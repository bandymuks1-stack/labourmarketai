import { describe, expect, it } from "vitest";

import {
  MODEL_REGISTRY,
  MODEL_TRANSPORTS,
  transportForProvider,
} from "@/lib/ai/runtime/model-registry";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
describe("transport records protocol, the binding decides the adapter", () => {
  it("every registry entry declares a known wire protocol", () => {
    for (const e of MODEL_REGISTRY) {
      expect(MODEL_TRANSPORTS, `${e.provider}/${e.model}`).toContain(
        e.transport,
      );
    }
  });

  it("records protocol compatibility — which is NOT permission to share an adapter", () => {
    expect(transportForProvider("openai")).toBe("openai-compatible");
    expect(transportForProvider("xai")).toBe("openai-compatible");
    expect(transportForProvider("qwen")).toBe("openai-compatible");
  });

  it("a shared protocol never means a shared endpoint or key", () => {
    // The mistake this pins, because it was made and caught in review: an
    // earlier version dispatched by transport, so every openai-compatible
    // provider got `openaiCompletionProvider` — which hardcodes
    // api.openai.com and OPENAI_API_KEY. An xAI-selected payload would have
    // gone to OpenAI. Same protocol, different vendor, different credential.
    const openai = readFileSync(
      join(__dirname, "..", "ai", "runtime", "providers", "openai.ts"),
      "utf8",
    );
    const xai = readFileSync(
      join(__dirname, "..", "ai", "runtime", "providers", "xai.ts"),
      "utf8",
    );
    expect(openai).toContain("api.openai.com");
    expect(openai).toContain("OPENAI_API_KEY");
    expect(xai).toContain("api.x.ai");
    expect(xai).toContain("XAI_API_KEY");
    // Each provider therefore needs its OWN binding in run-core.
    const core = readFileSync(
      join(__dirname, "..", "ai", "runtime", "run-core.ts"),
      "utf8",
    );
    expect(core).toContain("ADAPTER_BY_PROVIDER");
    expect(core).toContain("xai: xaiCompletionProvider");
    expect(core).toContain("openai: openaiCompletionProvider");
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
    const src = readFileSync(
      join(__dirname, "..", "ai", "runtime", "run-core.ts"),
      "utf8",
    );
    // The adapter lookup is total and its null case is handled at the call
    // site — the two halves that stop an opened union from crashing.
    expect(src).toContain("AiCompletionProvider | null");
    expect(src).toContain("adapter === null");
    expect(src).toContain("no adapter bound for provider");
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

  it("every profiled provider has an adapter binding", () => {
    // Guards the reverse mistake: a profile for something with no binding
    // would be orderable but undispatchable.
    const core = readFileSync(
      join(__dirname, "..", "ai", "runtime", "run-core.ts"),
      "utf8",
    );
    const bindings = core.slice(
      core.indexOf("ADAPTER_BY_PROVIDER"),
      core.indexOf("function adapterForChainId"),
    );
    for (const p of AI_PROVIDER_PROFILES) {
      expect(bindings, `${p.id} has a profile but no adapter binding`).toContain(
        `${p.id}:`,
      );
    }
  });

  it("a registered provider with no binding is refused, not misrouted", () => {
    // Qwen's honest end state today: in the registry, priced nowhere, bound to
    // no adapter. It must get a refusal rather than another vendor's endpoint.
    const core = readFileSync(
      join(__dirname, "..", "ai", "runtime", "run-core.ts"),
      "utf8",
    );
    const bindings = core.slice(
      core.indexOf("ADAPTER_BY_PROVIDER"),
      core.indexOf("function adapterForChainId"),
    );
    expect(bindings).not.toContain("qwen");
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
