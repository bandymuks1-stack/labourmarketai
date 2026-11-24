"use server";

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateDirectConversation } from "@/lib/communication/direct-conversation";
import {
  evaluateWorkerContactRequest,
  type WorkerContactDecision,
} from "@/lib/communication/communication-eligibility";

/**
 * Canonical-journey P1 — worker → demand owner "contact the employer".
 *
 * Before this action the worker journey dead-ended after "express interest":
 * the worker dropped an internal signal and waited, with no way to start a
 * conversation (audit §7: the journey ends in a waiting room). This is the
 * worker-side mirror of contact-interested-worker.ts, under the SAME §8.1
 * grant (`allowed_demand_interest`) — the relationship is the worker's own
 * active interest signal on an open, verified-company demand.
 *
 * Order is the honesty contract of this action:
 *   1. resolve the caller's OWN worker row (workers.profile_id = auth.uid());
 *   2. verify the caller's OWN interest signal on this demand exists and is
 *      not withdrawn — read under the caller's RLS session (own rows only);
 *   3. resolve the demand owner server-side ONLY, through the gated
 *      SECURITY DEFINER RPC contact_demand_owner_v1 (owner-gated migration
 *      20260723053000) AFTER the caller's own facts held. RLS correctly
 *      hides customer_requests rows from non-owners, and production
 *      deliberately allowlists service_role table grants (a service-role
 *      read here failed 42501 for every worker — 2026-07-23 E2E break).
 *      The RPC reveals the owner's profile id only when every gate holds,
 *      and the id NEVER reaches the browser (it goes straight into the
 *      participant insert). Until the migration is applied the action
 *      feature-detects the missing RPC → honest "needs_migration".
 *   4. enforce the same visibility gate the worker board RPC applies:
 *      demand status 'submitted' + owner is a VERIFIED company — a worker
 *      can only contact an employer whose demand they could legitimately see;
 *   5. open/reopen the IN-APP conversation (0021 backend, rate-capped by
 *      createConversation). No first message is fabricated — the worker
 *      writes their own words in the thread.
 *
 * No contact channel (phone/email) is ever exposed. Nothing external is ever
 * sent. The company notices the thread through the real unread badge/bell,
 * with the demand title as the subject and a typed demand_interest source.
 */

const RELATION_NOT_FOUND = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny<T>(c: T): any {
  return c;
}

export type ContactEmployerResult =
  | { ok: true; conversationId: string }
  | {
      ok: false;
      reason:
        | WorkerContactDecision
        | "not_authenticated"
        | "not_a_worker"
        | "needs_migration"
        | "error";
    };

export async function contactEmployerAction(input: {
  locale: string;
  requestId: string;
}): Promise<ContactEmployerResult> {
  const { locale, requestId } = input;
  if (!requestId) return { ok: false, reason: "error" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "not_authenticated" };

  // 1) The caller's own worker identity.
  const { data: workerRow } = await asAny(supabase)
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  const workerId = (workerRow?.id as string | null) ?? null;
  if (!workerId) return { ok: false, reason: "not_a_worker" };

  // 2) The caller's OWN, still-standing interest signal on THIS demand —
  //    read under the caller's session (RLS: worker sees own rows only).
  let signalStatus: string | null = null;
  try {
    const { data: signal } = await asAny(supabase)
      .from("demand_interest_signals")
      .select("status")
      .eq("request_id", requestId)
      .eq("worker_id", workerId)
      .maybeSingle();
    signalStatus = (signal?.status as string | null) ?? null;
  } catch (e) {
    if ((e as { code?: string })?.code === RELATION_NOT_FOUND) {
      return { ok: false, reason: "needs_migration" };
    }
  }
  const hasOwnActiveSignal = !!signalStatus && signalStatus !== "withdrawn";
  if (!hasOwnActiveSignal) return { ok: false, reason: "no_interest" };

  // 3+4) Owner resolution + the worker-board visibility gate through the
  //      gated SECURITY DEFINER RPC contact_demand_owner_v1 (migration
  //      20260723053000). The RPC re-verifies the caller's own signal and
  //      reveals owner_profile_id/demand_title ONLY when every gate holds;
  //      the id is used exclusively for the participant insert and never
  //      returned to the browser. The previous service-role read died with
  //      42501 in production (service_role table grants are deliberately
  //      allowlisted and exclude customer_requests/companies), so every
  //      worker's contact attempt failed — 2026-07-23 E2E first break.
  interface OwnerContextRow {
    owner_profile_id: string | null;
    demand_title: string | null;
    has_own_signal: boolean;
    demand_open: boolean;
    company_verified: boolean;
  }
  let row: OwnerContextRow | null = null;
  try {
    const { data, error } = await asAny(supabase).rpc("contact_demand_owner_v1", {
      p_request_id: requestId,
    });
    if (error) {
      const code = (error as { code?: string }).code;
      if (code === "42883" || code === "PGRST202" || code === RELATION_NOT_FOUND) {
        return { ok: false, reason: "needs_migration" }; // RPC not applied yet
      }
      return { ok: false, reason: "error" };
    }
    row = Array.isArray(data) ? ((data[0] as OwnerContextRow) ?? null) : null;
  } catch {
    return { ok: false, reason: "needs_migration" };
  }
  if (!row) return { ok: false, reason: "error" }; // demand does not exist

  const decision = evaluateWorkerContactRequest({
    // Both the app-side read above and the RPC's own check must agree —
    // default-closed on any disagreement.
    hasOwnActiveSignal: hasOwnActiveSignal && row.has_own_signal,
    demandOpen: row.demand_open,
    companyVerified: row.company_verified,
  });
  if (decision !== "allowed") return { ok: false, reason: decision };

  const ownerProfileId = row.owner_profile_id;
  if (!ownerProfileId || ownerProfileId === user.id) {
    return { ok: false, reason: "error" };
  }

  // 5) Open/reopen the in-app thread with the just-verified grant. Neutral
  //    subject from the demand title — no PII, no fabricated content.
  const subject = row.demand_title?.slice(0, 120) ?? null;
  const conversation = await getOrCreateDirectConversation(
    ownerProfileId,
    locale,
    subject,
    "allowed_demand_interest",
    { type: "demand_interest", id: requestId },
  );
  if (!conversation.ok) return { ok: false, reason: "error" };
  return { ok: true, conversationId: conversation.data.id };
}
