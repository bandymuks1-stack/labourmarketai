import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import { gateOpenNeeds } from "@/lib/billing/open-needs-gate";
import { deriveNeedSkills } from "@/lib/market/need-skills";
import {
  canCloseFrom,
  canReopenFrom,
  mergeConfirmedNeedPayload,
} from "./demand-lifecycle-model";

/**
 * Demand lifecycle flows (PR10; R-15 2026-09-19).
 *
 * CLOSE / REOPEN go through the gated RPCs `close_demand_v1` /
 * `reopen_demand_v1` (migration 20260919190000, RED — owner-gated): the
 * creator, an admin, or a colleague with `has_org_demand_access` on the need's
 * organization may move status submitted ↔ closed, and nothing else. Until
 * that migration is applied (42883 / PGRST202) the flows fall back to the
 * owner-only direct update under the EXISTING `customer_requests_update` RLS
 * (profile_id = auth.uid()) — byte-identical to before R-15, so a colleague
 * simply gets `not-owner` as they always did.
 *
 * The §19 CONFIRM act stays the creator's: it writes `payload`, and the
 * UPDATE policy is deliberately NOT widened (payload carries the commercial
 * fields). Nothing here sends anything anywhere.
 */

/** PostgREST / Postgres codes for "the RPC is not applied here". */
const RPC_MISSING_CODES: ReadonlySet<string> = new Set(["42883", "PGRST202"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export type DemandLifecycleResult =
  | { kind: "ok"; status?: string }
  | { kind: "invalid" }
  | { kind: "not-owner" }
  | { kind: "nothing-to-confirm" }
  // Owner launch pricing 2026-09-05: reopening would exceed the organization's
  // concurrent active open needs (FREE 1 / ORGANIZATION 10). The way forward is
  // the paid plan or the individual plan; nothing is charged or reopened.
  | { kind: "over-limit"; limit: number; next: "upgrade" | "individual_plan" }
  | { kind: "error"; message: string };

async function visibleRequest(requestId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, req: null, organizationId: null };
  // W8 slice 1 — the ONE workspace gate for all three lifecycle writes
  // (confirm / close / reopen). Not acting for a company ⇒ `not-owner`, which
  // is what every caller already renders honestly.
  const employer = await resolveEmployerCompanyContext();
  if (employer.kind !== "ok") {
    return { supabase, user: null, req: null, organizationId: null };
  }
  // R-15: read under the SELECT policy (creator OR has_org_demand_access), then
  // pin the row to the ACTIVE workspace — a deep link carrying another
  // organization's need must not resolve from this context even when the
  // caller could read it elsewhere.
  const { data: row } = await asAny(supabase)
    .from("customer_requests")
    .select(
      "id, status, title, need_summary, role_or_work_type, notes, payload, profile_id, organization_id",
    )
    .eq("id", requestId)
    .maybeSingle();
  const req =
    row && (row.profile_id === user.id || row.organization_id === employer.organizationId)
      ? row
      : null;
  return { supabase, user, req, organizationId: employer.organizationId };
}

/** The gated RPC answer → the lifecycle result the surfaces already render.
 *  `null` = the RPC is not applied here (fall back to the owner-only path). */
function mapLifecycleRpc(
  data: unknown,
  error: { code?: string; message: string } | null,
  okStatus: string,
): DemandLifecycleResult | null {
  if (error) {
    if (RPC_MISSING_CODES.has(error.code ?? "")) return null;
    return { kind: "error", message: error.message };
  }
  const outcome = (data as { outcome?: string } | null)?.outcome;
  if (outcome === okStatus) return { kind: "ok", status: okStatus };
  if (outcome === "not_found") return { kind: "not-owner" };
  // already_closed / already_open / invalid_transition — the precondition the
  // caller re-checked has moved under them; the surface says so.
  return { kind: "invalid" };
}

/**
 * The §19 EXPLICIT HUMAN ACT: the company confirms the offline-recognized
 * requirement set, writing `payload.structured_need.skill_slugs` on its OWN
 * demand. From then on scouting/matching treat the need as human-structured
 * (no more "recognized — not confirmed" banner).
 */
export async function confirmRecognizedNeed(
  requestId: string,
): Promise<DemandLifecycleResult> {
  if (!requestId) return { kind: "invalid" };
  const { supabase, user, req } = await visibleRequest(requestId);
  if (!user || !req) return { kind: "not-owner" };
  // R-15 boundary: the confirm act writes `payload`, which also carries the
  // commercial clusters — it stays the CREATOR's. A colleague reading the row
  // is not a colleague editing it.
  if (req.profile_id !== user.id) return { kind: "not-owner" };

  // Same ONE derivation pipeline the board/scouting/interest use.
  const derived = deriveNeedSkills({
    title: req.title,
    needSummary: req.need_summary,
    roleOrWorkType: req.role_or_work_type,
    notes: req.notes,
    payload: req.payload,
  });
  // Only a recognition/expansion suggestion can be "confirmed" — an already
  // human-structured need has nothing to confirm; an underivable one has
  // nothing to confirm either (honest no-op).
  if (
    derived.source !== "recognized_from_text" &&
    derived.source !== "profession_expanded"
  ) {
    return { kind: "nothing-to-confirm" };
  }
  if (derived.skillSlugs.length === 0) return { kind: "nothing-to-confirm" };

  const payload = mergeConfirmedNeedPayload(req.payload, {
    skillSlugs: derived.skillSlugs,
    professionSlug: derived.professionSlug,
  });
  const { error } = await asAny(supabase)
    .from("customer_requests")
    .update({ payload, updated_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("profile_id", user.id);
  if (error) return { kind: "error", message: error.message };
  return { kind: "ok" };
}

/** Close the company's own demand — instantly hidden from the worker board
 *  (its RPC serves status='submitted' only). Row + history stay (§3). */
export async function closeDemand(requestId: string): Promise<DemandLifecycleResult> {
  if (!requestId) return { kind: "invalid" };
  const { supabase, user, req } = await visibleRequest(requestId);
  if (!user || !req) return { kind: "not-owner" };
  if (!canCloseFrom(req.status)) return { kind: "invalid" };
  // R-15: the gated RPC first (creator / admin / has_org_demand_access);
  // absent RPC → the owner-only direct update below, unchanged.
  const rpc = await asAny(supabase).rpc("close_demand_v1", { p_request_id: requestId });
  const mapped = mapLifecycleRpc(rpc.data, rpc.error, "closed");
  if (mapped) return mapped;
  const { error } = await asAny(supabase)
    .from("customer_requests")
    .update({ status: "closed", updated_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("profile_id", user.id)
    .eq("status", "submitted");
  if (error) return { kind: "error", message: error.message };
  return { kind: "ok", status: "closed" };
}

/** Reopen a previously closed demand (back to submitted → worker-visible
 *  again through the same verified-company gate). */
export async function reopenDemand(requestId: string): Promise<DemandLifecycleResult> {
  if (!requestId) return { kind: "invalid" };
  const { supabase, user, req, organizationId } = await visibleRequest(requestId);
  if (!user || !req || !organizationId) return { kind: "not-owner" };
  if (!canReopenFrom(req.status)) return { kind: "invalid" };
  // A reopened need is an ACTIVE need again: the SAME ceiling as creating one
  // (owner launch pricing 2026-09-05), decided by the ONE open-needs gate —
  // for the creator and for a colleague alike (R-15).
  const needsGate = await gateOpenNeeds(supabase, organizationId, user.id);
  if (!needsGate.allowed) return { kind: "over-limit", limit: needsGate.limit, next: needsGate.next };
  const rpc = await asAny(supabase).rpc("reopen_demand_v1", { p_request_id: requestId });
  const mapped = mapLifecycleRpc(rpc.data, rpc.error, "submitted");
  if (mapped) return mapped;
  const { error } = await asAny(supabase)
    .from("customer_requests")
    .update({ status: "submitted", updated_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("profile_id", user.id)
    .eq("status", "closed");
  if (error) return { kind: "error", message: error.message };
  return { kind: "ok", status: "submitted" };
}
