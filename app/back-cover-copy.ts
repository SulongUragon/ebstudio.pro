/** Back cover copy rules shared by the editor, the API, and the cover export. */
export const BLURB_MIN_WORDS = 60;
export const BLURB_MAX_WORDS = 230;

export function countBlurbWords(blurb: string) {
  return blurb.trim().split(/\s+/).filter(Boolean).length;
}

/** Replaces em and en dashes the way the rest of EB Studio Pro writes. */
export function removeDashes(text: string) {
  return text
    .replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, "$1 to $2")
    .replace(/\s*[\u2014\u2013]\s*/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*([.!?])/g, "$1");
}
