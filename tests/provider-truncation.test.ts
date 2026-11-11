import assert from "node:assert/strict";
import test from "node:test";
import { POST, outlineTokenBudget, truncationRetryBudget } from "../app/api/generate/route";
import { createLongFictionManuscript } from "./fixtures/publishing-manuscripts";

type Provider = "openai" | "anthropic" | "kimi";
type Reply = { truncated: boolean; text: string };

const words = (count: number) => Array.from({ length: count }, () => "word").join(" ");
const FULL = JSON.stringify({ content: words(990), summary: "Revised summary." });
const CUT = FULL.slice(0, 400);

function providerOf(url: string): Provider {
  if (url.includes("anthropic")) return "anthropic";
  if (url.includes("openai")) return "openai";
  return "kimi";
}

function replyBody(provider: Provider, reply: Reply) {
  if (provider === "anthropic") {
    return { stop_reason: reply.truncated ? "max_tokens" : "end_turn", content: [{ type: "text", text: reply.text }] };
  }
  if (provider === "openai") {
    return reply.truncated
      ? { status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output_text: reply.text }
      : { status: "completed", output_text: reply.text };
  }
  return { choices: [{ finish_reason: reply.truncated ? "length" : "stop", message: { content: reply.text } }] };
}

async function withProviders(
  keys: Provider[],
  replies: Partial<Record<Provider, Reply[]>>,
  run: (calls: Array<{ provider: Provider; budget: number }>) => Promise<void>,
) {
  const originalFetch = globalThis.fetch;
  const env = { ...process.env };
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.MOONSHOT_API_KEY;
  if (keys.includes("openai")) process.env.OPENAI_API_KEY = "test";
  if (keys.includes("anthropic")) process.env.ANTHROPIC_API_KEY = "test";
  if (keys.includes("kimi")) process.env.MOONSHOT_API_KEY = "test";
  const calls: Array<{ provider: Provider; budget: number }> = [];
  const seen: Record<Provider, number> = { openai: 0, anthropic: 0, kimi: 0 };
  globalThis.fetch = (async (url: unknown, init?: { body?: unknown }) => {
    const provider = providerOf(String(url));
    const body = JSON.parse(String(init?.body ?? "{}"));
    calls.push({ provider, budget: body.max_tokens ?? body.max_output_tokens });
    const list = replies[provider] ?? [{ truncated: false, text: FULL }];
    const reply = list[Math.min(seen[provider], list.length - 1)];
    seen[provider] += 1;
    return new Response(JSON.stringify(replyBody(provider, reply)), { status: 200 });
  }) as typeof fetch;
  try {
    await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = env;
  }
}

function instructionRequest(provider: "auto" | Provider) {
  const book = createLongFictionManuscript();
  return new Request("http://localhost/api/generate", {
    method: "POST",
    body: JSON.stringify({
      action: "revise_section",
      mode: book.mode,
      brief: book.brief,
      plan: book.plan,
      section: book.plan[1],
      sectionIndex: 1,
      revision: { mode: "instruction", content: words(1000), instruction: "Make it quieter." },
      provider,
    }),
  });
}

test("outline budget grows with the chapter count", () => {
  assert.equal(outlineTokenBudget(3), 5000);
  assert.equal(outlineTokenBudget(25), 16000);
  assert.equal(outlineTokenBudget(40), 23800);
  assert.equal(outlineTokenBudget(60), 24000);
  assert.ok(outlineTokenBudget(25) > 25 * 450, "room for verbose chapters");
});

test("truncation retries ask for 1.6 times the budget within each provider's cap", () => {
  assert.equal(truncationRetryBudget("anthropic", 10000), 16000);
  assert.equal(truncationRetryBudget("anthropic", 24000), 32000);
  assert.equal(truncationRetryBudget("kimi", 12000), 16000);
  assert.equal(truncationRetryBudget("openai", 5000), 8000);
});

for (const provider of ["anthropic", "openai", "kimi"] as const) {
  test(`${provider}: a cut-off answer is retried once with a larger budget`, async () => {
    await withProviders([provider], { [provider]: [{ truncated: true, text: CUT }, { truncated: false, text: FULL }] }, async (calls) => {
      const response = await POST(instructionRequest(provider));
      assert.equal(response.status, 200, await response.clone().text());
      assert.equal(calls.length, 2);
      assert.equal(calls[1].budget, truncationRetryBudget(provider, calls[0].budget));
      assert.ok(calls[1].budget > calls[0].budget);
    });
  });
}

test("a provider that stays cut off reports output_truncated, not invalid_response", async () => {
  await withProviders(["anthropic"], { anthropic: [{ truncated: true, text: CUT }] }, async (calls) => {
    const response = await POST(instructionRequest("anthropic"));
    const data = await response.json();
    assert.equal(response.status, 502);
    assert.equal(data.code, "output_truncated");
    assert.match(data.error, /ran out of room/);
    assert.doesNotMatch(data.error, /invalid_response/);
    assert.equal(calls.length, 2);
  });
});

test("Auto fails over to the next provider when one stays cut off", async () => {
  await withProviders(
    ["openai", "anthropic"],
    { openai: [{ truncated: true, text: CUT }], anthropic: [{ truncated: false, text: FULL }] },
    async (calls) => {
      const response = await POST(instructionRequest("auto"));
      const data = await response.json();
      assert.equal(response.status, 200);
      assert.equal(data.provider, "anthropic");
      assert.deepEqual(calls.map((call) => call.provider), ["openai", "openai", "anthropic"]);
    },
  );
});
