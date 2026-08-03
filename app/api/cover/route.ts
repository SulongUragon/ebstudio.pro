import { NextResponse } from "next/server";
import type { BookBrief, Mode } from "../../book-types";

export const maxDuration = 300;

type CoverRequest = {
  mode: Mode;
  brief: BookBrief;
  subtitle?: string;
  style?: string;
  finish?: string;
};

const FINISH_DIRECTIONS: Record<string, string> = {
  matte:
    "matte printed finish, soft controlled contrast, restrained highlights, tactile fine-art paper character",
  satin:
    "satin printed finish, balanced contrast, subtle dimensional sheen, polished but understated",
  "glossy-premium":
    "premium glossy cover finish, rich deep blacks, luminous color depth, controlled specular highlights, subtle metallic sheen on copper and gold accents, luxurious polished appearance without plastic glare",
};

const STYLE_DIRECTIONS: Record<string, string> = {
  cinematic:
    "cinematic editorial realism, premium dramatic lighting, sophisticated depth, rich color grading, high-end publishing aesthetic",
  minimalist:
    "minimalist conceptual editorial art, one powerful symbolic focal point, refined negative space, premium modern publishing aesthetic",
  illustrated:
    "detailed contemporary book illustration, expressive atmosphere, layered visual storytelling, polished commercial publishing aesthetic",
  "photoreal-title":
    "high-end photorealistic editorial photography featuring a believable real human subject relevant to the story or topic, natural skin texture, anatomically correct face and hands, authentic expression, cinematic lighting, premium commercial book-cover art direction",
  "minimal-real-title":
    "minimalist photorealistic still-life photography using one or two real physical objects meaningfully connected to the story or topic, refined negative space, precise lighting, tactile natural materials, premium contemporary book-cover art direction",
  "fully-loaded-title":
    "maximalist cinematic book-cover design packed with layered story-specific scenes, characters, symbolic objects, environmental details, dramatic atmosphere, premium depth, and high-impact commercial publishing art direction",
  "eb-signature":
    "concept-led editorial artwork derived directly from the book title and subject, emotionally specific and immediately relevant to the book, using the EB Studio Pro signature palette: dark forest green, deep navy blue, burnished copper and rust, warm parchment and muted gold, anchored by charcoal black; premium restrained color harmony, sophisticated depth, memorable focal symbolism, high-end publishing aesthetic",
};

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

    const style = STYLE_DIRECTIONS[body.style ?? "cinematic"]
      ? body.style ?? "cinematic"
      : "cinematic";
    const direction = STYLE_DIRECTIONS[style];
    const finish = FINISH_DIRECTIONS[body.finish ?? "satin"]
      ? body.finish ?? "satin"
      : "satin";
    const finishDirection = FINISH_DIRECTIONS[finish];
    const bookContext =
      body.mode === "fiction"
        ? `Genre: ${body.brief.genre || "fiction"}. Premise: ${body.brief.premise || body.brief.title}. Main characters: ${body.brief.characters || "not specified"}.`
        : `Topic: ${body.brief.topic || body.brief.title}. Target audience: ${body.brief.audience || "general readers"}. Key ideas: ${body.brief.keyPoints || body.subtitle || "not specified"}.`;

    const paletteGuard =
      style === "eb-signature"
        ? "Palette requirement: use dark forest green, deep navy, burnished copper or rust, warm parchment or muted gold, and charcoal as the dominant and nearly exclusive color system. Preserve natural tonal variation within those hues. Do not introduce neon colors, rainbow palettes, bright candy colors, or unrelated dominant hues."
        : "";

    const subjectDirection =
      style === "minimal-real-title"
        ? "Use one or two convincingly real physical objects as the sole visual subject. Choose objects that symbolize this specific book, with tactile material detail, restrained shadows, clean negative space, and a deliberate minimalist composition. Do not include people, faces, hands, silhouettes, crowds, or human figures. Avoid decorative clutter and generic stock-photo props."
        : style === "fully-loaded-title"
          ? "Build a visually crowded, fully loaded, maximalist cover using multiple layered scenes, relevant characters when appropriate, symbolic objects, environmental storytelling, foreground and background details, dramatic light, atmosphere, and controlled depth. Every element must connect directly to this specific book. Make it dense, immersive, cinematic, and high-impact without becoming random or unreadable. Keep a deliberate visual hierarchy and preserve a strong title zone."
          : style === "photoreal-title"
            ? "Feature a convincingly real human subject whose identity, emotion, wardrobe, environment, and pose are meaningfully connected to this specific book. Preserve natural skin texture, realistic eyes, anatomically correct hands, believable proportions, and cinematic editorial lighting. Avoid plastic skin, uncanny faces, extra fingers, malformed anatomy, and generic stock-photo posing."
            : "";
    const prompt = `Create original front-cover artwork for a premium ${body.mode === "fiction" ? "fiction" : "non-fiction"} ebook.

Book title for creative context only: ${body.brief.title}
${bookContext}
Visual direction: ${direction}.
Cover finish: ${finishDirection}.
${paletteGuard}
${subjectDirection}

The cover finish should be expressed through lighting, tonal depth, surface character, and color treatment while keeping the artwork clean and the typography zones readable. The central visual concept must be meaningfully derived from this specific book title, premise or topic—not a generic genre image. Compose for a 5:8 portrait book cover, keeping all important subjects inside the central 85% safe area so the source can be cropped cleanly. Create a strong focal image with clear visual hierarchy and generous quiet space for deterministic typography in the upper and lower thirds. Edge-to-edge artwork, commercially polished, emotionally specific to the book, readable at thumbnail size. Do not render any words, letters, numbers, title, author name, logos, watermarks, borders, mockups, books, devices, or publisher marks. Avoid generic stock-photo composition and visual clutter.`;

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
