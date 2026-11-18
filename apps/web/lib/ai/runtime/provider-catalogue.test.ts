/**
 * PROVIDER CATALOGUE (owner order 2026-10-25) — one vendor table, enforced.
 *
 * The catalogue is only useful if it cannot drift from what the runtime can
 * actually reach, and if its one enforcement input — `termsCeiling` — really
 * stops a payload. Both are pinned here.
 */
import { describe, expect, it } from "vitest";
import {
  PROVIDER_CATALOGUE,
  catalogueEntryFor,
  integrationStateFor,
  termsCeilingFor,
} from "./provider-catalogue";
import { AI_PROVIDER_PROFILES, orderedCandidatesFor, tierPriceUsd, type AiProviderProfile } from "./provider-chain";
import { MODEL_REGISTRY, registryProviders } from "./model-registry";
import { SECONDARY_TRANSLATION_PROVIDERS, deeplEgressProfile } from "./run-core";
import { AI_DATA_SENSITIVITY_CLASSES } from "./data-sensitivity";
import { egressPermitted, maxPermittedSensitivity, type AiEgressGrant } from "./data-egress";

const GENEROUS = (provider: string): AiEgressGrant[] => [
  { provider, maxSensitivity: "SENSITIVE_FREE_TEXT", basis: "test", grantedOn: "2026-10-25" },
];

