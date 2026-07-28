import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isAiProvider, isAiService } from "@/lib/telemetry/provider-registry";
import { measured, unmeasured, type MetricValue } from "@/lib/commercial/business-health";

/**
 * BUSINESS HEALTH — READ MODEL over `usage_cost_events`.
 *
 * The first metrics in the Business Health Engine that can actually be
 * computed from real rows instead of reporting a missing collector.
 *
 * Rules this file obeys, all of them load-bearing:
 *   - READ ONLY. No insert, no update, no delete, no rollup table. Aggregates
 *     are computed at read time from the append-only ledger, exactly as the
 *     event model requires.
 *   - It reads with the CALLER'S session, so the admin-only RLS policy on
 *     `usage_cost_events` is what authorises it — never the service role.
 *   - An empty or unreadable ledger yields `measured: false` WITH A REASON,
 *     never a zero. A zero cost and an unmeasured cost are different facts,
 *     and the whole engine is built on not confusing them.
 *   - `unknownCostEvents` is reported as its own number: it is the honesty
 *     metric. A large estimated total means nothing if half the events carry
 *     no cost at all.
 */

const RELATION_ABSENT = "42P01";

interface CostJson {
  currency?: string | null;
  estimatedCents?: number | null;
  actualCents?: number | null;
  pricingVersion?: string | null;
  supplier?: string | null;
  billingSource?: string | null;
}

interface EventRow {
  provider: string;
  service: string;
  cost: CostJson | null;
}

export interface AiCostReadModel {
  /** Events considered (AI provider or AI service) in the window. */
  readonly aiEventCount: MetricValue;
  /** Sum of estimated cost, EUR cents, across AI events that state one. */
  readonly aiEstimatedCents: MetricValue;
  /** Sum of reconciled cost, EUR cents, across AI events that state one. */
  readonly aiActualCents: MetricValue;
  /** AI events carrying NO cost at all — the blind spot, named. */
  readonly unknownCostEvents: MetricValue;
  /**
   * actual ÷ estimated. Tells whether our price list matches the invoices.
   * Unmeasured until BOTH sides have a non-zero basis — a ratio against zero
   * is not a number, it is a division by nothing.
   */
  readonly estimatedToActualRatio: MetricValue;
  /** Every event in the window, AI or not — the denominator for coverage. */
  readonly totalEventCount: MetricValue;
}

const LEDGER_ABSENT = () =>
  unmeasured(
    "no_collector",
    "usage_cost_events is not applied in this environment — the ledger does not exist yet.",
  );

const NOT_READABLE = () =>
  unmeasured(
    "not_applicable",
    "The ledger is not readable for this caller (admin-only RLS). No number is shown rather than a partial one.",
  );

const NO_ROWS = (what: string) =>
  unmeasured("no_data_yet", `No ${what} in the window — the activity has not happened yet.`);

/**
 * AI cost read model over a time window.
 * `sinceIso` defaults to the last 30 days; `asOf` stamps the returned values.
 */
export async function getAiCostReadModel(options?: {
  readonly sinceIso?: string;
  readonly untilIso?: string;
  readonly asOf?: string;
}): Promise<AiCostReadModel> {
  const asOf = options?.asOf ?? new Date().toISOString();
  const since =
    options?.sinceIso ?? new Date(Date.parse(asOf) - 30 * 24 * 60 * 60 * 1000).toISOString();

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("usage_cost_events")
    .select("provider, service, cost")
    .gte("occurred_at", since);
  if (options?.untilIso) query = query.lte("occurred_at", options.untilIso);

  const { data, error } = await query;

  if (error) {
    const absent = error.code === RELATION_ABSENT;
    const fail = absent ? LEDGER_ABSENT() : NOT_READABLE();
    return {
      aiEventCount: fail,
      aiEstimatedCents: fail,
      aiActualCents: fail,
      unknownCostEvents: fail,
      estimatedToActualRatio: fail,
      totalEventCount: fail,
    };
  }

  const rows = (data ?? []) as EventRow[];
  const total = rows.length;
  const aiRows = rows.filter(
    (r) => isAiProvider(r.provider) || isAiService(r.service),
  );

  if (total === 0) {
    const none = NO_ROWS("events");
    return {
      aiEventCount: measured(0, "count", asOf),
      aiEstimatedCents: none,
      aiActualCents: none,
      unknownCostEvents: measured(0, "count", asOf),
      estimatedToActualRatio: none,
      totalEventCount: measured(0, "count", asOf),
    };
  }

  let estimated = 0;
  let estimatedBasis = 0;
  let actual = 0;
  let actualBasis = 0;
  let unknown = 0;

  for (const r of aiRows) {
    const c = r.cost ?? {};
    const e = typeof c.estimatedCents === "number" ? c.estimatedCents : null;
    const a = typeof c.actualCents === "number" ? c.actualCents : null;
    if (e === null && a === null) {
      unknown += 1;
      continue;
    }
    if (e !== null) {
      estimated += e;
      estimatedBasis += 1;
    }
    if (a !== null) {
      actual += a;
      actualBasis += 1;
    }
  }

  return {
    totalEventCount: measured(total, "count", asOf),
    aiEventCount: measured(aiRows.length, "count", asOf),
    unknownCostEvents: measured(unknown, "count", asOf),
    aiEstimatedCents:
      estimatedBasis > 0
        ? measured(estimated, "eur_cents", asOf)
        : NO_ROWS("AI event with an estimated cost"),
    aiActualCents:
      actualBasis > 0
        ? measured(actual, "eur_cents", asOf)
        : NO_ROWS("AI event with a reconciled cost"),
    // A ratio needs both sides. Against a zero estimate it is not a large
    // number, it is an undefined one.
    estimatedToActualRatio:
      estimatedBasis > 0 && actualBasis > 0 && estimated > 0
        ? measured(actual / estimated, "ratio", asOf)
        : NO_ROWS("window with both an estimated and a reconciled cost"),
  };
}
