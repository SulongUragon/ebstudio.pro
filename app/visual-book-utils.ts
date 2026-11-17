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

/** A recipe's ingredients as the editor shows them: "Group:" headings, then "Item | quantity" lines. */
export type IngredientGroup = { group: string; rows: Array<{ item: string; quantity: string }> };

/** Recipe books always get an ingredients page: page 3, after the cover and the introduction. */
export function ingredientsPageIndex(kind: string, pageCount: number) {
  return kind === "recipe-activity" && pageCount >= 4 ? 2 : -1;
}

export function markIngredientsPage<T extends { ingredientsPage?: boolean }>(pages: T[], kind: string): T[] {
  const index = ingredientsPageIndex(kind, pages.length);
  return pages.map((page, position) => ({ ...page, ingredientsPage: position === index }));
}

/** Turns the storyboard's structured list into editable text. */
export function formatIngredients(raw: unknown) {
  const list = Array.isArray(raw) ? raw : [];
  const lines: string[] = [];
  let current = "";
  for (const entry of list) {
    const value = (entry ?? {}) as { group?: unknown; item?: unknown; quantity?: unknown };
    const item = noDashes(String(value.item ?? "").trim());
    if (!item) continue;
    const group = noDashes(String(value.group ?? "").trim());
    if (group && group !== current) {
      lines.push(`${group}:`);
      current = group;
    }
    const quantity = noDashes(String(value.quantity ?? "").trim());
    lines.push(quantity ? `${item} | ${quantity}` : item);
  }
  return lines.join("\n");
}

export function parseIngredients(text: string | undefined): IngredientGroup[] {
  const groups: IngredientGroup[] = [];
  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    const line = noDashes(rawLine.replace(/^[\s*•-]+/, "").trim());
    if (!line) continue;
    if (line.endsWith(":") && !line.includes("|")) {
      groups.push({ group: line.slice(0, -1).trim(), rows: [] });
      continue;
    }
    if (!groups.length) groups.push({ group: "", rows: [] });
    const [item, ...rest] = line.split("|");
    groups[groups.length - 1].rows.push({ item: item.trim(), quantity: rest.join("|").trim() });
  }
  return groups.filter(group => group.rows.length);
}

/** Ranges like "2–3 cups" read as "2 to 3 cups"; dashes are never printed. */
function noDashes(value: string) {
  return value.replace(/\s*[\u2013\u2014]\s*/g, " to ").replace(/(\d)\s*-\s*(\d)/g, "$1 to $2");
}
