import type { ComicPanel, VisualBookPage, VisualProjectMode } from "./visual-book-types";
type RawObject = Record<string, unknown>;
const VISUAL_LAYOUTS: VisualBookPage["layout"][] = ["full-bleed", "image-top", "image-left", "image-right", "quote"];

export function normalizeVisualPages(rawPages: unknown, pageCount: number, mode: VisualProjectMode): VisualBookPage[] {
  const source = Array.isArray(rawPages) ? rawPages : [];
  return Array.from({ length: pageCount }, (_, index) => {
    const raw = (source[index] ?? {}) as RawObject;
    const isCover = index === 0;
    const isCta = index === pageCount - 1 && pageCount > 1;
    const panels = mode === "comic" ? normalizePanels(raw.panels, isCover ? 1 : clamp(Number(raw.panel_count) || 2, 1, 4)) : [];
    const requestedLayout = String(raw.layout ?? "") as VisualBookPage["layout"];
    return { id: cryptoId("page", index), pageNumber: index + 1, role: isCover ? "cover" : isCta ? "cta" : "content", title: cleanText(raw.title) || (isCover ? "Cover" : `Page ${index + 1}`), body: cleanText(raw.body), imagePrompt: cleanText(raw.image_prompt), layout: VISUAL_LAYOUTS.includes(requestedLayout) ? requestedLayout : isCover ? "full-bleed" : VISUAL_LAYOUTS[1 + ((index - 1) % 3)], panels };
  });
}
export function normalizePanels(rawPanels: unknown, panelCount: number): ComicPanel[] {
  const source = Array.isArray(rawPanels) ? rawPanels : [];
  return Array.from({ length: panelCount }, (_, index) => {
    const raw = (source[index] ?? {}) as RawObject;
    const dialogue = Array.isArray(raw.dialogue) ? raw.dialogue.slice(0, 3).map((item) => { const value = (item ?? {}) as RawObject; return { speaker: cleanText(value.speaker), text: cleanText(value.text) }; }).filter((item) => item.text) : [];
    return { id: cryptoId("panel", index), order: index + 1, scene: cleanText(raw.scene), camera: cleanText(raw.camera) || "medium cinematic composition", dialogue, caption: cleanText(raw.caption), soundEffect: cleanText(raw.sound_effect) };
  });
}
export function visualProjectFilename(title: string, suffix: string) { const stem = title.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "visual-mini-book"; return `${stem}-${suffix}`; }
function cleanText(value: unknown) { return String(value ?? "").replace(/\u2014/g, "-").trim(); }
function clamp(value: number, minimum: number, maximum: number) { return Math.min(maximum, Math.max(minimum, value)); }
function cryptoId(prefix: string, index: number) { if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`; return `${prefix}-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`; }
