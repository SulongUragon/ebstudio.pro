import type { BookVoice, Manuscript } from "./book-types";

/** Voice and style lock rules shared by the editor and the API. */
export const VOICE_SAMPLE_MIN_WORDS = 150;
export const VOICE_SAMPLE_MAX_WORDS = 1500;
export const VOICE_NOTES_MAX_CHARACTERS = 600;
export const VOICE_PROFILE_MAX_CHARACTERS = 2000;
/** How much of the sample travels with each chapter request, as a style reference. */
export const VOICE_EXCERPT_CHARACTERS = 1200;
export const DEFAULT_VOICE_STORAGE_KEY = "eb-studio-pro-default-voice";

export function countVoiceWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Returns an error message for a sample that cannot be analyzed, or null. */
export function validateVoiceSample(sample: string | undefined) {
  const words = countVoiceWords(sample ?? "");
  if (words < VOICE_SAMPLE_MIN_WORDS) {
    return `Paste at least ${VOICE_SAMPLE_MIN_WORDS} words of your own writing so EB can learn your voice.`;
  }
  if (words > VOICE_SAMPLE_MAX_WORDS) {
    return `Keep the sample under ${VOICE_SAMPLE_MAX_WORDS} words. A few strong pages are enough.`;
  }
  return null;
}

export function hasVoice(voice: BookVoice | undefined) {
  return Boolean(voice?.profile?.trim() || voice?.notes?.trim() || voice?.sample?.trim());
}

/** Trims every part of a voice to its limits so a request never carries an oversized block. */
export function normalizeVoice(voice: BookVoice | undefined): BookVoice | undefined {
  if (!voice || typeof voice !== "object") return undefined;
  const clean = (value: unknown, limit: number) => (typeof value === "string" ? value.trim().slice(0, limit) : "");
  const sampleWords = (typeof voice.sample === "string" ? voice.sample : "").trim().split(/\s+/).filter(Boolean);
  const normalized: BookVoice = {
    sample: sampleWords.slice(0, VOICE_SAMPLE_MAX_WORDS).join(" "),
    notes: clean(voice.notes, VOICE_NOTES_MAX_CHARACTERS),
    profile: clean(voice.profile, VOICE_PROFILE_MAX_CHARACTERS),
  };
  return hasVoice(normalized) ? normalized : undefined;
}

/**
 * Locks (or removes) a voice on a book that already exists. Chapters already
 * written stay as they are; only later rewrites and blurbs use the new voice.
 */
export function setBookVoice(book: Manuscript, voice: BookVoice | undefined): Manuscript {
  const normalized = normalizeVoice(voice);
  const brief = { ...book.brief };
  if (normalized) brief.voice = normalized;
  else delete brief.voice;
  return { ...book, brief };
}

/** Cuts the sample at a sentence end near the excerpt limit. */
export function voiceExcerpt(sample: string) {
  const text = sample.replace(/\s+/g, " ").trim();
  if (text.length <= VOICE_EXCERPT_CHARACTERS) return text;
  const cut = text.slice(0, VOICE_EXCERPT_CHARACTERS);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return (end > VOICE_EXCERPT_CHARACTERS * 0.5 ? cut.slice(0, end + 1) : cut).trim();
}

/**
 * The block added to a writing prompt. Empty when the book has no voice, so
 * books without one get exactly the prompt they always had.
 */
export function voicePromptBlock(voice: BookVoice | undefined) {
  const locked = normalizeVoice(voice);
  if (!locked) return "";
  const parts = [
    "",
    "AUTHOR VOICE LOCK. Write in this author's own voice for the whole section. It outranks the generic premium style, but never the point of view, tense, safety, or no em dash rules above.",
  ];
  if (locked.profile) parts.push(`Style profile:\n${locked.profile}`);
  if (locked.notes) parts.push(`Author's own direction: ${locked.notes}`);
  if (locked.sample) {
    parts.push(
      `Reference passage written by the author. Match its rhythm, sentence length, diction, warmth, and humor. Do not copy, quote, or paraphrase its sentences, facts, or names:\n"""\n${voiceExcerpt(locked.sample)}\n"""`,
    );
  }
  return `${parts.join("\n")}\n`;
}
