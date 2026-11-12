import assert from "node:assert/strict";
import test from "node:test";
import { DELETE as accessDelete, GET as accessGet, POST as accessPost } from "../app/api/access/route";
import { POST as bookImagePost } from "../app/api/book-image/route";
import { POST as coverPost } from "../app/api/cover/route";
import { POST as generatePost } from "../app/api/generate/route";
import { POST as visualImagePost } from "../app/api/visual-image/route";
import { ACCESS_COOKIE, safeEqual } from "../app/api-access";
import {
  buildCoverPrompt,
  buildCoverTypographyLayout,
  resolveCoverTextMode,
  validateCoverArtworkPrompt,
  validateCoverPromptForPlaceholders,
  validateIntegratedTypographyPrompt,
} from "../app/creative-direction";
import { classifyOpenAIImageError, retryDelayMs } from "../app/openai-image-errors";
import { authorizedRequest, TEST_ACCESS_CODE } from "./helpers/api-access";

const COVER_BODY = {
  mode: "nonfiction",
  brief: {
    title: "Quiet Mornings",
    author: "Sulong Uragon",
    topic: "building a calm morning routine",
    audience: "busy adults",
    keyPoints: "sleep, light, movement",
  },
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

/* Cover prompt validation ------------------------------------------------- */

for (const [mode, coverTextMode] of [
  ["nonfiction", "app-typography"],
  ["fiction", "app-typography"],
  ["nonfiction", "integrated-typography"],
  ["fiction", "integrated-typography"],
] as const) {
  test(`a real ${mode} ${coverTextMode} cover prompt passes every validator`, () => {
    const args = {
      mode,
      title: "Quiet Mornings",
      subtitle: "Small Habits for Calmer Days",
      author: "Sulong Uragon",
      genre: "Literary fiction",
      premise: "A widow restores a lakeside cabin.",
      topic: "building a calm morning routine",
      audience: "busy adults",
      keyPoints: "sleep, light, movement",
      creativeFinish: "auto",
      coverTextMode,
      customDirection: "",
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resolved = resolveCoverTextMode(args as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const full = { ...args, style: "cinematic", finishDirection: "satin", coverTextMode: resolved, titleTypography: "auto", titlePlacement: "auto" } as any;
    const prompt = buildCoverPrompt(full);
    const layout = buildCoverTypographyLayout(full);
    const artworkOk = resolved === "integrated-typography" ? validateIntegratedTypographyPrompt(prompt) : validateCoverArtworkPrompt(prompt);
    assert.ok(artworkOk, "artwork rules");
    assert.ok(validateCoverPromptForPlaceholders(prompt), "placeholder rules on the prompt");
    assert.ok(validateCoverPromptForPlaceholders(layout), "placeholder rules on the layout");
  });
}

test("placeholder check still catches real template text", () => {
  assert.equal(validateCoverPromptForPlaceholders("Render the Author Name at the bottom."), false);
  assert.equal(validateCoverPromptForPlaceholders("Cover for Book Title by someone."), false);
  assert.equal(validateCoverPromptForPlaceholders("Lorem ipsum dolor."), false);
  assert.equal(validateCoverPromptForPlaceholders("No title, no subtitle, no author name, no book title."), true);
});

/* OpenAI image errors ----------------------------------------------------- */

test("used-up credits are named as credits and never retried", () => {
  const failure = classifyOpenAIImageError(429, { error: { code: "insufficient_quota", message: "You exceeded your current quota" } }, "cover");
  assert.equal(failure.kind, "credits");
  assert.equal(failure.retryable, false);
  assert.match(failure.message, /credits are used up/);
  assert.match(failure.message, /Billing/);
  assert.equal(classifyOpenAIImageError(400, { error: { code: "billing_hard_limit_reached" } }).kind, "credits");
});

test("a plain rate limit is busy and retryable", () => {
  const failure = classifyOpenAIImageError(429, { error: { code: "rate_limit_exceeded" } }, "cover");
  assert.equal(failure.kind, "busy");
  assert.equal(failure.retryable, true);
  assert.match(failure.message, /busy/);
  assert.equal(retryDelayMs("3"), 3000);
  assert.equal(retryDelayMs("90"), 10000);
  assert.equal(retryDelayMs(null), 2000);
});

test("verification, access, and safety get their own messages", () => {
  assert.equal(classifyOpenAIImageError(403, { error: { message: "Your organization must be verified" } }).kind, "verification");
  assert.equal(classifyOpenAIImageError(401, { error: { code: "invalid_api_key" } }).kind, "access");
  assert.equal(classifyOpenAIImageError(400, { error: { code: "content_policy_violation" } }).kind, "safety");
});

async function withOpenAIImages(replies: Array<{ status: number; body: unknown; retryAfter?: string }>, run: (calls: () => number) => Promise<void>) {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test";
  let count = 0;
  globalThis.fetch = (async () => {
    const reply = replies[Math.min(count, replies.length - 1)];
    count += 1;
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: reply.retryAfter ? { "retry-after": reply.retryAfter } : {},
    });
  }) as typeof fetch;
  try {
    await run(() => count);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
}

const coverRequest = () =>
  authorizedRequest("https://ebstudiopro.loudminds.club/api/cover", { method: "POST", body: JSON.stringify(COVER_BODY) });

test("the cover API now reaches OpenAI with a real title, author, and subtitle", async () => {
  await withOpenAIImages([{ status: 200, body: { data: [{ b64_json: "AAAA" }] } }], async (calls) => {
    const response = await coverPost(await coverRequest());
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    assert.equal(data.imageData, "data:image/jpeg;base64,AAAA");
    assert.equal(calls(), 1);
  });
});

test("the cover API reports used-up credits without retrying", async () => {
  await withOpenAIImages([{ status: 429, body: { error: { code: "insufficient_quota", message: "You exceeded your current quota" } } }], async (calls) => {
    const response = await coverPost(await coverRequest());
    const data = await response.json();
    assert.equal(response.status, 402);
    assert.equal(data.reason, "credits");
    assert.match(data.error, /credits are used up/);
    assert.equal(calls(), 1);
  });
});

test("the cover API retries once when OpenAI is busy", async () => {
  await withOpenAIImages(
    [
      { status: 429, body: { error: { code: "rate_limit_exceeded" } }, retryAfter: "0.01" },
      { status: 200, body: { data: [{ b64_json: "BBBB" }] } },
    ],
    async (calls) => {
      const response = await coverPost(await coverRequest());
      assert.equal(response.status, 200);
      assert.equal(calls(), 2);
    },
  );
});

/* Access code ------------------------------------------------------------- */

const ENDPOINTS = [
  ["generate", generatePost],
  ["cover", coverPost],
  ["book-image", bookImagePost],
  ["visual-image", visualImagePost],
] as const;

for (const [name, handler] of ENDPOINTS) {
  test(`/api/${name} refuses requests without the access cookie`, async () => {
    process.env.APP_ACCESS_CODE = TEST_ACCESS_CODE;
    const response = await handler(new Request(`https://ebstudiopro.loudminds.club/api/${name}`, { method: "POST", body: "{}" }));
    assert.equal(response.status, 401);
    assert.equal((await response.json()).code, "access_required");
  });

  test(`/api/${name} refuses a forged cookie and cross-site requests`, async () => {
    process.env.APP_ACCESS_CODE = TEST_ACCESS_CODE;
    const forged = await handler(
      new Request(`https://ebstudiopro.loudminds.club/api/${name}`, { method: "POST", body: "{}", headers: { cookie: `${ACCESS_COOKIE}=abc123` } }),
    );
    assert.equal(forged.status, 401);
    const crossSite = await handler(
      await authorizedRequest(`https://ebstudiopro.loudminds.club/api/${name}`, { method: "POST", body: "{}", headers: { "sec-fetch-site": "cross-site" } }),
    );
    assert.equal(crossSite.status, 403);
  });

  test(`/api/${name} is locked when APP_ACCESS_CODE is not set`, async () => {
    delete process.env.APP_ACCESS_CODE;
    const response = await handler(new Request(`https://ebstudiopro.loudminds.club/api/${name}`, { method: "POST", body: "{}" }));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "access_not_configured");
  });
}

test("/api/access unlocks with the right code and sets a secure HttpOnly cookie", async () => {
  process.env.APP_ACCESS_CODE = TEST_ACCESS_CODE;
  const wrong = await accessPost(new Request("https://ebstudiopro.loudminds.club/api/access", { method: "POST", body: JSON.stringify({ code: "nope" }) }));
  assert.equal(wrong.status, 401);
  assert.equal(wrong.headers.get("set-cookie"), null);

  const right = await accessPost(new Request("https://ebstudiopro.loudminds.club/api/access", { method: "POST", body: JSON.stringify({ code: TEST_ACCESS_CODE }) }));
  assert.equal(right.status, 200);
  const cookie = right.headers.get("set-cookie") ?? "";
  assert.match(cookie, /^eb_access=[0-9a-f]{64};/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.doesNotMatch(cookie, new RegExp(TEST_ACCESS_CODE));

  const token = cookie.split(";")[0];
  const status = await accessGet(new Request("https://ebstudiopro.loudminds.club/api/access", { headers: { cookie: token } }));
  assert.deepEqual(await status.json(), { configured: true, unlocked: true });

  // The cookie from /api/access opens a protected endpoint.
  const generate = await generatePost(new Request("https://ebstudiopro.loudminds.club/api/generate", { method: "POST", body: "{}", headers: { cookie: token } }));
  assert.notEqual(generate.status, 401);

  const lock = await accessDelete(new Request("https://ebstudiopro.loudminds.club/api/access", { method: "DELETE" }));
  assert.match(lock.headers.get("set-cookie") ?? "", /Max-Age=0/);
});

test("access state never reveals the code", async () => {
  process.env.APP_ACCESS_CODE = TEST_ACCESS_CODE;
  const response = await accessGet(new Request("https://ebstudiopro.loudminds.club/api/access"));
  const text = await response.text();
  assert.doesNotMatch(text, new RegExp(TEST_ACCESS_CODE));
  assert.deepEqual(JSON.parse(text), { configured: true, unlocked: false });
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "abcd"), false);
});
