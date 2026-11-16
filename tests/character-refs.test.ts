import assert from "node:assert/strict";
import test from "node:test";
import { POST as generatePost } from "../app/api/generate/route";
import { POST as visualImagePost } from "../app/api/visual-image/route";
import {
  characterSheetPrompt,
  decodeReferenceImages,
  mergeCast,
  normalizeCast,
  referenceInstruction,
  referencesForScene,
  type CharacterRef,
} from "../app/character-refs";
import { cloudflareModelFor, compactPrompt } from "../app/image-providers";
import { blankVisualBookBrief } from "../app/visual-book-types";
import { buildVisualImagePrompt } from "../app/visual-image-prompt";
import { authorizedRequest } from "./helpers/api-access";

const JPEG = `data:image/jpeg;base64,${Buffer.from(new Uint8Array(400).fill(7)).toString("base64")}`;
const luma: CharacterRef = { id: "ref-luma", name: "Luma", description: "A round pale gold lantern-bug with two round antennae.", imageData: JPEG };
const pip: CharacterRef = { id: "ref-pip", name: "Pip", description: "A smaller lantern-bug with one bent antenna.", imageData: JPEG };
const scarecrow: CharacterRef = { id: "ref-scarecrow", name: "Scarecrow", description: "A tall scarecrow in a patched brown coat." };

test("the cast list is cleaned: named, described, unique, at most four", () => {
  const cast = normalizeCast([
    { name: " Luma ", description: "A round  lantern-bug." },
    { name: "luma", description: "Duplicate." },
    { name: "", description: "No name." },
    { name: "Pip", description: "" },
    { name: "Pip", description: "Small bug." },
    { name: "A", description: "a" },
    { name: "B", description: "b" },
    { name: "C", description: "c" },
  ]);
  assert.deepEqual(cast.map((ref) => ref.name), ["Luma", "Pip", "A", "B"]);
  assert.equal(cast[0].description, "A round lantern-bug.");
  assert.deepEqual(normalizeCast("nope"), []);
});

test("finding characters again keeps drawings and edited descriptions the author already has", () => {
  const merged = mergeCast([{ ...luma, description: "My own words." }], normalizeCast([{ name: "Luma", description: "New words." }, { name: "Pip", description: "Small bug." }]));
  assert.equal(merged[0].imageData, JPEG);
  assert.equal(merged[0].description, "My own words.");
  assert.equal(merged[1].name, "Pip");
});

test("a scene gets the references of exactly the drawn characters it names", () => {
  const refs = [luma, pip, scarecrow];
  assert.deepEqual(referencesForScene(refs, "Pip zips after a firefly while LUMA watches.").map((ref) => ref.name), ["Luma", "Pip"]);
  assert.deepEqual(referencesForScene(refs, "The old scarecrow stands alone."), [], "an undrawn character sends nothing");
  assert.deepEqual(referencesForScene(refs, "A pipe drips. Illuminated grass."), [], "names match whole words only");
  assert.deepEqual(referencesForScene(refs, "Luma's glow fills the yard.").map((ref) => ref.name), ["Luma"]);
  assert.deepEqual(referencesForScene(undefined, "Luma"), []);
});

test("prompts tell the model which reference is which, and still fit the 2,000 character limit", () => {
  assert.equal(referenceInstruction([]), "");
  assert.match(referenceInstruction(["Luma", "Pip"]), /image 1 is Luma, image 2 is Pip/);
  const prompt = buildVisualImagePrompt({
    scene: "s ".repeat(900),
    camera: "c ".repeat(300),
    style: "t ".repeat(600),
    characterBible: "Mara has a red scarf. ".repeat(120),
    palette: "p ".repeat(500),
    referenceNames: ["Luma", "Pip", "Scarecrow", "A Very Long Character Name Indeed Here"],
  });
  assert.ok(prompt.length <= 2000, `prompt was ${prompt.length}`);
  assert.equal(compactPrompt(prompt), prompt.replace(/\s+/g, " ").trim());
  assert.ok(prompt.indexOf("Reference images:") < prompt.indexOf("Scene:"));

  const sheet = characterSheetPrompt({ name: "Luma", description: luma.description, style: "friendly rounded storybook art", palette: "warm gold" });
  assert.match(sheet, /One character, full body/);
  assert.match(sheet, /No text in the image/);
  assert.ok(sheet.includes(luma.description));
});

test("only small real pictures are accepted as references", () => {
  assert.deepEqual(decodeReferenceImages(undefined), []);
  const decoded = decodeReferenceImages([{ name: "Luma", imageData: JPEG }]);
  assert.ok(Array.isArray(decoded) && decoded[0].mime === "image/jpeg" && decoded[0].bytes.length === 400);
  assert.ok("error" in (decodeReferenceImages([{ name: "Luma", imageData: "https://example.com/a.jpg" }]) as object));
  assert.ok("error" in (decodeReferenceImages([{ name: "Luma", imageData: "data:image/svg+xml;base64,AAAA" }]) as object));
  assert.ok("error" in (decodeReferenceImages(Array.from({ length: 5 }, () => ({ name: "L", imageData: JPEG }))) as object));
  const huge = `data:image/jpeg;base64,${Buffer.from(new Uint8Array(800_000)).toString("base64")}`;
  assert.ok("error" in (decodeReferenceImages([{ name: "Luma", imageData: huge }]) as object));
});

