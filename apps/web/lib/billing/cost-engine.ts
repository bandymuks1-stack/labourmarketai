import "server-only";

import {
  buildCustomerCostReport,
  type AiRunCostRow,
  type CustomerCostReport,
  type UsageEventCostRow,
} from "@/lib/billing/cost-engine-core";
import type { UsageCategory } from "@/lib/billing/usage-core";

/**
 * Per-customer cost report — SERVER-only reader (Sprint v2 §11).
 *
 * Real source TODAY: ai_runs (actual_cost_usd per run, written by the shared
 * AI router; gated draft 20260714150000). Read-time rollup — see the design
 * decision note in cost-engine-core.ts. Other categories read usage_events
 * (gated draft 20260714200000) and stay honestly "not_instrumented" until a
 * real collector writes rows.
 *
 * Degrades honestly: a missing table yields empty inputs (and the report's
 * `sourcesAvailable` flags say so) — never fabricated numbers, never a throw.
 */

export interface CustomerCostReportWithSources {
  readonly report: CustomerCostReport;
  readonly sources: {
    readonly aiRunsAvailable: boolean;
    readonly usageEventsAvailable: boolean;
  };
}

export async function getCustomerCostReportBestEffort(
  profileId: string,
): Promise<CustomerCostReportWithSources> {
  let aiRuns: AiRunCostRow[] = [];
  let usageEvents: UsageEventCostRow[] = [];
  let aiRunsAvailable = false;
  let usageEventsAvailable = false;

  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;

    const ai = await db
      .from("ai_runs")
      .select("actual_cost_usd, estimated_cost_usd")
      .eq("profile_id", profileId)
      .limit(5000);
    if (!ai.error) {
      aiRunsAvailable = true;
      aiRuns = (
        (ai.data ?? []) as {
          actual_cost_usd: number | null;
          estimated_cost_usd: number | null;
        }[]
      ).map((r) => ({
        actualCostUsd: r.actual_cost_usd,
        estimatedCostUsd: r.estimated_cost_usd,
      }));
    }

    const ue = await db
      .from("usage_events")
      .select("category, cost_usd")
      .eq("profile_id", profileId)
      .limit(5000);
    if (!ue.error) {
      usageEventsAvailable = true;
      usageEvents = (
        (ue.data ?? []) as { category: UsageCategory; cost_usd: number | null }[]
      ).map((r) => ({ category: r.category, costUsd: r.cost_usd }));
    }
  } catch {
    // fall through to the honest empty report
  }

  return {
    report: buildCustomerCostReport({ aiRuns, usageEvents }),
    sources: { aiRunsAvailable, usageEventsAvailable },
  };
}
