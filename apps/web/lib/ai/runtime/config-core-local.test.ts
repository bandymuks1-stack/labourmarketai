/**
 * The keyless local provider — configuration validity.
 *
 * The claim under test is narrow and worth stating precisely: a LOCAL provider
 * becomes live WITHOUT an api key, and a CLOUD provider's key requirement is
 * exactly as strict as it was before. Both halves are asserted here, because
 * "keyless local works" is only good news if it did not arrive by relaxing the
 * check that keeps a cloud vendor inert.
 */
import { describe, it, expect } from "vitest";
import {
  checkLocalBaseUrl,
  resolveAiRuntimeConfig,
  isCloudProvider,
  type AiRuntimeConfigInput,
} from "./config-core";

const BASE: AiRuntimeConfigInput = {
  mode: undefined,
  provider: undefined,
  apiKey: undefined,
  model: undefined,
  timeoutMs: undefined,
  maxRetries: undefined,
  maxOutputTokens: undefined,
  dailyRunBudget: undefined,
};

const local = (over: Partial<AiRuntimeConfigInput> = {}) =>
  resolveAiRuntimeConfig({
    ...BASE,
    mode: "live",
    provider: "local",
    localBaseUrl: "http://localhost:11434/v1",
    localModel: "llama3.1:8b",
    ...over,
  });

describe("local provider — keyless configuration is VALID", () => {
  it("live + base URL + model + NO key is live", () => {
    const cfg = local();
    expect(cfg.state).toBe("live");
    expect(cfg.reason).toBe("ok");
    expect(cfg.provider).toBe("local");
    // The whole point: no key, and no key was invented either.
    expect(cfg.hasApiKey).toBe(false);
    expect(cfg.hasLocalApiKey).toBe(false);
    expect(cfg.localModel).toBe("llama3.1:8b");
  });

  it('an operator-supplied placeholder key is NOT what makes it work', () => {
    // The old config forced AI_API_KEY="fake" to reach `live`. Proving the
    // keyless case is live is only half of it — the presence of a key must
    // also make no difference, or the placeholder habit survives.
    const withKey = local({ apiKey: "sk-not-needed-here" });
    const without = local();
    expect(withKey.state).toBe(without.state);
    expect(withKey.reason).toBe(without.reason);
  });

  it("an OPTIONAL local bearer is recorded as presence only", () => {
    const cfg = local({ localApiKey: "proxy-token" });
    expect(cfg.state).toBe("live");
    expect(cfg.hasLocalApiKey).toBe(true);
    // The value never lands on the config object.
    expect(JSON.stringify(cfg)).not.toContain("proxy-token");
  });
});

describe("local provider — its OWN proof of configuration is enforced", () => {
  it("missing base URL is invalid", () => {
    const cfg = local({ localBaseUrl: undefined });
    expect(cfg.state).toBe("disabled");
    expect(cfg.reason).toBe("missing_base_url");
  });

  it("blank base URL is invalid (not treated as set)", () => {
    const cfg = local({ localBaseUrl: "   " });
    expect(cfg.state).toBe("disabled");
    expect(cfg.reason).toBe("missing_base_url");
  });

  it("missing model is invalid — a local model id is never defaulted", () => {
    const cfg = local({ localModel: undefined });
    expect(cfg.state).toBe("disabled");
    expect(cfg.reason).toBe("missing_local_model");
  });

  it("malformed URL is rejected", () => {
    const cfg = local({ localBaseUrl: "not a url" });
    expect(cfg.state).toBe("disabled");
    expect(cfg.reason).toBe("invalid_base_url");
  });

  it.each(["file:///etc/passwd", "ftp://host/x", "ws://localhost:1234"])(
    "unsupported protocol %s is rejected",
    (url) => {
      const cfg = local({ localBaseUrl: url });
      expect(cfg.state).toBe("disabled");
      expect(cfg.reason).toBe("invalid_base_url");
    },
  );

  it("a credential embedded in the URL is rejected", () => {
    const cfg = local({ localBaseUrl: "https://user:pass@ai.example.com/v1" });
    expect(cfg.state).toBe("disabled");
    expect(cfg.reason).toBe("invalid_base_url");
  });

  it("plaintext http to a NON-loopback host is rejected", () => {
    // These prompts carry CVs and journal text; a cleartext hop off-box is a
    // disclosure, not a convenience.
    const cfg = local({ localBaseUrl: "http://ai.example.com/v1" });
    expect(cfg.state).toBe("disabled");
    expect(cfg.reason).toBe("invalid_base_url");
  });

  it("https to a remote host IS accepted", () => {
    const cfg = local({ localBaseUrl: "https://ai.example.com/v1" });
    expect(cfg.state).toBe("live");
    expect(cfg.localBaseUrl).toBe("https://ai.example.com/v1");
  });

  it.each([
    "http://localhost:11434",
    "http://127.0.0.1:1234",
    "http://127.5.5.5:1234",
    "http://[::1]:1234",
    "http://ollama.localhost:11434",
  ])("plaintext http IS accepted for loopback host %s", (url) => {
    expect(local({ localBaseUrl: url }).state).toBe("live");
  });
});