type Call = { url: string; body: unknown };
async function withCloudflare(model: string | undefined, run: (calls: Call[]) => Promise<void>, openAIKey = false) {
  const saved = { ...process.env };
  const originalFetch = globalThis.fetch;
  if (openAIKey) process.env.OPENAI_API_KEY = "test";
  else delete process.env.OPENAI_API_KEY;
  process.env.CLOUDFLARE_ACCOUNT_ID = "acct";
  process.env.CLOUDFLARE_API_TOKEN = "token";
  if (model) process.env.CLOUDFLARE_IMAGE_MODEL = model;
  else delete process.env.CLOUDFLARE_IMAGE_MODEL;
  const calls: Call[] = [];
  globalThis.fetch = (async (url: unknown, init?: { body?: unknown }) => {
    calls.push({ url: String(url), body: init?.body });
    return new Response(JSON.stringify({ success: true, result: { image: "/9j/AAAA" } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = saved;
  }
}

const project = { ...blankVisualBookBrief(), title: "Luma and the Shy Shadow", kind: "children-story", characterBible: "Luma: a round lantern-bug.", palette: "warm gold" };
const page = { id: "p2", pageNumber: 2, role: "content", title: "Cozy Glow", body: "", imagePrompt: "Luma and Pip hover by the shed.", layout: "full-bleed" };
const imageRequest = (body: Record<string, unknown>) =>
  authorizedRequest("http://localhost/api/visual-image", { method: "POST", body: JSON.stringify({ project, ...body }) });

test("a page with references sends the pictures to FLUX.2, even when OpenAI is set up or an older model is configured", async () => {
  assert.equal(cloudflareModelFor(0), "@cf/black-forest-labs/flux-2-klein-9b");
  await withCloudflare("@cf/black-forest-labs/flux-1-schnell", async (calls) => {
    const response = await visualImagePost(await imageRequest({ page, references: [{ name: "Luma", imageData: JPEG }, { name: "Pip", imageData: JPEG }] }));
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    assert.equal(data.referencesUsed, 2);
    assert.equal(calls.length, 1, "OpenAI was not called");
    assert.ok(calls[0].url.endsWith("/ai/run/@cf/black-forest-labs/flux-2-klein-9b"));
    const form = calls[0].body as FormData;
    assert.ok(form instanceof FormData);
    assert.ok(form.get("input_image_0") instanceof Blob && form.get("input_image_1") instanceof Blob);
    assert.equal((form.get("input_image_0") as Blob).size, 400);
    assert.equal(form.get("input_image_2"), null);
    assert.match(String(form.get("prompt")), /image 1 is Luma, image 2 is Pip/);
  }, true);
});

test("a page without references is drawn as before", async () => {
  await withCloudflare(undefined, async (calls) => {
    const response = await visualImagePost(await imageRequest({ page }));
    assert.equal((await response.json()).referencesUsed, 0);
    const form = calls[0].body as FormData;
    assert.equal(form.get("input_image_0"), null);
    assert.doesNotMatch(String(form.get("prompt")), /Reference images/);
  });
});

test("a character reference is drawn square, alone, from its description", async () => {
  await withCloudflare(undefined, async (calls) => {
    const response = await visualImagePost(await imageRequest({ character: { name: "Pip", description: pip.description } }));
    assert.equal(response.status, 200);
    const form = calls[0].body as FormData;
    assert.equal(form.get("width"), "1024");
    assert.equal(form.get("height"), "1024");
    assert.ok(String(form.get("prompt")).includes(pip.description));
    assert.match(String(form.get("prompt")), /One character, full body/);
  });
  await withCloudflare(undefined, async (calls) => {
    const bad = await visualImagePost(await imageRequest({ character: { name: "Pip", description: " " } }));
    assert.equal(bad.status, 400);
    const badRef = await visualImagePost(await imageRequest({ page, references: [{ name: "Luma", imageData: "not-a-picture" }] }));
    assert.equal(badRef.status, 400);
    assert.equal(calls.length, 0, "nothing was sent to the image model");
  });
});

test("the cast action lists recurring characters from the lock and the scenes", async () => {
  const saved = { ...process.env };
  const originalFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test";
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.MOONSHOT_API_KEY;
  let input = "";
  globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    input = JSON.parse(String(init?.body)).input;
    const characters = [
      { name: "Luma", description: "A round pale gold lantern-bug — big eyes." },
      { name: "Pip", description: "A smaller lantern-bug with one bent antenna." },
    ];
    return new Response(JSON.stringify({ status: "completed", output_text: JSON.stringify({ characters }) }), { status: 200 });
  }) as typeof fetch;
  try {
    const response = await generatePost(
      await authorizedRequest("http://localhost/api/generate", {
        method: "POST",
        body: JSON.stringify({ action: "visual_cast", provider: "openai", mode: "fiction", brief: { title: project.title }, visualProject: { ...project, pages: [page] } }),
      }),
    );
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    assert.deepEqual(data.characters.map((ref: CharacterRef) => ref.name), ["Luma", "Pip"]);
    assert.doesNotMatch(data.characters[0].description, /[–—]/);
    assert.ok(input.includes("Luma and Pip hover by the shed."));
    assert.ok(input.includes("Luma: a round lantern-bug."));
  } finally {
    globalThis.fetch = originalFetch;
    process.env = saved;
  }
});
