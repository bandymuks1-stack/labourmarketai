/**
 * Per-ORGANIZATION daily AI run cap (trial-readiness cost guardrail).
 *
 * The existing AI_DAILY_RUN_BUDGET is GLOBAL: one organization could burn the
 * whole platform's day. This adds a second, narrower ceiling on VENDOR runs
 * only (the real cost amplifier). Journal, projects, teams, calendar, normal
 * chat, deterministic matching and vendorless AI resolutions never touch it.
 *
 * SOURCE OF TRUTH: `usage_cost_events` (event_type='usage'), which is already
 * written once per live vendor run and carries `organization_id`. `ai_runs`
 * has no organization column, so no migration is needed.
 *
 * FAILURE POLICY (owner-reviewable): FAIL-OPEN on an unreadable count, with a
 * greppable warning. The global AI_DAILY_RUN_BUDGET still bounds total spend,
 * and failing closed would turn a ledger hiccup into "AI is down for every
 * organization". Runs with no organization (personal workspace, cron) are not
 * attributable and are governed by the global budget only.
 *
 * Env: AI_ORG_DAILY_RUN_CAP (default 100, clamped 0..100000). 0 means "no
 * vendor AI runs for any organization"; use a large number to relax.
 * Unparsable values fall back to the default.
 */
export const DEFAULT_ORG_DAILY_RUN_CAP = 100;

export function resolveOrgDailyRunCap(
  raw: string | number | undefined = process.env.AI_ORG_DAILY_RUN_CAP,
): number {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return DEFAULT_ORG_DAILY_RUN_CAP;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_ORG_DAILY_RUN_CAP;
  return Math.min(100_000, Math.max(0, Math.floor(n)));
}

export type OrgRunBudgetAssessment = "ok" | "budget_exceeded";

export function assessOrgRunBudget(
  orgRunsToday: number,
  cap: number,
): OrgRunBudgetAssessment {
  return orgRunsToday >= cap ? "budget_exceeded" : "ok";
}

export interface OrgRunCountDb {
  from(table: string): {
    select(
      cols: string,
      opts: { count: "exact"; head: true },
    ): {
      eq(col: string, v: string): {
        eq(col: string, v: string): {
          gte(col: string, v: string): PromiseLike<{
            count: number | null;
            error: { message?: string } | null;
          }>;
        };
      };
    };
  };
}

/** Today's (UTC) vendor-run count for one organization, or null if unreadable. */
export async function countOrgAiRunsTodayBestEffort(
  organizationId: string,
  db?: OrgRunCountDb,
  now: Date = new Date(),
): Promise<number | null> {
  try {
    const client =
      db ??
      ((await (await import("@/lib/usage/usage-cost-store")).usageLedgerReadClient()) as OrgRunCountDb);
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    const { count, error } = await client
      .from("usage_cost_events")
      .select("event_id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("event_type", "usage")
      .gte("occurred_at", start.toISOString());
    if (error) {
      console.warn("[ai/org-cap] org run count unavailable — failing open", {
        message: (error.message ?? "unknown").slice(0, 200),
      });
      return null;
    }
    return count ?? null;
  } catch (err) {
    console.warn("[ai/org-cap] org run count unavailable — failing open", {
      message: (err instanceof Error ? err.message : "unknown").slice(0, 200),
    });
    return null;
  }
}
