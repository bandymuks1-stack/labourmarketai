import { cn } from "@/lib/utils";

/**
 * The record-state language, shared by every public product moment.
 * Meaning is carried by SHAPE + WORD, never by colour alone:
 *   own        ring              — the person's own record (no review yet)
 *   waiting    dashed ring       — waiting for a manager's review
 *   confirmed  filled + check    — a manager confirmed it
 *   unknown    dotted ring       — not recorded yet (UNKNOWN is not zero)
 * The labels are the product's real states, mapped in
 * docs/public/PUBLIC_SLICE_TRUTH_TABLE_2026-10-02.md.
 */
export type RecordState = "own" | "waiting" | "confirmed" | "unknown";

export function StateMark({
  state,
  label,
  className,
}: {
  state: RecordState;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-support",
        state === "confirmed" ? "text-brand-blue" : "text-text-secondary",
        state === "unknown" && "italic text-text-muted",
        className,
      )}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
        {state === "confirmed" ? (
          <>
            <circle cx="7" cy="7" r="7" fill="currentColor" />
            <path d="M4 7.2l2 2L10 5" fill="none" stroke="rgb(var(--c-ink-900))" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </>
        ) : (
          <circle
            cx="7"
            cy="7"
            r="6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeDasharray={state === "waiting" ? "3 2.4" : state === "unknown" ? "1 2.6" : undefined}
            strokeLinecap="round"
          />
        )}
      </svg>
      {label}
    </span>
  );
}
