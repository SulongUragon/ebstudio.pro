import assert from "node:assert/strict";
import test from "node:test";
import { isCompleteSentence, splitIntoCompleteSentences } from "../app/visual-book-exporters";
import { normalizeVisualPages } from "../app/visual-book-utils";
import { artLookFinish, artLookOpening, buildVisualImagePrompt } from "../app/visual-image-prompt";
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

test("the art look opens the prompt and the prompt still fits the backup model", () => {
  assert.match(artLookFinish("photographic"), /film grain/);
  assert.match(artLookFinish("illustrated"), /illustration/);
  assert.match(artLookOpening("photographic"), /^One cinematic photograph.*Not a drawing, cartoon/);
  assert.equal(artLookOpening("illustrated"), "One original book illustration, artwork only.");
  const photo = buildVisualImagePrompt({ scene: "A woman packs a closet.", camera: "", style: "", characterBible: "", palette: "", look: "photographic" });
  assert.ok(photo.startsWith("One cinematic photograph"));
  const long = buildVisualImagePrompt({
    scene: "s ".repeat(900),
    camera: "c ".repeat(300),
    style: "t ".repeat(600),
    characterBible: "Mara has a red scarf. ".repeat(120),
    palette: "p ".repeat(500),
    finish: artLookFinish("photographic"),
    look: "photographic",
    referenceNames: ["Mara", "Pip"],
  });
  assert.ok(long.length <= 1760, `prompt was ${long.length} characters, leaving too little room for redraw corrections`);
  assert.ok(long.includes("Finish: editorial photography"));
});

test("pdf helpers read canvas colors and chapter numerals", () => {
  assert.deepEqual(parseColor("#d4a843"), { r: 212, g: 168, b: 67, a: 1 });
  assert.deepEqual(parseColor("rgba(243, 234, 217, 0.7)"), { r: 243, g: 234, b: 217, a: 0.7 });
  assert.deepEqual([1, 4, 9, 14, 40].map(roman), ["I", "IV", "IX", "XIV", "XL"]);
});

test("the art check reads the checker's verdict and puts corrections where the image model reads first", async () => {
  const { parseArtCheck, promptWithCorrections, checkVisualArt } = await import("../app/art-check");
  assert.deepEqual(parseArtCheck('{"passed": true, "problems": []}'), { passed: true, skipped: false, problems: [] });
  assert.deepEqual(parseArtCheck('Here: {"passed": false, "problems": ["garbled text on a page", "head turned backward"]}'), {
    passed: false, skipped: false, problems: ["garbled text on a page", "head turned backward"],
  });
  assert.equal(parseArtCheck("no json"), null);
  const fixed = promptWithCorrections("One original book illustration.\nNo text.", ["garbled text on a page"]);
  assert.equal(fixed.split("\n")[1], "The last attempt was rejected. Avoid: garbled text on a page.");
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  assert.deepEqual(await checkVisualArt("data:image/jpeg;base64,AAAA", { scene: "", characterBible: "" }), { passed: true, skipped: true, problems: [] });
  process.env.ANTHROPIC_API_KEY = "test";
  const reply = new Response(JSON.stringify({ content: [{ type: "text", text: '{"passed": false, "problems": ["extra fingers"]}' }] }), { status: 200 });
  const verdict = await checkVisualArt("data:image/jpeg;base64,AAAA", { scene: "a kitchen", characterBible: "" }, (async () => reply) as typeof fetch);
  assert.deepEqual(verdict, { passed: false, skipped: false, problems: ["extra fingers"] });
  if (saved === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved;
});

test("image prompts ask for natural anatomy and blank pages", () => {
  const prompt = buildVisualImagePrompt({ scene: "A woman kneels by a closet.", camera: "", style: "", characterBible: "", palette: "" });
  assert.match(prompt, /Natural anatomy/);
  assert.match(prompt, /Any book, page, paper, sign, or screen is blank/);
});

test("older projects get the art look that suits their style", async () => {
  const { resolveArtLook } = await import("../app/visual-book-types");
  assert.equal(resolveArtLook({ visualStyle: "cinematic-editorial", kind: "illustrated-story" }), "photographic");
  assert.equal(resolveArtLook({ visualStyle: "cinematic-editorial", kind: "children-story" }), "illustrated");
  assert.equal(resolveArtLook({ visualStyle: "warm-storybook", kind: "illustrated-story" }), "illustrated");
  assert.equal(resolveArtLook({ visualStyle: "warm-storybook", kind: "illustrated-story", artLook: "painting" }), "painting");
});

test("the photographic art check fails cartoons", async () => {
  const { artCheckInstructions } = await import("../app/art-check");
  assert.match(artCheckInstructions({ scene: "", characterBible: "", look: "photographic" }), /realistic photograph.*cartoon/);
  assert.doesNotMatch(artCheckInstructions({ scene: "", characterBible: "", look: "illustrated" }), /Required look/);
});

test("unnamed cast references match the scene by their last word", async () => {
  const { sceneNamesRef } = await import("../app/character-refs");
  assert.equal(sceneNamesRef("Interior shot of a woman kneeling beside an open closet", "The grieving woman"), true);
  assert.equal(sceneNamesRef("A woman's hands set a photo down", "The grieving woman"), true);
  assert.equal(sceneNamesRef("An armchair draped with an amber cardigan", "The wooden armchair with amber cardigan"), true);
  assert.equal(sceneNamesRef("Luma glows beside the shed", "Pip"), false);
  assert.equal(sceneNamesRef("Pip hides", "Pip"), true);
  assert.equal(sceneNamesRef("A red hat on a hook", "The big hat"), false);
});

test("fal.ai requests use Kontext max, the right aspect ratio, and references as data URIs", async () => {
  const { falRequestBody, generateFalImage, FAL_REFERENCE_MODEL, FAL_TEXT_MODEL } = await import("../app/fal-image");
  const page = falRequestBody("One cinematic photograph.", 1024, 1536);
  assert.equal(page.aspect_ratio, "2:3");
  assert.equal("image_urls" in page, false);
  const sheet = falRequestBody("Ref.", 1024, 1024, [{ bytes: new Uint8Array([1, 2, 3]), mime: "image/png" }]);
  assert.equal(sheet.aspect_ratio, "1:1");
  assert.deepEqual(sheet.image_urls, ["data:image/png;base64,AQID"]);
  const saved = process.env.FAL_KEY;
  process.env.FAL_KEY = "k";
  const calls: string[] = [];
  const fetcher = (async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push(`${url} ${init?.headers?.Authorization}`);
    return new Response(JSON.stringify({ images: [{ url: "data:image/jpeg;base64,AAAA" }], has_nsfw_concepts: [false] }), { status: 200 });
  }) as unknown as typeof fetch;
  const text = await generateFalImage("p", 1024, 1536, [], fetcher);
  const refs = await generateFalImage("p", 1024, 1536, [{ bytes: new Uint8Array([1]), mime: "image/png" }], fetcher);
  assert.equal(text.imageData, "data:image/jpeg;base64,AAAA");
  assert.deepEqual(calls, [`https://fal.run/${FAL_TEXT_MODEL} Key k`, `https://fal.run/${FAL_REFERENCE_MODEL} Key k`]);
  assert.equal(refs.model, FAL_REFERENCE_MODEL);
  const broke = (async () => new Response(JSON.stringify({ detail: "Exhausted balance" }), { status: 403 })) as unknown as typeof fetch;
  await assert.rejects(generateFalImage("p", 1024, 1536, [], broke), /credits are used up/);
  if (saved === undefined) delete process.env.FAL_KEY; else process.env.FAL_KEY = saved;
});
