"use client";

import { MessageCircleQuestion } from "lucide-react";

import { iconControl } from "@/components/app/conversation/chat/icon-scale";

/** The composer's own marker (`components/app/conversation/chat/composer.tsx`).
 *  `lib/guards/home-goals.test.ts` pins that the composer still carries it. */
export const COMPOSER_INPUT_SELECTOR = '[data-testid="composer-input"]';

/**
 * "ASK THE ASSISTANT" — the visible way into the conversation from the top of
 * the home (owner P0 No. 1, step 4, 2026-11-12).
 *
 * The home IS the conversation, and its composer is already on screen at the
 * bottom — but a new person reading the goal cards does not know the box
 * under them takes any sentence. This entry says so and puts the cursor in
 * that box. It opens nothing new: no second chat, no dialog, no route. It
 * moves focus to the ONE composer, which is also what a keyboard or screen
 * reader user needs from it.
 */
export function AskAssistantEntry({ label, hint }: { label: string; hint: string }) {
  return (
    <button
      type="button"
      data-testid="home-ask-assistant"
      onClick={() => {
        const input = document.querySelector<HTMLTextAreaElement>(COMPOSER_INPUT_SELECTOR);
        if (!input) return;
        const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        input.scrollIntoView({ block: "nearest", behavior: calm ? "auto" : "smooth" });
        input.focus({ preventScroll: true });
      }}
      className="ua-press mt-2 flex min-h-14 w-full items-center gap-2.5 rounded-xl border border-dashed border-ink-500 bg-ink-800/60 p-3 text-left outline-none transition-colors duration-150 hover:border-brand-blue focus-visible:ring-2 focus-visible:ring-brand-blue motion-reduce:transition-none sm:mt-3 sm:gap-3 sm:p-3.5"
    >
      <span className="flex size-9 flex-none items-center justify-center rounded-lg bg-ink-700/70 text-text-secondary sm:size-10">
        <MessageCircleQuestion {...iconControl()} aria-hidden />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-support font-semibold leading-snug text-text-primary sm:text-body">{label}</span>
        <span className="text-support leading-snug text-text-secondary">{hint}</span>
      </span>
    </button>
  );
}
