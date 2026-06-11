"use client";

import { cn } from "@/lib/utils";

/**
 * Minimal print trigger for read-only report previews. Uses the browser's own
 * print dialog — no PDF service, no export backend. Hidden from print output.
 */
export function PrintButton({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={cn(
        "w-fit rounded-md border border-border px-3 py-1 text-xs font-medium text-text-secondary hover:bg-surface-muted print:hidden",
        className,
      )}
      data-testid="print-button"
    >
      {label}
    </button>
  );
}
