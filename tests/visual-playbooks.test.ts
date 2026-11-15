import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/generate/route";
import { COMIC_FORMATS, VISUAL_BOOK_KINDS, blankVisualBookBrief } from "../app/visual-book-types";
import {
  COMIC_FORMAT_PLAYBOOKS,
  VISUAL_KIND_PLAYBOOKS,
  visualPlaybookBlock,
  visualPlaybookFor,
} from "../app/visual-playbooks";
import { authorizedRequest } from "./helpers/api-access";

const FIELDS = ["hook", "shape", "pageTurn", "voice", "ending"] as const;

test("every Mini Book Type and Comic Format has a complete, distinct playbook", () => {
  const all = [
    ...VISUAL_BOOK_KINDS.map((kind) => VISUAL_KIND_PLAYBOOKS[kind.id]),
    ...COMIC_FORMATS.map((format) => COMIC_FORMAT_PLAYBOOKS[format.id]),
  ];
  assert.equal(all.length, 16);
  for (const playbook of all) {
    assert.ok(playbook, "a selectable type is missing its playbook");
    for (const field of FIELDS) {
      assert.ok(playbook[field].length >= 60, `${playbook.label} ${field} is too thin`);
      assert.doesNotMatch(playbook[field], /[–—]/, `${playbook.label} ${field} has a dash`);
    }
  }
  for (const field of FIELDS) {
    assert.equal(new Set(all.map((playbook) => playbook[field])).size, 16, `${field} must differ for every type`);
  }
  VISUAL_BOOK_KINDS.forEach((kind) => assert.equal(VISUAL_KIND_PLAYBOOKS[kind.id].label, kind.label));
  COMIC_FORMATS.forEach((format) => assert.equal(COMIC_FORMAT_PLAYBOOKS[format.id].label, format.label));
});

test("the playbook follows the mode, and unknown saved values fall back safely", () => {
  const visual = { ...blankVisualBookBrief("visual"), kind: "lead-magnet" as const, comicFormat: "noir" as const };
  assert.equal(visualPlaybookFor(visual).label, "Lead Magnet");
  assert.equal(visualPlaybookFor({ ...visual, mode: "comic" }).label, "Dark Noir");
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

const page = (number: number) => ({ page_number: number, title: `Page ${number}`, body: "Text.", image_prompt: "Art.", layout: "full-bleed", panel_count: 0, panels: [] });
const project = (mode: "visual" | "comic", extra: Record<string, unknown>) => ({
  ...blankVisualBookBrief(mode),
  title: "The Lantern Keeper",
  premise: "A girl keeps the last lantern lit through one long storm.",
  pageCount: 3,
  ...extra,
});

test("the storyboard prompt carries the chosen type's playbook, and a different type changes it", async () => {
  const output = { refined_subtitle: "", character_bible: "", palette: "", pages: [1, 2, 3].map(page) };
  const story = await capturePrompt({ action: "visual_storyboard", visualProject: project("visual", { kind: "children-story" }) }, output);
  assert.equal(story.status, 200);
  assert.ok(story.prompt.includes(VISUAL_KIND_PLAYBOOKS["children-story"].hook));
  assert.ok(story.prompt.includes(VISUAL_KIND_PLAYBOOKS["children-story"].ending));
  assert.equal(story.prompt.includes(VISUAL_KIND_PLAYBOOKS["lead-magnet"].hook), false);

  const magnet = await capturePrompt({ action: "visual_storyboard", visualProject: project("visual", { kind: "lead-magnet" }) }, output);
  assert.ok(magnet.prompt.includes(VISUAL_KIND_PLAYBOOKS["lead-magnet"].shape));

  const comic = await capturePrompt({ action: "visual_storyboard", visualProject: project("comic", { comicFormat: "comic-strip" }) }, output);
  assert.ok(comic.prompt.includes(COMIC_FORMAT_PLAYBOOKS["comic-strip"].pageTurn));
  assert.equal(comic.prompt.includes(VISUAL_KIND_PLAYBOOKS["illustrated-story"].hook), false);
});

test("Rewrite page uses the same playbook", async () => {
  const current = { id: "p2", pageNumber: 2, role: "content", title: "Storm", body: "Rain.", imagePrompt: "Rain.", layout: "full-bleed", panels: [] };
  const result = await capturePrompt(
    { action: "visual_page", visualProject: { ...project("comic", { comicFormat: "noir" }), pages: [current], page: current } },
    { page: page(2) },
  );
  assert.equal(result.status, 200);
  assert.ok(result.prompt.includes(COMIC_FORMAT_PLAYBOOKS.noir.voice));
});
