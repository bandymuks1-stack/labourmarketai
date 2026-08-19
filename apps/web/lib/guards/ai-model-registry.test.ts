import { describe, expect, it } from "vitest";

import {
  MODEL_REGISTRY,
  MODEL_REGISTRY_VERSION,
  isSelectable,
  modelsForProvider,
  registryEntryForModel,
  registryProviders,
} from "@/lib/ai/runtime/model-registry";
import { AI_MODEL_CANDIDATES } from "@/lib/ai/runtime/model-candidates";
import {
  MODEL_PRICING_USD_PER_MTOK,
  pricingForModel,
} from "@/lib/ai/runtime/model-pricing";

/**
 * MODEL REGISTRY (owner requirement 2026-08-19: global provider-neutrality).
 *
 * The runtime's routing POLICY was already provider-neutral — cost-class
 * ordering, a privacy veto ahead of cost, one-tier escalation. What blocked a
 * new provider was model KNOWLEDGE: ids lived in one literal, prices in
 * another that did not know about it, and provider identity in two separate
 * closed unions. Adding a sixth provider meant four hand edits and there was
 * nowhere to record capability, context, quality, latency, free-tier status,
 * where a price came from or when it took effect.
 *
 * These pins keep the registry the single source, and — since #1197 made
 * prices load-bearing for real spend — keep an unsourced price from ever
 * becoming an enforcement input.
 */
