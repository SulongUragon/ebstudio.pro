import type { VisualBookPage } from "./visual-book-types";
type RawObject = Record<string, unknown>;
const VISUAL_LAYOUTS: VisualBookPage["layout"][] = ["full-bleed", "image-top", "image-left", "image-right", "quote"];

export function normalizeVisualPages(rawPages: unknown, pageCount: number): VisualBookPage[] {
  const source = Array.isArray(rawPages) ? rawPages : [];
  return Array.from({ length: pageCount }, (_, index) => {
    const raw = (source[index] ?? {}) as RawObject;
    const isCover = index === 0;
    const isCta = index === pageCount - 1 && pageCount > 1;
    const requestedLayout = String(raw.layout ?? "") as VisualBookPage["layout"];
    return { id: cryptoId("page", index), pageNumber: index + 1, role: isCover ? "cover" : isCta ? "cta" : "content", title: cleanText(raw.title) || (isCover ? "Cover" : `Page ${index + 1}`), body: cleanText(raw.body), imagePrompt: cleanText(raw.image_prompt), pullQuote: cleanText(raw.pull_quote), layout: VISUAL_LAYOUTS.includes(requestedLayout) ? requestedLayout : isCover ? "full-bleed" : VISUAL_LAYOUTS[1 + ((index - 1) % 3)] };
  });
}
export function visualProjectFilename(title: string, suffix: string) { const stem = title.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "visual-mini-book"; return `${stem}-${suffix}`; }
function cleanText(value: unknown) { return String(value ?? "").replace(/\u2014/g, "-").trim(); }
function cryptoId(prefix: string, index: number) { if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`; return `${prefix}-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`; }
