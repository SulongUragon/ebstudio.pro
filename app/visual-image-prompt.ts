import { referenceInstruction } from "./character-refs";

/**
 * Prompt for one visual-book illustration.
 *
 * Image models draw any words they are given, and the backup model keeps only
 * the first 2,000 characters. So the prompt never contains the book title, page
 * title, or premise, and the two rules that matter most (no lettering, and the locked
 * cast) come first where they cannot be cut off.
 */
export type VisualImagePromptInput = {
  scene: string;
  camera: string;
  style: string;
  characterBible: string;
  palette: string;
  /** Premium finish for the book's visual style; see premiumArtFinish. */
  finish?: string;
  /** Names of the characters whose reference drawings are sent with this request, in order. */
  referenceNames?: string[];
};

// Fixed wording is about 540 characters; these keep the whole prompt near 1,700, leaving room
// for the art checker's corrections on a redraw within the backup model's 2,000.
const LIMITS = { scene: 300, camera: 70, style: 130, cast: 460, palette: 120, finish: 130 };

export function buildVisualImagePrompt(input: VisualImagePromptInput) {
  // The reference instruction needs room, so the written cast lock gets less when it is present.
  const cast = clip(input.characterBible, input.referenceNames?.length ? LIMITS.cast - 240 : LIMITS.cast);
  const lines = [
    "One original book illustration, artwork only.",
    "No text in the image: no words, letters, numbers, titles, captions, signs, labels, logos, or watermarks. Any book, page, paper, sign, or screen is blank.",
    "Natural anatomy: each person's head, neck, shoulders, and body face the same way; two arms, two legs, five-fingered hands.",
    referenceInstruction(input.referenceNames ?? []),
    cast
      ? `Locked cast, draw each exactly as described, same kind of being, shape, colors, and size: ${cast}`
      : "Keep every visible character specific and believable.",
    `Scene: ${clip(input.scene, LIMITS.scene) || "A quiet moment from the story."}`,
    `Framing: ${clip(input.camera, LIMITS.camera) || "clear, readable composition"}`,
    `Art style: ${clip(input.style, LIMITS.style)}`,
    `Palette and lighting: ${clip(input.palette, LIMITS.palette) || "one coherent palette drawn from the scene"}`,
    input.finish ? `Finish: ${clip(input.finish, LIMITS.finish)}` : "",
    "Show only the cast members the scene names. Do not imitate a living artist or protected character.",
  ];
  return lines.filter(Boolean).join("\n");
}

const PHOTOGRAPHIC_STYLES = new Set(["cinematic-editorial", "dark-luxury", "clean-modern"]);
const ILLUSTRATED_STYLES = new Set(["warm-storybook", "bold-color", "ink-noir"]);

/** Gallery-grade finishing note that matches the premium page design. */
export function premiumArtFinish(visualStyle: string) {
  if (PHOTOGRAPHIC_STYLES.has(visualStyle)) return "fine art editorial photography, natural film grain, subtle filmic color grade, quiet restraint, gallery print quality";
  if (ILLUSTRATED_STYLES.has(visualStyle)) return "premium hand-crafted illustration, visible artisan texture, refined restraint, gallery print quality";
  return "";
}

/**
 * The author's own character lock always stays word for word. Locks the
 * storyboard writer adds for other recurring characters are appended once.
 */
export function mergeCharacterLock(authorLock: string, generatedLock: string) {
  const author = authorLock.trim();
  const generated = generatedLock.replace(/\s+/g, " ").trim();
  if (!author) return generated;
  if (!generated || author.toLowerCase().includes(generated.toLowerCase())) return author;
  return `${author} ${generated}`;
}

/** Cuts at a sentence or word boundary so a description is never left half-said mid-word. */
function clip(value: string, limit: number) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const sentence = cut.lastIndexOf(". ");
  if (sentence > limit * 0.6) return cut.slice(0, sentence + 1);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:]$/, "");
}
