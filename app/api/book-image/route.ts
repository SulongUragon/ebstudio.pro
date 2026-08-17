import { NextResponse } from "next/server";

export const maxDuration = 300;

type RequestBody = {
  manuscript?: { mode?: string; title?: string; genre?: string; premise?: string; characters?: string; topic?: string };
  section?: { title?: string; purpose?: string; summary?: string; content?: string };
};

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "OpenAI image generation is not configured." }, { status: 503 });
    const body = (await request.json()) as RequestBody;
    if (!body.manuscript?.title || !body.section?.title) return NextResponse.json({ error: "Book and section details are required." }, { status: 400 });
    const context = body.manuscript.mode === "fiction"
      ? `Genre: ${body.manuscript.genre || "fiction"}. Premise: ${body.manuscript.premise || ""}. Characters: ${body.manuscript.characters || ""}.`
      : `Topic: ${body.manuscript.topic || body.manuscript.title}.`;
    const prompt = `Create one premium interior illustration for the long-form book "${body.manuscript.title}".
${context}
Section: ${body.section.title}
Section purpose: ${body.section.purpose || ""}
Section summary: ${body.section.summary || ""}
Scene context: ${(body.section.content || "").slice(0, 5000)}

Choose the single strongest visually specific moment from this section. Preserve character identity, age, wardrobe logic, setting, mood, and story continuity implied by the supplied book context. Cinematic editorial realism, sophisticated composition, believable anatomy, controlled depth, premium publishing quality, emotionally specific rather than generic. Compose as a portrait interior-book illustration with a clear focal subject and enough negative space to reproduce cleanly on a page. No title, captions, speech bubbles, letters, logos, watermark, border, mockup, or unrelated decorative text.`;
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1", prompt, n: 1, size: "1024x1536", quality: "low", output_format: "jpeg", output_compression: 82 }),
    });
    const data = (await response.json().catch(() => ({}))) as { data?: Array<{ b64_json?: string }>; error?: { message?: string } };
    if (!response.ok || !data.data?.[0]?.b64_json) return NextResponse.json({ error: data.error?.message || "Book image could not be generated." }, { status: response.status >= 400 ? response.status : 502 });
    return NextResponse.json({ imageData: `data:image/jpeg;base64,${data.data[0].b64_json}`, prompt });
  } catch (error) {
    console.error("Book image generation failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Book image could not be generated. Your manuscript is safe." }, { status: 500 });
  }
}
