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

/**
 * The WIRE PROTOCOL a model speaks — deliberately not the vendor's name.
 *
 * This is the field that makes the architecture globally provider-neutral in
 * practice rather than in principle. Most new entrants (Qwen via Alibaba Cloud
 * Model Studio, DeepSeek, Mistral, OpenRouter, vLLM, Ollama, LM Studio) expose
 * an OpenAI-COMPATIBLE endpoint. Mapping transport -> adapter instead of
 * provider -> adapter means every one of those is reachable with an existing
 * adapter and a base URL: a registry entry, not a new adapter and not a new
 * switch case.
 */
export const MODEL_TRANSPORTS = [
  "anthropic",
  "openai-compatible",
  "gemini",
] as const;
export type ModelTransport = (typeof MODEL_TRANSPORTS)[number];

export interface ModelRegistryEntry {
  /** Provider id. Free-form BY DESIGN — a new provider is data, not a type. */
  readonly provider: string;
  /** Wire protocol. Decides which ADAPTER serves it — see {@link ModelTransport}. */
  readonly transport: ModelTransport;
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
  /**
   * True when the model accepts `thinking: { type: "adaptive" }` on the wire
   * (Anthropic 4.6+ generations). False/absent means the parameter must be
   * OMITTED — pre-4.6 models (e.g. Haiku 4.5) reject adaptive thinking with a
   * 400, and omitting the parameter is valid on every model. Fail-safe default
   * is therefore "omit". Anthropic-transport only; other transports ignore it.
   */
  readonly adaptiveThinking?: boolean;
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
  "explain_market_demand",
  "propose_conversation_intent",
];

const ANTHROPIC_SOURCE = "Anthropic public pricing, reviewed by owner 2026-06";

/** Read first-hand from the vendor's own pricing page, not an aggregator —
 *  the distinction #1197 made load-bearing. */
const GEMINI_SOURCE =
  "Google Gemini API pricing, https://ai.google.dev/gemini-api/docs/pricing, standard paid tier, read 2026-08-28 (gemini-3.5-flash-lite $0.30 in / $2.50 out per 1M tokens; earlier 2.5-series figures read 2026-08-24)";

