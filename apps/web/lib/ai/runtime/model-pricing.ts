/**
 * Model pricing — REAL cost computation from token usage (AI Router v1).
 *
 * USD per 1 MILLION tokens, keyed by tier ALIAS and by the concrete model ids
 * in AI_MODEL_CANDIDATES.anthropic. Cost is computed ONLY when the provider
 * returned real token usage; unknown model / missing usage → null (honest,
 * never fabricated). Mock runs are never priced (run-agent skips them).
 *
 * ⚠️ OWNER REVIEWS PRICES: values below mirror Anthropic's public per-MTok
 * pricing as of 2026-06 (Opus 4.8 $5/$25, Sonnet 4.6 $3/$15, Haiku 4.5 $1/$5).
 * Non-anthropic providers (openai/gemini/xai/deepl) are deliberately ABSENT —
 * their runs report actual_cost_usd = null until the owner adds reviewed
 * prices here. DeepL bills per character and is never token-priced.
 *
 * Pure. No IO, no env, no fetch.
 */

export interface ModelPricingUsdPerMTok {
  readonly inputUsdPerMTok: number;
  readonly outputUsdPerMTok: number;
}

const HAIKU: ModelPricingUsdPerMTok = { inputUsdPerMTok: 1, outputUsdPerMTok: 5 };
const SONNET: ModelPricingUsdPerMTok = { inputUsdPerMTok: 3, outputUsdPerMTok: 15 };
const OPUS: ModelPricingUsdPerMTok = { inputUsdPerMTok: 5, outputUsdPerMTok: 25 };

/** Alias + concrete-id pricing table (single exported const — owner-reviewed). */
export const MODEL_PRICING_USD_PER_MTOK: Readonly<
  Record<string, ModelPricingUsdPerMTok>
> = {
  // Tier aliases (task-routing vocabulary).
  haiku: HAIKU,
  sonnet: SONNET,
  opus: OPUS,
  // Concrete Anthropic ids — must mirror AI_MODEL_CANDIDATES.anthropic.
  "claude-haiku-4-5-20251001": HAIKU,
  "claude-haiku-4-5": HAIKU,
  "claude-sonnet-4-6": SONNET,
  "claude-opus-4-8": OPUS,
};

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
 */
export function estimateTokensFromText(text: string): number {
  if (typeof text !== "string" || text.length === 0) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
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
