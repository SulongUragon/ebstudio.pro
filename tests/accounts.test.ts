import assert from "node:assert/strict";
import test from "node:test";
import { accountForRequest, supabasePublicConfig } from "../app/account-server";
import { POST as generate } from "../app/api/generate/route";
import { GET as accountRoute } from "../app/api/account/route";
import {
  syncCloudProjects,
  type CloudRow,
  type CloudStore,
  type SyncableProject,
} from "../app/cloud-library-client";
import type { CloudProjectKind } from "../app/cloud-runtime";

const SUPABASE_URL = "https://exampleref.supabase.co";
const USER_ID = "11111111-1111-4111-8111-111111111111";

type Book = SyncableProject & { marker?: string };
const book = (id: string, updatedAt: string, marker = ""): Book => ({
  id,
  title: `Book ${id}`,
  author: "Sulong",
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt,
  marker,
});

/** An in-memory account library that records every upload, download, and removal. */
function fakeStore(initial: Book[]) {
  const files = new Map(initial.map((item) => [item.id, item]));
  const log = { saved: [] as string[], downloaded: [] as string[], removed: [] as string[] };
  const store: CloudStore = {
    async list(): Promise<CloudRow[]> {
      return [...files.values()].map((item) => ({ project_id: item.id, updated_at: item.updatedAt ?? item.createdAt }));
    },
    async download<T>(_kind: CloudProjectKind, id: string) {
      log.downloaded.push(id);
      return (files.get(id) ?? null) as T | null;
    },
    async save(_kind, project) {
      log.saved.push(project.id);
      files.set(project.id, project as Book);
    },
    async remove(_kind, id) {
      log.removed.push(id);
      files.delete(id);
    },
  };
  return { store, files, log };
}

test("first sign-in uploads every book that only exists on this device", async () => {
  const { store, files, log } = fakeStore([]);
  const local = [book("laptop-1", "2026-11-10T00:00:00.000Z"), book("laptop-2", "2026-11-11T00:00:00.000Z")];
  const result = await syncCloudProjects("manuscript", local, store);
  assert.equal(result.state, "synced");
  assert.deepEqual(log.saved.sort(), ["laptop-1", "laptop-2"]);
  assert.equal(files.size, 2);
});

test("a new device downloads the account library", async () => {
  const { store, log } = fakeStore([book("from-laptop", "2026-11-10T00:00:00.000Z", "cloud")]);
  const result = await syncCloudProjects<Book>("manuscript", [], store);
  assert.deepEqual(result.projects.map((item) => item.id), ["from-laptop"]);
  assert.equal(result.projects[0].marker, "cloud");
  assert.deepEqual(log.saved, []);
});

test("the newer copy wins in both directions and unchanged books are not downloaded again", async () => {
  const { store, log } = fakeStore([
    book("edited-on-phone", "2026-11-12T00:00:00.000Z", "cloud"),
    book("edited-on-laptop", "2026-11-10T00:00:00.000Z", "cloud"),
    book("same", "2026-11-09T00:00:00.000Z", "cloud"),
  ]);
  const local = [
    book("edited-on-phone", "2026-11-11T00:00:00.000Z", "local"),
    book("edited-on-laptop", "2026-11-12T00:00:00.000Z", "local"),
    book("same", "2026-11-09T00:00:00.000Z", "local"),
  ];
  const result = await syncCloudProjects<Book>("manuscript", local, store);
  const byId = new Map(result.projects.map((item) => [item.id, item.marker]));
  assert.equal(byId.get("edited-on-phone"), "cloud");
  assert.equal(byId.get("edited-on-laptop"), "local");
  assert.deepEqual(log.downloaded, ["edited-on-phone"]);
  assert.deepEqual(log.saved, ["edited-on-laptop"]);
});

test("syncing never deletes a book from the account or the device", async () => {
  const { store, log } = fakeStore([book("cloud-only", "2026-11-10T00:00:00.000Z")]);
  const result = await syncCloudProjects("manuscript", [book("device-only", "2026-11-10T00:00:00.000Z")], store);
  assert.deepEqual(result.projects.map((item) => item.id).sort(), ["cloud-only", "device-only"]);
  assert.deepEqual(log.removed, []);
});

test("signed out, or with the account unreachable, the device library is kept as it is", async () => {
  const local = [book("offline", "2026-11-10T00:00:00.000Z")];
  assert.deepEqual(await syncCloudProjects("manuscript", local, null), { projects: local, state: "local-only" });
  const broken: CloudStore = {
    list: async () => {
      throw new Error("offline");
    },
    download: async () => null,
    save: async () => undefined,
    remove: async () => undefined,
  };
  assert.deepEqual(await syncCloudProjects("manuscript", local, broken), { projects: local, state: "local-only" });
});

