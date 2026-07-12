import type { LucideIcon } from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Shared chrome for the four hub blocks so they read as ONE connected premium
 * surface, not four unrelated cards. Presentational, server-rendered (no hooks),
 * tokens only. See premium-hub-screen.tsx for composition.
 */

/** A hub block: the `.card-border` premium panel + a mono eyebrow + optional icon. */
export function HubPanel({
  eyebrow,
  icon: Icon,
  className,
  testid,
  children,
}: {
  eyebrow: string;
  icon?: LucideIcon;
  className?: string;
  testid?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-testid={testid}
      className={cn("card-border flex h-full flex-col gap-4 p-5 sm:p-6", className)}
    >
      <div className="flex items-center gap-2">
        {Icon ? (
          <Icon className="h-4 w-4 text-brand-cyan" strokeWidth={1.75} aria-hidden />
        ) : null}
        <span className="font-mono text-[10px] font-medium uppercase tracking-label text-brand-cyan">
          {eyebrow}
        </span>
      </div>
      {children}
    </section>
  );
}

const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Labelled progress row with an accessible track. `tone` picks the fill accent
 *  (blue→cyan for skills, green for positive completion). Never a trust badge. */
export function HubProgress({
  label,
  value,
  ariaLabel,
  tone = "accent",
}: {
  label: string;
  value: number;
  ariaLabel?: string;
  tone?: "accent" | "success";
}) {
  const pct = clampPct(value);
  const fill =
    tone === "success"
      ? "bg-gradient-to-r from-state-success to-brand-cyan"
      : "bg-gradient-to-r from-brand-blue to-brand-cyan";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-text-secondary">{label}</span>
        <span className="font-mono text-xs font-semibold tabular-nums text-text-primary">
          {pct}%
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-ink-700"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel ?? label}
      >
        <div className={cn("h-full rounded-full", fill)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Honest empty state for a block that has no real data yet: a calm icon +
 *  explanation + one direct next action to the existing surface that fills it.
 *  Never a fake number, never a dead CTA. */
export function HubEmptyState({
  icon: Icon,
  title,
  body,
  ctaLabel,
  href,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  ctaLabel: string;
  href: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-start justify-center gap-3 rounded-xl border border-dashed border-ink-600 bg-ink-800/30 p-5">
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-ink-600 bg-ink-800/60">
        <Icon className="h-5 w-5 text-text-muted" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-display text-sm font-semibold text-text-primary">{title}</p>
        <p className="text-xs leading-relaxed text-text-secondary">{body}</p>
      </div>
      <Link
        href={href as "/dashboard"}
        className="inline-flex min-h-9 w-fit items-center gap-1.5 rounded-md border border-border-subtle bg-surface-1 px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
      >
        {ctaLabel}
        <span aria-hidden className="text-text-muted">
          →
        </span>
      </Link>
    </div>
  );
}

/** Neutral "can't read this right now" state (migration/feature not available).
 *  Honest — never a fake value, never an error dump. */
export function HubUnavailable({ message }: { message: string }) {
  return (
    <div className="flex flex-1 flex-col items-start justify-center gap-2 rounded-xl border border-ink-600 bg-ink-800/30 p-5">
      <p className="text-xs leading-relaxed text-text-muted">{message}</p>
    </div>
  );
}

/** Compact stat box used in the hub blocks.
 *
 *  Interaction contract (user-journey repair v1, dashboard sweep): when the
 *  stat has a real destination, pass `href` (+ `openHint` for the accessible
 *  name) and the WHOLE tile becomes a link — full surface, keyboard, visible
 *  focus ring, hover affordance. Without `href` the tile is a plain,
 *  deliberately affordance-free statistic (no hover, no cursor) so it can
 *  never be mistaken for a button. A zero value keeps its link — the
 *  destination owns the honest empty state + next action. */
export function HubStat({
  value,
  label,
  tone = "default",
  href,
  openHint,
  testid,
}: {
  value: React.ReactNode;
  label: string;
  tone?: "default" | "warning";
  href?: string;
  /** Action affordance appended to the accessible name when `href` is set. */
  openHint?: string;
  testid?: string;
}) {
  const body = (
    <>
      <span
        className={cn(
          "font-display text-2xl font-bold tracking-tightest tabular-nums",
          tone === "warning" ? "text-state-warning" : "text-text-primary",
        )}
      >
        {value}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {label}
      </span>
    </>
  );
  if (href) {
    return (
      <Link
        href={href as "/dashboard"}
        data-testid={testid}
        aria-label={openHint ? `${label} — ${openHint}` : label}
        className="flex flex-col gap-1 rounded-xl border border-ink-600 bg-ink-800/40 p-3 transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
      >
        {body}
      </Link>
    );
  }
  return (
    <div data-testid={testid} className="flex flex-col gap-1 rounded-xl border border-ink-600 bg-ink-800/40 p-3">
      {body}
    </div>
  );
}

/** Full-surface link wrapper for a hub block's identity header (avatar/name)
 *  or preview zone — the header/preview LOOKS like the door to its space, so
 *  it must BE the door (dashboard interactivity sweep). */
export function HubZoneLink({
  href,
  ariaLabel,
  testid,
  className,
  children,
}: {
  href: string;
  ariaLabel: string;
  testid?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href as "/dashboard"}
      aria-label={ariaLabel}
      data-testid={testid}
      className={cn(
        "-m-2 rounded-xl p-2 transition-colors hover:bg-ink-800/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
        className,
      )}
    >
      {children}
    </Link>
  );
}
