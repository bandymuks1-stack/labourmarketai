import {
  classifyCompletionFailure,
  type ChainFailureClass,
} from "@/lib/ai/runtime/provider-chain";

/**
 * What happened to ONE AI run, read from the columns `ai_runs` already records
 * (provider, schema_validation, blocked_reason, route_reason). Pure: no read,
 * no write, no new vocabulary of its own for a vendor failure.
 *
 * WHY: the `ai-failing` monitor counted (failed schema + ANY blocked_reason)
 * over all runs. That mixed policy outcomes working as designed with faults,
 * and missed faults that carry no blocked_reason at all:
 *   - `egress_refused` (#2433) — the data egress gate refused every provider
 *     for a personal-data task. Intentional until the owner grants a provider.
 *   - `needs_human_confirmation` — an honest inert seam, not a fault.
 *   - a vendor quota (HTTP 429), a timeout or a 5xx writes NO blocked_reason;
 *     it lands only in route_reason as "… — vendor call failed: <code>: <detail>"
 *     (`buildRoutingAuditRecord` in lib/ai/runtime/task-routing.ts), so the old
 *     rule never counted it.
 *   - `cost_unpriced` (a model with no owner-reviewed price: misconfiguration)
 *     was counted beside `cost_ceiling` (a budget doing its job).
 * The vendor-failure classes are the provider chain's own
 * (`classifyCompletionFailure`, lib/ai/runtime/provider-chain.ts), applied to
 * the code and detail the audit row recorded.
 *
 * provider = 'disabled' is its own outcome, `vendorless`: no provider was set
 * up to answer. It is neither attempted nor a failure HERE — the separate
 * `ai-runtime-disabled` signal (#2691) alerts on it.
 */
export type AiRunOutcome =
  | "served"
  /** blocked_reason = 'egress_refused': personal data may not leave (#2433). */
  | "privacy_refused"
  /** blocked_reason = 'needs_human_confirmation'. */
  | "confirmation_required"
  /** blocked_reason = 'cost_ceiling', or the daily / organization run budget. */
  | "budget_blocked"
  /** provider = 'disabled' — alerted by `ai-runtime-disabled`, not here. */
  | "vendorless"
  /** blocked_reason = 'cost_unpriced': the model has no reviewed price. */
  | "price_missing"
  | "configuration"
  | "unavailable"
  | "timeout"
  | "rate_limit"
  | "provider_error"
  | "invalid_output"
  | "truncated"
  | "unsupported_capability"
  /** A block reason or a skipped run this module does not recognise. Counted
   *  as a failure so an unknown shape is seen, never hidden as healthy. */
  | "unclassified";

export const AI_RUN_OUTCOMES: readonly AiRunOutcome[] = [
  "served",
  "privacy_refused",
  "confirmation_required",
  "budget_blocked",
  "vendorless",
  "price_missing",
  "configuration",
  "unavailable",
  "timeout",
  "rate_limit",
  "provider_error",
  "invalid_output",
  "truncated",
  "unsupported_capability",
  "unclassified",
];

/** Policy outcomes working as designed — not attempted, not a fault. */
export const INTENTIONAL_OUTCOMES: ReadonlySet<AiRunOutcome> = new Set([
  "privacy_refused",
  "confirmation_required",
  "budget_blocked",
]);

/** Something is broken or misconfigured. */
export const TECHNICAL_FAILURES: ReadonlySet<AiRunOutcome> = new Set([
  "price_missing",
  "configuration",
  "unavailable",
  "timeout",
  "rate_limit",
  "provider_error",
  "invalid_output",
  "truncated",
  "unsupported_capability",
  "unclassified",
]);

export interface AiRunFacts {
  readonly provider?: unknown;
  readonly schema_validation?: unknown;
  readonly blocked_reason?: unknown;
  readonly route_reason?: unknown;
}

const BLOCKED: Readonly<Record<string, AiRunOutcome>> = {
  egress_refused: "privacy_refused",
  needs_human_confirmation: "confirmation_required",
  cost_ceiling: "budget_blocked",
  cost_unpriced: "price_missing",
};

const CHAIN: Readonly<Record<ChainFailureClass, AiRunOutcome>> = {
  CONFIGURATION: "configuration",
  UNAVAILABLE: "unavailable",
  TIMEOUT: "timeout",
  RATE_LIMIT: "rate_limit",
  PROVIDER_ERROR: "provider_error",
  INVALID_OUTPUT: "invalid_output",
  TRUNCATED: "truncated",
  // The chain names a sensitivity veto, but a refusal is recorded as
  // blocked_reason = 'egress_refused' and is read above, never from text.
  PRIVACY_BLOCK: "privacy_refused",
  UNSUPPORTED_CAPABILITY: "unsupported_capability",
};

const MARKER = " vendor call failed: ";

const str = (v: unknown): string => (typeof v === "string" ? v : "");

export function classifyAiRun(run: AiRunFacts): AiRunOutcome {
  if (str(run.provider) === "disabled") return "vendorless";
  const validation = str(run.schema_validation);
  if (validation === "passed") return "served";

  const blocked = str(run.blocked_reason);
  if (blocked) return BLOCKED[blocked] ?? "unclassified";
  if (validation === "failed") return "invalid_output";

  const route = str(run.route_reason);
  const at = route.indexOf(MARKER);
  if (at >= 0) {
    const failure = route.slice(at + MARKER.length);
    if (failure.startsWith("provider disabled:")) {
      return CHAIN[classifyCompletionFailure({ status: "disabled" }) ?? "CONFIGURATION"];
    }
    const sep = failure.indexOf(": ");
    const code = sep > 0 ? failure.slice(0, sep) : failure;
    const message = sep > 0 ? failure.slice(sep + 2) : "";
    return CHAIN[classifyCompletionFailure({ status: "error", code, message }) ?? "PROVIDER_ERROR"];
  }
  // Skipped before any dispatch with no block reason and no vendor failure:
  // the daily or per-organization run budget (`run-agent.ts`), recorded with
  // provider 'none'.
  if (validation === "skipped" && str(run.provider) === "none") return "budget_blocked";
  return "unclassified";
}

export interface AiOutcomeSummary {
  readonly runs: number;
  readonly byOutcome: Readonly<Record<AiRunOutcome, number>>;
  /** Runs that should have reached a provider: all minus intentional and vendorless. */
  readonly attempted: number;
  readonly technicalFailures: number;
  /** technicalFailures / attempted, or null when nothing was attempted (never a fake 0 %). */
  readonly technicalFailureRate: number | null;
}

export function summarizeAiRuns(runs: readonly AiRunFacts[]): AiOutcomeSummary {
  const byOutcome = Object.fromEntries(AI_RUN_OUTCOMES.map((o) => [o, 0])) as Record<AiRunOutcome, number>;
  for (const r of runs) byOutcome[classifyAiRun(r)] += 1;
  let notAttempted = byOutcome.vendorless;
  let technicalFailures = 0;
  for (const o of AI_RUN_OUTCOMES) {
    if (INTENTIONAL_OUTCOMES.has(o)) notAttempted += byOutcome[o];
    if (TECHNICAL_FAILURES.has(o)) technicalFailures += byOutcome[o];
  }
  const attempted = runs.length - notAttempted;
  return {
    runs: runs.length,
    byOutcome,
    attempted,
    technicalFailures,
    technicalFailureRate: attempted > 0 ? technicalFailures / attempted : null,
  };
}
