import { SemanticIcon, type SemanticConcept } from "@/components/app/semantic-icon";
import { cn } from "@/lib/utils";

/**
 * Stat — THE one figure tile (design audit 2026-10-14, D0). Nine local copies
 * (Stat / Figure / MetricTile / Counter / Metric) grew with different type
 * scales, label styles and null handling; screens converge on this one as
 * they are reworked.
 *
 * Honesty rules:
 *   - `value === null` means the read FAILED or is unknown: it renders "—",
 *     never 0 (UNKNOWN is not zero — product vocabulary rule 3).
 *   - a figure is a real persisted count/sum, never a score or a rating.
 *   - the label is sentence case (vocabulary rule 5); mono is for the number
 *     only when `mono` is asked for (ids, stamps).
 */
export function Stat({
  value,
  label,
  concept,
  hint,
  size = "md",
  framed = true,
  testid,
  className,
}: {
  /** Already-formatted figure; null = unknown (renders an em dash). */
  value: string | number | null;
  /** Already-localized label. */
  label: string;
  /** Optional semantic icon (person, object, time, calendar …). */
  concept?: SemanticConcept;
  /** Optional one-line explanation under the label. */
  hint?: string;
  size?: "sm" | "md" | "lg";
  /** Framed tile (default) or a bare figure inside an existing card. */
  framed?: boolean;
  testid?: string;
  className?: string;
}) {
  const shown = value === null ? "—" : String(value);
  return (
    <div
      data-testid={testid}
      data-unknown={value === null ? "true" : undefined}
      className={cn(
        "flex min-w-0 items-center gap-3",
        framed && "rounded-card border border-ink-600 bg-ink-800/40 px-4 py-3",
        className,
      )}
    >
      {concept ? <SemanticIcon concept={concept} label={label} className="h-5 w-5 shrink-0 text-brand-cyan" /> : null}
      <div className="flex min-w-0 flex-col">
        <span
          className={cn(
            "font-display font-bold leading-tight tracking-tightest text-text-primary tabular-nums",
            size === "sm" ? "text-lg" : size === "lg" ? "text-3xl" : "text-xl",
          )}
        >
          {shown}
        </span>
        <span className="text-meta text-text-muted">{label}</span>
        {hint ? <span className="text-meta text-text-muted/80">{hint}</span> : null}
      </div>
    </div>
  );
}
