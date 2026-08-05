import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * AI cost & usage summary for the owner (W14 Pilot Analytics slice v1).
 *
 * Reads the two first-party AI accounting tables through the CALLER's
 * already-superadmin-gated Supabase client — NEVER the service role:
 *
 *   - `ai_runs`            (applied 20260803061937) — per-run routing audit
 *     with token counts and USD cost figures; admin-only SELECT via RLS.
 *   - `usage_cost_events`  (applied 20260728114353) — the canonical EUR-cent
 *     usage/cost ledger; admin-only SELECT via RLS.
 *
 * A non-admin session returns zero rows from both by policy, so this module
 * is double-gated (page `requireSuperadmin` + RLS), same as
 * lib/admin/pilot-metrics.ts / conversion-funnel.ts.
 *
 * HONESTY CONTRACT (same stance as those modules):
 *   - production has 0 rows today (AI_PROVIDER_MODE=disabled) — the summary
 *     renders real zeros and "—", never a fake chart or an invented number;
 *   - an unreadable table is reported as `available: false`, distinct from
 *     "available but empty";
 *   - unknown cost stays null → "—". Sums only ever include REAL figures,
 *     and the row count they cover is stated next to them.
 */

const WINDOW_ROWS = 5000;
const TOP_GROUPS = 20;

export type AiCostGroup = {
  key: string;
  runs: number;
  inputTokens: number;
  outputTokens: number;
  /** Sum of the rows' actual cost — null when NO row in the group had one. */
  actualCostUsd: number | null;
  /** How many rows contributed a real actual-cost figure to the sum. */
  costedRuns: number;
};

export type AiRunsSummary = {
  available: boolean;
  totalRuns: number;
  byDay: AiCostGroup[];
  byTaskType: AiCostGroup[];
  byProvider: AiCostGroup[];
};

export type UsageLedgerGroup = {
  key: string;
  events: number;
  /** Sum of actualCents — null when NO event in the group carried one. */
  actualCents: number | null;
  /** Sum of estimatedCents — null when NO event in the group carried one. */
  estimatedCents: number | null;
};

export type UsageLedgerSummary = {
  available: boolean;
  totalEvents: number;
  byDay: UsageLedgerGroup[];
  byService: UsageLedgerGroup[];
  byProvider: UsageLedgerGroup[];
};

type AiRunRow = {
  created_at: string;
  task_type: string | null;
  provider: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  actual_cost_usd: number | null;
};

type UsageEventRow = {
  occurred_at: string;
  provider: string | null;
  service: string | null;
  cost: Record<string, unknown> | null;
};

// The generated Database type knows neither table until `pnpm db:types` is
// re-run — cast through `any` (established repo pattern; RLS still enforces
// admin-only SELECT at runtime).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFrom = (name: string) => any;

function day(iso: string): string {
  return iso.slice(0, 10);
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function groupRuns(rows: AiRunRow[], keyOf: (r: AiRunRow) => string): AiCostGroup[] {
  const map = new Map<string, AiCostGroup>();
  for (const r of rows) {
    const key = keyOf(r);
    const g =
      map.get(key) ??
      ({ key, runs: 0, inputTokens: 0, outputTokens: 0, actualCostUsd: null, costedRuns: 0 } as AiCostGroup);
    g.runs += 1;
    g.inputTokens += r.input_tokens ?? 0;
    g.outputTokens += r.output_tokens ?? 0;
    if (r.actual_cost_usd !== null && Number.isFinite(r.actual_cost_usd)) {
      g.actualCostUsd = (g.actualCostUsd ?? 0) + r.actual_cost_usd;
      g.costedRuns += 1;
    }
    map.set(key, g);
  }
  return [...map.values()]
    .sort((a, b) => b.key.localeCompare(a.key) || b.runs - a.runs)
    .slice(0, TOP_GROUPS);
}

export async function getAiRunsSummary(supabase: SupabaseClient): Promise<AiRunsSummary> {
  const fromAny = (supabase as unknown as { from: AnyFrom }).from.bind(supabase);
  const { data, error } = await fromAny("ai_runs")
    .select("created_at, task_type, provider, input_tokens, output_tokens, actual_cost_usd")
    .order("created_at", { ascending: false })
    .limit(WINDOW_ROWS);
  if (error) {
    return { available: false, totalRuns: 0, byDay: [], byTaskType: [], byProvider: [] };
  }
  const rows = (data ?? []) as AiRunRow[];
  return {
    available: true,
    totalRuns: rows.length,
    byDay: groupRuns(rows, (r) => day(r.created_at)),
    byTaskType: groupRuns(rows, (r) => r.task_type ?? "(unknown)").sort(
      (a, b) => b.runs - a.runs,
    ),
    byProvider: groupRuns(rows, (r) => r.provider ?? "(unknown)").sort(
      (a, b) => b.runs - a.runs,
    ),
  };
}

function groupEvents(
  rows: UsageEventRow[],
  keyOf: (r: UsageEventRow) => string,
): UsageLedgerGroup[] {
  const map = new Map<string, UsageLedgerGroup>();
  for (const r of rows) {
    const key = keyOf(r);
    const g =
      map.get(key) ?? ({ key, events: 0, actualCents: null, estimatedCents: null } as UsageLedgerGroup);
    g.events += 1;
    const actual = num(r.cost?.["actualCents"]);
    const estimated = num(r.cost?.["estimatedCents"]);
    if (actual !== null) g.actualCents = (g.actualCents ?? 0) + actual;
    if (estimated !== null) g.estimatedCents = (g.estimatedCents ?? 0) + estimated;
    map.set(key, g);
  }
  return [...map.values()]
    .sort((a, b) => b.key.localeCompare(a.key) || b.events - a.events)
    .slice(0, TOP_GROUPS);
}

export async function getUsageLedgerSummary(
  supabase: SupabaseClient,
): Promise<UsageLedgerSummary> {
  const fromAny = (supabase as unknown as { from: AnyFrom }).from.bind(supabase);
  const { data, error } = await fromAny("usage_cost_events")
    .select("occurred_at, provider, service, cost")
    .order("occurred_at", { ascending: false })
    .limit(WINDOW_ROWS);
  if (error) {
    return { available: false, totalEvents: 0, byDay: [], byService: [], byProvider: [] };
  }
  const rows = (data ?? []) as UsageEventRow[];
  return {
    available: true,
    totalEvents: rows.length,
    byDay: groupEvents(rows, (r) => day(r.occurred_at)),
    byService: groupEvents(rows, (r) => r.service ?? "(unknown)").sort(
      (a, b) => b.events - a.events,
    ),
    byProvider: groupEvents(rows, (r) => r.provider ?? "(unknown)").sort(
      (a, b) => b.events - a.events,
    ),
  };
}

/** EUR fractional cents → human string, honest "—" for null. */
export function formatEurCents(cents: number | null): string {
  if (cents === null || !Number.isFinite(cents)) return "—";
  return `€${(cents / 100).toFixed(4)}`;
}

/** USD → human string, honest "—" for null. */
export function formatUsd(usd: number | null): string {
  if (usd === null || !Number.isFinite(usd)) return "—";
  return `$${usd.toFixed(4)}`;
}
