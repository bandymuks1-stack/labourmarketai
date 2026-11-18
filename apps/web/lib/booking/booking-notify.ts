import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  emitBookingNotification,
  emitEngagementCreatedNotification,
  type BookingNotificationEventType,
  type BookingNotificationFacts,
} from "@/lib/notifications/event-emitters";

/**
 * The ONE place a booking write rings its bells. It lived inside
 * booking-actions.ts ("use server"), where it could not be shared: a second
 * path that proposes a booking (a client accepting an agency's candidate)
 * therefore proposed dates to the worker and told them nothing. Not a server
 * action: plain functions, called by actions with their own session client.
 */

// booking_requests is not in the generated Database type on every branch.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

/**
 * THE FACTS THE BELLS RIDE ON (2026-09-23). Read HERE, under the CALLER's
 * own session, from the row the RPC just wrote: `booking_requests_select`
 * admits exactly the two parties, and every caller of this module is one of
 * them (lib/booking/booking-actions.ts; the client who accepts an agency's
 * candidate, lib/agency/bridge-actions.ts). The emitters used to read this row with the admin client, which
 * holds no grant on `booking_requests` in production, so no booking bell
 * ever rang (event-emitters.ts, SERVICE_ROLE GRANT TRUTH). A row the caller
 * cannot read yields null facts, which the emitter reports as
 * `recipient_unresolved` — never a guess from browser input. Never throws:
 * the domain write already succeeded.
 */
async function bookingNotificationFacts(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<BookingNotificationFacts> {
  try {
    const { data } = await asAny(supabase)
      .from("booking_requests")
      .select("owner_id, worker_id, start_date, location_country")
      .eq("id", bookingId)
      .maybeSingle();
    const row = (data ?? null) as {
      owner_id?: string | null;
      worker_id?: string | null;
      start_date?: string | null;
      location_country?: string | null;
    } | null;
    return {
      bookingId,
      ownerProfileId: row?.owner_id ?? null,
      workerId: row?.worker_id ?? null,
      startDate: row?.start_date ?? null,
      locationCountry: row?.location_country ?? null,
    };
  } catch {
    return { bookingId, ownerProfileId: null, workerId: null, startDate: null, locationCountry: null };
  }
}

/**
 * The durable bells for ONE booking write. AWAITED, not detached: the
 * serverless runtime can freeze the invocation the instant the action
 * returns, killing a `void`-detached insert mid-flight — the mechanism that
 * made the live interest emitter deliver nothing. Neither emitter throws,
 * so awaiting them can never fail the write that already succeeded. One row
 * read serves both bells; `engagementCreated` adds the engagement bell for
 * BOTH parties on a v3/v4 accept that really minted one.
 */
export async function notifyBooking(
  supabase: SupabaseClient,
  bookingId: string,
  eventType: BookingNotificationEventType,
  engagementCreated = false,
): Promise<void> {
  const facts = await bookingNotificationFacts(supabase, bookingId);
  if (engagementCreated) await emitEngagementCreatedNotification(facts);
  await emitBookingNotification(facts, eventType);
}
