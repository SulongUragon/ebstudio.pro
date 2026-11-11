import type { Manuscript, SectionContent } from "./book-types";

export type RevisionMode = "instruction" | "expand" | "tighten";

export const REVISION_MODES: RevisionMode[] = ["instruction", "expand", "tighten"];

export const MAX_REVISION_INSTRUCTION_CHARACTERS = 1200;

/** Target change in word count for each mode, as a fraction of the original. */
export const REVISION_TARGETS = {
  expand: { min: 0.3, max: 0.5 },
  tighten: { min: 0.2, max: 0.3 },
} as const;

export function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function isRevisionMode(value: unknown): value is RevisionMode {
  return typeof value === "string" && (REVISION_MODES as string[]).includes(value);
}

export type RevisionRequest = {
  mode: RevisionMode;
  instruction?: string;
  content: string;
};

/** Checks a revision request before it is sent to a writer. Returns an error message or null. */
export function validateRevisionRequest(revision: Partial<RevisionRequest> | undefined) {
  if (!revision || !isRevisionMode(revision.mode)) return "Choose how this chapter should change.";
  if (!revision.content?.trim()) return "This chapter has no text to revise yet.";
  if (revision.mode === "instruction") {
    const instruction = revision.instruction?.trim() ?? "";
    if (!instruction) return "Write a note telling EB what to change in this chapter.";
    if (instruction.length > MAX_REVISION_INSTRUCTION_CHARACTERS) {
      return `Keep the note under ${MAX_REVISION_INSTRUCTION_CHARACTERS} characters.`;
    }
  }
  return null;
}

/**
 * Expand must actually grow the chapter and Tighten must actually shrink it.
 * A small tolerance keeps a near miss from forcing a second paid generation.
 */
export function revisionLengthOk(mode: RevisionMode, before: string, after: string) {
  const original = countWords(before);
  const revised = countWords(after);
  if (!revised) return false;
  if (mode === "expand") return revised >= original * (1 + REVISION_TARGETS.expand.min * 0.6);
  if (mode === "tighten") return revised <= original * (1 - REVISION_TARGETS.tighten.min * 0.6);
  return revised >= original * 0.4;
}

export function revisionDirection(mode: RevisionMode, instruction = "", originalWords = 0) {
  if (mode === "expand") {
    const low = Math.round(originalWords * (1 + REVISION_TARGETS.expand.min));
    const high = Math.round(originalWords * (1 + REVISION_TARGETS.expand.max));
    return `Expand this chapter from about ${originalWords} words to between ${low} and ${high} words. Deepen what is already here: dramatize moments that are summarized, add sensory and emotional detail, sharpen dialogue, or add concrete examples and steps for non-fiction. Do not add filler, recap, or new plot events, and do not change what happens or what the chapter teaches.`;
  }
  if (mode === "tighten") {
    const low = Math.round(originalWords * (1 - REVISION_TARGETS.tighten.max));
    const high = Math.round(originalWords * (1 - REVISION_TARGETS.tighten.min));
    return `Tighten this chapter from about ${originalWords} words to between ${low} and ${high} words. Cut repetition, throat clearing, over explanation, filler transitions, and redundant description. Keep every plot event, key point, example, and line of dialogue that matters, and keep the author's voice.`;
  }
  return `Apply this note from the author to the chapter:
"""
${instruction.trim()}
"""
Change only what the note asks for. Keep everything the note does not touch as close to the original as possible, including events, facts, voice, and length, unless the note asks to change them.`;
}

/** Replaces a section's text and keeps the version it replaced so the author can undo. */
export function applySectionRevision(
  manuscript: Manuscript,
  index: number,
  next: { content: string; summary: string },
  basePlan?: Partial<SectionContent>,
): Manuscript {
  const sections = [...manuscript.sections];
  const current = sections[index];
  const previousVersion =
    current?.content?.trim() ? { content: current.content, summary: current.summary } : undefined;
  sections[index] = {
    ...(current ?? {}),
    ...(basePlan ?? {}),
    content: next.content,
    summary: next.summary,
    previousVersion,
  } as SectionContent;
  return { ...manuscript, sections };
}

/** Restores the version a section had before its last revision. */
export function undoSectionRevision(manuscript: Manuscript, index: number): Manuscript {
  const current = manuscript.sections[index];
  if (!current?.previousVersion) return manuscript;
  const sections = [...manuscript.sections];
  sections[index] = {
    ...current,
    content: current.previousVersion.content,
    summary: current.previousVersion.summary,
    previousVersion: undefined,
  };
  return { ...manuscript, sections };
}

export function describeWordChange(before: string, after: string) {
  const delta = countWords(after) - countWords(before);
  if (delta === 0) return "Same length as before.";
  const amount = Math.abs(delta).toLocaleString("en-US");
  return delta > 0 ? `${amount} words added.` : `${amount} words removed.`;
}
