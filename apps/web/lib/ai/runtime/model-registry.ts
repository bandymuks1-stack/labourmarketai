/**
 * MODEL REGISTRY — the one place a (provider, model) fact may be written.
 *
 * ── WHY THIS EXISTS (owner requirement 2026-08-19, global provider-neutrality)
 *
 * The runtime already routes well: `provider-chain.ts` orders candidates by
 * cost class (free_local → free_tier → paid), `data-sensitivity.ts` holds a
 * privacy veto that runs BEFORE cost, and `task-routing.ts` escalates one tier
 * only when a cheaper attempt failed a listed condition. That is the owner's
 * policy — local/free first, but never at the price of privacy or quality.
 *
 * What the runtime could NOT express was knowledge ABOUT a model. Model
 * identity was scattered across structures that did not know about each other:
 *
 *   - `AiProviderKind` and `AiChainProviderId` — two separate CLOSED unions of
 *     the same five providers;
 *   - `AI_MODEL_CANDIDATES` — model ids only, four providers, no other facts;
 *   - `MODEL_PRICING_USD_PER_MTOK` — prices, Anthropic only, no source, no date.
 *
 * Adding a sixth provider therefore meant editing two type unions and two
 * literals by hand, and there was nowhere at all to record capabilities per
 * model, context limits, measured quality, measured latency, free-tier status,
 * where a price came from, or when it took effect. Choosing "the cheapest
 * sufficient model" is not expressible when sufficiency is not written down.
 *
 * This module is that missing layer, and ONLY that layer.
 *
 * ── WHAT THIS IS NOT ───────────────────────────────────────────────────────
 *
 * It is NOT a second provider registry. Provider-level facts — cost class,
 * locality, key requirement, dispatch priority, structured-output support —
 * stay in `AI_PROVIDER_PROFILES` (provider-chain.ts), which owns them. This
 * holds MODEL-level facts, which existed nowhere. Duplicating the provider
 * table here would create exactly the parallel structure the platform doctrine
 * forbids, and the two copies would drift.
 *
 * `AI_MODEL_CANDIDATES` and `MODEL_PRICING_USD_PER_MTOK` are now DERIVED from
 * this registry rather than maintained beside it, so a model id or a price has
 * one home. Adding a provider is a data entry here — no type edit.
 *
 * ── THE RULE THAT MAKES A PRICE SAFE TO ENFORCE ────────────────────────────
 *
 * Since #1197 the router blocks a run whose ceiling it cannot evaluate. That
 * makes prices load-bearing: a wrong number now silently authorises or refuses
 * real spend. So `enabled: true` REQUIRES both prices, a `pricingSource` and an
 * `effectiveFrom` date — guard-enforced. An unverified price cannot become an
 * enforcement input by being typed into a table. This is the same rule the
 * repo already applies to public claims: a number is only as good as the
 * source recorded next to it.
 *
 * Pure constants + pure derivations. No IO, no env, no fetch. Nothing here
 * activates a provider; activation stays with the adapters' env gates.
 */
import type { AiTaskType } from "./task-routing";

/** Bumped when the SHAPE changes, so a stored decision can be re-read. */
export const MODEL_REGISTRY_VERSION = 1;

/** Tier aliases the routing layer selects by. */
export const MODEL_ALIASES = ["haiku", "sonnet", "opus", "fable"] as const;
export type ModelAlias = (typeof MODEL_ALIASES)[number];

