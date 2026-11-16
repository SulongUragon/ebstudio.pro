import assert from "node:assert/strict";
import test from "node:test";
import { POST as visualImagePost } from "../app/api/visual-image/route";
import { compactPrompt } from "../app/image-providers";
import { buildVisualImagePrompt, mergeCharacterLock } from "../app/visual-image-prompt";
import { blankVisualBookBrief } from "../app/visual-book-types";
import { authorizedRequest } from "./helpers/api-access";

// A real brief whose title was once drawn into the art by the image model.
const LUMA = {
  title: "Luma and the Shy Shadow",
  premise:
    "Luma is a tiny glowing lantern-bug who is afraid of the dark corner behind the garden shed, because something there moves whenever the wind blows. One night her little brother wanders too close to the shed chasing a firefly, and Luma must choose between staying safe in the light or flying into the dark to find him. When she finally goes in, she discovers the 'scary shadow' is just an old scarecrow whose lantern burned out long ago, and she relights it so neither of them has to be afraid of the dark again.",
  characterBible:
    "Luma: a round, soft-bodied lantern-bug about the size of a thumb, pale gold glowing belly, two small round antennae, big curious eyes, no clothing, stays visually consistent across every page. World: a cozy backyard garden at dusk, wooden fence, tall grass, a small wooden garden shed with peeling paint, fireflies drifting in the air.",
  palette:
    "Warm amber and soft gold light from Luma's glow as the main light source, deep dusky blue-purple for the night sky and shadows, muted green for the grass, no harsh black, no neon or saturated colors, lighting always motivated by Luma's glow or the moon.",
};

const lumaPrompt = () =>
  buildVisualImagePrompt({
    scene: "Luma hovers at the edge of the dark shed corner, glowing nervously, antennae drooping.",
    camera: "medium shot, low angle",
    style: "Friendly rounded storybook art with bright clean shapes.",
    characterBible: `${LUMA.characterBible} Pip: a smaller lantern-bug half Luma's size with a paler yellow glow and one bent antenna.`,
    palette: LUMA.palette,
  });

test("the image prompt puts the no-text rule and the cast first, and never names a title", () => {
  const prompt = lumaPrompt();
  assert.ok(prompt.indexOf("No text in the image") < 120);
  assert.ok(prompt.indexOf("Locked cast") < 400);
  assert.ok(prompt.includes("Pip: a smaller lantern-bug"));
  assert.doesNotMatch(prompt, /Shy Shadow|title context|Page \d+ purpose|afraid of the dark corner/i);
});

test("the whole prompt survives the backup model's 2,000 character limit", () => {
  const prompt = lumaPrompt();
  const sent = compactPrompt(prompt);
  assert.ok(sent.length <= 2000);
  assert.equal(sent, prompt.replace(/\s+/g, " ").trim(), "nothing was cut off");
  const long = buildVisualImagePrompt({
    scene: "s ".repeat(900),
    camera: "c ".repeat(300),
    style: "t ".repeat(600),
    characterBible: "Mara has a red scarf. ".repeat(120),
    palette: "p ".repeat(500),
  });
  assert.ok(long.length <= 2000, `prompt was ${long.length} characters`);
  assert.ok(long.includes("No text in the image") && long.includes("Mara has a red scarf."));
});

test("the author's character lock is kept word for word and new cast locks are appended once", () => {
  const added = "Pip: a smaller lantern-bug with one bent antenna.";
  assert.equal(mergeCharacterLock("", added), added);
  assert.equal(mergeCharacterLock(LUMA.characterBible, ""), LUMA.characterBible);
  const merged = mergeCharacterLock(LUMA.characterBible, added);
  assert.ok(merged.startsWith(LUMA.characterBible) && merged.endsWith(added));
  assert.equal(mergeCharacterLock(merged, added), merged);
});

test("the image request sent to the backup model carries no book or page title", async () => {
  const saved = { ...process.env };
  const originalFetch = globalThis.fetch;
  delete process.env.OPENAI_API_KEY;
  process.env.CLOUDFLARE_ACCOUNT_ID = "acct";
  process.env.CLOUDFLARE_API_TOKEN = "token";
  process.env.CLOUDFLARE_IMAGE_MODEL = "@cf/black-forest-labs/flux-2-klein-9b";
  let sentPrompt = "";
  globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    if (init?.body instanceof FormData) sentPrompt = String(init.body.get("prompt"));
    return new Response(JSON.stringify({ success: true, result: { image: "/9j/AAAA" } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const page = { id: "p6", pageNumber: 6, role: "content", title: "Just an Old Friend", body: "", imagePrompt: "Luma glows beside the shed.", layout: "full-bleed" };
    const response = await visualImagePost(
      await authorizedRequest("http://localhost/api/visual-image", {
        method: "POST",
        body: JSON.stringify({ project: { ...blankVisualBookBrief(), ...LUMA, kind: "children-story" }, page }),
      }),
    );
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    assert.ok(sentPrompt.includes("Luma glows beside the shed."));
    assert.doesNotMatch(sentPrompt, /Shy Shadow|Old Friend/i);
    assert.match(sentPrompt, /No text in the image/);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = saved;
  }
});
