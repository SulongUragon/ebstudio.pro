import { NextResponse } from "next/server";
import { sanitizeChapterOpenerMetadata } from "../../longform-chapter-openers";

export const maxDuration = 300;

const OPENAI_IMAGE_URL = "https://api.openai.com/v1/images/generations";
const UPSTREAM_TIMEOUT_MS = 150_000;
const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

type RequestBody = {
  manuscript?: { mode?: string; title?: string; genre?: string; premise?: string; characters?: string; topic?: string };
  section?: {
    title?: string;
    purpose?: string;
    summary?: string;
    content?: string;
    openerDeck?: string;
    openerImagePrompt?: string;
    openerVisualMood?: string;
  };
};

type OpenAIImageResponse = { data?: Array<{ b64_json?: string }>; error?: { message?: string; code?: string; type?: string } };

function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function looksLikeSafetyRejection(data: OpenAIImageResponse, status: number) {
  const text = `${data.error?.code ?? ""} ${data.error?.type ?? ""} ${data.error?.message ?? ""}`.toLowerCase();
  return status === 400 && /(safety|policy|moderation|content|violation|rejected|self[- ]?harm|image_generation_user_error)/.test(text);
}

async function requestImage(prompt: string, attempts = 3) {
  let lastStatus = 502, lastData: OpenAIImageResponse = {}, lastRequestId = "";
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const response = await fetch(OPENAI_IMAGE_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1", prompt, n: 1, size: "1024x1536", quality: "low", output_format: "jpeg", output_compression: 82 }),
      });
      lastStatus = response.status;
      lastRequestId = response.headers.get("x-request-id") ?? "";
      lastData = (await response.json().catch(() => ({}))) as OpenAIImageResponse;
      if (response.ok && lastData.data?.[0]?.b64_json) return { ok: true as const, data: lastData, status: response.status, requestId: lastRequestId };
      if (!RETRYABLE_STATUS.has(response.status) || attempt === attempts - 1) break;
    } catch (error) {
      lastData = { error: { message: error instanceof DOMException && error.name === "AbortError" ? "The image service timed out before returning an image." : error instanceof Error ? error.message : "The image service connection failed.", type: "network_error" } };
      lastStatus = 504;
      if (attempt === attempts - 1) break;
    } finally { clearTimeout(timeout); }
    await sleep(1200 * 2 ** attempt);
  }
  return { ok: false as const, data: lastData, status: lastStatus, requestId: lastRequestId };
}

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "OpenAI image generation is not configured." }, { status: 503 });
    const body = (await request.json()) as RequestBody;
    if (!body.manuscript?.title || !body.section?.title) return NextResponse.json({ error: "Book and section details are required." }, { status: 400 });

    const context = body.manuscript.mode === "fiction"
      ? `Genre: ${body.manuscript.genre || "fiction"}. Premise: ${body.manuscript.premise || ""}. Characters: ${body.manuscript.characters || ""}.`
      : `Topic: ${body.manuscript.topic || body.manuscript.title}.`;
    const visualBible = `VISUAL CONTINUITY BIBLE: cinematic editorial realism; dark, restrained, moody atmosphere; deep charcoal, midnight blue, muted forest green and weathered brown palette; low-key directional lighting with subtle cool highlights; natural skin tones; realistic photographic texture; shallow controlled depth of field; understated film grain; emotionally intimate rather than theatrical; premium literary-fiction publishing aesthetic. Avoid bright golden-hour warmth, cheerful sunrise imagery, pastel colors, high-key interiors, generic inspirational stock imagery, painterly storybook rendering, or sudden stylistic shifts.`;
    const openerDirection = sanitizeChapterOpenerMetadata(body.section.openerImagePrompt);
    const openerMood = sanitizeChapterOpenerMetadata(body.section.openerVisualMood);

    const prompt = `Create one premium interior illustration for the long-form book "${body.manuscript.title}".
${context}
Section: ${body.section.title}
Section purpose: ${body.section.purpose || ""}
Section summary: ${body.section.summary || ""}
Scene context: ${(body.section.content || "").slice(0, 5000)}
${openerDirection ? `Chapter opener scene direction: ${openerDirection}` : ""}
${openerMood ? `Chapter opener visual mood: ${openerMood}` : ""}

${visualBible}
Choose the single strongest visually specific moment from this section. Preserve character identity, age, wardrobe logic, setting, mood, and story continuity implied by the supplied book context. Sophisticated composition, believable anatomy, controlled depth, premium publishing quality, emotionally specific rather than generic. Portrait interior-book illustration with a clear focal subject positioned away from the lower-third text-safe area when possible. Preserve clean lower-third or left-side negative space for app-rendered chapter typography. No title, captions, speech bubbles, words, letters, typography, readable signage, logos, watermark, border, mockup, or unrelated decorative text.`;

    let result = await requestImage(prompt);
    let usedPrompt = prompt;
    let usedFallback = false;

    if (!result.ok && looksLikeSafetyRejection(result.data, result.status)) {
      const safePrompt = `Create a premium interior-book illustration for a chapter titled "${body.section.title}" in the book "${body.manuscript.title}".

${visualBible}
This is a safety-adapted scene: preserve the SAME visual world, palette, photographic treatment, lighting language, period/setting feel, and emotional gravity as the rest of the book, while replacing any unsafe action with an ordinary non-harmful moment of solitude, contemplation, departure, aftermath, or transition. A calm character may be present doing an everyday safe action such as sitting fully clothed, standing by a doorway, walking away, holding a closed envelope, looking through a window, packing a bag, or pausing in a dim familiar room. If no person is useful, choose a specific environment/object composition that belongs naturally to this story world.

No person in distress. No injury, death, self-harm, suicide, medical emergency, weapons, blood, violence, drugs, explicit intimacy, or dangerous action. Do not depict or imply a harmful act. IMPORTANT: do not default to a bright sunrise, empty wooden chair, generic window, glowing pathway, or inspirational golden-room scene. Keep the established dark cinematic theme and make this chapter visually distinct from adjacent fallback images. Premium portrait composition, realistic photographic texture, no text, captions, letters, logos, watermark, border, or mockup.`;
      result = await requestImage(safePrompt, 2);
      usedPrompt = safePrompt;
      usedFallback = true;
    }

    if (!result.ok || !result.data.data?.[0]?.b64_json) {
      const upstreamMessage = result.data.error?.message || "Book image could not be generated.";
      console.error("Book image upstream failure", { section: body.section.title, status: result.status, requestId: result.requestId, code: result.data.error?.code, type: result.data.error?.type, message: upstreamMessage });
      const userMessage = looksLikeSafetyRejection(result.data, result.status) ? "This chapter could not be illustrated safely even with the theme-preserving fallback. Try another section or revise the chapter illustration context." : upstreamMessage;
      return NextResponse.json({ error: userMessage, status: result.status, code: result.data.error?.code ?? result.data.error?.type ?? "image_generation_failed", requestId: result.requestId || undefined }, { status: result.status >= 400 ? result.status : 502 });
    }

    return NextResponse.json({ imageData: `data:image/jpeg;base64,${result.data.data[0].b64_json}`, prompt: usedPrompt, fallback: usedFallback, requestId: result.requestId || undefined });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    console.error("Book image generation failed", message);
    return NextResponse.json({ error: `Book image could not be generated. ${message}. Your manuscript is safe.` }, { status: 500 });
  }
}
