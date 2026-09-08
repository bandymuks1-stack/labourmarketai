"use server";

import "server-only";

/**
 * The durable-notification actions a CLIENT surface may call.
 *
 * Two writes are exposed: "mark all mine read" and "mark ONE of mine read"
 * (completion v1 — the per-row persist the client-only `markAsRead` lacked).
 * Both run with the caller's OWN client — RLS plus the column-level grant
 * mean the request can only ever stamp the caller's own read_at markers,
 * whatever a crafted client sends. While the owner-gated store is unapplied
 * both are honest no-ops (`feature_unavailable`), so the controls degrade to
 * exactly the client-state-only behaviour the product had before.
 */
import { createClient } from "@/lib/supabase/server";
import {
  markAllNotificationEventsRead,
  markNotificationEventRead,
  type MarkReadOutcome,
} from "./events";

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function markAllNotificationEventsReadAction(): Promise<MarkReadOutcome> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "unexpected_error", code: "not_authenticated" };
  return markAllNotificationEventsRead(supabase, new Date().toISOString());
}

export async function markNotificationEventReadAction(
  eventId: string,
): Promise<MarkReadOutcome> {
  // Shape check only — authority is RLS (a well-formed id the caller does
  // not own matches zero rows). Derived-signal ids ("pending-invitations")
  // are refused here rather than sent to the database.
  if (typeof eventId !== "string" || !UUID_SHAPE.test(eventId)) {
    return { kind: "unexpected_error", code: "invalid_id" };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "unexpected_error", code: "not_authenticated" };
  return markNotificationEventRead(supabase, eventId, new Date().toISOString());
}