export interface ModelRegistryEntry {
  /** Provider id. Free-form BY DESIGN — a new provider is data, not a type. */
  readonly provider: string;
  /** The concrete model id sent on the wire. */
  readonly model: string;
  /** Tier alias this model serves for its provider, or null if unbound. */
  readonly alias: ModelAlias | null;
  /** Task types this model is considered sufficient for. Empty = unassessed. */
  readonly capabilities: readonly AiTaskType[];
  /** Measured quality 0..1 from our OWN evals. null until measured — never a
   *  vendor's self-reported benchmark, and never a guess. */
  readonly qualityScore: number | null;
  readonly inputUsdPerMTok: number | null;
  readonly outputUsdPerMTok: number | null;
  /** A no-charge allowance exists. Note this is a COST fact, not permission:
   *  `data-sensitivity.ts` still decides whether a free tier may see a payload. */
  readonly freeTier: boolean;
  readonly contextTokens: number | null;
  readonly maxOutputTokens: number | null;
  /** Measured p50 from real `ai_runs`. null until measured. */
  readonly latencyP50Ms: number | null;
  /** Data-handling constraints worth carrying at model level (jurisdiction,
   *  training-on-input terms). Free text, reviewed by the owner. */
  readonly dataRestrictions: readonly string[];
  /** ISO date the pricing took effect. */
  readonly effectiveFrom: string | null;
  /** Where the price came from. null = UNVERIFIED; cannot be enabled. */
  readonly pricingSource: string | null;
  /** May the router select this model at all. */
  readonly enabled: boolean;
}

/** Every task type, for models assessed as generally sufficient. */
const GENERAL_TASKS: readonly AiTaskType[] = [
  "structure_future_work",
  "derive_workforce_requirements",
  "normalize_work_scope",
  "normalize_external_profile",
  "extract_cv",
  "explain_match",
  "translate_message",
  "draft_follow_up",
];

const ANTHROPIC_SOURCE = "Anthropic public pricing, reviewed by owner 2026-06";

