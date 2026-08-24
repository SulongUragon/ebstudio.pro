import { NextResponse } from "next/server";
import { buildVisualArtworkDirection } from "../../creative-direction";
import type { ComicPanel, VisualBookBrief, VisualBookPage } from "../../visual-book-types";
export const maxDuration = 300;
type VisualImageRequest = { project: VisualBookBrief; page: VisualBookPage; panel?: ComicPanel };
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
  try {
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "OpenAI image generation is not configured." }, { status: 503 });
    const { project, page, panel } = (await request.json()) as VisualImageRequest;
    if (!project?.title || !page) return NextResponse.json({ error: "Complete the visual project and storyboard first." }, { status: 400 });
    const comic = project.mode === "comic";
    if (comic && !panel) return NextResponse.json({ error: "Choose a comic panel to illustrate." }, { status: 400 });
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
    const scene = comic ? panel?.scene : page.imagePrompt;
    const camera = comic ? panel?.camera : "portrait editorial composition";
    const size = comic && project.comicFormat !== "webtoon" ? "1024x1024" : "1024x1536";
    const prompt = `Create one original ${comic ? "comic panel" : "visual mini ebook illustration"}.

Book title context only, do not render it: ${project.title}
Project premise: ${project.premise}
Page ${page.pageNumber} purpose: ${page.title}
Visible scene: ${scene || page.title}
Camera and framing: ${camera}
Art direction: ${style}
Locked recurring character design: ${project.characterBible || "No recurring character design was supplied. Keep any visible person believable and specific."}
Locked palette and lighting: ${project.palette || "Use a coherent premium palette derived from the scene."}

The character description is authoritative. Preserve the same apparent age, facial structure, hair, skin tone, body type, wardrobe identifiers, and distinguishing features in every recurring appearance. Show only what can be visibly present in this scene. Keep the composition readable at page size.

ABSOLUTELY NO TEXT: no words, letters, numbers, speech bubbles, thought bubbles, captions, sound effects, signs, labels, logos, watermarks, borders, page numbers, book mockups, or typography. Do not imitate a living artist, named franchise, protected character, or recognizable copyrighted visual world.`;
    const { response, data } = await requestImageWithRetry(prompt, size);
    if (!response.ok || !data.data?.[0]?.b64_json) {
      const code = data.error?.code ?? "image_request_failed";
      const quotaFailure = QUOTA_ERROR_CODES.has(code) || /quota|credit|billing/i.test(data.error?.message ?? "");
      const error = quotaFailure
        ? "OpenAI image credits are unavailable or the project spending limit has been reached."
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
    return NextResponse.json({ imageData: `data:image/jpeg;base64,${data.data[0].b64_json}` });
  } catch (error) {
    console.error("EB Studio Pro visual image request failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "This page image could not be generated. Your storyboard is safe." }, { status: 500 });
  }
}