export const MODEL_REGISTRY: readonly ModelRegistryEntry[] = [
  // ── Anthropic — the only prices the owner has reviewed. ───────────────────
  {
    provider: "anthropic",
    transport: "anthropic" as const,
    // Canonical id carries NO date suffix (claude-api skill: "use only the
    // exact model ID strings — never append date suffixes"). The previous
    // `claude-haiku-4-5-20251001` was a non-canonical variant.
    model: "claude-haiku-4-5",
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
    // Pre-4.6 model: adaptive thinking is rejected with a 400 — omit it.
    adaptiveThinking: false,
    effectiveFrom: "2026-06-01",
    pricingSource: ANTHROPIC_SOURCE,
    enabled: true,
  },
  {
    provider: "anthropic",
    transport: "anthropic" as const,
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
    adaptiveThinking: true,
    effectiveFrom: "2026-06-01",
    pricingSource: ANTHROPIC_SOURCE,
    enabled: true,
  },
  {
    provider: "anthropic",
    transport: "anthropic" as const,
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
    adaptiveThinking: true,
    effectiveFrom: "2026-06-01",
    pricingSource: ANTHROPIC_SOURCE,
    enabled: true,
  },
  {
    provider: "anthropic",
    transport: "anthropic" as const,
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
    adaptiveThinking: true,
    effectiveFrom: null,
    pricingSource: null,
    enabled: false,
  },

  // ── OpenAI / Gemini / xAI — adapters work, prices NOT owner-reviewed. ─────
  // Since #1197 an unpriced model is refused rather than run, so these are
  // registered and disabled rather than quietly reachable.
  ...(["gpt-5-nano", "gpt-5-mini", "gpt-5"] as const).map((model, i) => ({
    provider: "openai",
    transport: "openai-compatible" as const,
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
  // ── Gemini — prices VERIFIED 2026-08-24, still NOT enabled. ──────────────
  //
  // The figures below are the STANDARD PAID-TIER prices read first-hand from
  // Google's own pricing page on 2026-08-24, not from an aggregator. They are
  // recorded here so that "we have no verified price" stops being one of the
  // reasons this provider cannot run — that reason was real, and it is now
  // answered with a source and a date.
  //
  // WHY PAID PRICES ON ENTRIES MARKED `freeTier: true`. The ceiling must never
  // UNDER-estimate. A key sitting on the free allowance today can be moved onto
  // billing by an owner action that touches nothing in this repo, and if the
  // registry had recorded €0 for that model the per-run ceiling would have been
  // computed against a price that stopped being true without a single line
  // changing here. Pricing the models at the metered rate means a tier change
  // can never silently spend past a budget. It also means that IF a run is ever
  // served by the free allowance, the cost written to `ai_runs` is the standard
  // rate rather than the €0 actually charged — an over-statement, in the one
  // direction a budget can absorb. Which tier this deployment's key is on is an
  // owner fact this repo cannot observe; see the human gate.
  //
  // gemini-2.5-pro is priced at its LONG-PROMPT tier ($2.50 / $15.00, prompts
  // over 200k tokens) rather than its cheaper short-prompt tier ($1.25 /
  // $10.00). The registry holds one price per model and the ceiling is only
  // sound if that price is the higher of the two.
  //
  // ENABLED: exactly ONE of the three — `gemini-2.5-flash-lite`, the cheapest,
  // which serves the `haiku` alias and therefore the `low_cost` tier.
  //
  // #1265 shipped all three priced and all three `enabled: false`, and said
  // why: pricing is not permission, and the remaining blocker was a
  // DATA-TRANSFER question. That question has since been answered in the ONE
  // direction that needs no grant. `explain_market_demand` is classed `PUBLIC`
  // on the evidence of its own field list, `AI_EGRESS_GRANTS` is still empty,
  // and an ungranted external provider may already receive `PUBLIC` — so the
  // gate opens for exactly one task and stays shut for every other.
  //
  // The other two stay FALSE. `explain_market_demand` prefers `low_cost` and
  // cannot escalate (`escalationConditions: []`), so `flash` and `pro` would
  // be unreachable models carrying a live enablement flag — and the moment a
  // second, more sensitive task wanted them, the enablement would already be
  // in place and would look like it had been reviewed. Enabling a model is
  // cheap to do and expensive to notice.
  ...(
    [
      // RETIRED MODEL REPLACED 2026-08-28, on the vendor's own instruction.
      // `gemini-2.5-flash-lite` was the ONE enabled entry, and the first real
      // production call against it returned:
      //
      //   404 NOT_FOUND: This model models/gemini-2.5-flash-lite is no longer
      //   available to new users. Please update your code to use
      //   models/gemini-3.5-flash-lite for the latest features and
      //   improvements.
      //
      // So the AI path was not blocked by a key, an env var, a code gate or a
      // privacy rule — every one of those was already correct and proven. It
      // was blocked by a model id that Google retired for new API keys. That
      // is worth recording because four earlier rounds of investigation
      // concluded otherwise.
      //
      // Prices are the PAID-tier figures published for gemini-3.5-flash-lite
      // ($0.30 in / $2.50 out per 1M tokens), read from the source below on
      // 2026-08-28 — same rule as the rest of this table: never the free-tier
      // €0, so a key moved onto billing cannot silently spend past a ceiling.
      // The rise from $0.10/$0.40 keeps `explain_market_demand` far inside its
      // $0.02 per-run ceiling (~$0.0035 at the observed payload size).
      { model: "gemini-3.5-flash-lite", input: 0.3, output: 2.5, enabled: true },
      // The other two are UNCHANGED and stay `enabled: false`. They are almost
      // certainly retired the same way, but an id nobody can reach cannot be
      // verified by reaching it — and guessing a replacement plus a price for a
      // disabled model would put two unverified numbers into the one table
      // whose entire job is to hold verified ones. They are corrected when a
      // task actually needs them, which requires an owner enablement anyway.
      { model: "gemini-2.5-flash", input: 0.3, output: 2.5, enabled: false },
      { model: "gemini-2.5-pro", input: 2.5, output: 15, enabled: false },
    ] as const
  ).map((entry, i) => ({
    provider: "gemini",
    transport: "gemini" as const,
    model: entry.model,
    alias: (["haiku", "sonnet", "opus"] as const)[i],
    capabilities: GENERAL_TASKS,
    qualityScore: null,
    inputUsdPerMTok: entry.input,
    outputUsdPerMTok: entry.output,
    freeTier: true,
    contextTokens: null,
    maxOutputTokens: null,
    latencyP50Ms: null,
    // The finding that drove data-sensitivity.ts, carried at model level —
    // and re-confirmed against the same page the prices came from: the free
    // tier's row reads "used to improve our products", the paid tier's reads
    // "not used". The restriction is therefore CURRENT, not historical.
    dataRestrictions: [
      "free tier documents that content may be used to improve vendor products (re-verified 2026-08-24)",
    ],
    effectiveFrom: "2026-08-24",
    pricingSource: GEMINI_SOURCE,
    enabled: entry.enabled,
  })),
  ...(["grok-3-mini", "grok-3", "grok-4"] as const).map((model, i) => ({
    provider: "xai",
    transport: "openai-compatible" as const,
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
    // Model Studio speaks the OpenAI protocol, so no new adapter is needed —
    // only a base URL, once the owner verifies terms and pricing.
    transport: "openai-compatible" as const,
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

/**
 * May `thinking: { type: "adaptive" }` be sent for this model?
 *
 * FAIL-SAFE: an unknown model (e.g. a config override the registry has never
 * seen) gets `false`, because omitting the parameter is valid on every
 * Anthropic model while sending it to a pre-4.6 model is a 400.
 */
export function supportsAdaptiveThinking(model: string): boolean {
  return registryEntryForModel(model)?.adaptiveThinking === true;
}

/**
 * Wire protocol for a provider, or null when the provider is unknown here.
 *
 * `local` is deliberately ABSENT from the registry: it hosts whatever model the
 * operator pulled, so it has no fixed model id to register. Callers handle it
 * explicitly rather than the registry inventing an entry for it.
 */
export function transportForProvider(provider: string): ModelTransport | null {
  return MODEL_REGISTRY.find((e) => e.provider === provider)?.transport ?? null;
}