describe("one catalogue covers every vendor the runtime can reach", () => {
  it("ids are unique", () => {
    const ids = PROVIDER_CATALOGUE.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every chain profile, registry provider and translation secondary has an entry", () => {
    const reachable = new Set<string>([
      ...AI_PROVIDER_PROFILES.map((p) => p.id),
      ...registryProviders(),
      ...SECONDARY_TRANSLATION_PROVIDERS.map((s) => s.id),
      "deepl_free",
    ]);
    for (const id of reachable) expect(catalogueEntryFor(id), id).toBeDefined();
  });

  it("covers every provider the owner named, and models are not providers", () => {
    for (const id of [
      "moonshot", "mistral", "deepl", "groq", "cloudflare", "openrouter", "deepseek",
      "openai", "anthropic", "gemini", "xai", "qwen", "libretranslate", "local", "nvidia", "meta",
    ]) {
      expect(catalogueEntryFor(id), id).toBeDefined();
    }
    // Llama and Nemotron are MODELS under the host that serves them.
    const models = MODEL_REGISTRY.map((e) => `${e.provider}/${e.model}`);
    expect(models).toContain("cloudflare/@cf/meta/llama-3.3-70b-instruct-fp8-fast");
    expect(models).toContain("cloudflare/@cf/nvidia/nemotron-3-120b-a12b");
    expect(AI_PROVIDER_PROFILES.some((p) => /llama|nemotron/i.test(p.id))).toBe(false);
  });

  it("every external entry cites a first-hand https source with a read date", () => {
    for (const e of PROVIDER_CATALOGUE) {
      if (e.id === "local") continue;
      expect(e.sources.length, e.id).toBeGreaterThan(0);
      for (const s of e.sources) {
        expect(s.url, e.id).toMatch(/^https:\/\//);
        expect(s.read, e.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(s.pageDate.length, e.id).toBeGreaterThan(0);
      }
    }
  });
});

describe("integration state is honest", () => {
  it("CODE_READY means a wire with env names; anything else has no wire", () => {
    for (const e of PROVIDER_CATALOGUE) {
      if (e.codeState === "CODE_READY_AWAITING_KEY") {
        expect(e.env.length, e.id).toBeGreaterThan(0);
      } else {
        expect(e.env, e.id).toEqual([]);
        expect(AI_PROVIDER_PROFILES.some((p) => p.id === e.id), `${e.id} has a chain profile`).toBe(false);
        // A registered-but-not-integrated provider (Qwen) keeps every model disabled.
        for (const m of MODEL_REGISTRY.filter((r) => r.provider === e.id)) {
          expect(m.enabled, `${e.id}/${m.model}`).toBe(false);
        }
      }
    }
  });

  it("LIVE_IN_PROD is observed, never declared", () => {
    expect(PROVIDER_CATALOGUE.some((e) => (e.codeState as string) === "LIVE_IN_PROD")).toBe(false);
    expect(integrationStateFor("cloudflare", "ready", true)).toBe("LIVE_IN_PROD");
    expect(integrationStateFor("cloudflare", "ready", false)).toBe("CODE_READY_AWAITING_KEY");
    expect(integrationStateFor("cloudflare", "unconfigured", true)).toBe("CODE_READY_AWAITING_KEY");
    expect(integrationStateFor("deepseek", "ready", true)).toBe("UNSUITABLE_BY_TERMS");
    expect(integrationStateFor("no-such-vendor", "ready", true)).toBe("NOT_INTEGRATED");
  });
});

describe("the vendor's own terms are an enforced ceiling", () => {
  it("an UNSUITABLE vendor is EXCLUDED: refused even PUBLIC, whatever a grant says", () => {
    for (const e of PROVIDER_CATALOGUE.filter((x) => x.codeState === "UNSUITABLE_BY_TERMS")) {
      expect(e.termsCeiling, e.id).toBe("EXCLUDED");
      const profile = { id: e.id, locality: "cloud" as const, costClass: "paid" };
      for (const s of AI_DATA_SENSITIVITY_CLASSES) {
        const v = egressPermitted(profile, s, GENEROUS(e.id));
        expect(v.permitted, `${e.id} ← ${s}`).toBe(false);
        expect(!v.permitted && v.reason, e.id).toMatch(/excluded by its own terms/);
      }
    }
    expect(termsCeilingFor("moonshot")).toBe("EXCLUDED");
    expect(termsCeilingFor("deepseek")).toBe("EXCLUDED");
  });

  it("a PUBLIC-by-terms vendor cannot be raised by a grant (DeepL Free, Mistral free mode, OpenRouter)", () => {
    for (const id of ["deepl_free", "mistral", "openrouter"]) {
      const profile = { id, locality: "cloud" as const, costClass: "free_tier" };
      expect(maxPermittedSensitivity(profile, GENEROUS(id)), id).toBe("PUBLIC");
      expect(egressPermitted(profile, "LOW_RISK_PROJECT_DATA", GENEROUS(id)).permitted, id).toBe(false);
      expect(egressPermitted(profile, "PUBLIC").permitted, id).toBe(true);
    }
  });

  it("a vendor whose terms set no cap is still default-deny (grants decide)", () => {
    const anthropic = { id: "anthropic", locality: "cloud" as const, costClass: "paid" };
    expect(maxPermittedSensitivity(anthropic)).toBe("PUBLIC");
    expect(maxPermittedSensitivity(anthropic, GENEROUS("anthropic"))).toBe("SENSITIVE_FREE_TEXT");
  });

  it("a DeepL key is classed by PLAN: \":fx\" is deepl_free (PUBLIC only), any other key is paid DeepL", () => {
    expect(deeplEgressProfile("abc:fx")).toEqual({ id: "deepl_free", locality: "cloud", costClass: "free_tier" });
    expect(deeplEgressProfile("abc")).toEqual({ id: "deepl", locality: "cloud", costClass: "paid" });
    expect(egressPermitted(deeplEgressProfile("abc:fx"), "SENSITIVE_FREE_TEXT", GENEROUS("deepl")).permitted).toBe(false);
  });
});

describe("cheapest sufficient: inside the paid class, the cheaper model for the tier goes first", () => {
  const paid = (id: string, priority: number): AiProviderProfile => ({
    id,
    displayName: id,
    costClass: "paid",
    requiresKey: true,
    locality: "cloud",
    capabilities: ["explain_market_demand"],
    structuredOutput: true,
    priority,
  });

  it("orders by the tier model's price, not by hand-set priority", () => {
    // anthropic listed FIRST by priority, but its haiku is dearer than gemini's.
    const profiles = [paid("anthropic", 1), paid("gemini", 2)];
    expect(tierPriceUsd("gemini", "haiku")).toBeLessThan(tierPriceUsd("anthropic", "haiku"));
    expect(orderedCandidatesFor("explain_market_demand", profiles, "haiku").map((p) => p.id)).toEqual(["gemini", "anthropic"]);
  });

  it("an unpriced tier model sorts last; without an alias priority decides", () => {
    const profiles = [paid("gemini", 1), paid("anthropic", 2)];
    // gemini's sonnet model has no reviewed price → after anthropic's priced sonnet.
    expect(tierPriceUsd("gemini", "sonnet")).toBe(Number.POSITIVE_INFINITY);
    expect(orderedCandidatesFor("explain_market_demand", profiles, "sonnet").map((p) => p.id)).toEqual(["anthropic", "gemini"]);
    expect(orderedCandidatesFor("explain_market_demand", profiles).map((p) => p.id)).toEqual(["gemini", "anthropic"]);
  });

  it("free classes are never reordered by a list price nobody pays", () => {
    const ids = orderedCandidatesFor("explain_market_demand", AI_PROVIDER_PROFILES, "haiku").map((p) => p.id);
    expect(ids.slice(0, 4)).toEqual(["local", "cloudflare", "mistral", "groq"]);
  });
});
