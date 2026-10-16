/**
 * What happened to ONE AI run, read from the columns ai_runs already records
 * (schema_validation, blocked_reason, route_reason). Pure: no read, no write.
 *
 * WHY (production 2026-10-15): the monitor counted only `blocked_reason` and
 * failed schemas. That mixed an INTENTIONAL privacy refusal with real faults
 * and hid others entirely:
 *   - the data-egress refusal of a PERSONAL-data task (#2399, by design until
 *     the owner confirms a provider) writes NO blocked_reason — it surfaces as
 *     "vendor call failed: unsupported: … data egress gate …";
 *   - a provider quota (Gemini 429 RESOURCE_EXHAUSTED) and a latency timeout
 *     also write no blocked_reason, so they were never counted at all;
 *   - `cost_unpriced` (a model with no owner-reviewed price) was counted as a
 *     generic "block" beside budget refusals.
 * Each class now has its own name, and the failure rate excludes the
 * intentional privacy refusals (they are a policy outcome, not a fault).
 */
export type AiRunOutcome =
  | "served"
  | "privacy_blocked"
  | "price_missing"
  | "budget_blocked"
  | "quota"
  | "timeout"
  | "provider_unavailable"
  | "invalid_output"
  | "other_failure";

export interface AiRunFacts {
  readonly schema_validation?: unknown;
  readonly blocked_reason?: unknown;
  readonly route_reason?: unknown;
}

/** Outcomes that are a policy decision working as designed, not a fault. */
export const INTENTIONAL_OUTCOMES: ReadonlySet<AiRunOutcome> = new Set(["privacy_blocked"]);

/** Outcomes that mean something is broken or misconfigured. */
export const TECHNICAL_FAILURES: ReadonlySet<AiRunOutcome> = new Set([
  "price_missing",
  "quota",
  "timeout",
  "provider_unavailable",
  "invalid_output",
  "other_failure",
]);

export function classifyAiRun(run: AiRunFacts): AiRunOutcome {
  const validation = typeof run.schema_validation === "string" ? run.schema_validation : "";
  const blocked = typeof run.blocked_reason === "string" ? run.blocked_reason : "";
  const route = typeof run.route_reason === "string" ? run.route_reason : "";

  if (validation === "passed") return "served";
  if (validation === "failed" || validation === "invalid") return "invalid_output";

  if (blocked) {
    if (blocked === "cost_unpriced") return "price_missing";
    if (/budget|ceiling|cap|daily|limit/i.test(blocked)) return "budget_blocked";
    if (/egress|privacy|sensitiv|consent/i.test(blocked)) return "privacy_blocked";
    return "other_failure";
  }

  // What the provider chain recorded: "… vendor call failed: <kind>: <detail>".
  const failure = route.match(/vendor call failed:\s*(.*)$/s)?.[1] ?? "";
  if (!failure) return "other_failure";
  // Every candidate refused by the egress gate = the task's data may not
  // leave to any configured provider. Intentional until a grant exists.
  if (/^unsupported:/i.test(failure) && /data egress gate/i.test(failure)) return "privacy_blocked";
  if (/RESOURCE_EXHAUSTED|\b429\b|rate.?limit|quota/i.test(failure)) return "quota";
  if (/^timeout:|latency ceiling|timed out/i.test(failure)) return "timeout";
  if (/^unavailable:|\b5\d\d\b|network|ECONN|fetch failed/i.test(failure)) return "provider_unavailable";
  return "other_failure";
}

export interface AiOutcomeSummary {
  readonly runs: number;
  readonly byOutcome: Readonly<Record<AiRunOutcome, number>>;
  /** Runs that were attempted for real: all runs minus intentional refusals. */
  readonly attempted: number;
  readonly technicalFailures: number;
  /** technicalFailures / attempted, or null when nothing was attempted. */
  readonly technicalFailureRate: number | null;
}

export function summarizeAiRuns(runs: readonly AiRunFacts[]): AiOutcomeSummary {
  const byOutcome: Record<AiRunOutcome, number> = {
    served: 0,
    privacy_blocked: 0,
    price_missing: 0,
    budget_blocked: 0,
    quota: 0,
    timeout: 0,
    provider_unavailable: 0,
    invalid_output: 0,
    other_failure: 0,
  };
  for (const r of runs) byOutcome[classifyAiRun(r)] += 1;
  let intentional = 0;
  let technicalFailures = 0;
  for (const [k, n] of Object.entries(byOutcome) as [AiRunOutcome, number][]) {
    if (INTENTIONAL_OUTCOMES.has(k)) intentional += n;
    if (TECHNICAL_FAILURES.has(k)) technicalFailures += n;
  }
  const attempted = runs.length - intentional;
  return {
    runs: runs.length,
    byOutcome,
    attempted,
    technicalFailures,
    technicalFailureRate: attempted > 0 ? technicalFailures / attempted : null,
  };
}
