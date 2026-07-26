"use client";

import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The conversation's ONE action button.
 *
 * The audit found the CTA hierarchy flat: in every card the primary and the
 * secondary differed only by a border tint, so the screen expressed no
 * recommendation and pushed the decision back onto the user — the opposite of
 * consultancy. Stating the three weights once, here, is what stops that
 * drifting again card by card.
 *
 * RULES (guard-pinned in lib/guards/ux-2-0-actions.test.ts):
 *   • at most ONE `primary` per card — it is the only solid fill;
 *   • `secondary` is a ghost: no border, so a cancel can never compete with a
 *     confirm just by having an outline;
 *   • `danger` is text-only in the semantic danger colour — visible, never
 *     dressed up as the recommended path.
 *
 * State is never colour-only:
 *   • `loading` renders a spinner and sets `aria-busy`;
 *   • `disabled` renders no spinner and sets `aria-disabled` + `not-allowed`.
 * So the two are distinguishable without perceiving hue at all.
 *
 * Focus comes from the global `:focus-visible` rule — this component must never
 * set `outline-none`.
 */
export type ChatActionTone = "primary" | "secondary" | "danger";

const TONE: Record<ChatActionTone, string> = {
  // The one solid fill. `shadow-cta-glow` is an existing token.
  primary:
    "bg-brand-blue text-white shadow-cta-glow hover:bg-brand-blue/90 disabled:hover:bg-brand-blue",
  // Ghost: no border at all, so it cannot read as equal weight.
  secondary: "text-text-secondary hover:bg-ink-700 hover:text-text-primary",
  danger: "text-state-danger hover:bg-state-danger/10",
};

export function ChatAction({
  tone = "secondary",
  loading = false,
  disabled = false,
  onClick,
  children,
  testId,
  type = "button",
}: {
  tone?: ChatActionTone;
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
  testId?: string;
  type?: "button" | "submit";
}) {
  const inert = disabled || loading;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={inert}
      aria-busy={loading || undefined}
      aria-disabled={disabled || undefined}
      data-testid={testId}
      data-tone={tone}
      className={`ua-press inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-support font-semibold transition-colors disabled:opacity-50 ${
        inert ? "cursor-not-allowed" : ""
      } ${TONE[tone]}`}
    >
      {/* The spinner is a STATE indicator, not decoration, so it survives
          reduced motion as a static glyph rather than disappearing. */}
      {loading && (
        <Loader2
          className="size-4 flex-none animate-spin motion-reduce:animate-none"
          aria-hidden
        />
      )}
      {children}
    </button>
  );
}

/** A row of actions. Keeps spacing and wrapping identical everywhere, and gives
 *  the guard one place to count how many `primary` tones a card renders. */
export function ChatActionRow({ children }: { children: ReactNode }) {
  return <div className="mt-3.5 flex flex-wrap items-center gap-2">{children}</div>;
}
