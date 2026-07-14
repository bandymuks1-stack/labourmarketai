import "server-only";

import {
  buildUsageEventRow,
  type UsageEventInput,
} from "@/lib/billing/usage-core";

/**
 * usage_events writer — SERVER-only, best-effort (same never-throw pattern as
 * lib/ai/runtime/audit-store.ts). Persists validated usage rows into the
 * append-only usage_events table (gated draft
 * 20260714200000_usage_cost_tracking_v1.sql). Until the migration is applied
 * the write degrades honestly to "needs-migration" — logged, never faked,
 * never affecting the caller's outcome.
 */

const RELATION_ABSENT = "42P01";
const POSTGREST_MISSING = "PGRST205";

export type UsageRecordResult =
  | "ok"
  | "invalid"
  | "needs-migration"
  | "error";

export async function recordUsageEvent(
  input: UsageEventInput,
): Promise<UsageRecordResult> {
  const built = buildUsageEventRow(input);
  if (!built.ok) {
    console.error("[billing/usage] invalid usage event", {
      reason: built.reason,
      category: input.category,
    });
    return "invalid";
  }
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const { error } = await db.from("usage_events").insert(built.row);
    if (!error) return "ok";
    if (error.code === RELATION_ABSENT || error.code === POSTGREST_MISSING) {
      return "needs-migration";
    }
    console.error("[billing/usage] persist failed", {
      message: String(error.message ?? "unknown").slice(0, 200),
    });
    return "error";
  } catch (err) {
    console.error("[billing/usage] persist failed", {
      message:
        err instanceof Error ? err.message.slice(0, 200) : "unknown error",
    });
    return "error";
  }
}
