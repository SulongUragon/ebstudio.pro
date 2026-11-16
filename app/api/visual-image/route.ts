import { characterSheetPrompt, decodeReferenceImages } from "../../character-refs";
import { buildVisualImagePrompt } from "../../visual-image-prompt";
import { NextResponse } from "next/server";
import { denyWithoutApiAccess } from "../../api-access";
import { buildVisualArtworkDirection } from "../../creative-direction";
import {
  bothProvidersFailedMessage,
  cloudflareImageConfigured,
  generateCloudflareImage,
  shouldUseImageFallback,
} from "../../image-providers";
import { classifyOpenAIImageError } from "../../openai-image-errors";
import type { ComicPanel, VisualBookBrief, VisualBookPage } from "../../visual-book-types";
export const maxDuration = 300;
type VisualImageRequest = {
  project: VisualBookBrief;
  page?: VisualBookPage;
  panel?: ComicPanel;
  /** Draw one character's reference picture instead of a page or panel. */
  character?: { name?: string; description?: string };
  /** Reference pictures of the characters this page or panel names. */
  references?: unknown;
};
type ImageResponsePayload = { data?: Array<{ b64_json?: string }>; error?: { message?: string; code?: string } };
const IMAGE_RETRY_DELAYS_MS = [15_000, 30_000, 60_000];
const QUOTA_ERROR_CODES = new Set(["billing_hard_limit_reached", "insufficient_quota"]);
const COMIC_STYLE_DIRECTIONS: Record<string, string> = {
  classic: "polished contemporary comic-book art, confident ink contours, dimensional color, clear action staging",
  "graphic-novel": "mature cinematic graphic-novel art, sophisticated composition, textured shadow, restrained premium color",
  romance: "expressive romance-comic art, emotionally precise faces, elegant fashion detail, intimate cinematic lighting",
  noir: "dark noir comic art, hard directional light, deep blacks, rain-slick atmosphere, tense visual storytelling",
  manga: "original manga-inspired black-and-white sequential art, expressive clean linework, screentone texture, dynamic framing",
  children: "friendly children's comic illustration, bright clean color, rounded forms, highly readable action and emotion",
  webtoon: "premium vertical webtoon illustration, clean digital linework, expressive character acting, luminous color and depth",
  "comic-strip": "clean modern comic-strip illustration, strong silhouettes, concise visual storytelling, readable character acting",
};

async function requestImageWithRetry(prompt: string, size: string) {
  const attempts = IMAGE_RETRY_DELAYS_MS.length + 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
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
        size,
        quality: "low",
        output_format: "jpeg",
        output_compression: 82,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as ImageResponsePayload;
    const errorCode = data.error?.code ?? "";
    const quotaFailure = QUOTA_ERROR_CODES.has(errorCode) || /quota|credit|billing/i.test(data.error?.message ?? "");
    const retryable = response.status === 429 && !quotaFailure;

    if (!retryable || attempt === attempts - 1) return { response, data };

    const retryAfterSeconds = Number(response.headers.get("retry-after"));
    const fallbackDelay = IMAGE_RETRY_DELAYS_MS[attempt];
    const delayMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? Math.min(60_000, retryAfterSeconds * 1_000)
      : fallbackDelay;
    console.warn("EB Studio Pro image generation rate-limited; retrying", {
      attempt: attempt + 1,
      delayMs,
      errorCode: errorCode || "unknown",
    });
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error("Image retry loop ended unexpectedly.");
}

