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

/** Folds the request block on a narrow screen, before first paint. It is sent
 *  open: on a wide screen the three services are visible with no tap, and
 *  with no script it simply stays open. `lg` (1024px) is where the block
 *  moves beside the sentence field. */
const NEED_FOLD_SCRIPT =
  '(function(){try{var d=document.getElementById("request");if(d&&window.matchMedia("(max-width: 1023px)").matches&&location.hash.indexOf("#request")!==0)d.removeAttribute("open")}catch(e){}})()';

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
        open
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
          <span
            className="col-start-1 mt-1 block text-sm leading-relaxed text-text-secondary"
            data-testid="request-doors-promise"
          >
            {t("promise")}
          </span>
          <span
            className="col-start-1 mt-1 block text-xs leading-relaxed text-text-muted"
            data-testid="request-doors-free"
          >
            {tV3("needFree")}
          </span>
          <span className="col-start-2 row-span-3 row-start-1 inline-flex size-11 shrink-0 items-center justify-center self-center rounded-full border border-ink-500 text-text-secondary">
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
        <>
          <p className="mt-2 text-base font-medium leading-snug text-text-primary" data-testid="landing-market-line">
            {t("market.line", { adverts: n.format(market.adverts), employers: n.format(market.employers) })}
          </p>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-text-secondary" data-testid="landing-market-source">
            {t("market.source", { date })}
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-text-secondary" data-testid="landing-market-none">
          {t("market.none")}
        </p>
      )}
      {adverts ? (
        <div className="mt-5">
          <h3 className="font-display text-base font-semibold text-text-primary">{t("adverts.title")}</h3>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-text-secondary">{t("adverts.sub")}</p>
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
      <ol className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        {(["s1", "s2", "s3", "s4"] as const).map((step, index) => (
          <li key={step} className="flex min-w-0 gap-3">
            <span
              aria-hidden
              className="flex size-7 shrink-0 items-center justify-center rounded-full border border-ink-500 font-mono text-xs text-text-secondary"
            >
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-text-primary">{t(`${step}.title`)}</span>
              <span className="mt-0.5 block text-sm leading-relaxed text-text-secondary">{t(`${step}.body`)}</span>
            </span>
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
