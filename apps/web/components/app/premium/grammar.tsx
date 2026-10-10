import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * THE PREMIUM GRAMMAR — the owner-accepted internal design class (frozen at
 * 4e695e261, branch feat/cc/visual-language-proof), ported as GRAMMAR onto the
 * product's own tokens. Never the proof's fixtures: every value a page shows
 * comes from its canonical reader.
 *
 *   eyebrow → headline with ONE accent word → one-line sub   (the rhythm)
 *   stamp   provenance / state / dates — small tracked mono
 *   mark    solid = a second party stands behind it; hollow = the person's
 *           own record; dashed = declared, nothing shows it yet
 */

export type EvidenceLevel = "confirmed" | "recorded" | "declared";

export function Stamp({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return (
    <span className={cn("font-mono text-[0.72rem] uppercase leading-snug tracking-[0.14em] text-text-muted [font-feature-settings:'tnum']", className)}>
      {children}
    </span>
  );
}

/** Quiet eyebrow — the first line of every region (neutral, not a colour accent). */
export function Eyebrow({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return (
    <span className={cn("font-mono text-[0.7rem] uppercase tracking-[0.14em] text-text-muted", className)}>{children}</span>
  );
}

/**
 * Historical emphasis markup ("Where things *stand*."). The emphasis is no
 * longer rendered as a coloured italic — owner direction 2026-10-09 rejected
 * decorative accent words — so the markers are stripped and the text is plain.
 * Kept as a component so existing call sites and copy keep working.
 */
export function Accented({ text, className }: { readonly text: string; readonly className?: string }) {
  return <span className={className}>{text.replace(/[*]/g, "")}</span>;
}

/** The region head — repeated at every region; that repetition is the rhythm. */
export function RegionHead({
  eyebrow,
  title,
  sub,
  className,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly sub?: string;
  readonly className?: string;
}) {
  return (
    <header className={cn("flex flex-col", className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-2.5 font-display text-[clamp(1.55rem,2.6vw,2.15rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-text-primary">
        <Accented text={title} />
      </h2>
      {sub ? <p className="mt-2.5 max-w-[52ch] text-[0.95rem] leading-snug text-text-muted">{sub}</p> : null}
    </header>
  );
}

/**
 * EXPLAIN — the ONE progressive-disclosure door for basis / provenance /
 * "how this is counted" text (owner 2026-10-10: no text walls; the action and
 * the figure first, the explanation one tap away). Nothing is deleted: the
 * full text stays in the DOM, readable by assistive tech and search, and
 * opens in place. Server-safe (native <details>, no client JS).
 */
export function Explain({
  summary,
  children,
  className,
  testId,
  defaultOpen = false,
}: {
  /** Already localised, short ("How this works"). */
  readonly summary: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly testId?: string;
  /** Open on first render — when something inside asks for a decision. */
  readonly defaultOpen?: boolean;
}) {
  return (
    <details className={cn("group", className)} data-testid={testId} open={defaultOpen || undefined}>
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-meta font-medium text-text-muted hover:text-text-primary [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="inline-block transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none">›</span>
        {summary}
      </summary>
      <div className="mt-1 flex max-w-[62ch] flex-col gap-2 text-meta leading-relaxed text-text-secondary">{children}</div>
    </details>
  );
}

/**
 * REVEAL — a long list shows its first `limit` items; the rest stays one tap
 * away behind "Show all (N)". Same rule everywhere a list can run long, so a
 * screen never becomes a wall of equal blocks. Server-safe; every item stays
 * in the DOM. `count` in the label is the TOTAL.
 */
export function Reveal({
  items,
  limit = 3,
  showAllLabel,
  className,
  listClassName,
  listAs = "div",
  testId,
}: {
  readonly items: readonly ReactNode[];
  readonly limit?: number;
  /** Already localised, e.g. t("common.disclosure.showAll", { count }). */
  readonly showAllLabel: string;
  readonly className?: string;
  readonly listClassName?: string;
  /** "ul" when the items are <li> (keeps list semantics). */
  readonly listAs?: "ul" | "div";
  readonly testId?: string;
}) {
  const List = listAs;
  const head = items.slice(0, limit);
  const rest = items.slice(limit);
  return (
    <div className={cn("flex flex-col", className)} data-testid={testId}>
      <List className={listClassName}>{head}</List>
      {rest.length > 0 ? (
        <details className="group">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-meta font-medium text-text-muted hover:text-text-primary group-open:hidden [&::-webkit-details-marker]:hidden">
            <span aria-hidden>›</span>
            {showAllLabel}
          </summary>
          <List className={listClassName}>{rest}</List>
        </details>
      ) : null}
    </div>
  );
}

/**
 * FOLD — a whole secondary REGION behind one quiet line (owner 2026-10-10:
 * no walls of equal blocks). A page keeps its primary work open and folds its
 * secondary tools here. Give it an `id` and mount `DetailsHashOpener` with
 * the same id so a deep link into the region opens it. Server-safe.
 */
export function Fold({
  id,
  title,
  hint,
  children,
  defaultOpen = false,
  testId,
}: {
  readonly id?: string;
  /** Already localised region title. */
  readonly title: string;
  /** Optional one-line, already localised: what is inside. */
  readonly hint?: string;
  readonly children: ReactNode;
  readonly defaultOpen?: boolean;
  readonly testId?: string;
}) {
  return (
    <details id={id} className="group scroll-mt-20 border-t border-ink-600/70 pt-2" open={defaultOpen || undefined} data-testid={testId}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-col">
          <span className="font-display text-card-title font-semibold text-text-primary">{title}</span>
          {hint ? <span className="text-meta text-text-muted">{hint}</span> : null}
        </span>
        <span aria-hidden className="shrink-0 text-text-muted transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none">›</span>
      </summary>
      <div className="mt-4 flex flex-col gap-6">{children}</div>
    </details>
  );
}

export function LevelMark({ level, className }: { readonly level: EvidenceLevel; readonly className?: string }) {
  return (
    <span
      aria-hidden
      data-level={level}
      className={cn(
        "inline-block h-[7px] w-[7px] shrink-0 rounded-full",
        level === "confirmed" && "bg-text-primary",
        level === "recorded" && "border border-text-primary/70",
        level === "declared" && "border border-dashed border-text-muted",
        className,
      )}
    />
  );
}

/** What stands behind something, as a thin bar — the numbers are always also written as text. */
export function EvidenceBar({
  confirmed,
  recorded,
  width = 72,
  label,
  className,
}: {
  readonly confirmed: number;
  readonly recorded: number;
  readonly width?: number;
  /** Accessible text, already localised (e.g. "12 h confirmed, 40 h recorded"). */
  readonly label: string;
  readonly className?: string;
}) {
  const total = Math.max(confirmed + recorded, 0);
  const scale = Math.max(total, 8);
  const c = total === 0 ? 0 : (confirmed / scale) * 100;
  const r = total === 0 ? 0 : (recorded / scale) * 100;
  return (
    <span
      role="img"
      aria-label={label}
      className={cn("relative inline-block h-[3px] overflow-hidden rounded-full bg-text-primary/10", className)}
      style={{ width }}
    >
      <span className="absolute inset-y-0 left-0 bg-text-primary" style={{ width: `${Math.min(100, c)}%` }} />
      <span
        className="absolute inset-y-0 bg-text-primary/35"
        style={{ left: `${Math.min(100, c)}%`, width: `${Math.min(100 - Math.min(100, c), r)}%` }}
      />
    </span>
  );
}
