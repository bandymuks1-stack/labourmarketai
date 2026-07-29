"use server";

import "server-only";

import { getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { getConversationPreviews } from "@/lib/communication/inbox-preview";
import { getUnreadConversationIds } from "@/lib/communication/unread";
import { readCounterpartIdentities } from "@/lib/communication/contact-permission";
import {
  deriveInboxPriority,
  sortByInboxPriority,
} from "@/lib/communication/inbox-priority";

/**
 * MESSAGES AS A CONVERSATION PROJECTION (owner audit §8.1: "Pokalbis turi
 * galėti parodyti, perskaityti, parengti atsakymą ir išsiųsti po
 * patvirtinimo").
 *
 * The chat can READ the inbox — this composes the SAME reads the messages
 * page uses (conversations under RLS, real unread ids, newest-message
 * previews, permission-gated counterpart names, the pure priority model) and
 * returns the few threads that actually need the person. It writes nothing:
 * sending stays the canonical `sendMessage` action, dispatched only after the
 * person confirms the drafted text in the chat.
 */

/** At most this many threads reach the chat — an answer, not an inbox dump. */
const CHAT_THREAD_LIMIT = 3;

export type ChatInboxThread = {
  readonly conversationId: string;
  /** Who wrote last, as a name the viewer is permitted to see, else null. */
  readonly counterpart: string | null;
  /** The newest message's first line ("" for attachment-only). */
  readonly preview: string;
  readonly waitingHours: number | null;
  readonly overdue: boolean;
};

export type MessagesChatResult =
  | { kind: "threads"; intro: string; threads: readonly ChatInboxThread[] }
  | { kind: "empty"; message: string }
  | { kind: "blocked"; message: string };

export async function loadMessagesForChat(): Promise<MessagesChatResult> {
  const t = await getTranslations("conversation.messages");
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { kind: "blocked", message: t("blocked") };

    const { data: rows, error } = await (
      supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            order: (
              c: string,
              o: { ascending: boolean },
            ) => { limit: (n: number) => Promise<{ data: unknown; error: unknown }> };
          };
        };
      }
    )
      .from("conversations")
      .select("id, updated_at")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) return { kind: "blocked", message: t("blocked") };

    type Row = { id: string; updated_at: string };
    const list = (rows ?? []) as Row[];
    if (list.length === 0) return { kind: "empty", message: t("empty") };

    const ids = list.map((c) => c.id);
    const [unreadIds, previews, names] = await Promise.all([
      getUnreadConversationIds(),
      getConversationPreviews(ids, user.id),
      readCounterpartIdentities(ids),
    ]);

    const nowMs = Date.now();
    const priorityOf = (c: Row) => {
      const p = previews.get(c.id);
      return deriveInboxPriority(
        {
          unread: unreadIds.has(c.id),
          newestByViewer: p?.byViewer ?? false,
          newestAt: p?.createdAt ?? c.updated_at ?? null,
        },
        nowMs,
      );
    };
    // Only the threads that genuinely await this person reach the chat.
    const awaiting = list.filter((c) => priorityOf(c).level === "awaiting_you");
    if (awaiting.length === 0) return { kind: "empty", message: t("noneWaiting") };

    const ordered = sortByInboxPriority(
      awaiting,
      priorityOf,
      (c) => previews.get(c.id)?.createdAt ?? c.updated_at ?? null,
    ).slice(0, CHAT_THREAD_LIMIT);

    const threads: ChatInboxThread[] = ordered.map((c) => {
      const p = priorityOf(c);
      return {
        conversationId: c.id,
        counterpart: names.get(c.id) ?? null,
        preview: previews.get(c.id)?.text ?? "",
        waitingHours: p.waitingHours,
        overdue: p.overdue,
      };
    });

    return {
      kind: "threads",
      intro: t("intro", { count: threads.length }),
      threads,
    };
  } catch {
    return { kind: "blocked", message: t("blocked") };
  }
}
