import { cn } from "@/lib/utils";

/**
 * THE WORK BAR — how much work stands behind something, in honest layers.
 *
 * The bar's outer length is volume relative to its siblings; inside it the
 * recorded part is cyan and the part a second party stands behind is green.
 * No records is NOT a short bar (UNKNOWN ≠ ZERO): the caller renders the
 * `unknown` state instead. The numbers always also exist as text — the bar
 * never carries a figure alone.
 */
export function WorkBar({
  widthPercent,
  confirmedPercent,
  label,
  className,
}: {
  /** 0–100: this bar's length relative to the longest sibling. */
  readonly widthPercent: number;
  /** 0–100: how much OF the bar a second party stands behind. */
  readonly confirmedPercent: number;
  readonly label?: string;
  readonly className?: string;
}) {
  const w = Math.max(6, Math.min(100, Math.round(widthPercent)));
  const c = Math.max(0, Math.min(100, Math.round(confirmedPercent)));
  return (
    <div
      role="img"
      aria-label={label}
      className={cn("h-2 overflow-hidden rounded-full bg-ink-700", className)}
      style={{ width: `${w}%` }}
      data-testid="work-bar"
    >
      <div className="rhythm-grow-x h-full rounded-full bg-brand-cyan">
        <div className="h-full rounded-full bg-trust-accent" style={{ width: `${c}%` }} />
      </div>
    </div>
  );
}
