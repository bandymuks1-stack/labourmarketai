"use server";

import "server-only";

/**
 * The durable-notification actions a CLIENT surface may call.
 *
 * Exactly one write is exposed: "mark all mine read". It runs with the
 * caller's OWN client — RLS plus the column-level grant mean the request can
 * only ever stamp the caller's own read_at markers, whatever a crafted client
 * sends. While the owner-gated store is unapplied this is an honest no-op
 * (`feature_unavailable`), so the button's behaviour degrades to exactly the
 * client-state-only behaviour the product had before.
 */
import { createClient } from "@/lib/supabase/server";
import {
  markAllNotificationEventsRead,
  type MarkReadOutcome,
} from "./events";

export async function markAllNotificationEventsReadAction(): Promise<MarkReadOutcome> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "unexpected_error", code: "not_authenticated" };
  return markAllNotificationEventsRead(supabase, new Date().toISOString());
}
