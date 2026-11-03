import "server-only";

import { cache } from "react";
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
 * a busier platform graduates this to a SQL-side aggregate).
 *
 * TWO READERS, ONE BODY (SEP-7: UNKNOWN ≠ ZERO). `getUnreadConversationIdsResult`
 * tells a FAILED read ("unavailable") from a successful empty one
 * ("ok" with no ids); surfaces that must not render a failure as "nothing
 * unread" (the home's door) use it. `getUnreadConversationIds` keeps its
 * historical, deliberately lossy shape for badges — a badge must never crash
 * the shell, and "no badge" is its honest default — by delegating.
 */
export type UnreadConversationIdsResult =
  | { readonly status: "ok"; readonly ids: ReadonlySet<string> }
  | { readonly status: "unavailable" };

// Request-cached (P0 latency audit): the auth-shell spine and page surfaces
// need this read in the same SSR pass — one query set per request, not two.
export const getUnreadConversationIdsResult = cache(
  async (): Promise<UnreadConversationIdsResult> => {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: "unavailable" };

    const { data: participantsRaw, error: pErr } = await asAny(supabase)
      .from("conversation_participants")
      .select("conversation_id, last_read_at")
      .eq("profile_id", user.id);
    if (pErr) return { status: "unavailable" };
    const lastReadByConv = new Map<string, string | null>(
      ((participantsRaw ?? []) as { conversation_id: string; last_read_at: string | null }[]).map(
        (p) => [p.conversation_id, p.last_read_at],
      ),
    );
    if (lastReadByConv.size === 0) return { status: "ok", ids: new Set() };

    const { data: messagesRaw, error: mErr } = await asAny(supabase)
      .from("conversation_messages")
      .select("conversation_id, author_id, created_at")
      .in("conversation_id", [...lastReadByConv.keys()])
      .neq("author_id", user.id)
      .order("created_at", { ascending: false })
      .limit(500);
    if (mErr) return { status: "unavailable" };

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
    return { status: "ok", ids: unread };
  } catch {
    return { status: "unavailable" };
  }
  },
);

/** The historical shape: any failure reads as the empty state (badges). */
export const getUnreadConversationIds = cache(
  async (): Promise<ReadonlySet<string>> => {
    const result = await getUnreadConversationIdsResult();
    return result.status === "ok" ? result.ids : new Set();
  },
);

/**
 * Count of unread conversations — backs the Žinutės nav badge and the bell.
 * Same real semantics as getUnreadConversationIds (one source, no drift).
 */
export async function getUnreadConversationCount(): Promise<number> {
  return (await getUnreadConversationIds()).size;
}
