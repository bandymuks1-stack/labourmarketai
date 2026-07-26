"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ChatMessageView, TypingIndicator, type MessageHandlers } from "./messages";
import type { ChatMessage } from "./types";

/** A thread item is either a data message or a live-embedded real component
 *  (e.g. the real CV flow / inline form / booking action rendered in-stream). */
export type ThreadItem =
  | { id: string; message: ChatMessage }
  | { id: string; embed: ReactNode };

/**
 * The scrolling message stream. Auto-scrolls to the newest message; the
 * composer lives outside (below) so it stays fixed while this scrolls.
 */
export function ConversationThread({
  items,
  typing,
  handlers,
  emptyState,
}: {
  items: ThreadItem[];
  typing: boolean;
  handlers: MessageHandlers;
  emptyState?: ReactNode;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items.length, typing]);

  return (
    <div className="flex-1 overflow-y-auto" data-testid="conversation-thread">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
        {items.length === 0 && emptyState}
        {/* `ua-msg-in` animates ONLY transform + opacity, and a CSS animation
            runs on mount — so a newly appended turn rises into place while the
            turns above it keep their exact position (no layout shift, nothing
            re-animates on re-render because React reuses those DOM nodes). */}
        {items.map((it) => (
          <div key={it.id} className="ua-msg-in">
            {"embed" in it ? it.embed : <ChatMessageView m={it.message} h={handlers} />}
          </div>
        ))}
        {typing && <TypingIndicator />}
        <div ref={endRef} />
      </div>
    </div>
  );
}
