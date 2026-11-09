/**
 * Platform-wide MONTHLY euro cap on AI vendor runs (cost guardrail).
 *
 * The daily run budget and the per-organization cap (org-run-cap.ts) count
 * RUNS; neither knows what a run cost. This caps the money itself: once this
 * calendar month's recorded vendor spend reaches the cap, further vendor runs
 * refuse with the same honest `budget_exceeded` outcome the other guards use.
 * Deterministic resolutions engage no vendor and are never capped.
 *
 * SOURCE OF TRUTH: `usage_cost_events` (event_type='usage'), the canonical
 * EUR-cent ledger that every live vendor run already writes once
 * (run-agent-server.ts → usage-cost-store.ts). Same read handle as the org cap
 * (`usageLedgerReadClient`); no second cost store, no migration. A row's spend
 * is its `cost.actualCents`, else its `cost.estimatedCents` (a run with only an
 * estimate still spent something); a row with neither adds nothing.
 *
 * MONTH: the UTC calendar month containing `now` — [1st 00:00Z, next 1st 00:00Z).
 *
 * FAILURE POLICY: FAIL-CLOSED. Unlike the org cap, this is an explicit money
 * ceiling the operator chose to set; an unreadable ledger means the platform
 * cannot prove it is under that ceiling, so the vendor run refuses (honest
 * `budget_exceeded`) instead of spending blind. With the cap unset nothing is
 * read and nothing changes.
 *
 * Env: AI_MONTHLY_COST_CAP_EUR — a non-negative number of euros (e.g. "20" or
 * "7.50"). Unset, empty or unparsable = OFF (no cap, no read). 0 means "no
 * vendor AI runs this month".
 */

/** The cap in euros, or null when OFF (unset / empty / invalid / negative). */
export function resolveMonthlyCostCapEur(
  raw: string | number | undefined = process.env.AI_MONTHLY_COST_CAP_EUR,
): number | null {
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** [start, end) of the UTC calendar month containing `now`, as ISO strings. */
export function utcMonthWindow(now: Date = new Date()): { startIso: string; endIso: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export type MonthlyCostCapAssessment = "ok" | "budget_exceeded";

/**
 * `spendEur === null` means the spend could not be read: with a cap set that
 * is a refusal (fail-closed, see docblock). A null cap is OFF.
 */
export function assessMonthlyCostCap(
  spendEur: number | null,
  capEur: number | null,
): MonthlyCostCapAssessment {
  if (capEur === null) return "ok";
  if (spendEur === null) return "budget_exceeded";
  return spendEur >= capEur ? "budget_exceeded" : "ok";
}

type LedgerPage = PromiseLike<{
  data: Array<{ cost: Record<string, unknown> | null }> | null;
  error: { message?: string } | null;
}>;

export interface MonthSpendDb {
  from(table: string): {
    select(cols: string): {
      eq(col: string, v: string): {
        gte(col: string, v: string): {
          lt(col: string, v: string): {
            order(col: string, opts: { ascending: boolean }): {
              range(from: number, to: number): LedgerPage;
            };
          };
        };
      };
    };
  };
}

const PAGE_ROWS = 1000;
/** Beyond this the month is not summed in-process; the read reports
 *  unavailable, which with a cap set refuses (fail-closed). */
const MAX_PAGES = 50;

function centsOf(cost: Record<string, unknown> | null): number {
  const actual = cost?.["actualCents"];
  if (typeof actual === "number" && Number.isFinite(actual)) return actual;
  const estimated = cost?.["estimatedCents"];
  if (typeof estimated === "number" && Number.isFinite(estimated)) return estimated;
  return 0;
}

/** This UTC month's recorded vendor spend in euros, or null if unreadable. */
export async function readMonthAiSpendEurBestEffort(
  db?: MonthSpendDb,
  now: Date = new Date(),
): Promise<number | null> {
  try {
    const client =
      db ??
      ((await (await import("@/lib/usage/usage-cost-store")).usageLedgerReadClient()) as MonthSpendDb);
    const { startIso, endIso } = utcMonthWindow(now);
    let cents = 0;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const from = page * PAGE_ROWS;
      const { data, error } = await client
        .from("usage_cost_events")
        .select("cost")
        .eq("event_type", "usage")
        .gte("occurred_at", startIso)
        .lt("occurred_at", endIso)
        // PK order keeps the paging stable while new rows land.
        .order("event_id", { ascending: true })
        .range(from, from + PAGE_ROWS - 1);
      if (error) {
        console.warn("[ai/monthly-cap] month spend unavailable — failing closed", {
          message: (error.message ?? "unknown").slice(0, 200),
        });
        return null;
      }
      const rows = data ?? [];
      for (const r of rows) cents += centsOf(r.cost);
      if (rows.length < PAGE_ROWS) return cents / 100;
    }
    console.warn("[ai/monthly-cap] month spend too large to sum — failing closed");
    return null;
  } catch (err) {
    console.warn("[ai/monthly-cap] month spend unavailable — failing closed", {
      message: (err instanceof Error ? err.message : "unknown").slice(0, 200),
    });
    return null;
  }
}
