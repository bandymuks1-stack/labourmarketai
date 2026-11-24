"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ChatMessageView, TypingIndicator, type MessageHandlers } from "./messages";
import type { ChatMessage } from "./types";

/** A thread item is either a data message or a live-embedded real component
 *  (e.g. the real CV flow / inline form / booking action rendered in-stream). */
export type ThreadItem =
  | { id: string; message: ChatMessage }
  | { id: string; embed: ReactNode; history?: true };

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
  introWide = false,
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
  /** The intro is a full working home (the worker's four regions), not a
   *  chat-width block: it renders in its own wider container above the
   *  conversation column, so a desktop screen uses its width (owner D1
   *  review 2026-10-14). The conversation column itself keeps its width. */
  introWide?: boolean;
  /** The chat composer, handed in by the shell. While the conversation is
   *  still OPENING (greeting + brief only) it renders HERE, centred right
   *  under the greeting (owner audit §4.1 — "composer centre pirmo atidarymo
   *  metu"); after the first real turn the shell renders it at the sticky
   *  bottom instead. */
  composer?: ReactNode;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  /** Nothing has happened yet IN THIS VISIT — the screen holds only the
   *  assistant's opening (greeting, and possibly the real state brief). One
   *  user turn or one embedded flow ends the opening state. The COLLAPSED
   *  earlier-conversation block does not: a returning worker who once wrote
   *  in the chat must still open on their home (ŠIANDIEN), not lose it for
   *  good (prod walk 2026-10-15: every returning worker saw no home). */
  const fresh = items.filter((it) => !("history" in it && it.history));
  const isOpening =
    !typing &&
    fresh.length <= 3 &&
    fresh.every((it) => "message" in it && it.message.role === "assistant");

  /** The opening composition reads TOP-DOWN when the composer is not inside
   *  it (an opening context such as ŠIANDIEN hands the composer to the
   *  sticky bar, which is on screen regardless). Scrolling to the end there
   *  lands the person BELOW the opening context: with ŠIANDIEN above the
   *  greeting the composition is taller than the scroller on a phone
   *  (measured past 1300px at 375x812), so the jump — on mount, and again
   *  when the brief lands — hid ŠIANDIEN's header and its one next action.
   *  Openings that carry their composer inline keep scrolling to it. */
  const holdOpeningTop = isOpening && !composer;

  /** A WIDE intro (ŠIANDIEN — a full working home) sits above the opening
   *  column. The column is centred ONLY when no such home is above it: under
   *  the home the greeting simply follows it, top-down. Centred there, every
   *  late arrival re-centred it — the opening brief landing under the
   *  greeting, the collapsed history block above it, a region of the home
   *  growing — and each moved the greeting by half its height (home CLS P0,
   *  2026-10-26). Without a wide intro the centred first screen is exactly
   *  as it was (owner audit §4.1, composer in the centre). */
  const wideIntroAbove = Boolean(intro && introWide);

  useEffect(() => {
    if (holdOpeningTop) return;
    // WCAG 2.3.3: a motion-sensitive person gets an instant jump, not a
    // smooth glide, on every new turn.
    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    endRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "end",
    });
  }, [items.length, typing, holdOpeningTop]);

  return (
    <div
      // No `justify-center` here — MEASURED at 375x640 with the S2 intro: the
      // opening composition (956px in a 520px scroller) had offsetTop -153 and
      // scrollHeight 738 < content, so its top 112px were unreachable by any
      // scroll. `justify-content: center` on a scroll container positions
      // overflow ABOVE the scrollable region; the inner block's `my-auto`
      // (below) centres the same composition when it fits and collapses to 0
      // when it does not, which is the only safe way to centre in a scroller.
      className="flex flex-1 flex-col overflow-y-auto"
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
      {isOpening && intro && introWide ? (
        <div className="mx-auto w-full max-w-6xl flex-none px-4 pt-6 lg:px-8" data-testid="conversation-intro-wide">
          {intro}
        </div>
      ) : null}
      <div
        // Named for the layout-shift probe (ux-metrics `cls_top`): without an
        // id of its own, a shift of this column was attributed to the whole
        // `conversation-thread` scroller.
        data-testid="conversation-column"
        className={`mx-auto flex w-full max-w-3xl flex-none flex-col px-4 py-6 ${
          !wideIntroAbove && isOpening ? "my-auto" : ""
        }`}
      >
        {isOpening && intro && !introWide ? <div className="mb-5">{intro}</div> : null}
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
