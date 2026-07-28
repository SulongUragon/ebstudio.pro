import { NextResponse } from "next/server";
import type { BookBrief, Mode } from "../../book-types";

export const maxDuration = 300;

type CoverRequest = {
  mode: Mode;
  brief: BookBrief;
  subtitle?: string;
  style?: string;
};

const STYLE_DIRECTIONS: Record<string, string> = {
  cinematic:
    "cinematic editorial realism, premium dramatic lighting, sophisticated depth, rich color grading, high-end publishing aesthetic",
  minimalist:
    "minimalist conceptual editorial art, one powerful symbolic focal point, refined negative space, premium modern publishing aesthetic",
  illustrated:
    "detailed contemporary book illustration, expressive atmosphere, layered visual storytelling, polished commercial publishing aesthetic",
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
    const bookContext =
      body.mode === "fiction"
        ? `Genre: ${body.brief.genre || "fiction"}. Premise: ${body.brief.premise || body.brief.title}. Main characters: ${body.brief.characters || "not specified"}.`
        : `Topic: ${body.brief.topic || body.brief.title}. Target audience: ${body.brief.audience || "general readers"}. Key ideas: ${body.brief.keyPoints || body.subtitle || "not specified"}.`;

    const prompt = `Create original front-cover artwork for a premium ${body.mode === "fiction" ? "fiction" : "non-fiction"} ebook.

Book title for creative context only: ${body.brief.title}
${bookContext}
Visual direction: ${direction}.

Portrait book-cover composition, 2:3 aspect ratio. Create a strong focal image with clear visual hierarchy and generous quiet space for typography in the upper and lower thirds. Edge-to-edge artwork, commercially polished, emotionally specific to the book, readable at thumbnail size. Do not render any words, letters, title, author name, logos, watermarks, borders, mockups, books, devices, or publisher marks. Avoid generic stock-photo composition and visual clutter.`;

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
          error:
            data.error?.message?.toLowerCase().includes("verif")
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
