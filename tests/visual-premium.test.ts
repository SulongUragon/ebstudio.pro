import assert from "node:assert/strict";
import test from "node:test";
import { isCompleteSentence, splitIntoCompleteSentences } from "../app/visual-book-exporters";
import { normalizeVisualPages } from "../app/visual-book-utils";
import { buildVisualImagePrompt, premiumArtFinish } from "../app/visual-image-prompt";
import { isPremiumProject, parseColor, premiumSequence, pullQuoteFor, roman } from "../app/visual-premium";
import { blankVisualBookBrief, type VisualBookPage, type VisualBookProject } from "../app/visual-book-types";

function project(pageCount: number, visualStyle: VisualBookProject["visualStyle"] = "cinematic-editorial"): VisualBookProject {
  const pages: VisualBookPage[] = Array.from({ length: pageCount }, (_, index) => ({
    id: `p${index + 1}`,
    pageNumber: index + 1,
    role: index === 0 ? "cover" : index === pageCount - 1 ? "cta" : "content",
    title: `Page ${index + 1}`,
    body: "A complete sentence sits here.",
    imagePrompt: "",
    layout: "image-top",
  }));
  return { ...blankVisualBookBrief(), title: "What Stayed", visualStyle, id: "x", createdAt: "2026-11-15T00:00:00Z", updatedAt: "", pages };
}

test("the premium book wraps the storyboard in a title page, contents, colophon, and back cover", () => {
  const sheets = premiumSequence(project(7));
  assert.deepEqual(sheets.map(sheet => sheet.kind), ["cover", "title", "contents", "page", "page", "page", "page", "page", "page", "colophon", "back"]);
  assert.deepEqual(sheets.map(sheet => sheet.folio), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  const chapters = sheets.flatMap(sheet => (sheet.kind === "page" ? [sheet.chapter] : []));
  assert.deepEqual(chapters, [1, 2, 3, 4, 5, 6]);
});

test("short books skip the contents page", () => {
  assert.deepEqual(premiumSequence(project(5)).map(sheet => sheet.kind), ["cover", "title", "page", "page", "page", "page", "colophon", "back"]);
});

test("only the editorial styles use the premium design", () => {
  for (const style of ["cinematic-editorial", "warm-storybook", "dark-luxury", "clean-modern", "bold-color", "ink-noir"] as const) {
    assert.equal(isPremiumProject({ visualStyle: style }), true, style);
  }
  assert.equal(isPremiumProject({ visualStyle: "notebook-reflection" }), false);
  assert.equal(isPremiumProject({ visualStyle: "warm-practical-guide" }), false);
});

test("sentences that end in a preposition are kept, not silently dropped", () => {
  const body = "She starts in the living room because it is the easiest to lie to herself about. The couch goes first.";
  assert.equal(splitIntoCompleteSentences(body).length, 2);
  assert.equal(isCompleteSentence("It was the one thing she was waiting for."), true);
  assert.equal(isCompleteSentence("The page stops with the."), false);
});

test("the AI pull quote is used when it is a whole sentence, otherwise one is picked from the page", () => {
  const body = "She counts the hangers. There is relief in this kind of order, the kind that does not ask her to feel. The rod is bare.";
  assert.equal(pullQuoteFor({ pullQuote: "There is relief in this kind of order, the kind that does not ask her to feel." }, body), "There is relief in this kind of order, the kind that does not ask her to feel.");
  assert.equal(pullQuoteFor({ pullQuote: "" }, body), "There is relief in this kind of order, the kind that does not ask her to feel.");
  assert.equal(pullQuoteFor({ pullQuote: "half a thought" }, "Short one. Tiny."), "");
});

test("the storyboard keeps each page's pull quote", () => {
  const [, page] = normalizeVisualPages([{ title: "Cover" }, { title: "One", body: "Body.", pull_quote: "The line to underline." }], 2);
  assert.equal(page.pullQuote, "The line to underline.");
});

test("premium art finish matches the style and the prompt still fits the backup model", () => {
  assert.match(premiumArtFinish("cinematic-editorial"), /film grain/);
  assert.match(premiumArtFinish("warm-storybook"), /illustration/);
  assert.equal(premiumArtFinish("notebook-reflection"), "");
  const long = buildVisualImagePrompt({
    scene: "s ".repeat(900),
    camera: "c ".repeat(300),
    style: "t ".repeat(600),
    characterBible: "Mara has a red scarf. ".repeat(120),
    palette: "p ".repeat(500),
    finish: premiumArtFinish("dark-luxury"),
    referenceNames: ["Mara", "Pip"],
  });
  assert.ok(long.length <= 2000, `prompt was ${long.length} characters`);
  assert.ok(long.includes("Finish: fine art editorial photography"));
});

test("pdf helpers read canvas colors and chapter numerals", () => {
  assert.deepEqual(parseColor("#d4a843"), { r: 212, g: 168, b: 67, a: 1 });
  assert.deepEqual(parseColor("rgba(243, 234, 217, 0.7)"), { r: 243, g: 234, b: 217, a: 0.7 });
  assert.deepEqual([1, 4, 9, 14, 40].map(roman), ["I", "IV", "IX", "XIV", "XL"]);
});
