"use client";

import { cn } from "@/lib/utils";

/**
 * Minimal print trigger for read-only report previews. Uses the browser's own
 * print dialog — no PDF service, no export backend. Hidden from print output.
 */
/**
 * `tone` exists because `cn()` is a plain string joiner and this repo has no
 * tailwind-merge: a caller passing `text-text-on-brand` alongside the base's
 * `text-text-secondary` leaves BOTH classes on the element, and the winner is
 * decided by Tailwind's stylesheet order, not by the order they were written.
 * That is exactly what happened on the CV — the "Download PDF" trigger painted
 * a gold fill with a warm-grey label at ~1.3:1. Choosing the whole colour set
 * here, instead of layering a conflicting utility on top of it, is the only way
 * to express "this print trigger is a primary action" without a merge library.
 */
const TONE = {
  /** Quiet trigger beside a read-only report preview (the original behaviour). */
  quiet:
    "border-border px-3 py-1 text-xs text-text-secondary hover:bg-surface-muted",
  /** A real primary action — the brand fill with its readable foreground. */
  primary:
    "border-brand-blue bg-brand-blue px-4 py-2 text-sm text-text-on-brand hover:opacity-90",
} as const;

export function PrintButton({
  label,
  className,
  tone = "quiet",
}: {
  label: string;
  className?: string;
  tone?: keyof typeof TONE;
}) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={cn(
        "w-fit rounded-md border font-medium print:hidden",
        TONE[tone],
        className,
      )}
      data-testid="print-button"
    >
      {label}
    </button>
  );
}
