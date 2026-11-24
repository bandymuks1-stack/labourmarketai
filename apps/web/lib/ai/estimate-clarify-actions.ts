"use server";

/**
 * Server action for the Estimate-clarify assist (Step 1/6).
 *
 * INERT by default. It is double-gated: it returns the `disabled` sentinel
 * immediately unless BOTH the master `AI_ASSIST_ENABLED` and the per-use-case
 * `AI_ASSIST_FLAGS.estimate_clarify` are true (they are `false` today). Only
 * then does it route through the {@link getAiProvider} boundary — which today
 * is the no-op provider, so no model is called, no key is read, no network
 * happens. Any future suggestion is validated by the strict
 * `estimate_clarify` schema (questions + assumption notes only — never a
 * number, price, total, rate, or verification).
 *
 * AI never produces the estimate. The deterministic engine owns all figures.
 */
import "server-only";
import { AI_ASSIST_ENABLED, AI_ASSIST_FLAGS } from "@/lib/config/ai";
import { getAiProvider } from "@/lib/ai/provider";
import { parseAiSuggestion } from "@/lib/ai/legacy-assist-schemas";
import type {
  EstimateClarifyInput,
  EstimateClarifyResult,
  AiDisabledResult,
} from "@/lib/ai/types";

const DISABLED: AiDisabledResult = {
  status: "disabled",
  provider: "noop",
  reason: "ai_assist_disabled",
};

export async function requestEstimateClarify(
  input: EstimateClarifyInput,
): Promise<EstimateClarifyResult | AiDisabledResult> {
  // Total gate — both flags off today ⇒ inert, no provider call.
  if (!AI_ASSIST_ENABLED || !AI_ASSIST_FLAGS.estimate_clarify) return DISABLED;

  const result = await getAiProvider().assistEstimateClarify(input);
  if ((result as AiDisabledResult).status === "disabled") return DISABLED;

  // Defence in depth: a future provider's output must pass the strict schema
  // (suggestion-only, no numeric/record-like fields) before it is ever shown.
  const validated = parseAiSuggestion(result);
  if (!validated || validated.kind !== "estimate_clarify") return DISABLED;
  return validated;
}
