import { Check } from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import { buttonLinkClassName } from "@/components/ui/Button";

/**
 * ONE AUDIENCE PAGE — the shared body of every "for …" page (workers,
 * companies, agencies, service providers, education institutions), so the
 * five read as one system (owner P0 2026-11-13).
 *
 * Four parts, always in this order, nothing else above the fold:
 *
 *   1. hero      — a plain eyebrow (the audience's name), ONE h1, one lead
 *                  sentence. Same scale as `PageHero`.
 *   2. today     — "What you can do today": three to six things that WORK
 *                  now, each a short title and one line. Nothing planned,
 *                  nothing "soon" (doctrine: no promise the product does not
 *                  keep). An item may link to the function it names.
 *   3. price     — one line saying what it costs this audience today, worded
 *                  like the pricing page. Never a number the pricing page
 *                  does not show.
 *   4. start     — ONE primary button (the next action for this audience) and
 *                  at most one quiet second link.
 *
 * A page passes already-translated strings; this component reads no catalog,
 * fetches nothing and spells no route of its own. Extra sections (a market
 * list, questions) go AFTER it, as children.
 */
export type AudienceTodayItem = {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  /** Locale-less internal path of the function this item names, if any. */
  readonly href?: string;
};

export function AudiencePage({
  eyebrow,
  title,
  lead,
  todayHeading,
  today,
  priceLabel,
  price,
  start,
  secondary,
  children,
  testId = "audience-page",
}: {
  eyebrow: string;
  title: string;
  lead: string;
  /** "What you can do today", in the page's language. */
  todayHeading: string;
  today: readonly AudienceTodayItem[];
  /** "Price", in the page's language. */
  priceLabel: string;
  price: string;
  start: { readonly label: string; readonly href: string };
  secondary?: { readonly label: string; readonly href: string };
  children?: React.ReactNode;
  testId?: string;
}) {
  return (
    <div data-testid={testId}>
      <section className="relative mx-auto max-w-container px-4 pb-8 pt-8 sm:px-12 sm:pt-10">
        <p className="font-mono text-meta uppercase tracking-label text-text-muted">{eyebrow}</p>
        <h1 className="mt-2 max-w-3xl font-display text-3xl font-bold leading-tight tracking-tightest text-text-primary sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary sm:text-base">
          {lead}
        </p>

        <h2 className="mt-8 font-display text-xl font-bold tracking-tightest text-text-primary sm:text-2xl">
          {todayHeading}
        </h2>
        <ul data-testid="audience-today" className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {today.map((item) => (
            <li
              key={item.id}
              className="flex min-w-0 gap-3 rounded-xl border border-ink-600 bg-ink-800/50 p-4"
            >
              <span
                aria-hidden
                className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-ink-700/70 text-brand-blue"
              >
                <Check className="size-5" />
              </span>
              <span className="min-w-0">
                {item.href ? (
                  <Link
                    href={item.href as "/"}
                    className="text-sm font-semibold text-text-primary underline underline-offset-2 hover:text-brand-blue"
                  >
                    {item.title}
                  </Link>
                ) : (
                  <span className="text-sm font-semibold text-text-primary">{item.title}</span>
                )}
                <span className="mt-0.5 block text-sm leading-snug text-text-secondary">
                  {item.body}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <p data-testid="audience-price" className="mt-6 max-w-2xl text-sm leading-relaxed text-text-secondary">
          <span className="font-semibold text-text-primary">{priceLabel}</span> {price}
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Link
            href={start.href as "/"}
            data-testid="audience-start"
            className={buttonLinkClassName()}
          >
            {start.label}
          </Link>
          {secondary && (
            <Link
              href={secondary.href as "/"}
              className="inline-flex min-h-11 items-center text-sm font-medium text-text-secondary underline underline-offset-2 hover:text-text-primary"
            >
              {secondary.label}
            </Link>
          )}
        </div>
      </section>
      {children}
    </div>
  );
}
