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
 * Turn-pair rhythm.
 *
 * A uniform `gap-4` between every item made the thread read as alternating
 * table rows: a question and its answer sat exactly as far apart as two
 * unrelated exchanges. A USER turn starts a new pair, so it takes the large
 * gap; whatever the assistant says in response stays tight to it. That one rule
 * is what turns a list into visible turn-taking.
 */
function spacingFor(item: ThreadItem, index: number): string {
  if (index === 0) return "";
  const startsNewPair = "message" in item && item.message.role === "user";
  return startsNewPair ? "mt-7" : "mt-1.5";
}

/**
 * The scrolling message stream. Auto-scrolls to the newest message; the
 * composer lives outside (below) so it stays fixed while this scrolls.
 *
 * While the thread holds nothing but the greeting, the block is centred in the
 * viewport rather than pinned to the top: unclaimed space reads as an
 * unfinished page, whereas space around a deliberately centred composition
 * reads as calm. The first real turn switches it to the normal top-anchored
 * stream — a plain alignment change, so there is nothing for
 * `prefers-reduced-motion` to suppress, and the arriving turn brings its own
 * entry motion.
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

  /** Nothing has happened yet — only the opening turn is on screen. */
  const isOpening =
    !typing &&
    items.length === 1 &&
    "message" in items[0] &&
    items[0].message.kind === "greeting";

  return (
    <div
      className={`flex flex-1 flex-col overflow-y-auto ${isOpening ? "justify-center" : ""}`}
      // A conversation is a log: `role="log"` makes assistive tech announce
      // arriving turns instead of leaving the user to discover them.
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      data-testid="conversation-thread"
      data-opening={isOpening ? "true" : undefined}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-none flex-col px-4 py-6">
        {items.length === 0 && emptyState}
        {/* `ua-msg-in` animates ONLY transform + opacity, and a CSS animation
            runs on mount — so a newly appended turn rises into place while the
            turns above it keep their exact position (no layout shift, nothing
            re-animates on re-render because React reuses those DOM nodes). */}
        {items.map((it, i) => (
          <div key={it.id} className={`ua-msg-in ${spacingFor(it, i)}`}>
            {"embed" in it ? (
              it.embed
            ) : (
              <ChatMessageView
                m={it.message}
                h={handlers}
                // OLD ACTIONS COLLAPSE (owner ruling 2026-07-29, W2): chip
                // rows render only on the NEWEST message. Answers higher up
                // keep their text — their buttons stop competing for
                // attention, so the thread never accumulates a button wall.
                isLast={i === items.length - 1}
              />
            )}
          </div>
        ))}
        {typing && (
          <div className="mt-1.5">
            <TypingIndicator />
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
