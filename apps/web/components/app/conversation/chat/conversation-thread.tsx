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
  composer,
  intro,
}: {
  items: ThreadItem[];
  typing: boolean;
  handlers: MessageHandlers;
  emptyState?: ReactNode;
  /** "Mano erdvė" (S2) — the personal-space block that opens the workspace.
   *  Rendered ONLY while the conversation is still opening, above the
   *  greeting: the first real turn replaces it with the conversation, so it
   *  never becomes a permanent header and needs no dismissed-state to store. */
  intro?: ReactNode;
  /** The chat composer, handed in by the shell. While the conversation is
   *  still OPENING (greeting + brief only) it renders HERE, centred right
   *  under the greeting (owner audit §4.1 — "composer centre pirmo atidarymo
   *  metu"); after the first real turn the shell renders it at the sticky
   *  bottom instead. */
  composer?: ReactNode;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items.length, typing]);

  /** Nothing has happened yet — the screen holds only the assistant's
   *  opening (greeting, and possibly the real state brief). One user turn,
   *  one embedded flow or restored history ends the opening state. */
  const isOpening =
    !typing &&
    items.length <= 3 &&
    items.every((it) => "message" in it && it.message.role === "assistant");

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
      {/* `my-auto` while opening, NOT `justify-center` alone: auto margins
          centre the composition when it fits AND collapse to 0 when it does
          not, so a taller opening (S2 adds the personal block above the
          greeting) stays scrollable from its first line on a short phone.
          `justify-content: center` in a scroll container would have made the
          overflowing top unreachable. */}
      <div
        className={`mx-auto flex w-full max-w-3xl flex-none flex-col px-4 py-6 ${
          isOpening ? "my-auto" : ""
        }`}
      >
        {isOpening && intro ? <div className="mb-5">{intro}</div> : null}
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
        {/* Opening state: the composer sits right under the greeting, in the
            centre of the screen — the conversation IS the front door, not a
            bar glued to the bottom of an empty page (owner audit §4.1). */}
        {isOpening && composer ? (
          <div className="mt-5" data-testid="conversation-opening-composer">
            {composer}
          </div>
        ) : null}
        <div ref={endRef} />
      </div>
    </div>
  );
}
