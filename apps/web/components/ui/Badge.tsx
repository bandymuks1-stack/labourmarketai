import { cn } from "@/lib/utils";

/**
 * Badge — the canonical mono/uppercase label chip (visual contract v1).
 * Tones are semantic (what the label MEANS), mapped to token families only, so
 * a theme change happens here once. The original four tones keep their exact
 * classes; the contract adds the shared semantic set.
 *
 * Honesty rules (doctrine §7/§18): a badge states a REAL persisted fact. No
 * rating, no trust score, no "AI verified", no reputation tiers — those names
 * are guard failures (visual-contract-v1.test.ts). For status pills with a
 * filled background see `components/app/status-chip.tsx` — StatusChip is the
 * status pattern; Badge is the quiet meta label.
 */
type Tone =
  | "brand"
  | "live"
  | "warning"
  | "muted"
  | "neutral"
  | "informative"
  | "positive"
  | "critical"
  | "preview"
  | "disputed";

const tones: Record<Tone, string> = {
  brand: "border-brand-blue/40 text-brand-blue",
  live: "border-state-live/40 text-state-live",
  warning: "border-state-warning/40 text-state-warning",
  muted: "border-ink-500 text-text-muted",
  /** No signal — plain informational label. */
  neutral: "border-ink-500 text-text-secondary",
  /** Something worth noticing, not a problem. */
  informative: "border-brand-blue/40 text-brand-blue",
  /** A real positive fact (persisted, not predicted). */
  positive: "border-state-success/40 text-state-success",
  /** A real problem. */
  critical: "border-state-danger/40 text-state-danger",
  /** Not live yet — honest preview/concept marker (doctrine §7). */
  preview: "border-brand-cyan/40 text-brand-cyan",
  /** Contested by a party — shown, never hidden. */
  disputed: "border-state-amber/40 text-state-amber",
};

export function Badge({
  tone = "muted",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-2.5 py-1 font-mono text-meta uppercase tracking-label",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
