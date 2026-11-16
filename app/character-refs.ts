/**
 * Character references keep a cast looking the same on every page. Each
 * recurring character is drawn once on a plain background; every later image
 * that names the character sends that drawing to the image model, which copies
 * it instead of guessing again from words.
 */
export type CharacterRef = { id: string; name: string; description: string; imageData?: string };

/** FLUX.2 on Workers AI accepts at most four reference images per request. */
export const MAX_CHARACTER_REFS = 4;
/** Reference images must be smaller than 512 px per side. */
export const CHARACTER_REF_SIDE = 480;
const NAME_LIMIT = 40;
const DESCRIPTION_LIMIT = 260;
const MAX_REFERENCE_BYTES = 700_000;

function clean(value: unknown, limit: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit).trim();
}

function refId(name: string) {
  return `ref-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "character"}`;
}

/** Cleans the writer's cast list: named, described, unique, at most four. */
export function normalizeCast(raw: unknown): CharacterRef[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const cast: CharacterRef[] = [];
  for (const item of raw) {
    const value = (item ?? {}) as Record<string, unknown>;
    const name = clean(value.name, NAME_LIMIT);
    const description = clean(value.description, DESCRIPTION_LIMIT);
    const key = name.toLowerCase();
    if (!name || !description || seen.has(key)) continue;
    seen.add(key);
    cast.push({ id: refId(name), name, description });
    if (cast.length === MAX_CHARACTER_REFS) break;
  }
  return cast;
}

/** A fresh cast list keeps any drawing the author already has for the same character. */
export function mergeCast(existing: CharacterRef[] | undefined, fresh: CharacterRef[]): CharacterRef[] {
  const byName = new Map((existing ?? []).map((ref) => [ref.name.toLowerCase(), ref]));
  const merged = fresh.map((ref) => {
    const kept = byName.get(ref.name.toLowerCase());
    return kept ? { ...ref, id: kept.id, description: kept.description || ref.description, imageData: kept.imageData } : ref;
  });
  for (const ref of existing ?? []) {
    if (merged.length >= MAX_CHARACTER_REFS) break;
    if (!merged.some((item) => item.name.toLowerCase() === ref.name.toLowerCase())) merged.push(ref);
  }
  return merged.slice(0, MAX_CHARACTER_REFS);
}

/** The drawn characters that this page names, in cast order. A scene that names nobody gets none. */
export function referencesForScene(refs: CharacterRef[] | undefined, sceneText: string) {
  const text = String(sceneText ?? "");
  return (refs ?? [])
    .filter((ref) => ref.imageData && ref.name.trim())
    .filter((ref) => new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(ref.name.trim())}([^A-Za-z0-9]|$)`, "i").test(text))
    .slice(0, MAX_CHARACTER_REFS)
    .map((ref) => ({ name: ref.name.trim(), imageData: ref.imageData as string }));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Prompt for the one drawing that defines a character. */
export function characterSheetPrompt(input: { name: string; description: string; style: string; palette: string }) {
  return [
    "Character design reference, artwork only. One character, full body, centered, facing slightly toward the viewer, neutral friendly pose.",
    "No text in the image: no words, letters, numbers, labels, or watermarks.",
    `The character: ${clean(input.description, DESCRIPTION_LIMIT)}`,
    "Plain soft light background with nothing else in it. No other characters, no props, no scenery, no frame.",
    `Art style: ${clean(input.style, 220)}`,
    input.palette.trim() ? `Colors: ${clean(input.palette, 160)}` : "",
    "Clean shapes and clear colors so the design is easy to copy exactly.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Tells the image model which reference image is which character. */
export function referenceInstruction(names: string[]) {
  const listed = names.slice(0, MAX_CHARACTER_REFS);
  if (!listed.length) return "";
  const map = listed.map((name, index) => `image ${index + 1} is ${name}`).join(", ");
  return `Reference images: ${map}. Draw ${listed.length > 1 ? "these characters" : "this character"} exactly as in the reference: same body shape, face, colors, markings, and proportions. Copy only the character, not the reference background or pose.`;
}

export type ReferenceImage = { name: string; bytes: Uint8Array; mime: string };

/** Decodes reference images sent by the browser. Anything that is not a small PNG, JPEG, or WebP is rejected. */
export function decodeReferenceImages(raw: unknown): ReferenceImage[] | { error: string } {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return { error: "Character references were not understood." };
  if (raw.length > MAX_CHARACTER_REFS) return { error: `Use at most ${MAX_CHARACTER_REFS} character references in one image.` };
  const images: ReferenceImage[] = [];
  for (const item of raw) {
    const value = (item ?? {}) as Record<string, unknown>;
    const name = clean(value.name, NAME_LIMIT);
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(value.imageData ?? ""));
    if (!name || !match) return { error: "A character reference image is not a valid picture." };
    const bytes = Uint8Array.from(Buffer.from(match[2], "base64"));
    if (bytes.length < 100 || bytes.length > MAX_REFERENCE_BYTES) return { error: "A character reference image is too large." };
    images.push({ name, bytes, mime: match[1] });
  }
  return images;
}
