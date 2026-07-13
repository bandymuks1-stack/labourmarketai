"use server";

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
 *   3. resolve the demand owner server-side ONLY. RLS correctly hides
 *      customer_requests rows from non-owners, so this single read uses the
 *      service-role client AFTER the caller's own facts held — the exact
 *      pattern a SECURITY DEFINER RPC would encode, kept app-side so the
 *      flow needs no new migration. The owner's profile id NEVER reaches
 *      the browser (it goes straight into the participant insert).
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

  // 3+4) Owner resolution + the worker-board visibility gate, server-side
  //      only (see the file contract above). The owner's profile id is used
  //      exclusively for the participant insert and never returned.
  const admin = createAdminClient();
  const { data: demand } = await asAny(admin)
    .from("customer_requests")
    .select("id, title, status, profile_id")
    .eq("id", requestId)
    .maybeSingle();
  const ownerProfileId = (demand?.profile_id as string | null) ?? null;
  if (!demand || !ownerProfileId || ownerProfileId === user.id) {
    return { ok: false, reason: "error" };
  }
  let companyVerified = false;
  {
    const { data: company } = await asAny(admin)
      .from("companies")
      .select("verification_status")
      .eq("profile_id", ownerProfileId)
      .maybeSingle();
    companyVerified = company?.verification_status === "verified";
  }
  const decision = evaluateWorkerContactRequest({
    hasOwnActiveSignal,
    demandOpen: demand.status === "submitted",
    companyVerified,
  });
  if (decision !== "allowed") return { ok: false, reason: decision };

  // 5) Open/reopen the in-app thread with the just-verified grant. Neutral
  //    subject from the demand title — no PII, no fabricated content.
  const subject = (demand.title as string | null)?.slice(0, 120) ?? null;
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