describe("checkLocalBaseUrl normalises without losing a path prefix", () => {
  it("drops a trailing slash", () => {
    const r = checkLocalBaseUrl("http://localhost:11434/v1/");
    expect(r.ok && r.url).toBe("http://localhost:11434/v1");
  });

  it("keeps a path prefix (a runtime may live under one)", () => {
    const r = checkLocalBaseUrl("https://gpu.example.com/inference/v1");
    expect(r.ok && r.url).toBe("https://gpu.example.com/inference/v1");
  });

  it("drops query and fragment", () => {
    const r = checkLocalBaseUrl("http://localhost:11434/v1?a=1#f");
    expect(r.ok && r.url).toBe("http://localhost:11434/v1");
  });
});

describe("CLOUD validation is NOT weakened by any of this", () => {
  it.each(["anthropic", "openai", "gemini", "xai"] as const)(
    "%s still requires a key",
    (provider) => {
      const cfg = resolveAiRuntimeConfig({
        ...BASE,
        mode: "live",
        provider,
        apiKey: undefined,
        // Even with a perfectly good LOCAL config present, a cloud provider
        // gets no benefit from it — the local values must not stand in.
        localBaseUrl: "http://localhost:11434/v1",
        localModel: "llama3.1:8b",
      });
      expect(cfg.state).toBe("disabled");
      expect(cfg.reason).toBe("missing_api_key");
    },
  );

  it.each(["anthropic", "openai", "gemini", "xai"] as const)(
    "%s with a key is live",
    (provider) => {
      const cfg = resolveAiRuntimeConfig({
        ...BASE,
        mode: "live",
        provider,
        apiKey: "sk-real-enough",
      });
      expect(cfg.state).toBe("live");
    },
  );

  it("an unknown provider is still rejected", () => {
    const cfg = resolveAiRuntimeConfig({
      ...BASE,
      mode: "live",
      provider: "totally-made-up",
      apiKey: "sk-x",
    });
    expect(cfg.state).toBe("disabled");
    expect(cfg.reason).toBe("unknown_provider");
  });

  it("OFF is still the default — no mode, no runtime", () => {
    expect(resolveAiRuntimeConfig({ ...BASE }).state).toBe("disabled");
    expect(resolveAiRuntimeConfig({ ...BASE }).reason).toBe("mode_disabled");
  });

  it("mock still needs nothing at all", () => {
    expect(resolveAiRuntimeConfig({ ...BASE, mode: "mock" }).state).toBe("mock");
  });

  it("local is not a cloud provider; the four vendors are", () => {
    expect(isCloudProvider("local")).toBe(false);
    for (const p of ["anthropic", "openai", "gemini", "xai"] as const) {
      expect(isCloudProvider(p)).toBe(true);
    }
  });
});

describe("cost guards survive a local configuration", () => {
  it("timeout / tokens / budget are still clamped", () => {
    const cfg = local({
      timeoutMs: "999999999",
      maxOutputTokens: "999999",
      dailyRunBudget: "-5",
    });
    expect(cfg.timeoutMs).toBe(120_000);
    expect(cfg.maxOutputTokens).toBe(8_000);
    expect(cfg.dailyRunBudget).toBe(0);
  });
});
