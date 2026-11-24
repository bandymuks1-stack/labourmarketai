"use server";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { getOrCreateDirectConversation } from "@/lib/communication/direct-conversation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

/**
 * Open (or reopen) the company↔worker conversation for an ACCEPTED booking —
 * booking lifecycle v1's missing next step (root-cause audit flow #6:
 * "after accept there is no calendar entry, journal link, or CTA. Accepted
 * is a terminal dead-end").
 *
 * §8.1 discipline, the exact twin of the accepted-service-request action:
 * the granting fact is verified SERVER-SIDE here — the caller must be the
 * proposing company (owner) or the booked worker of the booking row (RLS
 * also enforces this on the read) and the status must be `accepted` (the
 * booking loop's one real mutual commitment). Only then is the explicit
 * `allowed_accepted_booking` grant passed to getOrCreateDirectConversation.
 * No counterpart profile id ever reaches the client — booking rows keep
 * exposing dates/notes only.
 *
 * Failure never bounces silently: it lands on the messages list with the
 * existing honest `?notice=cannot_open` restricted state.
 */
export async function openBookingConversationAction(
  formData: FormData,
): Promise<void> {
  const bookingId = String(formData.get("bookingId") ?? "");
  const locale = String(formData.get("locale") ?? "lt");
  const cannotOpen = `/${locale}/dashboard/communication?notice=cannot_open`;

  if (!bookingId) redirect(cannotOpen);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(cannotOpen);

  const { data: row } = await asAny(supabase)
    .from("booking_requests")
    .select("owner_id, status, role_text, workers(profile_id)")
    .eq("id", bookingId)
    .maybeSingle();

  const booking = row as {
    owner_id: string;
    status: string;
    role_text: string | null;
    workers: { profile_id: string | null } | null;
  } | null;

  if (!booking || booking.status !== "accepted") redirect(cannotOpen);
  const workerProfileId = booking!.workers?.profile_id ?? null;
  const counterpart =
    user!.id === booking!.owner_id
      ? workerProfileId
      : user!.id === workerProfileId
        ? booking!.owner_id
        : null;
  if (!counterpart) redirect(cannotOpen);

  const subject = booking!.role_text?.slice(0, 120) ?? null;
  // Source relation v1: stamp the just-verified ACCEPTED booking row as this
  // thread's typed source (type 'accepted_booking' — this caller's own exact
  // type, no other). Passed only AFTER the gate above held.
  const result = await getOrCreateDirectConversation(
    counterpart,
    locale,
    subject,
    "allowed_accepted_booking",
    { type: "accepted_booking", id: bookingId },
  );
  if (!result.ok) redirect(cannotOpen);
  redirect(`/${locale}/dashboard/communication/${result.data.id}`);
}
