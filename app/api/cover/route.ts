import { NextResponse } from "next/server";
import type { BookBrief, Mode } from "../../book-types";
import { buildCoverPrompt } from "../../creative-direction";

export const maxDuration = 300;

type CoverRequest = {
  mode: Mode;
  brief: BookBrief;
  subtitle?: string;
  style?: string;
  finish?: string;
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
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI cover generation is not configured." },
        { status: 503 },
      );
    }

    const body = (await request.json()) as CoverRequest;
    if (!body.brief?.title || !body.mode) {
      return NextResponse.json({ error: "Complete the book title first." }, { status: 400 });
    }

    const style = COVER_STYLES.has(body.style ?? "cinematic")
      ? body.style ?? "cinematic"
      : "cinematic";
    const finish = FINISH_DIRECTIONS[body.finish ?? "satin"]
      ? body.finish ?? "satin"
      : "satin";
    const finishDirection = FINISH_DIRECTIONS[finish];
    const prompt = buildCoverPrompt({
      mode: body.mode,
      title: body.brief.title,
      subtitle: body.subtitle ?? body.brief.subtitle,
      genre: body.brief.genre,
      topic: body.brief.topic,
      premise: body.brief.premise,
      audience: body.brief.audience,
      keyPoints: body.brief.keyPoints,
      style,
      finishDirection,
      customDirection: body.customDirection,
    });

    const response = await fetch("https://api.openai.com/v1/images/generations", {
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

    const data = (await response.json().catch(() => ({}))) as {
      data?: Array<{ b64_json?: string }>;
      error?: { message?: string; code?: string };
    };

    if (!response.ok || !data.data?.[0]?.b64_json) {
      console.error("EB Studio Pro cover generation failed", response.status, data.error?.code);
      return NextResponse.json(
        {
          code: data.error?.code ?? "image_request_failed",
          providerDetail: String(data.error?.message ?? "").slice(0, 240),
          error:
            data.error?.code === "billing_hard_limit_reached"
              ? "OpenAI image credits are unavailable or the project spending limit has been reached."
              : data.error?.message?.toLowerCase().includes("verif")
                ? "OpenAI requires organization verification before image generation can be used."
                : response.status === 403
                ? "OpenAI image generation access is not enabled for this project."
                : response.status === 429
                  ? "The cover generator is busy or has reached its usage limit. Please try again shortly."
                  : "The AI cover could not be generated. Your manuscript is safe.",
        },
        { status: response.status >= 400 ? response.status : 502 },
      );
    }

    return NextResponse.json({
      imageData: `data:image/jpeg;base64,${data.data[0].b64_json}`,
      style,
      finish,
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
