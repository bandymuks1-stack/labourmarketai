import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

/**
 * REAL unread state for the signed-in user's conversations (audit PR5).
 *
 * v1 counted only never-opened threads (`last_read_at IS NULL`), so a new
 * reply in a thread the user had opened once was invisible everywhere — the
 * exact "weak unread" gap the root-cause audit flagged. A conversation is now
 * unread when SOMEONE ELSE's message is newer than the caller's
 * `last_read_at` (or the caller never opened a thread that has counterpart
 * messages). The caller's own messages never mark a thread unread.
 *
 * Read shape: one participant read + one bounded counterpart-message read
 * (newest 500 rows across the caller's threads — generous at pilot scale;
 * a busier platform graduates this to a SQL-side aggregate). Defensive: any
 * error returns the empty state — a badge must never crash the shell, and
 * "no badge" is the honest default.
 */
export async function getUnreadConversationIds(): Promise<ReadonlySet<string>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return new Set();

    const { data: participantsRaw, error: pErr } = await asAny(supabase)
      .from("conversation_participants")
      .select("conversation_id, last_read_at")
      .eq("profile_id", user.id);
    if (pErr) return new Set();
    const lastReadByConv = new Map<string, string | null>(
      ((participantsRaw ?? []) as { conversation_id: string; last_read_at: string | null }[]).map(
        (p) => [p.conversation_id, p.last_read_at],
      ),
    );
    if (lastReadByConv.size === 0) return new Set();

    const { data: messagesRaw, error: mErr } = await asAny(supabase)
      .from("conversation_messages")
      .select("conversation_id, author_id, created_at")
      .in("conversation_id", [...lastReadByConv.keys()])
      .neq("author_id", user.id)
      .order("created_at", { ascending: false })
      .limit(500);
    if (mErr) return new Set();

    const unread = new Set<string>();
    for (const m of (messagesRaw ?? []) as {
      conversation_id: string;
      author_id: string;
      created_at: string;
    }[]) {
      if (unread.has(m.conversation_id)) continue;
      const lastRead = lastReadByConv.get(m.conversation_id);
      if (lastRead === undefined) continue;
      if (lastRead === null || Date.parse(m.created_at) > Date.parse(lastRead)) {
        unread.add(m.conversation_id);
      }
    }
    return unread;
  } catch {
    return new Set();
  }
}

/**
 * Count of unread conversations — backs the Žinutės nav badge and the bell.
 * Same real semantics as getUnreadConversationIds (one source, no drift).
 */
export async function getUnreadConversationCount(): Promise<number> {
  return (await getUnreadConversationIds()).size;
}
