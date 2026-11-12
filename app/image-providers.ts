import type { ImageFailure } from "./openai-image-errors";

/**
 * Cloudflare Workers AI as the backup image provider. OpenAI stays first; when
 * its credits are used up, the key has no image access, or it stays busy, the
 * routes fall back to the model named in CLOUDFLARE_IMAGE_MODEL.
 */
export const DEFAULT_CLOUDFLARE_IMAGE_MODEL = "@cf/black-forest-labs/flux-2-klein-9b";
const CLOUDFLARE_MAX_SIDE = 1920;
const CLOUDFLARE_PROMPT_LIMIT = 2000;
const CLOUDFLARE_TIMEOUT_MS = 120_000;

export type GeneratedImage = { imageData: string; provider: "openai" | "cloudflare"; model: string };

export function cloudflareImageConfigured() {
  return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID?.trim() && process.env.CLOUDFLARE_API_TOKEN?.trim());
}

export function cloudflareImageModel() {
  const configured = process.env.CLOUDFLARE_IMAGE_MODEL?.trim() || DEFAULT_CLOUDFLARE_IMAGE_MODEL;
  return configured.startsWith("@") ? configured : `@cf/${configured}`;
}

/** Failures where a different provider can still succeed. Safety refusals are not retried elsewhere. */
export function shouldUseImageFallback(failure: Pick<ImageFailure, "kind">) {
  return ["credits", "access", "verification", "busy", "timeout", "other"].includes(failure.kind);
}

/** FLUX.2 models on Workers AI take multipart form input; older models take JSON. */
export function usesMultipartInput(model: string) {
  return /flux-2/i.test(model);
}

/** Workers AI accepts up to 1920 px per side, in steps of 16. */
export function cloudflareSize(width: number, height: number) {
  const scale = Math.min(1, CLOUDFLARE_MAX_SIDE / Math.max(width, height));
  const fit = (value: number) => Math.max(256, Math.round((value * scale) / 16) * 16);
  return { width: fit(width), height: fit(height) };
}

export function compactPrompt(prompt: string) {
  const compact = prompt.replace(/\s+/g, " ").trim();
  if (compact.length <= CLOUDFLARE_PROMPT_LIMIT) return compact;
  const cut = compact.slice(0, CLOUDFLARE_PROMPT_LIMIT);
  return cut.slice(0, Math.max(cut.lastIndexOf(". "), CLOUDFLARE_PROMPT_LIMIT - 200) + 1).trim();
}

function mimeFromBytes(bytes: Uint8Array) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0x52 && bytes[1] === 0x49) return "image/webp";
  return "image/jpeg";
}

function mimeFromBase64(base64: string) {
  if (base64.startsWith("iVBOR")) return "image/png";
  if (base64.startsWith("UklGR")) return "image/webp";
  return "image/jpeg";
}

function toBase64(bytes: Uint8Array) {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

export class CloudflareImageError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** True when Cloudflare rejected the request only because the model takes no width or height. */
export function isSizeNotSupportedError(message: string) {
  return /\b(width|height)\b/i.test(message) && /(not allowed|unevaluated|additional|unknown|unexpected)/i.test(message);
}

export async function generateCloudflareImage(prompt: string, width: number, height: number): Promise<GeneratedImage> {
  if (!cloudflareImageConfigured()) throw new CloudflareImageError("Cloudflare image generation is not configured.", 503);
  const model = cloudflareImageModel();
  const size = cloudflareSize(width, height);
  const text = compactPrompt(prompt);
  const url = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID!.trim()}/ai/run/${model}`;

  const send = async (includeSize: boolean) => {
    const headers: Record<string, string> = { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN!.trim()}` };
    let body: BodyInit;
    if (usesMultipartInput(model)) {
      const form = new FormData();
      form.append("prompt", text);
      if (includeSize) {
        form.append("width", String(size.width));
        form.append("height", String(size.height));
      }
      body = form;
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(includeSize ? { prompt: text, width: size.width, height: size.height } : { prompt: text });
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CLOUDFLARE_TIMEOUT_MS);
    try {
      return await fetch(url, { method: "POST", headers, body, signal: controller.signal });
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === "AbortError";
      throw new CloudflareImageError(timedOut ? "Cloudflare took too long to return the image." : "Cloudflare could not be reached.", 504);
    } finally {
      clearTimeout(timeout);
    }
  };

  const read = async (response: Response): Promise<GeneratedImage | { error: string; status: number }> => {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const data = (await response.json().catch(() => ({}))) as {
        result?: { image?: string };
        errors?: Array<{ message?: string; code?: number }>;
      };
      const image = data.result?.image;
      if (response.ok && image) return { imageData: `data:${mimeFromBase64(image)};base64,${image}`, provider: "cloudflare", model };
      return { error: data.errors?.[0]?.message ?? `HTTP ${response.status}`, status: response.ok ? 502 : response.status };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (response.ok && bytes.length >= 100) {
      return { imageData: `data:${mimeFromBytes(bytes)};base64,${toBase64(bytes)}`, provider: "cloudflare", model };
    }
    return { error: `HTTP ${response.status}`, status: response.ok ? 502 : response.status };
  };

  let result = await read(await send(true));
  // Some models (for example flux-1-schnell) take only a prompt and always
  // return a square image. Ask again without the size instead of failing.
  if ("error" in result && isSizeNotSupportedError(result.error)) {
    console.warn("Cloudflare model takes no width or height; retrying with the prompt only", model);
    result = await read(await send(false));
  }
  if ("error" in result) {
    console.error("Cloudflare image generation failed", result.status, model, result.error.slice(0, 200));
    throw new CloudflareImageError(`Cloudflare could not generate the image (${result.error.slice(0, 120)}).`, result.status);
  }
  return result;
}

/** One message when both providers failed, naming both reasons. */
export function bothProvidersFailedMessage(openAI: ImageFailure, cloudflare: unknown) {
  const backup = cloudflare instanceof Error ? cloudflare.message : "Cloudflare also failed.";
  return `${openAI.message} The Cloudflare backup also failed: ${backup}`;
}
