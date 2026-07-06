"use server";

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getOrCreateDirectConversation } from "@/lib/communication/direct-conversation";
import { acknowledgeInterest } from "@/lib/opportunities/interest";
import { revalidatePath } from "next/cache";

/**
 * Company → interested worker: open the REAL thread behind "contacted"
 * (root-cause audit PR5: `demand_interest_signals.status = 'contacted'`
 * used to be a bare flag — it claimed an event the product never mediated,
 * and the worker got no channel).
 *
 * Order matters and is the honesty contract of this action:
 *   1. verify the caller OWNS the demand (customer_requests, RLS-backed);
 *   2. verify the WORKER's own interest signal exists and is not withdrawn —
 *      the worker initiated this contact consent, which is why no shortlist /
 *      availability precondition applies (they asked to be contacted);
 *   3. resolve the worker's messaging identity (workers.profile_id)
 *      server-side only — it never reaches the client;
 *   4. open/reopen the IN-APP conversation (0021 backend, §8.1 grant
 *      `allowed_demand_interest`);
 *   5. ONLY THEN mark the signal `contacted` (existing gated RPC) — so the
 *      status is set exactly when a real thread exists.
 *
 * Nothing external is ever sent — a permission only opens an in-app thread;
 * the worker notices it through the real unread badge/bell.
 */

const RELATION_NOT_FOUND = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny<T>(c: T): any {
  return c;
}

export type ContactInterestedWorkerResult =
  | { ok: true; conversationId: string }
  | {
      ok: false;
      reason:
        | "not_authenticated"
        | "not_owner"
        | "no_interest"
        | "worker_unavailable"
        | "needs_migration"
        | "error";
    };

export async function contactInterestedWorkerAction(input: {
  locale: string;
  requestId: string;
  workerId: string;
}): Promise<ContactInterestedWorkerResult> {
  const { locale, requestId, workerId } = input;
  if (!requestId || !workerId) return { ok: false, reason: "error" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "not_authenticated" };

  // 1) Own demand (RLS also enforces profile_id = auth.uid()).
  const { data: demand } = await asAny(supabase)
    .from("customer_requests")
    .select("id, title")
    .eq("id", requestId)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!demand) return { ok: false, reason: "not_owner" };

  // 2) The worker's own, still-standing interest signal on THIS demand.
  let interestStatus: string | null = null;
  try {
    const { data: signal } = await asAny(supabase)
      .from("demand_interest_signals")
      .select("status")
      .eq("request_id", requestId)
      .eq("worker_id", workerId)
      .maybeSingle();
    interestStatus = (signal?.status as string | null) ?? null;
  } catch (e) {
    if ((e as { code?: string })?.code === RELATION_NOT_FOUND) {
      return { ok: false, reason: "needs_migration" };
    }
  }
  if (!interestStatus || interestStatus === "withdrawn") {
    return { ok: false, reason: "no_interest" };
  }

  // 3) Messaging identity resolved server-side only.
  const { data: worker } = await asAny(supabase)
    .from("workers")
    .select("profile_id")
    .eq("id", workerId)
    .maybeSingle();
  const workerProfileId = (worker?.profile_id as string | null) ?? null;
  if (!workerProfileId) return { ok: false, reason: "worker_unavailable" };

  // 4) Open/reopen the in-app thread with the just-verified grant.
  const subject = (demand.title as string | null)?.slice(0, 120) ?? null;
  const conversation = await getOrCreateDirectConversation(
    workerProfileId,
    locale,
    subject,
    "allowed_demand_interest",
  );
  if (!conversation.ok) return { ok: false, reason: "error" };

  // 5) The thread exists — NOW "contacted" is a true statement. A failure
  //    here leaves the status behind the reality (thread without flag),
  //    which is the safe direction; the ack stays retryable from the UI.
  await acknowledgeInterest({ requestId, workerId, status: "contacted" });
  revalidatePath(`/${locale}/dashboard/company/scouting`);

  return { ok: true, conversationId: conversation.data.id };
}
