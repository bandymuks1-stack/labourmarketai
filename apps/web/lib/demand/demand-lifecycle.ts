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
 * Demand lifecycle flows (PR10). Own-row writes under the EXISTING
 * customer_requests RLS (update: profile_id = auth.uid()) — no RPC, no
 * migration, no new write surface. Nothing here sends anything anywhere.
 */

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

async function ownRequest(requestId: string) {
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
  const { data: req } = await asAny(supabase)
    .from("customer_requests")
    .select("id, status, title, need_summary, role_or_work_type, notes, payload")
    .eq("id", requestId)
    .eq("profile_id", user.id)
    .maybeSingle();
  return { supabase, user, req, organizationId: employer.organizationId };
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
  const { supabase, user, req } = await ownRequest(requestId);
  if (!user || !req) return { kind: "not-owner" };

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
  const { supabase, user, req } = await ownRequest(requestId);
  if (!user || !req) return { kind: "not-owner" };
  if (!canCloseFrom(req.status)) return { kind: "invalid" };
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
  const { supabase, user, req, organizationId } = await ownRequest(requestId);
  if (!user || !req || !organizationId) return { kind: "not-owner" };
  if (!canReopenFrom(req.status)) return { kind: "invalid" };
  // A reopened need is an ACTIVE need again: the SAME ceiling as creating one
  // (owner launch pricing 2026-09-05), decided by the ONE open-needs gate.
  const needsGate = await gateOpenNeeds(supabase, organizationId, user.id);
  if (!needsGate.allowed) return { kind: "over-limit", limit: needsGate.limit, next: needsGate.next };
  const { error } = await asAny(supabase)
    .from("customer_requests")
    .update({ status: "submitted", updated_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("profile_id", user.id)
    .eq("status", "closed");
  if (error) return { kind: "error", message: error.message };
  return { kind: "ok", status: "submitted" };
}
