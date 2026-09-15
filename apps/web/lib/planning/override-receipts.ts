import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { ReservationSource } from "@/lib/workforce/commitment-reservation";

/**
 * OVERRIDE RECEIPTS — the read behind J-TIME-FREEDOM step 5.
 *
 * A receipt says: this manager accepted a KNOWN clash for this assignment,
 * knowing these collisions, on this window, for this reason. It is written
 * once by `record_commitment_override_v1` (migration 20260915120000, owner-
 * gated) and never changed. Two parties may read it, and the database decides
 * which: the project's managers and the worker it concerns
 * (`commitment_override_receipts_select`). This module adds no filter of its
 * own beyond the project or worker the surface is asking about.
 *
 * HONEST DEGRADATION. Three outcomes, never two. Until the migration is
 * applied the relation does not exist and the read is `not-applied` — the
 * surface says receipts are prepared and not enabled, which is true. A real
 * read failure is `unavailable`. Neither is rendered as "no receipts".
 */

const MISSING_OBJECT_CODES = new Set(["42P01", "42703", "PGRST205"]);
const READ_LIMIT = 100;

export interface OverrideReceiptCollision {
  readonly source: ReservationSource;
  readonly sourceId: string;
  readonly overlapStart: string;
  readonly overlapEnd: string;
}

export interface OverrideReceipt {
  readonly id: string;
  readonly projectId: string;
  readonly workerId: string;
  readonly decidedBy: string;
  readonly windowStart: string | null;
  readonly windowEnd: string | null;
  readonly collisions: readonly OverrideReceiptCollision[];
  readonly reason: string | null;
  readonly createdAt: string;
}

export type OverrideReceiptsRead =
  | { readonly status: "ok"; readonly receipts: readonly OverrideReceipt[] }
  | { readonly status: "not-applied" }
  | { readonly status: "unavailable" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

function mapRow(r: Record<string, unknown>): OverrideReceipt {
  const raw = Array.isArray(r.collisions) ? (r.collisions as Record<string, unknown>[]) : [];
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    workerId: String(r.worker_id),
    decidedBy: String(r.decided_by),
    windowStart: (r.window_start as string | null) ?? null,
    windowEnd: (r.window_end as string | null) ?? null,
    collisions: raw.map((c) => ({
      source: String(c.source) as ReservationSource,
      sourceId: String(c.sourceId),
      overlapStart: String(c.overlapStart),
      overlapEnd: String(c.overlapEnd),
    })),
    reason: (r.reason as string | null) ?? null,
    createdAt: String(r.created_at),
  };
}

async function readReceipts(
  column: "project_id" | "worker_id",
  value: string,
  caller?: { readonly supabase: SupabaseClient },
): Promise<OverrideReceiptsRead> {
  const supabase = caller?.supabase ?? (await createClient());
  const res = await asAny(supabase)
    .from("commitment_override_receipts")
    .select("id, project_id, worker_id, decided_by, window_start, window_end, collisions, reason, created_at")
    .eq(column, value)
    .order("created_at", { ascending: false })
    .limit(READ_LIMIT);
  if (res.error) {
    return MISSING_OBJECT_CODES.has(res.error.code ?? "") ? { status: "not-applied" } : { status: "unavailable" };
  }
  return { status: "ok", receipts: ((res.data ?? []) as Record<string, unknown>[]).map(mapRow) };
}

/** Every receipt on one project — the managers' view. */
export function getProjectOverrideReceipts(
  projectId: string,
  caller?: { readonly supabase: SupabaseClient },
): Promise<OverrideReceiptsRead> {
  return readReceipts("project_id", projectId, caller);
}

/** Every receipt about one worker — the subject's view. RLS admits the
 *  worker themselves; a manager asking about a worker they do not manage
 *  gets nothing, and gets it as an empty list because the read succeeded. */
export function getWorkerOverrideReceipts(
  workerId: string,
  caller?: { readonly supabase: SupabaseClient },
): Promise<OverrideReceiptsRead> {
  return readReceipts("worker_id", workerId, caller);
}
