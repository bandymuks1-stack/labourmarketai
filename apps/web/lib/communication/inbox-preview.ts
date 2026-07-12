import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

export type ConversationPreview = {
  /** Author of the newest message in the thread. */
  authorId: string;
  /** True when the newest message was written by the viewer. */
  byViewer: boolean;
  /** Trimmed first line of the newest message body ("" = attachment-only). */
  text: string;
  /** True when the newest message is a work instruction. */
  isInstruction: boolean;
  createdAt: string;
};

const PREVIEW_MAX_CHARS = 90;

/**
 * Newest-message preview per conversation — the line that lets a user tell
 * WHAT is new without opening every thread. One bounded RLS-scoped read
 * (newest 300 messages across the listed threads; the list itself is capped
 * at 100 conversations). Only REAL message content is previewed — no
 * placeholder text is ever fabricated for a thread whose newest message is
 * outside the window (those simply render without a preview line).
 * Defensive: any error returns the empty map — the list must render without
 * previews rather than fail.
 */
export async function getConversationPreviews(
  conversationIds: readonly string[],
  viewerId: string,
): Promise<ReadonlyMap<string, ConversationPreview>> {
  if (conversationIds.length === 0) return new Map();
  try {
    const supabase = await createClient();
    const { data, error } = await asAny(supabase)
      .from("conversation_messages")
      .select("conversation_id, author_id, body, is_instruction, created_at")
      .in("conversation_id", [...conversationIds])
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) return new Map();

    const previews = new Map<string, ConversationPreview>();
    for (const m of (data ?? []) as {
      conversation_id: string;
      author_id: string;
      body: string | null;
      is_instruction: boolean | null;
      created_at: string;
    }[]) {
      if (previews.has(m.conversation_id)) continue; // newest wins
      const firstLine = (m.body ?? "").trim().split(/\r?\n/, 1)[0] ?? "";
      previews.set(m.conversation_id, {
        authorId: m.author_id,
        byViewer: m.author_id === viewerId,
        text:
          firstLine.length > PREVIEW_MAX_CHARS
            ? `${firstLine.slice(0, PREVIEW_MAX_CHARS - 1)}…`
            : firstLine,
        isInstruction: m.is_instruction === true,
        createdAt: m.created_at,
      });
    }
    return previews;
  } catch {
    return new Map();
  }
}
