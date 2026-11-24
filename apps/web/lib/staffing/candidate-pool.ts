/**
 * Operator candidate pool — SERVER loader (Staffing Operating Model v1, PR7).
 *
 * Read-only. Reuses the matching-workbench supply query (existing `workers` +
 * skill/journal counts, admin-RLS-scoped) and maps each worker to an honest
 * CandidateView (evidence status + missing info). No write, no migration, no new
 * table. The page is admin-gated (requireSuperadmin) before this runs.
 *
 * Consent-and-disclosure v1: each candidate additionally carries the CURRENT
 * worker-permission state from the consent ledger
 * (admin_list_worker_privacy_states RPC — current state only, never the
 * history). The operator may LOOK at the pool internally, but any outward
 * step (introducing the worker to a company, sending a CV, sharing contacts)
 * requires the worker's own employer_data_disclosure confirmation — until
 * then the pool shows "Awaiting worker permission". Honest degradation:
 * RPC absent → "unknown".
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { listWorkbench } from "@/lib/admin/matching-workbench";
import { createClient } from "@/lib/supabase/server";
import { toCandidateView, type CandidateView } from "./candidate-pool-core";

export type WorkerPermissionState =
  | "granted"
  | "withdrawn"
  | "granted_stale_version"
  | "not_set"
  | "unknown";

export interface CandidateWithPermission extends CandidateView {
  /** CURRENT profile_discoverability state — controls whether this candidate
   *  may appear on any EXTERNAL surface. Internal operator view only. */
  readonly workerPermission: WorkerPermissionState;
}

export type CandidatePoolResult =
  | { readonly kind: "ok"; readonly candidates: CandidateWithPermission[] }
  | { readonly kind: "needs-migration" }
  | { readonly kind: "error"; readonly message: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asAny = (c: SupabaseClient): any => c;

async function readPrivacyStates(): Promise<Map<string, WorkerPermissionState>> {
  const map = new Map<string, WorkerPermissionState>();
  try {
    const supabase = await createClient();
    const { data, error } = await asAny(supabase).rpc(
      "admin_list_worker_privacy_states",
    );
    if (error || !Array.isArray(data)) return map;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of data as any[]) {
      if (row?.profile_id && typeof row.discoverability === "string") {
        map.set(String(row.profile_id), row.discoverability as WorkerPermissionState);
      }
    }
    return map;
  } catch {
    return map;
  }
}

export async function loadCandidatePool(
  locale = "en",
): Promise<CandidatePoolResult> {
  const wb = await listWorkbench(locale);
  if (wb.kind === "needs-migration") return { kind: "needs-migration" };
  if (wb.kind === "error") return { kind: "error", message: wb.message };

  const states = await readPrivacyStates();
  return {
    kind: "ok",
    candidates: wb.supply.map((s) => ({
      ...toCandidateView(s),
      workerPermission: s.profileId
        ? (states.get(s.profileId) ?? "unknown")
        : "unknown",
    })),
  };
}
