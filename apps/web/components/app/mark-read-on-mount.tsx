"use client";

import { useEffect, useRef } from "react";
import { markConversationRead } from "@/lib/communication/actions";

/**
 * Fire-and-forget mark-read pulse when the conversation detail page
 * mounts. Honest semantics — there's no "delivered" / "read" indicator
 * shown to the other party in v1; the timestamp just lets the inbox
 * sort + label unread threads for the participant.
 *
 * The pulse runs once per mount (refs guard against React strict-mode
 * double-effects).
 */
export function MarkReadOnMount({
  conversationId,
  locale,
}: {
  conversationId: string;
  locale: string;
}) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    void markConversationRead({ conversationId, locale });
  }, [conversationId, locale]);
  return null;
}