export async function POST(request: Request) {
  const denied = await denyWithoutApiAccess(request);
  if (denied) return denied;
  try {
    if (!process.env.OPENAI_API_KEY && !cloudflareImageConfigured()) return NextResponse.json({ error: "No image provider is configured." }, { status: 503 });
    const { project, page, panel, character, references: rawReferences } = (await request.json()) as VisualImageRequest;
    const characterSheet = Boolean(character);
    if (!project?.title || (!page && !characterSheet)) return NextResponse.json({ error: "Complete the visual project and storyboard first." }, { status: 400 });
    const comic = project.mode === "comic";
    if (comic && !panel && !characterSheet) return NextResponse.json({ error: "Choose a comic panel to illustrate." }, { status: 400 });
    if (characterSheet && !String(character?.description ?? "").trim()) {
      return NextResponse.json({ error: "Describe the character before drawing its reference." }, { status: 400 });
    }
    const references = characterSheet ? [] : decodeReferenceImages(rawReferences);
    if ("error" in references) return NextResponse.json({ error: references.error }, { status: 400 });
    const style = comic
      ? COMIC_STYLE_DIRECTIONS[project.comicFormat] ?? COMIC_STYLE_DIRECTIONS["graphic-novel"]
      : buildVisualArtworkDirection(
          {
            mode: ["illustrated-story", "children-story", "book-teaser"].includes(project.kind)
              ? "fiction"
              : "nonfiction",
            title: project.title,
            subtitle: project.subtitle,
            premise: project.premise,
            audience: project.audience,
            kind: project.kind,
          },
          project.visualStyle,
        );
    const scene = comic ? panel?.scene : page?.imagePrompt;
    const camera = comic ? panel?.camera : "portrait editorial composition";
    const size = characterSheet || (comic && project.comicFormat !== "webtoon") ? "1024x1024" : "1024x1536";
    const prompt = characterSheet
      ? characterSheetPrompt({
          name: String(character?.name ?? ""),
          description: String(character?.description ?? ""),
          style,
          palette: project.palette ?? "",
        })
      : buildVisualImagePrompt({
          comic,
          scene: scene ?? "",
          camera: camera ?? "",
          style,
          characterBible: project.characterBible ?? "",
          palette: project.palette ?? "",
          referenceNames: references.map((reference) => reference.name),
        });
    const [width, height] = size.split("x").map(Number);
    // Character references only work on the Cloudflare FLUX.2 model, and a
    // character's reference picture must come from the same model that will
    // copy it. Both go straight to Cloudflare when it is set up.
    if ((characterSheet || references.length > 0) && cloudflareImageConfigured()) {
      try {
        const drawn = await generateCloudflareImage(prompt, width, height, references);
        return NextResponse.json({ imageData: drawn.imageData, imageProvider: "cloudflare", referencesUsed: references.length });
      } catch (cloudflareError) {
        const detail = cloudflareError instanceof Error ? cloudflareError.message : "Cloudflare could not generate the image.";
        console.error("EB Studio Pro reference image generation failed", detail);
        return NextResponse.json({ code: "reference_image_failed", error: `${detail} Your storyboard is safe.` }, { status: 502 });
      }
    }
    const tryBackup = async (openAIFailure: ReturnType<typeof classifyOpenAIImageError>) => {
      try {
        const backup = await generateCloudflareImage(prompt, width, height);
        console.warn("Visual image used the Cloudflare backup", openAIFailure.kind, backup.model);
        return NextResponse.json({ imageData: backup.imageData, imageProvider: "cloudflare", referencesUsed: 0 });
      } catch (cloudflareError) {
        return NextResponse.json({ code: openAIFailure.code, error: bothProvidersFailedMessage(openAIFailure, cloudflareError) }, { status: openAIFailure.status });
      }
    };
    if (!process.env.OPENAI_API_KEY) {
      return tryBackup(classifyOpenAIImageError(401, { error: { code: "openai_not_configured" } }, "page image"));
    }
    const { response, data } = await requestImageWithRetry(prompt, size);
    if (!response.ok || !data.data?.[0]?.b64_json) {
      const openAIFailure = classifyOpenAIImageError(response.ok ? 502 : response.status, data, "page image");
      if (cloudflareImageConfigured() && shouldUseImageFallback(openAIFailure)) return tryBackup(openAIFailure);
      const code = data.error?.code ?? "image_request_failed";
      const quotaFailure = QUOTA_ERROR_CODES.has(code) || /quota|credit|billing/i.test(data.error?.message ?? "");
      const error = quotaFailure
        ? "OpenAI credits are used up or the spending limit was reached, so this page image could not be generated. Add credits at platform.openai.com > Settings > Billing, then try again."
        : response.status === 429
          ? "The image generator remained rate-limited after automatic retries. Finished images were saved; resume again later."
          : response.status === 401
            ? "The OpenAI image API key is invalid or no longer active."
            : response.status === 403 || code === "model_not_found"
              ? "This OpenAI project or API key does not have access to the configured image model."
              : "This page image could not be generated. Your storyboard is safe.";
      console.error("EB Studio Pro visual image generation failed", response.status, code);
      return NextResponse.json({ code, error }, { status: response.status >= 400 ? response.status : 502 });
    }
    return NextResponse.json({ imageData: `data:image/jpeg;base64,${data.data[0].b64_json}`, imageProvider: "openai", referencesUsed: 0 });
  } catch (error) {
    console.error("EB Studio Pro visual image request failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "This page image could not be generated. Your storyboard is safe." }, { status: 500 });
  }
}
