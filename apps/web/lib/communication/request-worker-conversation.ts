"use server";

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateDirectConversation } from "@/lib/communication/direct-conversation";
import { canStartCommunicationOrBooking } from "@/lib/visibility/worker-profile-visibility";
import {
  evaluateCommunicationRequest,
  isShortlistedForContact,
  type CommunicationRequestDecision,
} from "@/lib/communication/communication-eligibility";

/**
 * Step 4A — company → worker "request to communicate" from the scouting surface.
 *
 * The scouting card is anonymized (Step 3B dropped the worker profileId from
 * the client), so the worker's identity key is resolved ONLY here, server-side,
 * and never returned to the browser. Gated by:
 *   1. the caller OWNS the demand (customer_requests.profile_id = auth.uid());
 *   2. the worker is on the caller's SHORTLIST for that demand (demand_shortlist,
 *      owner-scoped) and not marked not_fit;
 *   3. the worker is CONTACTABLE (canStartCommunicationOrBooking — Step 3A rule 6).
 *
 * On success it reuses the existing 0021 communication backend
 * (getOrCreateDirectConversation: dedupes, no new table/policy) to open an
 * IN-APP conversation. No contact channel (phone/email) is ever exposed. No
 * external message is sent. No fake acceptance — the worker simply receives the
 * thread in their inbox and may reply or not.
 */

const RELATION_NOT_FOUND = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny<T>(c: T): any {
  return c;
}

export type RequestWorkerConversationResult =
  | { ok: true; conversationId: string }
  | { ok: false; reason: CommunicationRequestDecision | "not_authenticated" | "worker_unavailable" | "needs_migration" | "error" };

export async function requestWorkerConversationAction(input: {
  locale: string;
  requestId: string;
  workerId: string;
}): Promise<RequestWorkerConversationResult> {
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
  const ownsDemand = !!demand;

  // 2) Worker on the caller's shortlist for this demand (owner-scoped).
  let shortlisted = false;
  try {
    const { data: sl } = await asAny(supabase)
      .from("demand_shortlist")
      .select("status")
      .eq("owner_id", user.id)
      .eq("request_id", requestId)
      .eq("worker_id", workerId)
      .maybeSingle();
    shortlisted = isShortlistedForContact(sl?.status ?? null);
  } catch (e) {
    if ((e as { code?: string })?.code === RELATION_NOT_FOUND) {
      return { ok: false, reason: "needs_migration" };
    }
  }

  // 3) Worker contactable — resolve availability + the messaging identity
  //    (profile_id) server-side ONLY. profile_id never leaves this function.
  const { data: worker } = await asAny(supabase)
    .from("workers")
    .select("profile_id, availability_status, available_from")
    .eq("id", workerId)
    .maybeSingle();
  const canContact = canStartCommunicationOrBooking({
    availabilityStatus: worker?.availability_status ?? null,
    availableFrom: worker?.available_from ?? null,
  });

  const decision = evaluateCommunicationRequest({ ownsDemand, shortlisted, canContact });
  if (decision !== "allowed") return { ok: false, reason: decision };

  const workerProfileId = worker?.profile_id as string | null;
  if (!workerProfileId) return { ok: false, reason: "worker_unavailable" };

  // Neutral subject from the demand title — no PII, no fabricated content.
  // The §8.1 permission grant is the just-verified Step 4A gate (owner +
  // shortlisted + contactable) — passed explicitly as the permission state.
  const subject = (demand?.title as string | null)?.slice(0, 120) ?? null;
  // Source relation v1: stamp the just-verified demand row as this thread's
  // typed source (type 'scouting' — this caller's own exact type, no other).
  // Passed only AFTER the Step 4A gate held above.
  const result = await getOrCreateDirectConversation(
    workerProfileId,
    locale,
    subject,
    "allowed_scouting_shortlist",
    { type: "scouting", id: requestId },
  );
  if (!result.ok) return { ok: false, reason: "error" };
  return { ok: true, conversationId: result.data.id };
}
