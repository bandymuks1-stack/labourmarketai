"use client";

/**
 * Minimal print trigger for read-only report previews. Uses the browser's own
 * print dialog — no PDF service, no export backend. Hidden from print output.
 */
export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="w-fit rounded-md border border-border px-3 py-1 text-xs font-medium text-text-secondary hover:bg-surface-muted print:hidden"
      data-testid="print-button"
    >
      {label}
    </button>
  );
}
