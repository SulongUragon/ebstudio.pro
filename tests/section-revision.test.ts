import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/generate/route";
import {
  applySectionRevision,
  countWords,
  describeWordChange,
  revisionDirection,
  revisionLengthOk,
  undoSectionRevision,
  validateRevisionRequest,
} from "../app/section-revision";
import { createLongFictionManuscript } from "./fixtures/publishing-manuscripts";

const words = (count: number, word = "word") => Array.from({ length: count }, () => word).join(" ");

test("revision requests are validated before any writer is called", () => {
  assert.match(validateRevisionRequest(undefined) ?? "", /Choose how/);
  assert.match(validateRevisionRequest({ mode: "expand", content: " " }) ?? "", /no text/);
  assert.match(validateRevisionRequest({ mode: "instruction", content: "text" }) ?? "", /Write a note/);
  assert.match(
    validateRevisionRequest({ mode: "instruction", content: "text", instruction: "x".repeat(1201) }) ?? "",
    /under 1200/,
  );
  assert.equal(validateRevisionRequest({ mode: "instruction", content: "text", instruction: "More tension." }), null);
  assert.equal(validateRevisionRequest({ mode: "tighten", content: "text" }), null);
});

test("expand must grow the chapter and tighten must shrink it", () => {
  const original = words(1000);
  assert.equal(revisionLengthOk("expand", original, words(1300)), true);
  assert.equal(revisionLengthOk("expand", original, words(1100)), false);
  assert.equal(revisionLengthOk("tighten", original, words(780)), true);
  assert.equal(revisionLengthOk("tighten", original, words(950)), false);
  assert.equal(revisionLengthOk("instruction", original, words(900)), true);
  assert.equal(revisionLengthOk("instruction", original, words(100)), false);
});

test("revision directions carry word targets and the author's note", () => {
  assert.match(revisionDirection("expand", "", 1000), /1300 and 1500 words/);
  assert.match(revisionDirection("tighten", "", 1000), /700 and 800 words/);
  assert.match(revisionDirection("instruction", "End on her decision.", 1000), /End on her decision\./);
  for (const mode of ["expand", "tighten", "instruction"] as const) {
    assert.doesNotMatch(revisionDirection(mode, "note", 1000), /[—–]/);
  }
});

test("a revision keeps the old version and undo restores it", () => {
  const book = createLongFictionManuscript();
  const original = book.sections[1];
  const revised = applySectionRevision(book, 1, { content: "New text.", summary: "New summary." });

  assert.equal(revised.sections[1].content, "New text.");
  assert.equal(revised.sections[1].title, original.title);
  assert.deepEqual(revised.sections[1].previousVersion, { content: original.content, summary: original.summary });
  assert.equal(book.sections[1].content, original.content, "the source manuscript is not mutated");
  assert.equal(revised.sections[0], book.sections[0]);

  const restored = undoSectionRevision(revised, 1);
  assert.equal(restored.sections[1].content, original.content);
  assert.equal(restored.sections[1].summary, original.summary);
  assert.equal(restored.sections[1].previousVersion, undefined);
  assert.equal(undoSectionRevision(restored, 1), restored, "nothing to undo returns the same book");
});

test("word change messages", () => {
  assert.equal(describeWordChange(words(10), words(25)), "15 words added.");
  assert.equal(describeWordChange(words(25), words(10)), "15 words removed.");
  assert.equal(describeWordChange(words(10), words(10)), "Same length as before.");
  assert.equal(countWords("  one two\nthree "), 3);
});

async function withMockedOpenAI<T>(replies: string[], run: (prompts: string[]) => Promise<T>) {
  const originalFetch = globalThis.fetch;
  const originalKeys = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    MOONSHOT_API_KEY: process.env.MOONSHOT_API_KEY,
  };
  process.env.OPENAI_API_KEY = "test-key";
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.MOONSHOT_API_KEY;
  const prompts: string[] = [];
  let call = 0;
  globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    prompts.push(String(init?.body ?? ""));
    const content = replies[Math.min(call, replies.length - 1)];
    call += 1;
    return new Response(JSON.stringify({ output_text: JSON.stringify({ content, summary: "Revised summary." }) }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  try {
    return await run(prompts);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalKeys)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function reviseRequest(mode: "expand" | "tighten" | "instruction", content: string, instruction?: string) {
  const book = createLongFictionManuscript();
  return new Request("http://localhost/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "revise_section",
      mode: book.mode,
      brief: book.brief,
      plan: book.plan,
      section: book.plan[1],
      sectionIndex: 1,
      previousSummaries: [book.sections[0].summary],
      revision: { mode, content, instruction },
      provider: "openai",
    }),
  });
}

test("revise_section returns the expanded chapter from the writer", async () => {
  await withMockedOpenAI([words(1400, "longer")], async (prompts) => {
    const response = await POST(reviseRequest("expand", words(1000)));
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(countWords(data.content), 1400);
    assert.equal(data.summary, "Revised summary.");
    assert.equal(prompts.length, 1);
    assert.match(prompts[0], /Expand this chapter/);
    assert.match(prompts[0], /past tense/);
  });
});

test("revise_section retries once, then refuses an expand that did not grow", async () => {
  await withMockedOpenAI([words(1000, "same")], async (prompts) => {
    const response = await POST(reviseRequest("expand", words(1000)));
    const data = await response.json();
    assert.equal(response.status, 422);
    assert.match(data.error, /could not expand/);
    assert.match(data.error, /not changed/);
    assert.equal(prompts.length, 2);
  });
});

test("revise_section applies the author's note", async () => {
  await withMockedOpenAI([words(980, "edited")], async (prompts) => {
    const response = await POST(reviseRequest("instruction", words(1000), "Make the ending quieter."));
    assert.equal(response.status, 200);
    assert.match(prompts[0], /Make the ending quieter\./);
  });
});

test("revise_section rejects a missing note without calling a writer", async () => {
  await withMockedOpenAI([words(10)], async (prompts) => {
    const response = await POST(reviseRequest("instruction", words(1000), "  "));
    assert.equal(response.status, 400);
    assert.equal(prompts.length, 0);
  });
});
