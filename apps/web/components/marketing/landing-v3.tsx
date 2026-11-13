import type { ReactNode } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";

import { LandingRequestDoors } from "@/components/marketing/landing-request-doors";
import { Link } from "@/lib/i18n/navigation";
import type { LandingV3Copy } from "@/lib/marketing/landing-v3-copy";

/**
 * LANDING V3 — PREVIEW (prototype, branch `evidence/landing-v3-preview`).
 * Three short blocks that replace seven sections of the live landing. See
 * `docs/audits/evidence/landing-v3/OUTLINE.md`.
 */

const NEED_FOLD_SCRIPT =
  '(function(){try{var d=document.getElementById("request");if(d&&window.matchMedia("(max-width: 1023px)").matches)d.removeAttribute("open")}catch(e){}})()';

/** ONE "submit a need" path. The three request services keep their own
 *  forms, rules and routes; they are the step behind this one entry. */
export function LandingNeedPath({ locale, copy }: { locale: string; copy: LandingV3Copy }) {
  return (
    <>
    {/* Sent open: on a wide screen the three services are visible with no
        tap (owner, 2026-11-13). The line after it folds it on a narrow
        screen before first paint; with no script it simply stays open. */}
    <details
      id="request"
      data-testid="landing-need-path"
      open
      suppressHydrationWarning
      className="group min-w-0 scroll-mt-24 rounded-2xl border border-ink-600 bg-ink-900/60"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-2xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue sm:p-5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <h2 id="request-doors-title" className="font-display text-lg font-semibold text-text-primary">
            {copy.need.title}
          </h2>
          <span className="mt-1 block text-sm leading-relaxed text-text-secondary">{copy.need.body}</span>
          <span className="mt-1 block text-xs font-medium text-text-muted">{copy.need.free}</span>
        </span>
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-ink-500 text-text-secondary">
          <ChevronDown
            aria-hidden
            className="size-5 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
        </span>
      </summary>
      <div className="px-4 pb-4 sm:px-5 sm:pb-5">
        <LandingRequestDoors locale={locale} embedded />
      </div>
    </details>
    <script dangerouslySetInnerHTML={{ __html: NEED_FOLD_SCRIPT }} />
    </>
  );
}

/** Statistics in ONE place, with their source said plainly: these are
 *  imported adverts, not customers or registered users. */
export function LandingMarketFacts({
  locale,
  copy,
  market,
  adverts,
}: {
  locale: string;
  copy: LandingV3Copy;
  market: { adverts: number; employers: number; refreshedAt: string | null } | null;
  /** Two or three real, current adverts from the canonical reader — or
   *  nothing, and then the block ends with the link to the search. */
  adverts?: ReactNode;
}) {
  const n = new Intl.NumberFormat(locale);
  const date = market?.refreshedAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(market.refreshedAt))
    : "—";
  return (
    <section id="market" aria-labelledby="landing-market-title" className="mt-10 scroll-mt-24" data-testid="landing-market-facts">
      <h2 id="landing-market-title" className="font-display text-xl font-semibold text-text-primary">
        {copy.market.title}
      </h2>
      {market ? (
        <>
          <p className="mt-2 text-base font-medium leading-snug text-text-primary">
            {copy.market.line
              .replace("{adverts}", n.format(market.adverts))
              .replace("{employers}", n.format(market.employers))}
          </p>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-text-secondary">
            {copy.market.source.replace("{date}", date)}
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-text-secondary">{copy.market.none}</p>
      )}
      {adverts ?? (
        <Link
          href="/jobs"
          className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand-blue underline-offset-4 hover:underline"
        >
          {copy.market.link}
          <ArrowRight className="size-3.5 shrink-0" aria-hidden />
        </Link>
      )}
    </section>
  );
}

/** ONE compact explanation — the journal, proof of skill, the assistant's
 *  limits and the chain — with links to the pages that hold the detail. */
export function LandingHow({ copy }: { copy: LandingV3Copy }) {
  return (
    <section id="how-it-works" aria-labelledby="landing-how-title" className="mt-10 scroll-mt-24" data-testid="landing-how">
      <h2 id="landing-how-title" className="font-display text-xl font-semibold text-text-primary">
        {copy.how.title}
      </h2>
      <ol className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        {copy.how.points.map((point, index) => (
          <li key={point.title} className="flex min-w-0 gap-3">
            <span
              aria-hidden
              className="flex size-7 shrink-0 items-center justify-center rounded-full border border-ink-500 font-mono text-xs text-text-secondary"
            >
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-text-primary">{point.title}</span>
              <span className="mt-0.5 block text-sm leading-relaxed text-text-secondary">{point.body}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <Link href="/for-workers" className="inline-flex min-h-11 items-center font-medium text-brand-blue underline-offset-4 hover:underline">
          {copy.how.links.workers}
        </Link>
        <Link href="/for-companies" className="inline-flex min-h-11 items-center font-medium text-brand-blue underline-offset-4 hover:underline">
          {copy.how.links.companies}
        </Link>
        <Link href="/legal/data-access" className="inline-flex min-h-11 items-center font-medium text-brand-blue underline-offset-4 hover:underline">
          {copy.how.links.data}
        </Link>
      </p>
    </section>
  );
}
