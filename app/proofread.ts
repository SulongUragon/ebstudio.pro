/**
 * Proofread a chapter: spacing problems are found here in code (free, instant),
 * spelling, abbreviation, and wrong-word problems come from the AI writer and are
 * validated here before the author sees them. A fix only ever replaces the exact
 * flagged text, so the rest of the chapter is never rewritten.
 */

export type ProofIssueKind = "spacing" | "repeat" | "spelling" | "abbreviation" | "word_choice" | "punctuation";

export type ProofIssue = {
  id: string;
  kind: ProofIssueKind;
  /** Exact text in the chapter that will be replaced. */
  match: string;
  replacement: string;
  reason: string;
  /** Where the match was found when the check ran. Used to pick the right occurrence. */
  start: number;
};

export const PROOF_KIND_LABELS: Record<ProofIssueKind, string> = {
  spacing: "Spacing",
  repeat: "Repeated word",
  spelling: "Spelling",
  abbreviation: "Abbreviation",
  word_choice: "Wrong word",
  punctuation: "Punctuation",
};

export const MAX_PROOFREAD_CHARACTERS = 120000;
export const PROOFREAD_CHUNK_CHARACTERS = 18000;
export const MAX_AI_ISSUES_PER_CHUNK = 60;

/** Repeated words that are often correct English ("had had", "that that"). */
const ALLOWED_REPEATS = new Set(["had", "that", "is", "do", "very", "no", "so", "bye", "ha", "knock", "now", "go", "come", "yes", "well", "oh", "far", "more", "again", "slowly", "out"]);

const DASHES = /[–—]/;

type Found = { kind: ProofIssueKind; start: number; end: number; replacement: string; reason: string };

/** Grows a whitespace match by one visible character on each side so it can be found again later. */
function withContext(content: string, start: number, end: number, replacement: string) {
  let s = start;
  let e = end;
  let prefix = "";
  let suffix = "";
  if (s > 0 && content[s - 1] !== "\n") {
    s -= 1;
    prefix = content[s];
  }
  if (e < content.length && content[e] !== "\n") {
    suffix = content[e];
    e += 1;
  }
  return { start: s, match: content.slice(s, e), replacement: `${prefix}${replacement}${suffix}` };
}

