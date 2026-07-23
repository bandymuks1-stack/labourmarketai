import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Accepted-booking engagement candidates for the PROJECT ASSIGN picker only
 * (booking-engagement bridge v1). Reads the caller-bound
 * `list_booking_engagement_workers_v1` RPC — worker id / profile / display
 * name, NO email, NO contact fields. Deliberately NOT merged into
 * `listManagedWorkers`: the instructions picker and every other roster
 * surface stay roster-only (an engagement grants project assignment for the
 * origin company's projects and nothing else).
 *
 * Until the owner applies migration 20260723120000 the RPC is absent —
 * feature-detected (42883/42P01/PGRST202/PGRST205) and degraded to the honest
 * `needs-migration` state (no rows, no fake affordance, no error surface).
 */

const ABSENT = new Set(["42883", "42P01", "PGRST202", "PGRST205"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export interface EngagementWorker {
  readonly engagementId: string;
  readonly workerProfileId: string;
  readonly name: string;
}

export type EngagementWorkersResult =
  | { kind: "ok"; workers: readonly EngagementWorker[] }
  | { kind: "needs-migration"; workers: readonly EngagementWorker[] }
  | { kind: "error"; workers: readonly EngagementWorker[] };

export async function listBookingEngagementWorkers(): Promise<EngagementWorkersResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "ok", workers: [] };

  const { data, error } = await asAny(supabase).rpc(
    "list_booking_engagement_workers_v1",
  );
  if (error) {
    if (error.code && ABSENT.has(error.code)) {
      return { kind: "needs-migration", workers: [] };
    }
    return { kind: "error", workers: [] };
  }

  const rows = (data ?? []) as {
    engagement_id: string;
    worker_profile_id: string | null;
    display_name: string | null;
  }[];
  const workers: EngagementWorker[] = [];
  for (const r of rows) {
    if (!r.worker_profile_id) continue;
    workers.push({
      engagementId: r.engagement_id,
      workerProfileId: r.worker_profile_id,
      name: r.display_name ?? r.worker_profile_id.slice(0, 8),
    });
  }
  return { kind: "ok", workers };
}
