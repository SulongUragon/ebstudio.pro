import assert from "node:assert/strict";
import test from "node:test";
import { POST as bookImagePost } from "../app/api/book-image/route";
import { POST as coverPost } from "../app/api/cover/route";
import { POST as visualImagePost } from "../app/api/visual-image/route";
import {
  cloudflareImageModel,
  cloudflareSize,
  compactPrompt,
  shouldUseImageFallback,
  usesMultipartInput,
} from "../app/image-providers";
import { authorizedRequest } from "./helpers/api-access";

const COVER_BODY = {
  mode: "nonfiction",
  brief: { title: "Quiet Mornings", author: "Sulong Uragon", topic: "building a calm morning routine", audience: "busy adults", keyPoints: "sleep, light, movement" },
  subtitle: "Small Habits for Calmer Days",
  author: "Sulong Uragon",
  style: "cinematic",
  finish: "satin",
  creativeFinish: "auto",
  coverTextMode: "app-typography",
  titleTypography: "auto",
  titlePlacement: "auto",
  customDirection: "",
};

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...new Array(200).fill(1)]);

type Call = { url: string; body: BodyInit | null | undefined };
type Handler = (url: string, init?: RequestInit) => Response;

async function withImageServices(
  options: { openai?: boolean; cloudflare?: boolean; model?: string },
  handler: Handler,
  run: (calls: Call[]) => Promise<void>,
) {
  const originalFetch = globalThis.fetch;
  const saved = { ...process.env };
  delete process.env.OPENAI_API_KEY;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CLOUDFLARE_IMAGE_MODEL;
  if (options.openai !== false) process.env.OPENAI_API_KEY = "test";
  if (options.cloudflare !== false) {
    process.env.CLOUDFLARE_ACCOUNT_ID = "acct123";
    process.env.CLOUDFLARE_API_TOKEN = "cf-token";
  }
  if (options.model) process.env.CLOUDFLARE_IMAGE_MODEL = options.model;
  const calls: Call[] = [];
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body });
    return handler(url, init);
  }) as typeof fetch;
  try {
    await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = saved;
  }
}

const openAIQuota = () =>
  new Response(JSON.stringify({ error: { code: "insufficient_quota", message: "You exceeded your current quota" } }), { status: 429 });
const cloudflareJson = (image = "/9j/AAAA") =>
  new Response(JSON.stringify({ success: true, result: { image } }), { status: 200, headers: { "content-type": "application/json" } });

const coverRequest = () =>
  authorizedRequest("https://ebstudiopro.loudminds.club/api/cover", { method: "POST", body: JSON.stringify(COVER_BODY) });

test("Cloudflare helpers: model name, size limits, prompt length, input format", () => {
  delete process.env.CLOUDFLARE_IMAGE_MODEL;
  assert.equal(cloudflareImageModel(), "@cf/black-forest-labs/flux-2-klein-9b");
  process.env.CLOUDFLARE_IMAGE_MODEL = "black-forest-labs/flux-1-schnell";
  assert.equal(cloudflareImageModel(), "@cf/black-forest-labs/flux-1-schnell");
  delete process.env.CLOUDFLARE_IMAGE_MODEL;
  assert.deepEqual(cloudflareSize(1024, 1536), { width: 1024, height: 1536 });
  assert.deepEqual(cloudflareSize(1600, 2560), { width: 1200, height: 1920 });
  assert.ok(compactPrompt("word ".repeat(1000)).length <= 2000);
  assert.equal(compactPrompt("  A   calm \n scene. "), "A calm scene.");
  assert.equal(usesMultipartInput("@cf/black-forest-labs/flux-2-klein-9b"), true);
  assert.equal(usesMultipartInput("@cf/bytedance/stable-diffusion-xl-lightning"), false);
  assert.equal(shouldUseImageFallback({ kind: "credits" }), true);
  assert.equal(shouldUseImageFallback({ kind: "safety" }), false);
});

