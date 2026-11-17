import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

import {
  buildDemandHistory,
  isDemandHistoryEventType,
  type DemandHistory,
  type DemandHistoryBookingEvent,
} from "./demand-history";

/**
 * Loads the facts of one need's history (4.30) through the CALLER'S session:
 *   - customer_requests: created_at, status, closed_outcome (visible to the
 *     creator and, by RLS, to colleagues with access to the need);
 *   - booking_requests: the caller's own proposals for this need
 *     (owner_id = auth.uid() by RLS);
 *   - booking_request_events: the events of those proposals (same
 *     visibility as the parent booking, append-only).
 *
 * No new table, column, policy or RPC. Absent columns or tables degrade to
 * fewer entries; nothing is invented. Profile ids are compared server-side
 * only and never leave this module.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const MAX_BOOKINGS = 200;

export async function loadDemandHistory(requestId: string): Promise<DemandHistory | null> {
  if (!requestId) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  let need: { created_at: string; status: string; closed_outcome?: string | null } | null = null;
  {
    const withOutcome = await asAny(supabase)
      .from("customer_requests")
      .select("created_at, status, closed_outcome")
      .eq("id", requestId)
      .maybeSingle();
    if (!withOutcome.error) need = withOutcome.data;
    else {
      // The lifecycle migration (closed_outcome) is not applied here.
      const plain = await asAny(supabase)
        .from("customer_requests")
        .select("created_at, status")
        .eq("id", requestId)
        .maybeSingle();
      if (!plain.error) need = plain.data;
    }
  }
  if (!need) return null;

  const events: DemandHistoryBookingEvent[] = [];
  try {
    const { data: bookings } = await asAny(supabase)
      .from("booking_requests")
      .select("id, worker_id")
      .eq("owner_id", user.id)
      .eq("request_id", requestId)
      .limit(MAX_BOOKINGS);
    const workerByBooking = new Map<string, string>(
      ((bookings ?? []) as { id: string; worker_id: string }[]).map((b) => [b.id, b.worker_id]),
    );
    if (workerByBooking.size > 0) {
      const { data: rows } = await asAny(supabase)
        .from("booking_request_events")
        .select("booking_request_id, actor_id, event_type, created_at")
        .in("booking_request_id", [...workerByBooking.keys()])
        .order("created_at", { ascending: true });
      for (const r of (rows ?? []) as {
        booking_request_id: string;
        actor_id: string;
        event_type: string;
        created_at: string;
      }[]) {
        const workerId = workerByBooking.get(r.booking_request_id);
        if (!workerId || !isDemandHistoryEventType(r.event_type)) continue;
        events.push({ workerId, type: r.event_type, actorId: r.actor_id, at: r.created_at });
      }
    }
  } catch {
    // The booking tables are not applied here: the history keeps the need's own facts.
  }

  return buildDemandHistory({
    readerId: user.id,
    need: { createdAt: need.created_at, status: need.status, closedOutcome: need.closed_outcome ?? null },
    events,
  });
}
