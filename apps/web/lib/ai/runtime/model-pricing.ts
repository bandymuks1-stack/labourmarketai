/**
 * Model pricing — REAL cost computation from token usage (AI Router v1).
 *
 * USD per 1 MILLION tokens, keyed by tier ALIAS and by the concrete model ids
 * in AI_MODEL_CANDIDATES.anthropic. Cost is computed ONLY when the provider
 * returned real token usage; unknown model / missing usage → null (honest,
 * never fabricated). Mock runs are never priced (run-agent skips them).
 *
 * ⚠️ OWNER REVIEWS PRICES. Prices now live in `./model-registry.ts`, which
 * requires a `pricingSource` and an `effectiveFrom` date beside every figure —
 * since #1197 a price authorises real spend, so an unsourced number must not be
 * able to become an enforcement input. Non-anthropic providers are registered
 * but carry no reviewed price, so they are ABSENT from the derived table and
 * their runs are refused as `cost_unpriced` rather than mispriced. DeepL bills
 * per character and is never token-priced.
 *
 * Pure. No IO, no env, no fetch.
 */

import { MODEL_REGISTRY, isSelectable } from "./model-registry";

export interface ModelPricingUsdPerMTok {
  readonly inputUsdPerMTok: number;
  readonly outputUsdPerMTok: number;
}

/** Alias + concrete-id pricing table (single exported const — owner-reviewed). */
/**
 * DERIVED SINCE 2026-08-19 from `./model-registry.ts` — the single place a
 * (provider, model) fact is written. Keys are the concrete model ids plus the
 * tier ALIASES, the latter kept because Anthropic is the default provider and
 * callers still price by alias when no provider is known.
 *
 * A model without an owner-reviewed price is simply ABSENT here, which is what
 * makes `cost_unpriced` fire in the router rather than a wrong number being
 * enforced.
 */
export const MODEL_PRICING_USD_PER_MTOK: Readonly<
  Record<string, ModelPricingUsdPerMTok>
> = Object.freeze(
  MODEL_REGISTRY.reduce<Record<string, ModelPricingUsdPerMTok>>((acc, e) => {
    // The FULL selectability predicate, not merely "has two numbers". Filtering
    // on the numbers alone left a hole: half-finishing a registry entry during
    // staged enablement — prices typed in, `enabled` still false or
    // `pricingSource` still empty — would publish the price here, and a
    // published price is what stops `cost_unpriced` from firing. An incomplete
    // edit could therefore authorise paid API use through the env gates.
    // Selectability is one predicate so it cannot be half-applied.
    if (!isSelectable(e)) return acc;
    if (e.inputUsdPerMTok === null || e.outputUsdPerMTok === null) return acc;
    const price: ModelPricingUsdPerMTok = {
      inputUsdPerMTok: e.inputUsdPerMTok,
      outputUsdPerMTok: e.outputUsdPerMTok,
    };
    acc[e.model] = price;
    // Alias keys resolve to the DEFAULT provider's model, matching
    // `modelIdForAlias`'s own default. Never overwritten by another provider.
    if (e.alias && e.provider === "anthropic") acc[e.alias] = price;
    return acc;
  }, {}),
);

export function pricingForModel(
  modelIdOrAlias: string,
): ModelPricingUsdPerMTok | null {
  return MODEL_PRICING_USD_PER_MTOK[modelIdOrAlias] ?? null;
}

/**
 * Actual run cost in USD from REAL token usage. Returns null when the model is
 * not in the reviewed pricing table or usage is unknown — never a fabricated
 * figure. Rounded to 6 decimals (micro-dollar precision).
 */
export function computeActualCostUsd(
  modelIdOrAlias: string,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined,
): number | null {
  if (
    inputTokens === null ||
    inputTokens === undefined ||
    outputTokens === null ||
    outputTokens === undefined ||
    !Number.isFinite(inputTokens) ||
    !Number.isFinite(outputTokens) ||
    inputTokens < 0 ||
    outputTokens < 0
  ) {
    return null;
  }
  const pricing = pricingForModel(modelIdOrAlias);
  if (!pricing) return null;
  const cost =
    (inputTokens * pricing.inputUsdPerMTok +
      outputTokens * pricing.outputUsdPerMTok) /
    1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

// ── Pre-run estimation (AI Router: cost ceilings must be enforceable) ────────

/**
 * Conservative token estimate from text.
 *
 * WHY A HEURISTIC IS THE HONEST CHOICE HERE. A real tokenizer is
 * provider-specific: importing one would put a vendor's tokenizer in the
 * routing layer and re-couple the architecture to a provider, which is exactly
 * what the owner's multi-provider requirement forbids. A ceiling only needs to
 * know the ORDER OF MAGNITUDE of a run before it happens, and it must never
 * UNDER-estimate — an under-estimate lets a run through the budget it should
 * have been blocked by.
 *
 * So: 4 characters per token, rounded UP, with a floor of 1 for non-empty
 * text. Across the Latin and Cyrillic scripts this product ships, real
 * tokenizers land at or below that ratio, so the estimate errs high — the safe
 * direction for a budget.
 *
 * This is an ESTIMATE and is only ever compared against a ceiling. Billing and
 * the `ai_runs` audit row use {@link computeActualCostUsd} on REAL usage
 * reported by the provider; the two are never mixed.
 *
 * HONEST LIMIT: this is a conservative estimate, not a proof. Without a
 * vendor tokenizer no pure function can guarantee an upper bound for every
 * string, so a pathological input could still tokenise above it. The residual
 * risk is bounded on the other side: `ai_runs` records the REAL cost of every
 * run, so an estimate that proved too low is visible after the fact rather
 * than invisible.
 */
export function estimateTokensFromText(text: string): number {
  if (typeof text !== "string" || text.length === 0) return 0;
  // Two views of the same string, and we take the LARGER token count:
  //   chars/4  — the familiar ratio, right for ASCII-heavy Latin text;
  //   bytes/3  — the safety net for token-dense input. UTF-8 spends 2 bytes on
  //              Cyrillic/Greek, 3 on CJK and 4 on emoji, all of which tokenise
  //              far denser than 4 chars per token. Judged on characters alone
  //              an emoji-heavy or Cyrillic string UNDER-counts, and an
  //              under-count is the one error a budget cannot absorb: it lets a
  //              run through the ceiling that should have stopped it.
  const utf8Bytes = new TextEncoder().encode(text).length;
  return Math.max(1, Math.ceil(Math.max(text.length / 4, utf8Bytes / 3)));
}

/**
 * Pre-run cost estimate in USD for a model and an expected token shape.
 *
 * Returns `null` when the model carries no OWNER-REVIEWED price — the same
 * honesty rule as {@link computeActualCostUsd}: an unpriced model yields no
 * number rather than a guessed one. The routing layer treats `null` as "this
 * ceiling cannot be evaluated" and blocks, because a budget that cannot be
 * checked is not a budget.
 */
export function estimateCostUsd(
  modelIdOrAlias: string,
  expectedInputTokens: number,
  expectedOutputTokens: number,
): number | null {
  return computeActualCostUsd(
    modelIdOrAlias,
    expectedInputTokens,
    expectedOutputTokens,
  );
}
