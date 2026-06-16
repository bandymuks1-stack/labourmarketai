import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Count the signed-in user's UNREAD conversations.
 *
 * "Unread" here matches the communication list page (page.tsx): a conversation
 * the user participates in but has never opened — their `conversation_participants`
 * row has `last_read_at IS NULL`. Opening the thread stamps `last_read_at`
 * (MarkReadOnMount → actions.ts), so the count clears after the user reads it.
 *
 * This backs the Inbox/Messages nav badge so an incoming request (e.g. a company
 * starting a conversation with a worker) is actually NOTICED — the worker is
 * already a participant and RLS lets them read it, but before this they had no
 * signal that a new thread had arrived.
 *
 * Defensive: any error (missing table/column, RLS, no session) returns 0 — a
 * badge must never crash the whole authenticated shell, and "no badge" is the
 * safe, honest default.
 */
export async function getUnreadConversationCount(): Promise<number> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return 0;

    // count-only (head: true) — no rows transferred, just the number.
    const { count, error } = await (supabase as unknown as {
      from: (t: string) => {
        select: (
          cols: string,
          opts: { count: "exact"; head: true },
        ) => {
          eq: (c: string, v: string) => {
            is: (c: string, v: null) => Promise<{ count: number | null; error: unknown }>;
          };
        };
      };
    })
      .from("conversation_participants")
      .select("conversation_id", { count: "exact", head: true })
      .eq("profile_id", user.id)
      .is("last_read_at", null);

    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}
