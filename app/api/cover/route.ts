import { NextResponse } from "next/server";
import { denyWithoutApiAccess } from "../../api-access";
import { classifyOpenAIImageError, retryDelayMs, type OpenAIImageErrorPayload } from "../../openai-image-errors";
import type { BookBrief, Mode } from "../../book-types";
import {
  buildCoverPrompt,
  buildCoverTypographyLayout,
  resolveCreativeCoverFinishId,
  resolveCoverTextMode,
  stripCoverPlaceholderText,
  validateCoverArtworkPrompt,
  validateCoverTextModePayload,
  validateIntegratedTypographyPrompt,
  validateCoverPromptForPlaceholders,
} from "../../creative-direction";

export const maxDuration = 300;

type CoverRequest = {
  mode: Mode;
  brief: BookBrief;
  subtitle?: string;
  author?: string;
  style?: string;
  finish?: string;
  creativeFinish?: string;
  titleTypography?: string;
  titlePlacement?: string;
  coverTextMode?: string;
  customDirection?: string;
};

const FINISH_DIRECTIONS: Record<string, string> = {
  matte:
    "matte printed finish, soft controlled contrast, restrained highlights, tactile fine-art paper character",
  satin:
    "satin printed finish, balanced contrast, subtle dimensional sheen, polished but understated",
  "glossy-premium":
    "premium glossy cover finish, rich deep blacks, luminous color depth, controlled specular highlights, subtle metallic sheen on copper and gold accents, luxurious polished appearance without plastic glare",
};

const COVER_STYLES = new Set([
  "cinematic",
  "minimalist",
  "illustrated",
  "photoreal-title",
  "minimal-real-title",
  "fully-loaded-title",
  "eb-signature",
]);

export async function POST(request: Request) {
  const denied = await denyWithoutApiAccess(request);
  if (denied) return denied;
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI cover generation is not configured." },
        { status: 503 },
      );
    }

    const body = (await request.json()) as CoverRequest;
    const title = stripCoverPlaceholderText(body.brief?.title);
    if (!title || !body.mode) {
      return NextResponse.json({ error: "Complete the book title first." }, { status: 400 });
    }
    if (!validateCoverTextModePayload(body.coverTextMode)) {
      return NextResponse.json({ error: "Choose a valid Cover Text Mode." }, { status: 400 });
    }

    const style = COVER_STYLES.has(body.style ?? "cinematic")
      ? body.style ?? "cinematic"
      : "cinematic";
    const finish = FINISH_DIRECTIONS[body.finish ?? "satin"]
      ? body.finish ?? "satin"
      : "satin";
    const finishDirection = FINISH_DIRECTIONS[finish];
    const creativeFinish = resolveCreativeCoverFinishId(body.creativeFinish);
    const subtitle = stripCoverPlaceholderText(body.subtitle ?? body.brief.subtitle);
    const author = stripCoverPlaceholderText(body.author);
    const coverTextMode = body.coverTextMode ?? "auto";
    const resolvedCoverTextMode = resolveCoverTextMode({
      mode: body.mode,
      title,
      subtitle,
      author,
      genre: body.brief.genre,
      topic: body.brief.topic,
      premise: body.brief.premise,
      audience: body.brief.audience,
      keyPoints: body.brief.keyPoints,
      creativeFinish,
      coverTextMode,
      customDirection: body.customDirection,
    });
    const prompt = buildCoverPrompt({
      mode: body.mode,
      title,
      subtitle,
      author,
      genre: body.brief.genre,
      topic: body.brief.topic,
      premise: body.brief.premise,
      audience: body.brief.audience,
      keyPoints: body.brief.keyPoints,
      style,
      finishDirection,
      creativeFinish,
      coverTextMode: resolvedCoverTextMode,
      titleTypography: body.titleTypography,
      titlePlacement: body.titlePlacement,
      customDirection: body.customDirection,
    });
    const typographyLayout = buildCoverTypographyLayout({
      mode: body.mode,
      title,
      subtitle,
      author,
      genre: body.brief.genre,
      topic: body.brief.topic,
      premise: body.brief.premise,
      audience: body.brief.audience,
      keyPoints: body.brief.keyPoints,
      style,
      creativeFinish,
      titleTypography: body.titleTypography,
      titlePlacement: body.titlePlacement,
      coverTextMode: resolvedCoverTextMode,
      customDirection: body.customDirection,
    });
    const validArtworkPrompt = resolvedCoverTextMode === "integrated-typography"
      ? validateIntegratedTypographyPrompt(prompt)
      : validateCoverArtworkPrompt(prompt);
    if (
      !validArtworkPrompt ||
      !validateCoverPromptForPlaceholders(prompt) ||
      !validateCoverPromptForPlaceholders(typographyLayout)
    ) {
      return NextResponse.json(
        { error: "Remove template placeholder text before generating the cover." },
        { status: 400 },
      );
    }

    const requestCover = () =>
      fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1",
          prompt,
          n: 1,
          size: "1024x1536",
          quality: "low",
          output_format: "jpeg",
          output_compression: 82,
        }),
      });

    type ImageResponse = OpenAIImageErrorPayload & { data?: Array<{ b64_json?: string }> };
    let response = await requestCover();
    let data = (await response.json().catch(() => ({}))) as ImageResponse;
    if (!response.ok && classifyOpenAIImageError(response.status, data, "cover").kind === "busy") {
      // One retry when OpenAI is only busy. Used-up credits are never retried.
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs(response.headers.get("retry-after"))));
      response = await requestCover();
      data = (await response.json().catch(() => ({}))) as ImageResponse;
    }

    if (!response.ok || !data.data?.[0]?.b64_json) {
      const failure = classifyOpenAIImageError(response.ok ? 502 : response.status, data, "cover");
      console.error("EB Studio Pro cover generation failed", response.status, failure.kind, failure.code);
      return NextResponse.json(
        {
          code: failure.code,
          reason: failure.kind,
          retryable: failure.retryable,
          providerDetail: String(data.error?.message ?? "").slice(0, 240),
          error: failure.message,
        },
        { status: failure.status },
      );
    }

    return NextResponse.json({
      imageData: `data:image/jpeg;base64,${data.data[0].b64_json}`,
      style,
      finish,
      creativeFinish,
      coverTextMode,
      resolvedCoverTextMode,
      shouldOverlayText: resolvedCoverTextMode === "app-typography",
      typographyLayout,
    });
  } catch (error) {
    console.error(
      "EB Studio Pro cover request failed",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json(
      { error: "The AI cover could not be generated. Your manuscript is safe." },
      { status: 500 },
    );
  }
}
