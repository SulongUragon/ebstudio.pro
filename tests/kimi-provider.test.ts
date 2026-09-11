import assert from "node:assert/strict";
import test from "node:test";
import {
  getProviderOrder,
  providerDisplayName,
  resolveKimiEndpoint,
  resolveKimiModel,
} from "../app/api/generate/route";

const providerEnvKeys = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "MOONSHOT_API_KEY",
  "KIMI_API_BASE",
  "KIMI_MODEL",
] as const;

function withProviderEnv(
  values: Partial<Record<(typeof providerEnvKeys)[number], string>>,
  run: () => void,
) {
  const original = Object.fromEntries(
    providerEnvKeys.map((key) => [key, process.env[key]]),
  );

  for (const key of providerEnvKeys) delete process.env[key];
  Object.assign(process.env, values);

  try {
    run();
  } finally {
    for (const key of providerEnvKeys) {
      const value = original[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("Kimi can be selected as the only configured writing provider", () => {
  withProviderEnv({ MOONSHOT_API_KEY: "test-key" }, () => {
    assert.deepEqual(getProviderOrder("kimi"), ["kimi"]);
    assert.deepEqual(getProviderOrder("auto"), ["kimi"]);
  });
});

test("Auto preserves the preferred provider and falls back through all configured writers", () => {
  withProviderEnv(
    {
      OPENAI_API_KEY: "openai-test-key",
      ANTHROPIC_API_KEY: "anthropic-test-key",
      MOONSHOT_API_KEY: "kimi-test-key",
    },
    () => {
      assert.deepEqual(getProviderOrder("auto", "kimi"), [
        "kimi",
        "openai",
        "anthropic",
      ]);
    },
  );
});

test("Kimi endpoint and model support deployment overrides", () => {
  withProviderEnv(
    {
      KIMI_API_BASE: "https://api.moonshot.cn/v1/",
      KIMI_MODEL: "moonshot-v1-128k",
    },
    () => {
      assert.equal(
        resolveKimiEndpoint(),
        "https://api.moonshot.cn/v1/chat/completions",
      );
      assert.equal(resolveKimiModel(), "moonshot-v1-128k");
    },
  );
});

test("Kimi defaults are ready for the international Moonshot API", () => {
  withProviderEnv({}, () => {
    assert.equal(
      resolveKimiEndpoint(),
      "https://api.moonshot.ai/v1/chat/completions",
    );
    assert.equal(resolveKimiModel(), "moonshot-v1-32k");
    assert.equal(providerDisplayName("kimi"), "Kimi");
  });
});
