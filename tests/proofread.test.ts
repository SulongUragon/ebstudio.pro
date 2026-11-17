import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAllIssues,
  applyIssue,
  findLocalIssues,
  issuePreview,
  mergeIssues,
  shiftIssues,
  splitForProofread,
  validateAiIssues,
} from "../app/proofread";

const fixAll = (text: string) => applyAllIssues(text, findLocalIssues(text)).content;

test("extra spaces between words, at line ends and line starts are fixed", () => {
  assert.equal(fixAll("She  walked   home."), "She walked home.");
  assert.equal(fixAll("First line.   \nSecond line."), "First line.\nSecond line.");
  assert.equal(fixAll("  She opened the door."), "She opened the door.");
});

test("space before punctuation and missing space after it are fixed", () => {
  assert.equal(fixAll("Wait , he said ."), "Wait, he said.");
  assert.equal(fixAll("It was late.The house was dark."), "It was late. The house was dark.");
  assert.equal(fixAll("yes,but not now"), "yes, but not now");
});

test("too many blank lines become one paragraph break", () => {
  assert.equal(fixAll("One.\n\n\n\nTwo.\n \n\nThree."), "One.\n\nTwo.\n\nThree.");
});

test("doubled words are fixed but correct doubles and proper names stay", () => {
  assert.equal(fixAll("She opened the the door."), "She opened the door.");
  assert.equal(fixAll("The the door opened."), "The door opened.");
  assert.equal(fixAll("She had had enough."), "She had had enough.");
  assert.equal(fixAll("They flew to Bora Bora."), "They flew to Bora Bora.");
});

test("clean prose, ellipses, abbreviations, times and URLs are left alone", () => {
  const clean = "Mr. Okafor left at 3:30 p.m. and said... nothing. See loudminds.club, e.g. the U.S. page.\n\nNext paragraph.";
  assert.deepEqual(findLocalIssues(clean), []);
});

test("AI findings must point at real text and only change a little of it", () => {
  const content = "She recieved the letter from Dr Okafor. Their was nothing left.";
  const issues = validateAiIssues(content, [
    { original: "She recieved the", replacement: "She received the", type: "spelling", reason: "Misspelled." },
    { original: "from Dr Okafor", replacement: "from Dr. Okafor", type: "abbreviation", reason: "Needs a period." },
    { original: "Their was", replacement: "There was", type: "word_choice", reason: "Wrong word." },
    { original: "not in the chapter", replacement: "x", type: "spelling" },
    { original: "Their was nothing left.", replacement: "Nothing at all remained for any of them anymore.", type: "word_choice" },
    { original: "the letter", replacement: "the letter—", type: "punctuation" },
  ]);
  assert.equal(issues.length, 3);
  assert.equal(applyAllIssues(content, issues).content, "She received the letter from Dr. Okafor. There was nothing left.");
});

test("a single fix finds the right occurrence even after earlier fixes moved the text", () => {
  const content = "a  b. c  d.";
  let issues = findLocalIssues(content);
  assert.equal(issues.length, 2);
  const first = applyIssue(content, issues[0]);
  assert.ok(first);
  issues = shiftIssues(issues.slice(1), first.at, first.delta);
  const second = applyIssue(first.content, issues[0]);
  assert.equal(second?.content, "a b. c d.");
});

test("merge keeps reading order and drops overlaps", () => {
  const local = findLocalIssues("Hello  world teh end.");
  const ai = validateAiIssues("Hello  world teh end.", [{ original: "teh end", replacement: "the end", type: "spelling" }]);
  const merged = mergeIssues(ai, local);
  assert.deepEqual(merged.map((i) => i.kind), ["spacing", "spelling"]);
});

test("long chapters are split at paragraph breaks and nothing is lost", () => {
  const paragraph = "word ".repeat(400).trim();
  const text = Array.from({ length: 30 }, () => paragraph).join("\n\n");
  const chunks = splitForProofread(text, 9000);
  assert.ok(chunks.length > 1);
  assert.equal(chunks.join(""), text);
  assert.ok(chunks.every((chunk) => chunk.length <= 9000 + paragraph.length));
});

test("previews make whitespace visible for spacing problems", () => {
  const content = "She  walked.";
  const preview = issuePreview(content, findLocalIssues(content)[0]);
  assert.equal(preview.match, "e··w");
  assert.equal(preview.replacement, "e·w");
});

test("proofread_section returns only AI findings that match the chapter", async () => {
  const { POST } = await import("../app/api/generate/route");
  const { authorizedRequest } = await import("./helpers/api-access");
  const { createLongFictionManuscript } = await import("./fixtures/publishing-manuscripts");
  const book = createLongFictionManuscript();
  const content = "She recieved the letter from Dr Okafor.\n\nIt was late.";
  const originalFetch = globalThis.fetch;
  const keys = { OPENAI_API_KEY: process.env.OPENAI_API_KEY, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, MOONSHOT_API_KEY: process.env.MOONSHOT_API_KEY };
  process.env.OPENAI_API_KEY = "test-key";
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.MOONSHOT_API_KEY;
  const prompts: string[] = [];
  globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    prompts.push(String(init?.body ?? ""));
    const issues = [
      { original: "She recieved the", replacement: "She received the", type: "spelling", reason: "Misspelled." },
      { original: "from Dr Okafor", replacement: "from Dr. Okafor", type: "abbreviation", reason: "Needs a period." },
      { original: "invented text", replacement: "other text", type: "spelling", reason: "Not real." },
    ];
    return new Response(JSON.stringify({ output_text: JSON.stringify({ issues }) }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    const response = await POST(
      await authorizedRequest("http://localhost/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "proofread_section", mode: book.mode, brief: book.brief, proofread: { content, title: "Chapter One" }, provider: "openai" }),
      }),
    );
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(data.issues.map((issue: { replacement: string }) => issue.replacement), ["She received the", "from Dr. Okafor"]);
    assert.match(prompts[0], /recieved/);
    assert.doesNotMatch(prompts[0], /—/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(keys)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
