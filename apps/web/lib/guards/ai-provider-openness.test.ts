import { describe, expect, it } from "vitest";

import {
  MODEL_REGISTRY,
  MODEL_TRANSPORTS,
  transportForProvider,
} from "@/lib/ai/runtime/model-registry";
import { observeProviderStates } from "@/lib/ai/runtime/provider-health";
import {
  AI_PROVIDER_PROFILES,
  resolveProviderChain,
} from "@/lib/ai/runtime/provider-chain";
import { resolveTaskRoute } from "@/lib/ai/runtime/task-routing";

/**
 * PROVIDER OPENNESS (owner requirement 2026-08-19: the orchestrator must take
 * Qwen and other providers on measured merit, not brand).
 *
 * #1198 opened the REGISTRY but left the road out of it closed: a provider
 * could be registered and priced, yet `AiChainProviderId` was a five-value
 * union, `adapterForChainId` was an exhaustive switch over it, and
 * `observeProviderStates` enumerated the same five by hand. Registered but
 * unroutable is not provider-neutral — the PR said so in its own scope note.
 *
 * These pins keep all three open, and — critically — keep the safety the
 * closed union used to provide:
 *
 *   - an id with no PROFILE is never a candidate;
 *   - an id with no ADAPTER fails closed with an honest reason. With the union
 *     opened, the old exhaustive switch would have returned `undefined` and
 *     crashed at `.complete()`; "no adapter" and "the adapter failed" must stay
 *     different sentences.
 */
describe("transport, not vendor, decides the adapter", () => {
  it("every registry entry declares a known wire protocol", () => {
    for (const e of MODEL_REGISTRY) {
      expect(MODEL_TRANSPORTS, `${e.provider}/${e.model}`).toContain(
        e.transport,
      );
    }
  });

  it("the OpenAI protocol family shares one adapter", () => {
    // The property that makes a new entrant cheap: Qwen, xAI and OpenAI all
    // speak the same protocol, so none of them needs its own adapter.
    expect(transportForProvider("openai")).toBe("openai-compatible");
    expect(transportForProvider("xai")).toBe("openai-compatible");
    expect(transportForProvider("qwen")).toBe("openai-compatible");
  });

  it("a vendor with its own protocol keeps its own adapter", () => {
    expect(transportForProvider("anthropic")).toBe("anthropic");
    expect(transportForProvider("gemini")).toBe("gemini");
  });

  it("an unregistered provider has no transport — the caller must degrade", () => {
    expect(transportForProvider("not-a-provider")).toBeNull();
    // `local` is deliberately absent: it serves whatever model the operator
    // pulled, so it has no fixed model id to register.
    expect(transportForProvider("local")).toBeNull();
  });
});

describe("an unknown provider fails closed, never crashes", () => {
  it("dispatch returns an honest reason instead of an undefined adapter", async () => {
    const { dispatchAiCompletion } = await import(
      "@/lib/ai/runtime/run-core"
    );
    expect(typeof dispatchAiCompletion).toBe("function");
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(
        new URL("../ai/runtime/run-core.ts", import.meta.url),
        "utf8",
      ),
    );
    // The adapter lookup is total and its null case is handled at the call
    // site — the two halves that stop an opened union from crashing.
    expect(src).toContain("AiCompletionProvider | null");
    expect(src).toContain("adapter === null");
    expect(src).toContain("no adapter for provider");
  });

  it("a provider with no profile is never ordered as a candidate", () => {
    const decision = resolveTaskRoute("extract_cv", {
      attempt: 1,
      expectedInputTokens: 1_000,
      provider: "anthropic",
    });
    const outcome = resolveProviderChain(decision, [
      { id: "not-a-provider", health: "ready" },
    ]);
    // Ready, but unknown to AI_PROVIDER_PROFILES → cannot serve.
    expect(outcome.kind).toBe("unavailable");
  });

  it("every profiled provider is one the runtime can actually reach", () => {
    // Guards the reverse mistake: a profile for something with no transport
    // and no local handling would be orderable but undispatchable.
    for (const p of AI_PROVIDER_PROFILES) {
      const reachable = p.id === "local" || transportForProvider(p.id) !== null;
      expect(reachable, `${p.id} has a profile but no way to run`).toBe(true);
    }
  });
});

describe("health observation is open too", () => {
  const cloud = { enabled: false, hasKey: false };
  const base = {
    local: { enabled: false, baseUrl: null, model: null },
    anthropic: cloud,
    openai: cloud,
    gemini: cloud,
    xai: cloud,
  } as const;

  it("a registry provider outside the original five can be observed", () => {
    // Without this, opening dispatch alone would leave a new provider
    // dispatchable in theory and unreachable in fact — it could never be
    // reported ready, so it could never be selected.
    const states = observeProviderStates({
      ...base,
      runtimeState: "live",
      cloud: { qwen: { enabled: true, hasKey: true } },
    });
    expect(states.map((s) => s.id)).toContain("qwen");
  });

  it("nothing is ready while the runtime is not live", () => {
    const states = observeProviderStates({
      ...base,
      runtimeState: "mock",
      cloud: { qwen: { enabled: true, hasKey: true } },
    });
    expect(states.map((s) => s.id)).toContain("qwen");
    for (const s of states) expect(s.health, s.id).toBe("disabled");
  });

  it("a named provider is never double-reported via the open map", () => {
    const states = observeProviderStates({
      ...base,
      runtimeState: "live",
      cloud: { openai: { enabled: true, hasKey: true } },
    });
    expect(states.filter((s) => s.id === "openai")).toHaveLength(1);
  });
});
