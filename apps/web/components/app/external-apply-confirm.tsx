"use client";

import { useState } from "react";

/**
 * External-apply confirmation step (V8 W4-B item 3, owner decision V8
 * addendum §4). The application for a public-source ad continues on the
 * PUBLISHER'S portal — the person must know that before leaving. First
 * activation reveals an inline confirm block: one sentence, the REAL anchor,
 * and a dismiss control. No network read, no tracking, no state beyond one
 * boolean — the anchor the person finally clicks is an ordinary link with
 * the same href/target/rel the direct control carried before.
 *
 * This component is the ONLY place an external application anchor may render
 * (guard: lib/guards/external-apply-confirm.test.ts) — both the board's card
 * section and the workspace result row mount it.
 */

/** The one URL normalisation both surfaces used — kept identical. */
export function externalApplyHref(rawUrl: string): string {
  return `https://${rawUrl.replace(/^https?:\/\//, "")}`;
}

const TRIGGER_CLASS: Record<"card" | "row", string> = {
  // The board card's original control, unchanged visually.
  card: "inline-flex min-h-11 w-fit items-center rounded-md border border-ink-500 px-3 py-1.5 text-xs text-text-primary transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
  // The workspace row's link look, raised to the 44px touch floor.
  row: "inline-flex min-h-11 w-fit items-center text-meta text-brand-blue underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
};

export function ExternalApplyConfirm({
  url,
  openLabel,
  noticeText,
  continueLabel,
  dismissLabel,
  anchorTestId,
  variant,
}: {
  /** The publisher's application URL as stored (scheme optional). */
  url: string;
  openLabel: string;
  /** The one informing sentence: the application continues on another portal. */
  noticeText: string;
  continueLabel: string;
  dismissLabel: string;
  /** Rides on the REAL anchor — existing test ids keep working. */
  anchorTestId: string;
  variant: "card" | "row";
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={TRIGGER_CLASS[variant]}
        data-testid={`${anchorTestId}-confirm`}
      >
        {openLabel} ↗
      </button>
    );
  }

  return (
    <ExternalApplyConfirmedBlock
      url={url}
      noticeText={noticeText}
      continueLabel={continueLabel}
      dismissLabel={dismissLabel}
      anchorTestId={anchorTestId}
      onDismiss={() => setConfirming(false)}
    />
  );
}

/**
 * The revealed state — exported separately so tests can render the anchor's
 * exact attributes without simulating a click (vitest runs without a DOM).
 */
export function ExternalApplyConfirmedBlock({
  url,
  noticeText,
  continueLabel,
  dismissLabel,
  anchorTestId,
  onDismiss,
}: {
  url: string;
  noticeText: string;
  continueLabel: string;
  dismissLabel: string;
  anchorTestId: string;
  onDismiss?: () => void;
}) {
  return (
    <div
      className="flex w-fit flex-col gap-2 rounded-md border border-ink-500 bg-ink-900/40 p-3"
      data-testid={`${anchorTestId}-confirm-block`}
    >
      <p className="text-meta leading-relaxed text-text-secondary">
        {noticeText}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={externalApplyHref(url)}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="inline-flex min-h-11 w-fit items-center rounded-md border border-brand-blue bg-brand-blue/10 px-3 py-1.5 text-xs font-semibold text-brand-blue transition-colors hover:bg-brand-blue/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
          data-testid={anchorTestId}
        >
          {continueLabel} ↗
        </a>
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex min-h-11 w-fit items-center rounded-md border border-ink-500 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
          data-testid={`${anchorTestId}-dismiss`}
        >
          {dismissLabel}
        </button>
      </div>
    </div>
  );
}