describe("the registry is the single source for model facts", () => {
  it("is versioned, so a stored routing decision stays re-readable", () => {
    expect(MODEL_REGISTRY_VERSION).toBeGreaterThanOrEqual(1);
  });

  it("carries every field the owner requirement names", () => {
    for (const e of MODEL_REGISTRY) {
      const where = `${e.provider}/${e.model}`;
      expect(typeof e.provider, where).toBe("string");
      expect(typeof e.model, where).toBe("string");
      expect(Array.isArray(e.capabilities), where).toBe(true);
      expect(Array.isArray(e.dataRestrictions), where).toBe(true);
      expect(typeof e.freeTier, where).toBe("boolean");
      expect(typeof e.enabled, where).toBe("boolean");
      // Nullable-but-present: measured or sourced facts, never invented.
      for (const k of [
        "qualityScore",
        "inputUsdPerMTok",
        "outputUsdPerMTok",
        "contextTokens",
        "maxOutputTokens",
        "latencyP50Ms",
        "effectiveFrom",
        "pricingSource",
      ] as const) {
        expect(e, `${where}.${k}`).toHaveProperty(k);
      }
    }
  });

  it("has no duplicate model ids — one home per model", () => {
    const ids = MODEL_REGISTRY.map((e) => e.model);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has at most one model per (provider, alias)", () => {
    const seen = new Set<string>();
    for (const e of MODEL_REGISTRY) {
      if (!e.alias) continue;
      const key = `${e.provider}:${e.alias}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });
});

describe("an unsourced price can never authorise spend", () => {
  it("enabled requires BOTH prices, a source and an effective date", () => {
    for (const e of MODEL_REGISTRY) {
      if (!e.enabled) continue;
      const where = `${e.provider}/${e.model}`;
      expect(e.inputUsdPerMTok, where).not.toBeNull();
      expect(e.outputUsdPerMTok, where).not.toBeNull();
      expect(e.pricingSource, where).not.toBeNull();
      expect(e.effectiveFrom, where).not.toBeNull();
      expect(isSelectable(e), where).toBe(true);
    }
  });

  it("effectiveFrom is a real ISO date where present", () => {
    for (const e of MODEL_REGISTRY) {
      if (e.effectiveFrom === null) continue;
      expect(e.effectiveFrom, e.model).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("a quality score, where present, comes from a 0..1 measurement", () => {
    for (const e of MODEL_REGISTRY) {
      if (e.qualityScore === null) continue;
      expect(e.qualityScore, e.model).toBeGreaterThanOrEqual(0);
      expect(e.qualityScore, e.model).toBeLessThanOrEqual(1);
    }
  });

  it("an unpriced model is ABSENT from the derived price table", () => {
    for (const e of MODEL_REGISTRY) {
      if (e.inputUsdPerMTok !== null) continue;
      expect(pricingForModel(e.model), e.model).toBeNull();
    }
  });
});

describe("the derived tables did not change any shipped value", () => {
  it("model ids are byte-identical to the pre-registry literals", () => {
    expect(AI_MODEL_CANDIDATES.anthropic).toEqual({
      fable: "claude-fable-5",
      opus: "claude-opus-4-8",
      sonnet: "claude-sonnet-4-6",
      haiku: "claude-haiku-4-5-20251001",
    });
    expect(AI_MODEL_CANDIDATES.openai).toEqual({
      opus: "gpt-5",
      sonnet: "gpt-5-mini",
      haiku: "gpt-5-nano",
    });
    expect(AI_MODEL_CANDIDATES.gemini).toEqual({
      opus: "gemini-2.5-pro",
      sonnet: "gemini-2.5-flash",
      haiku: "gemini-2.5-flash-lite",
    });
    expect(AI_MODEL_CANDIDATES.xai).toEqual({
      opus: "grok-4",
      sonnet: "grok-3",
      haiku: "grok-3-mini",
    });
  });

  it("prices are byte-identical to the pre-registry table", () => {
    expect(MODEL_PRICING_USD_PER_MTOK.haiku).toEqual({
      inputUsdPerMTok: 1,
      outputUsdPerMTok: 5,
    });
    expect(MODEL_PRICING_USD_PER_MTOK.sonnet).toEqual({
      inputUsdPerMTok: 3,
      outputUsdPerMTok: 15,
    });
    expect(MODEL_PRICING_USD_PER_MTOK.opus).toEqual({
      inputUsdPerMTok: 5,
      outputUsdPerMTok: 25,
    });
    expect(MODEL_PRICING_USD_PER_MTOK["claude-opus-4-8"]).toEqual(
      MODEL_PRICING_USD_PER_MTOK.opus,
    );
  });

  it("an alias key never resolves to a non-default provider's price", () => {
    // `modelIdForAlias` defaults to anthropic, so the alias keys must too.
    for (const alias of ["haiku", "sonnet", "opus"] as const) {
      const viaAlias = MODEL_PRICING_USD_PER_MTOK[alias];
      const anthropicModel = modelsForProvider("anthropic")[alias];
      expect(viaAlias).toEqual(MODEL_PRICING_USD_PER_MTOK[anthropicModel]);
    }
  });
});

describe("a new provider is data, not a type change", () => {
  it("providers are derived from the registry, not a hand-kept union", () => {
    const providers = registryProviders();
    expect(providers).toContain("anthropic");
    expect(providers).toContain("openai");
    // The proof that the structure is open: a provider that was not in any of
    // the original closed unions is present without a type edit.
    expect(providers).toContain("qwen");
  });

  it("Qwen is registered as a real candidate", () => {
    const qwen = MODEL_REGISTRY.filter((e) => e.provider === "qwen");
    expect(qwen.length).toBeGreaterThanOrEqual(3);
    // Bound to the same tier ladder as every other provider — that is what
    // makes it selectable by the existing router rather than a special case.
    expect(qwen.map((e) => e.alias).sort()).toEqual(["haiku", "opus", "sonnet"]);
  });

  it("Qwen is NOT selectable — its prices are unverified, not invented", () => {
    // The primary source is unreachable from this environment, so no figure
    // was written. Registered, disabled, and honest about why.
    for (const e of MODEL_REGISTRY.filter((x) => x.provider === "qwen")) {
      expect(e.enabled, e.model).toBe(false);
      expect(e.inputUsdPerMTok, e.model).toBeNull();
      expect(e.pricingSource, e.model).toBeNull();
      expect(isSelectable(e), e.model).toBe(false);
    }
  });

  it("every provider with a working adapter is registered", () => {
    // If an adapter can dispatch to it, the registry must know about it —
    // otherwise cost control has a blind spot.
    for (const p of ["anthropic", "openai", "gemini", "xai"]) {
      expect(registryProviders(), p).toContain(p);
    }
  });

  it("lookup by concrete model id works for a registered model", () => {
    expect(registryEntryForModel("claude-opus-4-8")?.provider).toBe("anthropic");
    expect(registryEntryForModel("qwen-max")?.provider).toBe("qwen");
    expect(registryEntryForModel("no-such-model")).toBeNull();
  });
});