/** A request carrying a Supabase session cookie, and a fetch that answers as Supabase would. */
async function withSupabase(
  options: { user?: boolean; approved?: boolean },
  run: (request: (url: string, init?: RequestInit) => Request, calls: string[]) => Promise<void>,
) {
  const saved = { ...process.env };
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  delete process.env.APP_ACCESS_CODE;
  process.env.OPENAI_API_KEY = "test";

  globalThis.fetch = (async (input: unknown) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    if (url.startsWith(`${SUPABASE_URL}/auth/v1/user`)) {
      return options.user
        ? Response.json({ id: USER_ID, aud: "authenticated", role: "authenticated", email: "writer@example.com" })
        : Response.json({ code: 401, msg: "invalid JWT" }, { status: 401 });
    }
    if (url.startsWith(`${SUPABASE_URL}/rest/v1/profiles`)) {
      return Response.json([{ approved: options.approved === true }]);
    }
    // Any AI provider call: answer with a usable voice profile so generate can finish.
    return Response.json({ status: "completed", output_text: JSON.stringify({ profile: "Rhythm: short, plain lines.\nDiction: everyday.\nTone: warm.\nAvoid: jargon." }) });
  }) as typeof fetch;

  const session = {
    access_token: "header.payload.signature",
    refresh_token: "refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: USER_ID, aud: "authenticated", role: "authenticated", email: "writer@example.com" },
  };
  const cookie = `sb-exampleref-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  const makeRequest = (url: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (options.user !== undefined) headers.set("cookie", cookie);
    return new Request(url, { ...init, headers });
  };

  try {
    await run(makeRequest, calls);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = saved;
  }
}

test("accounts are off until a valid Supabase URL and publishable key are set", () => {
  const saved = { ...process.env };
  try {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    assert.equal(supabasePublicConfig(), null);
    process.env.SUPABASE_URL = "https://evil.example.com";
    process.env.SUPABASE_PUBLISHABLE_KEY = "key";
    assert.equal(supabasePublicConfig(), null);
    process.env.SUPABASE_URL = SUPABASE_URL;
    assert.deepEqual(supabasePublicConfig(), { url: SUPABASE_URL, publishableKey: "key" });
    process.env.SUPABASE_URL = ` ${SUPABASE_URL}/ `;
    assert.deepEqual(supabasePublicConfig(), { url: SUPABASE_URL, publishableKey: "key" });
  } finally {
    process.env = saved;
  }
});

const generateBody = JSON.stringify({
  action: "voice_profile",
  voice: { sample: Array.from({ length: 40 }, () => "I write short lines. They land.").join(" ") },
  provider: "openai",
});

test("an approved account may use the AI tools", async () => {
  await withSupabase({ user: true, approved: true }, async (request, calls) => {
    const account = await accountForRequest(request("http://localhost/api/account"));
    assert.deepEqual(account, { configured: true, signedIn: true, approved: true, email: "writer@example.com" });
    const response = await generate(request("http://localhost/api/generate", { method: "POST", body: generateBody }));
    assert.equal(response.status, 200);
    assert.match((await response.json()).profile, /Rhythm/);
    assert.equal(calls.some((url) => url.includes("api.openai.com")), true, "the writer was called");
  });
});

test("a signed-in account the owner has not approved cannot spend the API keys", async () => {
  await withSupabase({ user: true, approved: false }, async (request, calls) => {
    const response = await generate(request("http://localhost/api/generate", { method: "POST", body: generateBody }));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "account_not_approved");
    assert.equal(calls.some((url) => !url.startsWith(SUPABASE_URL)), false, "no AI provider was called");
  });
});

test("signed out, the AI tools ask the user to sign in", async () => {
  await withSupabase({}, async (request, calls) => {
    const response = await generate(request("http://localhost/api/generate", { method: "POST", body: generateBody }));
    assert.equal(response.status, 401);
    assert.equal((await response.json()).code, "sign_in_required");
    assert.equal(calls.some((url) => !url.startsWith(SUPABASE_URL)), false, "no AI provider was called");
  });
});

test("/api/account shares only public sign-in settings", async () => {
  await withSupabase({ user: true, approved: true }, async (request) => {
    process.env.ANTHROPIC_API_KEY = "secret-anthropic";
    const response = await accountRoute(request("http://localhost/api/account"));
    const text = await response.text();
    const data = JSON.parse(text);
    assert.equal(data.signedIn, true);
    assert.deepEqual(data.supabase, { url: SUPABASE_URL, publishableKey: "sb_publishable_test" });
    assert.equal(text.includes("secret-anthropic"), false);
    assert.equal(text.includes("\"test\""), false);
  });
});
