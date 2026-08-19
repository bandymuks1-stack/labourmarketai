/**
 * AI dispatch core — provider selection + disabled/mock/live behaviour.
 * No network: the live branch is reached only to prove it self-gates on a
 * missing key BEFORE importing the SDK.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { resolveAiRuntimeConfig, type AiRuntimeConfigInput } from "./config-core";
import { dispatchAiCompletion, selectCompletionProvider } from "./run-core";
import type { AiCompletionRequest } from "./types";
import { resolveTaskRoute } from "./task-routing";

const base: AiRuntimeConfigInput = {
  mode: undefined, provider: undefined, apiKey: undefined, model: undefined,
  timeoutMs: undefined, maxRetries: undefined, maxOutputTokens: undefined,
  dailyRunBudget: undefined,
};

const req = (mock?: unknown): AiCompletionRequest => ({
  agentKey: "worker_profile",
  promptVersion: "v1",
  system: "You suggest, never verify.",
  input: { bio: "I tile bathrooms." },
  locale: "lt",
  mock,
});

describe("selectCompletionProvider", () => {
  it("maps every kind to its provider (non-anthropic wires stay env-gated)", () => {
    expect(selectCompletionProvider("disabled").kind).toBe("disabled");
    expect(selectCompletionProvider("mock").kind).toBe("mock");
    expect(selectCompletionProvider("anthropic").kind).toBe("anthropic");
    // AI Router v1: real fetch wires exist, DOUBLE env-gated inside each
    // adapter (enable flag + key) — selection alone never reaches a network.
    expect(selectCompletionProvider("openai").kind).toBe("openai");
    expect(selectCompletionProvider("gemini").kind).toBe("gemini");
    expect(selectCompletionProvider("xai").kind).toBe("xai");
  });

  it("an env-gated adapter selected without env returns the disabled sentinel", async () => {
    const cfg = resolveAiRuntimeConfig({
      ...base, mode: "live", provider: "openai", apiKey: "presence-only",
    });
    const r = await selectCompletionProvider("openai").complete(req(), cfg);
    expect(r.status).toBe("disabled");
  });
});

describe("dispatchAiCompletion", () => {
  it("disabled config returns the disabled sentinel (no work)", async () => {
    const cfg = resolveAiRuntimeConfig(base);
    const r = await dispatchAiCompletion(req({ x: 1 }), cfg);
    expect(r.status).toBe("disabled");
  });

  it("mock config returns the supplied deterministic payload as raw", async () => {
    const cfg = resolveAiRuntimeConfig({ ...base, mode: "mock" });
    const payload = { suggestion: true, headline: "Plytelių klojėjas" };
    const r = await dispatchAiCompletion(req(payload), cfg);
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.provider).toBe("mock");
      expect(r.raw).toEqual(payload);
    }
  });

  it("mock with no payload returns raw:null (downstream schema then rejects it)", async () => {
    const cfg = resolveAiRuntimeConfig({ ...base, mode: "mock" });
    const r = await dispatchAiCompletion(req(), cfg);
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.raw).toBeNull();
  });
});

describe("live adapter self-gates on a missing key (no network)", () => {
  beforeEach(() => {
    delete process.env.AI_API_KEY;
  });
  it("the legacy no-chain path is refused by the egress gate before any provider work", async () => {
    // OWNER DECISION 2026-08-19 (AI DATA BOUNDARY). This used to reach the
    // adapter and fail on the missing key. It no longer gets that far: the
    // egress gate now runs ON THE DISPATCH PATH rather than in the optional
    // chain context, so a no-chain caller cannot skip it by omitting an
    // argument. `worker_profile` carries PERSONAL data and anthropic holds no
    // egress grant, so the refusal comes first — which is the correct order.
    const cfg = resolveAiRuntimeConfig({
      ...base, mode: "live", provider: "anthropic", apiKey: "sk-ant-presence-only",
    });
    expect(cfg.state).toBe("live");
    const r = await dispatchAiCompletion(req(), cfg);
    expect(r.status).toBe("error");
    if (r.status === "error") {
      expect(r.code).toBe("unsupported");
      expect(r.message).toMatch(/egress grant/i);
    }
  });

  it("once egress IS permitted, the adapter still self-gates on a missing key", async () => {
    // The original property, preserved rather than dropped: reaching the live
    // branch must fail on the key WITHOUT importing the SDK or touching the
    // network. A grant is injected so the run gets past the boundary at all —
    // otherwise this coverage would have been lost to the gate.
    const cfg = resolveAiRuntimeConfig({
      ...base, mode: "live", provider: "anthropic", apiKey: "sk-ant-presence-only",
    });
    const r = await dispatchAiCompletion(req(), cfg, {
      decision: resolveTaskRoute("normalize_external_profile", { attempt: 1 }),
      states: [{ id: "anthropic", health: "ready" }],
      grants: [
        {
          provider: "anthropic",
          maxSensitivity: "SENSITIVE_FREE_TEXT",
          basis: "test fixture",
          grantedOn: "2026-08-19",
        },
      ],
    });
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.code).toBe("no_api_key");
  });
});