/** Finds spacing and repeated-word problems without any AI call. */
export function findLocalIssues(content: string): ProofIssue[] {
  const found: Found[] = [];
  const add = (kind: ProofIssueKind, start: number, end: number, replacement: string, reason: string) =>
    found.push({ kind, start, end, replacement, reason });

  // Two or more spaces between words.
  for (const m of content.matchAll(/(?<=\S)[ \t]{2,}(?=\S)/g)) {
    add("spacing", m.index, m.index + m[0].length, " ", "Extra space between words.");
  }
  // Spaces at the end of a line.
  for (const m of content.matchAll(/(?<=\S)[ \t]+(?=\n|$)/g)) {
    add("spacing", m.index, m.index + m[0].length, "", "Extra space at the end of a line.");
  }
  // Spaces at the start of a paragraph line (not list items or quotes).
  for (const m of content.matchAll(/(?<=^|\n)[ \t]+(?=[A-Za-z"'“‘])/g)) {
    add("spacing", m.index, m.index + m[0].length, "", "Extra space at the start of a line.");
  }
  // Space before a comma, period, semicolon, colon, question or exclamation mark.
  for (const m of content.matchAll(/(?<=[A-Za-z0-9"'”’)])[ \t]+(?=[,.;:!?](?!\.\.))/g)) {
    add("spacing", m.index, m.index + m[0].length, "", "Space before punctuation.");
  }
  // Missing space after punctuation: "end.The", "yes,but", "wait;then".
  for (const m of content.matchAll(/(?<=[a-z”’)])([.,;!?])(?=[A-Z][a-z])|(?<=[a-z])([,;])(?=[a-z])/g)) {
    const at = m.index + 1;
    add("spacing", at, at, " ", "Missing space after punctuation.");
  }
  // Three or more line breaks in a row.
  for (const m of content.matchAll(/\n[ \t]*\n(?:[ \t]*\n)+/g)) {
    add("spacing", m.index, m.index + m[0].length, "\n\n", "Too many blank lines between paragraphs.");
  }
  // The same word twice in a row: "the the".
  for (const m of content.matchAll(/\b([A-Za-z]+)([ \t]+)\1\b/gi)) {
    const word = m[1];
    if (ALLOWED_REPEATS.has(word.toLowerCase())) continue;
    const second = m[0].slice(m[1].length + m[2].length);
    // "Bora Bora", "Baden Baden": doubled proper names are left alone.
    if (/^[A-Z]/.test(word) && /^[A-Z]/.test(second)) continue;
    add("repeat", m.index, m.index + m[0].length, word, `"${word}" appears twice in a row.`);
  }

  found.sort((a, b) => a.start - b.start);
  const issues: ProofIssue[] = [];
  let lastEnd = -1;
  for (const item of found) {
    if (item.start < lastEnd) continue; // overlapping problems: keep the first
    lastEnd = Math.max(item.end, item.start + 1);
    const grown = item.kind === "repeat"
      ? { start: item.start, match: content.slice(item.start, item.end), replacement: item.replacement }
      : withContext(content, item.start, item.end, item.replacement);
    if (!grown.match || grown.match === grown.replacement) continue;
    issues.push({
      id: `local-${item.start}-${issues.length}`,
      kind: item.kind,
      match: grown.match,
      replacement: grown.replacement,
      reason: item.reason,
      start: grown.start,
    });
  }
  return issues;
}

/** Splits a chapter into pieces the AI can read in full, at paragraph breaks. */
export function splitForProofread(content: string, size = PROOFREAD_CHUNK_CHARACTERS) {
  const paragraphs = content.split(/(\n\s*\n)/);
  const chunks: string[] = [];
  let current = "";
  for (const part of paragraphs) {
    if (current.length + part.length > size && current.trim()) {
      chunks.push(current);
      current = "";
    }
    current += part;
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}

export type RawAiIssue = { original?: unknown; replacement?: unknown; type?: unknown; reason?: unknown };

const AI_KINDS: ProofIssueKind[] = ["spelling", "abbreviation", "word_choice", "punctuation"];

function letters(text: string) {
  return text.replace(/[^A-Za-z]/g, "").toLowerCase();
}

/**
 * Keeps only AI findings that point at real text in the chapter and change a small part of it.
 * Anything that looks like a rewrite, adds a dash, or cannot be found is dropped.
 */
export function validateAiIssues(content: string, raw: RawAiIssue[]): ProofIssue[] {
  const issues: ProofIssue[] = [];
  const used = new Set<number>();
  for (const item of raw) {
    const match = typeof item.original === "string" ? item.original : "";
    const replacement = typeof item.replacement === "string" ? item.replacement : "";
    const kind = AI_KINDS.includes(item.type as ProofIssueKind) ? (item.type as ProofIssueKind) : "spelling";
    const reason = typeof item.reason === "string" ? item.reason.replace(DASHES, ", ").trim().slice(0, 200) : "";
    if (!match.trim() || !replacement.trim() || match === replacement) continue;
    if (match.length > 160 || DASHES.test(replacement) && !DASHES.test(match)) continue;
    if (Math.abs(match.length - replacement.length) > 24) continue;
    // A proofread fix leaves most words alone.
    const before = match.split(/\s+/);
    const after = replacement.split(/\s+/);
    const changed = after.filter((word, i) => word !== before[i]).length;
    if (changed > Math.max(2, Math.ceil(before.length / 2))) continue;
    // Spacing-only changes are handled locally, so ignore them here.
    if (match.replace(/\s+/g, " ") === replacement.replace(/\s+/g, " ")) continue;
    if (letters(match) === letters(replacement) && kind === "spelling") continue;
    // Questions ending in a period or comma are a deliberate flat delivery, and ellipses are style.
    const bare = (text: string) => text.replace(/[.,?!\u2026]/g, "");
    const count = (text: string, mark: RegExp) => (text.match(mark) ?? []).length;
    if (
      bare(match) === bare(replacement) &&
      (count(replacement, /\?/g) > count(match, /\?/g) || count(replacement, /\.\.\.|\u2026/g) > count(match, /\.\.\.|\u2026/g))
    ) continue;
    let start = content.indexOf(match);
    while (start !== -1 && used.has(start)) start = content.indexOf(match, start + 1);
    if (start === -1) continue;
    used.add(start);
    issues.push({ id: `ai-${start}-${issues.length}`, kind, match, replacement, reason: reason || "Suggested correction.", start });
  }
  return issues;
}

/** Puts local and AI findings together, in reading order, without overlaps. */
export function mergeIssues(...groups: ProofIssue[][]) {
  const all = groups.flat().sort((a, b) => a.start - b.start);
  const merged: ProofIssue[] = [];
  let lastEnd = -1;
  for (const issue of all) {
    if (issue.start < lastEnd) continue;
    merged.push(issue);
    lastEnd = issue.start + issue.match.length;
  }
  return merged;
}

/** Finds the occurrence of the issue's text closest to where it was first found. */
export function locateIssue(content: string, issue: ProofIssue) {
  let best = -1;
  let bestDistance = Infinity;
  let at = content.indexOf(issue.match);
  while (at !== -1) {
    const distance = Math.abs(at - issue.start);
    if (distance < bestDistance) {
      best = at;
      bestDistance = distance;
    }
    at = content.indexOf(issue.match, at + 1);
  }
  return best;
}

/** Applies one fix. Returns the new chapter text and how far later text moved, or null if the text changed. */
export function applyIssue(content: string, issue: ProofIssue) {
  const at = locateIssue(content, issue);
  if (at === -1) return null;
  return {
    content: `${content.slice(0, at)}${issue.replacement}${content.slice(at + issue.match.length)}`,
    at,
    delta: issue.replacement.length - issue.match.length,
  };
}

/** Moves the remembered position of the issues left after a fix. */
export function shiftIssues(issues: ProofIssue[], at: number, delta: number) {
  return issues.map((issue) => (issue.start > at ? { ...issue, start: issue.start + delta } : issue));
}

/** Applies every fix, last one first so earlier positions stay correct. */
export function applyAllIssues(content: string, issues: ProofIssue[]) {
  let next = content;
  let applied = 0;
  for (const issue of [...issues].sort((a, b) => b.start - a.start)) {
    const result = applyIssue(next, issue);
    if (!result) continue;
    next = result.content;
    applied += 1;
  }
  return { content: next, applied };
}

/** Text around an issue for display, with whitespace made visible. */
export function issuePreview(content: string, issue: ProofIssue, around = 32) {
  const at = Math.max(0, locateIssue(content, issue));
  const before = content.slice(Math.max(0, at - around), at).replace(/\s+/g, " ");
  const after = content.slice(at + issue.match.length, at + issue.match.length + around).replace(/\s+/g, " ");
  const show = (text: string) =>
    issue.kind === "spacing" ? text.replace(/\n/g, "¶").replace(/[ \t]/g, "·") : text.replace(/\s+/g, " ");
  return {
    before: (at - around > 0 ? "…" : "") + before.trimStart(),
    match: show(issue.match),
    replacement: show(issue.replacement) || "(remove)",
    after: after.trimEnd() + (at + issue.match.length + around < content.length ? "…" : ""),
  };
}

/** Runs a task for every item with at most `limit` running at once, in order of start. */
export async function runInPool<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await task(item);
    }
  });
  await Promise.all(workers);
}