test("cover falls back to Cloudflare when OpenAI credits are used up", async () => {
  await withImageServices({}, (url) => (url.includes("openai") ? openAIQuota() : cloudflareJson()), async (calls) => {
    const response = await coverPost(await coverRequest());
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    assert.equal(data.imageProvider, "cloudflare");
    assert.equal(data.imageData, "data:image/jpeg;base64,/9j/AAAA");
    const cloudflare = calls.find((call) => call.url.includes("cloudflare"));
    assert.ok(cloudflare);
    assert.match(cloudflare.url, /accounts\/acct123\/ai\/run\/@cf\/black-forest-labs\/flux-2-klein-9b$/);
    assert.ok(cloudflare.body instanceof FormData);
    assert.equal(cloudflare.body.get("width"), "1024");
    assert.equal(cloudflare.body.get("height"), "1536");
    assert.ok(String(cloudflare.body.get("prompt")).length <= 2000);
    assert.equal(calls.filter((call) => call.url.includes("openai")).length, 1, "credits are not retried");
  });
});

test("cover uses Cloudflare directly when no OpenAI key is set", async () => {
  await withImageServices({ openai: false }, () => cloudflareJson(), async (calls) => {
    const response = await coverPost(await coverRequest());
    assert.equal(response.status, 200);
    assert.equal((await response.json()).imageProvider, "cloudflare");
    assert.equal(calls.length, 1);
  });
});

test("cover still uses OpenAI first when it works", async () => {
  await withImageServices({}, () => new Response(JSON.stringify({ data: [{ b64_json: "OPENAI" }] }), { status: 200 }), async (calls) => {
    const data = await (await coverPost(await coverRequest())).json();
    assert.equal(data.imageProvider, "openai");
    assert.equal(calls.length, 1);
  });
});

test("cover names both reasons when OpenAI and Cloudflare both fail", async () => {
  await withImageServices(
    {},
    (url) =>
      url.includes("openai")
        ? openAIQuota()
        : new Response(JSON.stringify({ success: false, errors: [{ message: "Capacity temporarily exceeded" }] }), { status: 429, headers: { "content-type": "application/json" } }),
    async () => {
      const response = await coverPost(await coverRequest());
      const data = await response.json();
      assert.equal(response.status, 402);
      assert.match(data.error, /OpenAI credits are used up/);
      assert.match(data.error, /Cloudflare backup also failed/);
      assert.match(data.error, /Capacity temporarily exceeded/);
    },
  );
});

test("a content policy refusal does not fall back to Cloudflare", async () => {
  await withImageServices(
    {},
    () => new Response(JSON.stringify({ error: { code: "content_policy_violation", message: "rejected by safety system" } }), { status: 400 }),
    async (calls) => {
      const response = await coverPost(await coverRequest());
      assert.equal(response.status, 400);
      assert.equal(calls.some((call) => call.url.includes("cloudflare")), false);
    },
  );
});

test("JSON-input Cloudflare models that return raw PNG bytes are handled", async () => {
  await withImageServices(
    { openai: false, model: "@cf/bytedance/stable-diffusion-xl-lightning" },
    () => new Response(PNG_BYTES, { status: 200, headers: { "content-type": "image/png" } }),
    async (calls) => {
      const data = await (await coverPost(await coverRequest())).json();
      assert.match(data.imageData, /^data:image\/png;base64,/);
      const body = JSON.parse(String(calls[0].body));
      assert.equal(body.width, 1024);
      assert.equal(body.height, 1536);
    },
  );
});

test("chapter images fall back to Cloudflare when OpenAI credits are used up", async () => {
  await withImageServices({}, (url) => (url.includes("openai") ? openAIQuota() : cloudflareJson()), async (calls) => {
    const response = await bookImagePost(
      await authorizedRequest("https://ebstudiopro.loudminds.club/api/book-image", {
        method: "POST",
        body: JSON.stringify({ manuscript: { mode: "fiction", title: "Quiet Mornings", genre: "literary" }, section: { title: "Chapter One", content: "She opened the window." } }),
      }),
    );
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    assert.equal(data.imageProvider, "cloudflare");
    assert.equal(calls.filter((call) => call.url.includes("openai")).length, 1);
  });
});

test("visual book pages fall back to Cloudflare when OpenAI credits are used up", async () => {
  await withImageServices({}, (url) => (url.includes("openai") ? openAIQuota() : cloudflareJson()), async () => {
    const response = await visualImagePost(
      await authorizedRequest("https://ebstudiopro.loudminds.club/api/visual-image", {
        method: "POST",
        body: JSON.stringify({
          project: { mode: "picture-book", title: "Quiet Mornings", kind: "picture-book", visualStyle: "watercolor", characterBible: "A small fox." },
          page: { pageNumber: 1, text: "The fox woke up.", illustration: "A fox stretching at sunrise." },
        }),
      }),
    );
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    assert.equal(data.imageProvider, "cloudflare");
  });
});
