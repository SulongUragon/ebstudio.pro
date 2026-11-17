/**
 * fal.ai as the main image provider when FAL_KEY is set: FLUX.1 Kontext [max]
 * for page art, and its multi-image endpoint when character references are sent.
 * Pay as you go, so there is no daily limit like the Cloudflare free allocation.
 */
export const FAL_TEXT_MODEL = "fal-ai/flux-pro/kontext/max/text-to-image";
export const FAL_REFERENCE_MODEL = "fal-ai/flux-pro/kontext/max/multi";
const FAL_TIMEOUT_MS = 150_000;

export type FalReferenceImage = { bytes: Uint8Array; mime: string };

export function falImageConfigured() {
  return Boolean(process.env.FAL_KEY?.trim());
}

export class FalImageError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "FalImageError";
  }
}

/** fal's aspect ratios; page art is 2:3 portrait, character sheets are square. */
export function falAspectRatio(width: number, height: number) {
  if (width === height) return "1:1";
  return width < height ? "2:3" : "3:2";
}

export function falRequestBody(prompt: string, width: number, height: number, references: FalReferenceImage[] = []) {
  return {
    prompt,
    aspect_ratio: falAspectRatio(width, height),
    num_images: 1,
    output_format: "jpeg",
    safety_tolerance: "2",
    sync_mode: true,
    ...(references.length
      ? { image_urls: references.map(reference => `data:${reference.mime};base64,${toBase64(reference.bytes)}`) }
      : {}),
  };
}

export async function generateFalImage(
  prompt: string,
  width: number,
  height: number,
  references: FalReferenceImage[] = [],
  fetcher: typeof fetch = fetch,
) {
  const model = references.length ? FAL_REFERENCE_MODEL : FAL_TEXT_MODEL;
  const response = await fetcher(`https://fal.run/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${process.env.FAL_KEY?.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(falRequestBody(prompt, width, height, references)),
    signal: AbortSignal.timeout(FAL_TIMEOUT_MS),
  });
  const data = (await response.json().catch(() => ({}))) as {
    images?: Array<{ url?: string; content_type?: string }>;
    has_nsfw_concepts?: boolean[];
    detail?: unknown;
  };
  if (!response.ok) {
    const detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail ?? "");
    // fal answers a used-up balance with 403 "Exhausted balance", so check the wording first.
    const reason = /balance|credit|billing|payment/i.test(detail) || response.status === 402
      ? "fal.ai credits are used up. Add credits at fal.ai > Billing."
      : response.status === 401 || response.status === 403
        ? "The fal.ai key is invalid or has no access."
        : `fal.ai could not generate the image (${response.status}).`;
    throw new FalImageError(reason, response.status);
  }
  const image = data.images?.[0];
  if (!image?.url) throw new FalImageError("fal.ai returned no image.", 502);
  if (data.has_nsfw_concepts?.[0]) throw new FalImageError("fal.ai blocked this image as unsafe.", 422);
  const imageData = image.url.startsWith("data:") ? image.url : await downloadAsDataUrl(image.url, image.content_type, fetcher);
  return { imageData, provider: "fal" as const, model };
}

async function downloadAsDataUrl(url: string, contentType: string | undefined, fetcher: typeof fetch) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new FalImageError("The fal.ai image could not be downloaded.", 502);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return `data:${contentType || "image/jpeg"};base64,${toBase64(bytes)}`;
}

function toBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}
