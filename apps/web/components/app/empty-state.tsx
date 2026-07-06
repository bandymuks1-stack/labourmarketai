import { Link } from "@/lib/i18n/navigation";

/**
 * Shared first-use / empty-state block (slice first-use-empty-states-v1).
 * Turns a bare "nothing here" line into an honest, scannable answer:
 *   title  → what this empty surface is
 *   why    → one sentence on why it's empty (not an error, just no data yet)
 *   next   → one sentence on what happens after the action (optional)
 *   cta    → ONE real action (optional). A primary (gradient) or secondary
 *            (bordered) link. Internal routes go through next-intl <Link>; a
 *            same-page anchor (#section) uses a plain <a>. Never a dead "#" or
 *            an inert control — callers omit the CTA when no real route exists.
 *
 * Pure presentation: the caller passes already-translated copy, so this stays
 * usable in any server component. No fake AI / matching / verification copy.
 */
export function EmptyState({
  title,
  why,
  next,
  cta,
  testId = "empty-state",
}: {
  title: string;
  /** Optional since audit PR8: a single-sentence empty state passes just the
   *  title — the component still gives it the shared visual treatment. */
  why?: string;
  next?: string;
  cta?: { label: string; href: string; variant?: "primary" | "secondary" };
  testId?: string;
}) {
  // min-h-11 = 44px touch targets (audit PR8).
  const PRIMARY =
    "mt-1 inline-flex min-h-11 w-fit items-center gap-2 rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-4 text-sm font-semibold text-ink-900 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue";
  const SECONDARY =
    "mt-1 inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md border border-ink-500 px-3 text-xs font-semibold text-text-primary transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue";
  const cls = cta?.variant === "secondary" ? SECONDARY : PRIMARY;
  const isInternalRoute = !!cta && cta.href.startsWith("/");

  return (
    <div
      data-testid={testId}
      className="card-border flex flex-col items-start gap-2 p-6"
    >
      <h3 className="font-display text-base font-semibold text-text-primary">
        {title}
      </h3>
      {why ? (
        <p className="max-w-prose text-sm leading-relaxed text-text-secondary">
          {why}
        </p>
      ) : null}
      {next ? (
        <p className="max-w-prose text-[13px] leading-relaxed text-text-muted">
          {next}
        </p>
      ) : null}
      {cta ? (
        isInternalRoute ? (
          <Link href={cta.href as "/dashboard"} className={cls} data-testid={`${testId}-cta`}>
            {cta.label} →
          </Link>
        ) : (
          <a href={cta.href} className={cls} data-testid={`${testId}-cta`}>
            {cta.label} →
          </a>
        )
      ) : null}
    </div>
  );
}
