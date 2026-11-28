import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { ArrowRight, ChevronDown } from "lucide-react";

import { LandingRequestDoors } from "@/components/marketing/landing-request-doors";
import { Link } from "@/lib/i18n/navigation";

/**
 * LANDING V3 (owner-approved structure and copy, 2026-11-13): three short
 * blocks under the goal centre instead of ten sections.
 *
 *   LandingNeedPath     ONE "submit a request" entry; the three request
 *                       services keep their own forms, rules and routes.
 *   LandingMarketFacts  market figures in ONE place, with their source said
 *                       plainly, and a few real adverts or the search link.
 *   LandingHow          ONE compact explanation with links to the detail.
 */

/** The request block is closed until the visitor asks for it (decisions 0032
 *  and 0034): the first screen shows its title only. A link to `#request`
 *  opens it before first paint. */
const NEED_FOLD_SCRIPT =
  '(function(){try{var d=document.getElementById("request");if(d&&location.hash.indexOf("#request")===0)d.setAttribute("open","")}catch(e){}})()';

export async function LandingNeedPath({ locale }: { locale: string }) {
  const [t, tV3] = await Promise.all([
    getTranslations("landing.requestDoors"),
    getTranslations("landing.v3"),
  ]);
  return (
    <>
      <details
        id="request"
        data-testid="landing-need-path"
        suppressHydrationWarning
        className="group min-w-0 scroll-mt-24 rounded-2xl border border-ink-600 bg-ink-900/60"
      >
        {/* A summary may hold a heading only as its own child, so the title,
            the two lines and the chevron are laid out by a grid rather than
            wrapped in a container. */}
        <summary className="grid min-h-11 cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 rounded-2xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue sm:p-5 [&::-webkit-details-marker]:hidden">
          <h2 id="request-doors-title" className="col-start-1 font-display text-lg font-semibold text-text-primary">
            {t("title")}
          </h2>
          <span className="col-start-2 row-start-1 inline-flex size-11 shrink-0 items-center justify-center self-center rounded-full border border-ink-500 text-text-secondary">
            <ChevronDown
              aria-hidden
              className="size-5 transition-transform group-open:rotate-180 motion-reduce:transition-none"
            />
          </span>
        </summary>
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          {/* What happens to a request, and what it costs: said once, where
              the visitor is about to send one. */}
          <p className="text-sm leading-relaxed text-text-secondary" data-testid="request-doors-promise">
            {t("promise")}
          </p>
          <p className="mb-3 mt-1 text-xs leading-relaxed text-text-muted" data-testid="request-doors-free">
            {tV3("needFree")}
          </p>
          <LandingRequestDoors locale={locale} embedded />
        </div>
      </details>
      <script dangerouslySetInnerHTML={{ __html: NEED_FOLD_SCRIPT }} />
    </>
  );
}

export async function LandingMarketFacts({
  locale,
  market,
  adverts,
}: {
  locale: string;
  /** The canonical snapshot's two counts, or null when it could not answer.
   *  Never a constant, never zero for "unknown". */
  market: { adverts: number; employers: number; refreshedAt: string | null } | null;
  /** A few real, current adverts from the canonical reader — or nothing, and
   *  then the block ends with the link to the search. */
  adverts?: ReactNode;
}) {
  const t = await getTranslations("landing.v3");
  const n = new Intl.NumberFormat(locale);
  const date = market?.refreshedAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(
        new Date(market.refreshedAt),
      )
    : null;
  return (
    <section
      id="market"
      aria-labelledby="landing-market-title"
      className="mt-10 scroll-mt-24"
      data-testid="landing-market-facts"
    >
      <h2 id="landing-market-title" className="font-display text-xl font-semibold text-text-primary">
        {t("market.title")}
      </h2>
      {/* Figures are printed only together with the sentence that says what
          they are (external adverts, not registered customers) and when they
          were refreshed. Without a refresh date there is nothing to vouch
          for them, so the block says the data is unavailable. */}
      {market && date ? (
        // The count is the line; where the figures come from and when they
        // were refreshed opens on a tap (decision 0032) and stays in the
        // document, so the figures are never printed without their source.
        <details className="group mt-2" data-testid="landing-market-provenance">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 text-base font-medium leading-snug text-text-primary" data-testid="landing-market-line">
              {t("market.line", { adverts: n.format(market.adverts), employers: n.format(market.employers) })}
            </span>
            <ChevronDown
              aria-hidden
              className="size-4 shrink-0 text-text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
            />
          </summary>
          <p className="max-w-3xl pb-1 text-sm leading-relaxed text-text-secondary" data-testid="landing-market-source">
            {t("market.source", { date })}
          </p>
        </details>
      ) : (
        <p className="mt-2 text-sm text-text-secondary" data-testid="landing-market-none">
          {t("market.none")}
        </p>
      )}
      {adverts ? (
        <div className="mt-5">
          <h3 className="font-display text-base font-semibold text-text-primary">{t("adverts.title")}</h3>
          {adverts}
        </div>
      ) : (
        <Link
          href="/jobs"
          data-testid="landing-market-search"
          className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand-blue underline-offset-4 hover:underline"
        >
          {t("market.search")}
          <ArrowRight className="size-3.5 shrink-0" aria-hidden />
        </Link>
      )}
    </section>
  );
}

export async function LandingHow() {
  const [t, tNav, tLegal] = await Promise.all([
    getTranslations("landing.v3.how"),
    getTranslations("nav"),
    getTranslations("legal"),
  ]);
  const link =
    "inline-flex min-h-11 items-center font-medium text-brand-blue underline-offset-4 hover:underline";
  return (
    <section
      id="how-it-works"
      aria-labelledby="landing-how-title"
      className="mt-10 scroll-mt-24"
      data-testid="landing-how"
    >
      <h2 id="landing-how-title" className="font-display text-xl font-semibold text-text-primary">
        {t("title")}
      </h2>
      <ol className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-4 lg:items-start">
        {(["s1", "s2", "s3", "s4"] as const).map((step, index) => (
          <li key={step} className="min-w-0">
            {/* The step is its title (decisions 0032 and 0034); its
                explanation opens on a tap and stays in the document. */}
            <details className="group" data-testid={`landing-how-${step}`}>
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue [&::-webkit-details-marker]:hidden">
                <span
                  aria-hidden
                  className="flex size-7 shrink-0 items-center justify-center rounded-full border border-brand-blue/50 font-mono text-xs text-brand-blue"
                >
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold text-text-primary">{t(`${step}.title`)}</span>
                <ChevronDown
                  aria-hidden
                  className="size-4 shrink-0 text-text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
                />
              </summary>
              <p className="pb-2 pl-10 text-sm leading-relaxed text-text-secondary">{t(`${step}.body`)}</p>
            </details>
          </li>
        ))}
      </ol>
      <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <Link href="/for-workers" className={link}>
          {tNav("workers")}
        </Link>
        <Link href="/for-companies" className={link}>
          {tNav("companies")}
        </Link>
        <Link href="/legal/data-access" className={link}>
          {tLegal("dataAccess.title")}
        </Link>
      </p>
    </section>
  );
}
