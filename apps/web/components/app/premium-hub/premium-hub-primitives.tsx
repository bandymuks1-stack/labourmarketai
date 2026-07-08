import type { LucideIcon } from "lucide-react";

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

/** Compact stat box used in the company + project blocks. */
export function HubStat({
  value,
  label,
  tone = "default",
}: {
  value: React.ReactNode;
  label: string;
  tone?: "default" | "warning";
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-ink-600 bg-ink-800/40 p-3">
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
    </div>
  );
}
