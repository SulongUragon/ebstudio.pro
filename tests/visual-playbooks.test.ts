import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/generate/route";
import { COMICS_REMOVED_MESSAGE, VISUAL_BOOK_KINDS, blankVisualBookBrief } from "../app/visual-book-types";
import { POST as visualImagePost } from "../app/api/visual-image/route";
import {
  VISUAL_KIND_PLAYBOOKS,
  visualPlaybookBlock,
  visualPlaybookFor,
} from "../app/visual-playbooks";
import { authorizedRequest } from "./helpers/api-access";

const FIELDS = ["hook", "shape", "pageTurn", "voice", "ending"] as const;

test("every Mini Book Type has a complete, distinct playbook", () => {
  const all = VISUAL_BOOK_KINDS.map((kind) => VISUAL_KIND_PLAYBOOKS[kind.id]);
  assert.equal(all.length, 8);
  for (const playbook of all) {
    assert.ok(playbook, "a selectable type is missing its playbook");
    for (const field of FIELDS) {
      assert.ok(playbook[field].length >= 60, `${playbook.label} ${field} is too thin`);
      assert.doesNotMatch(playbook[field], /[\u2013\u2014]/, `${playbook.label} ${field} has a dash`);
    }
  }
  for (const field of FIELDS) {
    assert.equal(new Set(all.map((playbook) => playbook[field])).size, 8, `${field} must differ for every type`);
  }
  VISUAL_BOOK_KINDS.forEach((kind) => assert.equal(VISUAL_KIND_PLAYBOOKS[kind.id].label, kind.label));
});

test("unknown saved values fall back safely", () => {
  const visual = { ...blankVisualBookBrief(), kind: "lead-magnet" as const };
  assert.equal(visualPlaybookFor(visual).label, "Lead Magnet");
  assert.equal(visualPlaybookFor({ ...visual, kind: "retired-type" as never }).label, "Illustrated Story");
  assert.match(visualPlaybookBlock(visual), /never overrides the author's title, premise, facts/);
});

async function capturePrompt(body: Record<string, unknown>, output: Record<string, unknown>) {
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
      await authorizedRequest("http://localhost/api/generate", { method: "POST", body: JSON.stringify({ provider: "openai", mode: "fiction", brief: { title: "The Lantern Keeper" }, ...body }) }),
    );
    return { status: response.status, prompt: JSON.parse(prompt).input as string };
  } finally {
    globalThis.fetch = originalFetch;
    process.env = saved;
  }
}

const page = (number: number) => ({ page_number: number, title: `Page ${number}`, body: "Text.", image_prompt: "Art.", layout: "full-bleed" });
const project = (extra: Record<string, unknown>) => ({
  ...blankVisualBookBrief(),
  title: "The Lantern Keeper",
  premise: "A girl keeps the last lantern lit through one long storm.",
  pageCount: 3,
  ...extra,
});

test("the storyboard prompt carries the chosen type's playbook, and a different type changes it", async () => {
  const output = { refined_subtitle: "", character_bible: "", palette: "", pages: [1, 2, 3].map(page) };
  const story = await capturePrompt({ action: "visual_storyboard", visualProject: project({ kind: "children-story" }) }, output);
  assert.equal(story.status, 200);
  assert.ok(story.prompt.includes(VISUAL_KIND_PLAYBOOKS["children-story"].hook));
  assert.ok(story.prompt.includes(VISUAL_KIND_PLAYBOOKS["children-story"].ending));
  assert.equal(story.prompt.includes(VISUAL_KIND_PLAYBOOKS["lead-magnet"].hook), false);
  assert.doesNotMatch(story.prompt, /comic|panel|speech bubble/i);

  const magnet = await capturePrompt({ action: "visual_storyboard", visualProject: project({ kind: "lead-magnet" }) }, output);
  assert.ok(magnet.prompt.includes(VISUAL_KIND_PLAYBOOKS["lead-magnet"].shape));
});

test("Rewrite page uses the same playbook", async () => {
  const current = { id: "p2", pageNumber: 2, role: "content", title: "Storm", body: "Rain.", imagePrompt: "Rain.", layout: "full-bleed" };
  const result = await capturePrompt(
    { action: "visual_page", visualProject: { ...project({ kind: "motivational" }), pages: [current], page: current } },
    { page: page(2) },
  );
  assert.equal(result.status, 200);
  assert.ok(result.prompt.includes(VISUAL_KIND_PLAYBOOKS.motivational.voice));
});

test("comics were removed: a comic request is refused before any AI is called", async () => {
  const originalFetch = globalThis.fetch;
  const saved = { ...process.env };
  process.env.OPENAI_API_KEY = "test";
  process.env.CLOUDFLARE_ACCOUNT_ID = "acct";
  process.env.CLOUDFLARE_API_TOKEN = "token";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    const comic = { ...project({}), mode: "comic", comicFormat: "noir" };
    const panel = { id: "a", order: 1, scene: "A dark street.", camera: "wide", dialogue: [], caption: "", soundEffect: "" };
    const comicPage = { id: "p2", pageNumber: 2, role: "content", title: "Rain", body: "", imagePrompt: "", layout: "full-bleed", panels: [panel] };
    for (const action of ["visual_storyboard", "visual_page", "visual_cast"]) {
      const response = await POST(
        await authorizedRequest("http://localhost/api/generate", {
          method: "POST",
          body: JSON.stringify({ provider: "openai", mode: "fiction", brief: { title: "T" }, action, visualProject: { ...comic, pages: [comicPage], page: comicPage } }),
        }),
      );
      assert.equal(response.status, 410, action);
      assert.equal((await response.json()).error, COMICS_REMOVED_MESSAGE);
    }
    const image = await visualImagePost(
      await authorizedRequest("http://localhost/api/visual-image", { method: "POST", body: JSON.stringify({ project: comic, page: comicPage, panel }) }),
    );
    assert.equal(image.status, 410);
    assert.equal(calls, 0, "no writer or image model was called");
  } finally {
    globalThis.fetch = originalFetch;
    process.env = saved;
  }
});
