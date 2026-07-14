/**
 * Per-customer cost rollup — PURE core (Pricing & Payments slice, Sprint v2
 * §11 cost engine). No IO. The server wrapper (cost-engine.ts) feeds it real
 * rows.
 *
 * DOCUMENTED DESIGN DECISION (read-time rollup, not write-time mirroring):
 * AI cost is the ONLY category measurable today, via ai_runs.actual_cost_usd
 * (gated draft 20260714150000_ai_runs_audit_v1.sql, written by the shared AI
 * router). The cost engine reads ai_runs directly at rollup time and does
 * NOT mirror rows into usage_events — one source of truth, no double-write
 * drift, no backfill job. usage_events serves the OTHER categories the
 * moment a real collector exists.
 *
 * Honesty rules:
 *   - a category with no data source reports state "not_instrumented" and
 *     knownCostUsd null — never a fabricated 0-cost claim;
 *   - a measurable category with zero rows reports "no_data";
 *   - rows whose cost is unknown (null actual cost) are COUNTED as
 *     unknown-cost events, never silently valued at 0 inside the known sum.
 */

import {
  USAGE_CATEGORIES,
  type UsageCategory,
} from "@/lib/billing/usage-core";

/** Categories with a REAL data source today. */
export const INSTRUMENTED_CATEGORIES: readonly UsageCategory[] = ["ai"];

export interface AiRunCostRow {
  readonly actualCostUsd: number | null;
  readonly estimatedCostUsd: number | null;
}

export interface UsageEventCostRow {
  readonly category: UsageCategory;
  readonly costUsd: number | null;
}

export type CategoryCostState = "measured" | "no_data" | "not_instrumented";

export interface CategoryCost {
  readonly category: UsageCategory;
  readonly state: CategoryCostState;
  /** Sum of KNOWN costs (USD). null when nothing is measurable. */
  readonly knownCostUsd: number | null;
  readonly eventCount: number;
  /** Events whose cost is unknown — surfaced, never valued at 0. */
  readonly unknownCostEventCount: number;
}

export interface CustomerCostReport {
  readonly categories: readonly CategoryCost[];
  readonly totalKnownCostUsd: number;
  readonly totalUnknownCostEventCount: number;
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Roll up ai_runs rows: actual cost preferred; estimated NEVER substitutes. */
export function rollupAiRuns(rows: readonly AiRunCostRow[]): CategoryCost {
  let known = 0;
  let unknown = 0;
  for (const r of rows) {
    if (typeof r.actualCostUsd === "number" && Number.isFinite(r.actualCostUsd)) {
      known += r.actualCostUsd;
    } else {
      unknown += 1;
    }
  }
  return {
    category: "ai",
    state: rows.length === 0 ? "no_data" : "measured",
    knownCostUsd: rows.length === 0 ? null : round6(known),
    eventCount: rows.length,
    unknownCostEventCount: unknown,
  };
}

/**
 * Full per-customer report: ai from ai_runs; every other category from
 * usage_events when rows exist, otherwise the honest not-instrumented /
 * no-data state.
 */
export function buildCustomerCostReport(input: {
  aiRuns: readonly AiRunCostRow[];
  usageEvents: readonly UsageEventCostRow[];
}): CustomerCostReport {
  const categories: CategoryCost[] = [];

  for (const category of USAGE_CATEGORIES) {
    if (category === "ai") {
      categories.push(rollupAiRuns(input.aiRuns));
      continue;
    }
    const rows = input.usageEvents.filter((e) => e.category === category);
    if (rows.length === 0) {
      categories.push({
        category,
        state: INSTRUMENTED_CATEGORIES.includes(category)
          ? "no_data"
          : "not_instrumented",
        knownCostUsd: null,
        eventCount: 0,
        unknownCostEventCount: 0,
      });
      continue;
    }
    let known = 0;
    let unknown = 0;
    for (const r of rows) {
      if (typeof r.costUsd === "number" && Number.isFinite(r.costUsd)) {
        known += r.costUsd;
      } else {
        unknown += 1;
      }
    }
    categories.push({
      category,
      state: "measured",
      knownCostUsd: round6(known),
      eventCount: rows.length,
      unknownCostEventCount: unknown,
    });
  }

  return {
    categories,
    totalKnownCostUsd: round6(
      categories.reduce((sum, c) => sum + (c.knownCostUsd ?? 0), 0),
    ),
    totalUnknownCostEventCount: categories.reduce(
      (sum, c) => sum + c.unknownCostEventCount,
      0,
    ),
  };
}
