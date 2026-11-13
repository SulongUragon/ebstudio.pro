import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/generate/route";
import type { BookVoice } from "../app/book-types";
import {
  hasVoice,
  normalizeVoice,
  validateVoiceSample,
  VOICE_EXCERPT_CHARACTERS,
  setBookVoice,
  voiceExcerpt,
  voicePromptBlock,
} from "../app/voice-style";
import { createLongFictionManuscript } from "./fixtures/publishing-manuscripts";
import { authorizedRequest } from "./helpers/api-access";

const SAMPLE = Array.from(
  { length: 40 },
  (_, index) => `Morning came slow over the river town ${index}. I poured the coffee and let it go cold.`,
).join(" ");

const VOICE: BookVoice = {
  sample: SAMPLE,
  notes: "short sentences, warm, no jargon",
  profile: "Sentence rhythm: short and plain.\nDiction: everyday words.\nTone: warm.\nAvoid: jargon.",
};

test("voice samples must be long enough to learn from and short enough to send", () => {
  assert.match(validateVoiceSample("Too short.") ?? "", /at least 150 words/);
  assert.match(validateVoiceSample("word ".repeat(1600)) ?? "", /under 1500 words/);
  assert.equal(validateVoiceSample(SAMPLE), null);
});

test("an empty voice adds nothing to a prompt", () => {
  assert.equal(voicePromptBlock(undefined), "");
  assert.equal(voicePromptBlock({}), "");
  assert.equal(voicePromptBlock({ sample: "  ", notes: "", profile: "" }), "");
  assert.equal(hasVoice({ notes: "   " }), false);
});

test("the voice block carries profile, notes, and a sentence-bounded excerpt, never the whole sample", () => {
  const block = voicePromptBlock(VOICE);
  assert.match(block, /AUTHOR VOICE LOCK/);
  assert.match(block, /Sentence rhythm: short and plain\./);
  assert.match(block, /short sentences, warm, no jargon/);
  assert.match(block, /Do not copy, quote, or paraphrase/);
  assert.ok(SAMPLE.length > VOICE_EXCERPT_CHARACTERS);
  const excerpt = voiceExcerpt(SAMPLE);
  assert.ok(excerpt.length <= VOICE_EXCERPT_CHARACTERS);
  assert.ok(excerpt.endsWith("."));
  assert.doesNotMatch(block, /[\u2014\u2013]/);
});

test("voices are trimmed to their limits", () => {
  const normalized = normalizeVoice({ sample: "word ".repeat(2000), notes: "n".repeat(900), profile: "p".repeat(3000) });
  assert.ok(normalized);
  assert.equal(normalized.sample?.split(" ").length, 1500);
  assert.equal(normalized.notes?.length, 600);
  assert.equal(normalized.profile?.length, 2000);
});

async function captureWriterPrompt(body: Record<string, unknown>, output: Record<string, unknown>) {
  const originalFetch = globalThis.fetch;
  const saved = { ...process.env };
  process.env.OPENAI_API_KEY = "test";
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.MOONSHOT_API_KEY;
  let prompt = "";
  globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    prompt = String(init?.body ?? "");
    return new Response(JSON.stringify({ status: "completed", output_text: JSON.stringify(output) }), { status: 200 });
  }) as typeof fetch;
  try {
    const response = await POST(
      await authorizedRequest("http://localhost/api/generate", { method: "POST", body: JSON.stringify({ provider: "openai", ...body }) }),
    );
    return { response, prompt };
  } finally {
    globalThis.fetch = originalFetch;
    process.env = saved;
  }
}

function sectionBody(voice?: BookVoice) {
  const book = createLongFictionManuscript();
  return {
    action: "section",
    mode: book.mode,
    brief: { ...book.brief, voice },
    plan: book.plan,
    section: book.plan[1],
    sectionIndex: 1,
    previousSummaries: [book.sections[0].summary],
  };
}

const LONG_SECTION = { content: Array.from({ length: 400 }, () => "She walked on.").join(" "), summary: "She walked on." };

test("chapter prompts carry the locked voice", async () => {
  const { prompt } = await captureWriterPrompt(sectionBody(VOICE), LONG_SECTION);
  assert.match(prompt, /AUTHOR VOICE LOCK/);
  assert.match(prompt, /short sentences, warm, no jargon/);
});

test("chapter prompts are unchanged for books without a voice", async () => {
  const without = await captureWriterPrompt(sectionBody(undefined), LONG_SECTION);
  const empty = await captureWriterPrompt(sectionBody({ sample: "", notes: "", profile: "" }), LONG_SECTION);
  assert.doesNotMatch(without.prompt, /AUTHOR VOICE LOCK/);
  assert.equal(without.prompt, empty.prompt);
});

test("rewrites and back cover blurbs carry the locked voice", async () => {
  const book = createLongFictionManuscript();
  const revise = await captureWriterPrompt(
    {
      action: "revise_section",
      mode: book.mode,
      brief: { ...book.brief, voice: VOICE },
      plan: book.plan,
      section: book.plan[1],
      sectionIndex: 1,
      revision: { mode: "instruction", content: "word ".repeat(1000), instruction: "Make it quieter." },
    },
    { content: "word ".repeat(990), summary: "Quieter." },
  );
  assert.match(revise.prompt, /AUTHOR VOICE LOCK/);

  const blurb = await captureWriterPrompt(
    {
      action: "back_cover_blurb",
      mode: book.mode,
      brief: { ...book.brief, title: book.title, author: book.author, voice: VOICE },
      manuscript: { sections: [] },
    },
    { blurb: "word ".repeat(140) },
  );
  assert.match(blurb.prompt, /AUTHOR VOICE LOCK/);
});

test("voice_profile returns a dash-free style profile", async () => {
  const { response, prompt } = await captureWriterPrompt(
    { action: "voice_profile", voice: { sample: SAMPLE, notes: "keep it warm" } },
    { profile: "Sentence rhythm: short \u2014 plain.\nDiction: everyday.\nTone: warm.\nOpenings and endings: quiet.\nAvoid: jargon." },
  );
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.doesNotMatch(data.profile, /[\u2014\u2013]/);
  assert.match(data.profile, /Sentence rhythm/);
  assert.match(prompt, /keep it warm/);
});

test("voice_profile refuses a sample that is too short without calling a writer", async () => {
  const { response, prompt } = await captureWriterPrompt({ action: "voice_profile", voice: { sample: "Too short." } }, {});
  assert.equal(response.status, 400);
  assert.equal(prompt, "");
});

test("a voice locked on a finished book reaches its next rewrite, and removing it restores the old prompt", async () => {
  const book = createLongFictionManuscript();
  const reviseBody = (target: typeof book) => ({
    action: "revise_section",
    mode: target.mode,
    brief: target.brief,
    plan: target.plan,
    section: target.plan[1],
    sectionIndex: 1,
    revision: { mode: "tighten", content: "word ".repeat(1000), instruction: "" },
  });
  const output = { content: "word ".repeat(900), summary: "Tighter." };

  const locked = setBookVoice(book, VOICE);
  assert.equal(locked.sections, book.sections);
  assert.equal(book.brief.voice, undefined);
  const withVoice = await captureWriterPrompt(reviseBody(locked), output);
  assert.match(withVoice.prompt, /AUTHOR VOICE LOCK/);

  const removed = setBookVoice(locked, undefined);
  assert.equal("voice" in removed.brief, false);
  const before = await captureWriterPrompt(reviseBody(book), output);
  const after = await captureWriterPrompt(reviseBody(removed), output);
  assert.equal(after.prompt, before.prompt);
});
