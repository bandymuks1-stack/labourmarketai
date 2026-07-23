import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  isMissingTableCode,
  type AgencyCandidateOffer,
  type AgencyCandidateOffersState,
} from "@/lib/agency/candidate-offers-model";

/**
 * Agency candidate-offer read service (agency→client bridge v1).
 *
 * Backed by the OWNER-GATED draft migration
 * 20260723170000_agency_candidate_offers_v1 (NOT applied yet). Until the owner
 * applies it, the read reports `needs-migration` and the UI shows the honest
 * "prepared, owner activation pending" state — the established migration-gated
 * pattern (agency clients / company locations / team brigades).
 *
 * REUSE, not a parallel model: offers are read from the ONE additive side
 * table; the worker labels come from the agency's OWN roster (company_workers)
 * and the need titles from the canonical customer_requests — both already
 * fetched in the company workspace. No candidate/demand duplication here, no
 * outbound action.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(v: unknown): any {
  return v;
}

export async function listAgencyCandidateOffers(): Promise<AgencyCandidateOffersState> {
  const supabase = await createClient();
  try {
    const { data, error } = await asAny(supabase)
      .from("agency_candidate_offers")
      .select("id, worker_id, request_id, status, note, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      if (isMissingTableCode(error.code)) return { kind: "needs-migration" };
      console.error("[agency-offers] read failed:", error.code);
      return { kind: "error" };
    }
    return {
      kind: "ok",
      rows: (data ?? []).map(
        (r: Record<string, unknown>): AgencyCandidateOffer => ({
          id: r.id as string,
          workerId: r.worker_id as string,
          requestId: r.request_id as string,
          status:
            (r.status as string) === "withdrawn" ? "withdrawn" : "offered",
          note: (r.note as string | null) ?? null,
          createdAt: r.created_at as string,
        }),
      ),
    };
  } catch {
    return { kind: "error" };
  }
}