export const MODEL_REGISTRY: readonly ModelRegistryEntry[] = [
  // ── Anthropic — the only prices the owner has reviewed. ───────────────────
  {
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    alias: "haiku",
    capabilities: GENERAL_TASKS,
    qualityScore: null,
    inputUsdPerMTok: 1,
    outputUsdPerMTok: 5,
    freeTier: false,
    contextTokens: 200_000,
    maxOutputTokens: 64_000,
    latencyP50Ms: null,
    dataRestrictions: [],
    effectiveFrom: "2026-06-01",
    pricingSource: ANTHROPIC_SOURCE,
    enabled: true,
  },
  {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    alias: "sonnet",
    capabilities: GENERAL_TASKS,
    qualityScore: null,
    inputUsdPerMTok: 3,
    outputUsdPerMTok: 15,
    freeTier: false,
    contextTokens: 200_000,
    maxOutputTokens: 64_000,
    latencyP50Ms: null,
    dataRestrictions: [],
    effectiveFrom: "2026-06-01",
    pricingSource: ANTHROPIC_SOURCE,
    enabled: true,
  },
  {
    provider: "anthropic",
    model: "claude-opus-4-8",
    alias: "opus",
    capabilities: GENERAL_TASKS,
    qualityScore: null,
    inputUsdPerMTok: 5,
    outputUsdPerMTok: 25,
    freeTier: false,
    contextTokens: 200_000,
    maxOutputTokens: 64_000,
    latencyP50Ms: null,
    dataRestrictions: [],
    effectiveFrom: "2026-06-01",
    pricingSource: ANTHROPIC_SOURCE,
    enabled: true,
  },
  {
    provider: "anthropic",
    model: "claude-fable-5",
    alias: "fable",
    capabilities: [],
    qualityScore: null,
    inputUsdPerMTok: null,
    outputUsdPerMTok: null,
    freeTier: false,
    contextTokens: null,
    maxOutputTokens: null,
    latencyP50Ms: null,
    dataRestrictions: [],
    effectiveFrom: null,
    pricingSource: null,
    enabled: false,
  },

  // ── OpenAI / Gemini / xAI — adapters work, prices NOT owner-reviewed. ─────
  // Since #1197 an unpriced model is refused rather than run, so these are
  // registered and disabled rather than quietly reachable.
  ...(["gpt-5-nano", "gpt-5-mini", "gpt-5"] as const).map((model, i) => ({
    provider: "openai",
    model,
    alias: (["haiku", "sonnet", "opus"] as const)[i],
    capabilities: GENERAL_TASKS,
    qualityScore: null,
    inputUsdPerMTok: null,
    outputUsdPerMTok: null,
    freeTier: false,
    contextTokens: null,
    maxOutputTokens: null,
    latencyP50Ms: null,
    dataRestrictions: [],
    effectiveFrom: null,
    pricingSource: null,
    enabled: false,
  })),
  ...(["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.5-pro"] as const).map(
    (model, i) => ({
      provider: "gemini",
      model,
      alias: (["haiku", "sonnet", "opus"] as const)[i],
      capabilities: GENERAL_TASKS,
      qualityScore: null,
      inputUsdPerMTok: null,
      outputUsdPerMTok: null,
      freeTier: true,
      contextTokens: null,
      maxOutputTokens: null,
      latencyP50Ms: null,
      // The finding that drove data-sensitivity.ts, carried at model level.
      dataRestrictions: [
        "free tier documents that content may be used to improve vendor products",
      ],
      effectiveFrom: null,
      pricingSource: null,
      enabled: false,
    }),
  ),
  ...(["grok-3-mini", "grok-3", "grok-4"] as const).map((model, i) => ({
    provider: "xai",
    model,
    alias: (["haiku", "sonnet", "opus"] as const)[i],
    capabilities: GENERAL_TASKS,
    qualityScore: null,
    inputUsdPerMTok: null,
    outputUsdPerMTok: null,
    freeTier: false,
    contextTokens: null,
    maxOutputTokens: null,
    latencyP50Ms: null,
    dataRestrictions: [],
    effectiveFrom: null,
    pricingSource: null,
    enabled: false,
  })),

  // ── Qwen (Alibaba Cloud Model Studio) — REGISTERED, NOT ENABLED. ─────────
  //
  // Owner requirement: Qwen is to be evaluated as a real candidate, not
  // documented for later. Registering it here is what makes it a candidate —
  // it now occupies the same structure as every other model and needs no type
  // change to become selectable.
  //
  // It is NOT enabled, and deliberately so. The primary source
  // (www.alibabacloud.com) is blocked by this environment's egress proxy, so
  // published per-MTok prices could not be verified first-hand. Third-party
  // aggregators quote roughly $0.03/$0.13 (Flash tier) up to $2.00/$6.00
  // (Qwen3.8 Max), but an aggregator is not a pricing source: since #1197 a
  // price authorises real spend, and the repo's rule is that a number is only
  // as good as the source recorded beside it. So prices stay null, the entries
  // stay disabled, and no figure was invented.
  //
  // Transport note: Model Studio exposes an OpenAI-COMPATIBLE API, so enabling
  // Qwen likely needs a base-URL binding on the existing adapter rather than a
  // new one. That is a separate slice and is not assumed here.
  ...(["qwen-flash", "qwen-plus", "qwen-max"] as const).map((model, i) => ({
    provider: "qwen",
    model,
    alias: (["haiku", "sonnet", "opus"] as const)[i],
    // Unassessed against our own evals — capabilities stay empty rather than
    // inheriting an assumption from another vendor's model.
    capabilities: [] as readonly AiTaskType[],
    qualityScore: null,
    inputUsdPerMTok: null,
    outputUsdPerMTok: null,
    freeTier: false,
    contextTokens: null,
    maxOutputTokens: null,
    latencyP50Ms: null,
    dataRestrictions: [
      "OWNER REVIEW REQUIRED: jurisdiction and data-processing terms unverified",
    ],
    effectiveFrom: null,
    pricingSource: null,
    enabled: false,
  })),
];

/** Providers present in the registry. Derived — never a hand-kept union. */
export function registryProviders(): readonly string[] {
  return [...new Set(MODEL_REGISTRY.map((e) => e.provider))].sort();
}

/** Entries for one provider, alias-keyed. */
export function modelsForProvider(
  provider: string,
): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const e of MODEL_REGISTRY) {
    if (e.provider === provider && e.alias) out[e.alias] = e.model;
  }
  return out;
}

/** A model may be selected only when it is enabled AND fully sourced. */
export function isSelectable(e: ModelRegistryEntry): boolean {
  return (
    e.enabled &&
    e.inputUsdPerMTok !== null &&
    e.outputUsdPerMTok !== null &&
    e.pricingSource !== null &&
    e.effectiveFrom !== null
  );
}

/** Registry lookup by concrete model id. */
export function registryEntryForModel(
  model: string,
): ModelRegistryEntry | null {
  return MODEL_REGISTRY.find((e) => e.model === model) ?? null;
}
