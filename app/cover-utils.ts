import type { Manuscript } from "./book-types";

export function resolveExactCoverTitle(manuscript: Manuscript, candidate: string) {
  return (
    candidate.trim() ||
    manuscript.title.trim() ||
    manuscript.brief.title.trim()
  );
}

export function contrastingTextStroke(color: string) {
  const normalized = color.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return "rgba(0,0,0,.78)";
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance > 145 ? "rgba(0,0,0,.78)" : "rgba(255,255,255,.82)";
}
