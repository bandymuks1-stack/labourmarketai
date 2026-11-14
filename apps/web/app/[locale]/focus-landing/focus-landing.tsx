import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";

import { MarketingFunnelBeacon } from "@/components/app/marketing-funnel-beacon";
import { AmbientGlow } from "@/components/decor/ambient-glow";
import { SiteFooter } from "@/components/layouts/site-footer";
import { SiteNav } from "@/components/layouts/site-nav";
import { LandingIntentChoice } from "@/components/marketing/landing-intent-choice";
import { LandingOpenJobsBand } from "@/components/marketing/landing-open-jobs-band";
import { LandingHow, LandingMarketFacts, LandingNeedPath } from "@/components/marketing/landing-v3";
import { PublicEntry } from "@/components/marketing/public-entry";
import { pickLandingMessages } from "@/lib/i18n/client-messages";
import { readLiveMarketLandingSnapshot } from "@/lib/market/live-market-landing";
import { resolveActiveLocale } from "@/lib/seo/metadata";

/**
 * THE LANDING — V3 (owner-approved structure and copy, 2026-11-13).
 *
 * The owner looked at the live V2 page on a phone: eleven screens long, four
 * places asking "who are you", two chains explaining the product, numbers
 * printed twice with two wordings. The instruction: a short, clear,
 * professional start page that first helps the visitor ACT; within five
 * seconds a new visitor understands who it is for, what they can do and how
 * to start, and meets each choice once. So the page is now:
 *
 *   1. THE GOAL CENTRE — the question (the page's h1), one line saying who it
 *      is for and what is free, the six goals (phone: four first, the other
 *      two under "More options"; never a carousel), and, as ALTERNATIVE ways
 *      to say the same need, the sentence field and ONE "Submit a request"
 *      entry that holds the three request services.
 *   2. THE MARKET — the canonical snapshot's two counts in one sentence that
 *      says they are external adverts, not registered clients; then a few
 *      real adverts from the same reader, or the link to the search.
 *   3. HOW IT WORKS — four short steps and three links to the detail.
 *   4. A FOOTER with only the necessary legal links and the unchanged legal
 *      sentence and copyright line.
 *
 * What left the page (the second and third role choices, the two chains, the
 * trust section, the example chips, the numbers inside the sentence box, the
 * decorative strip) and where each destination is still reachable is recorded
 * in `docs/audits/evidence/landing-v3/OUTLINE.md`.
 *
 * Anchors other pages and the header link to are kept: `#goals`, `#find`,
 * `#request`, `#market`, `#how-it-works`.
 *
 * `/{locale}` sits outside the (marketing) route group, so this component
 * carries that layout's chrome itself: the skip link, <AmbientGlow>,
 * <MarketingFunnelBeacon>, <SiteNav>, <main id="main-content"> and the footer.
 */
export async function FocusLanding({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const activeLocale = resolveActiveLocale(locale);
  // The ONE canonical market snapshot, through its 300 s `unstable_cache`
  // entry — one market truth, one freshness window (owner command §9/§12).
  const [market, t, tV3] = await Promise.all([
    // The landing renders the supply counts only; it reads `professions`
    // nowhere, so it does not pay for the per-profession reads.
    readLiveMarketLandingSnapshot({ resolveProfessions: false }),
    getTranslations("common"),
    getTranslations("landing.v3"),
  ]);

  // Exact counts or nothing: a count the canonical reader could not return is
  // omitted, never filled with a constant (owner command §16).
  const marketFacts =
    market.activeVacancies !== null && market.distinctEmployers !== null
      ? {
          adverts: market.activeVacancies,
          employers: market.distinctEmployers,
          refreshedAt: market.lastRefreshedAt,
        }
      : null;
  const hasAdverts = market.sample.basis === "live" && market.sample.vacancies.length > 0;

  return (
    <NextIntlClientProvider messages={pickLandingMessages(await getMessages())}>
      <div className="relative min-h-screen" data-landing-mode="focus">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:border focus:border-brand-blue focus:bg-ink-800 focus:px-4 focus:py-2 focus:font-mono focus:text-xs focus:uppercase focus:tracking-label focus:text-text-primary"
        >
          {t("skipToContent")}
        </a>
        <AmbientGlow />
        <MarketingFunnelBeacon />
        <SiteNav goalsOnPage />
        <main id="main-content" className="relative">
          <div className="mx-auto max-w-container px-4 pb-10 pt-5 sm:px-12 sm:pt-10">
            {/* 1. THE GOAL CENTRE */}
            <section className="flex min-w-0 flex-col gap-4">
              <LandingIntentChoice
                lead={tV3("lead")}
                phoneMore={{ ids: ["partners", "agencies"], label: tV3("moreChoices") }}
              />
              <p
                className="flex items-center gap-3 text-xs font-medium uppercase tracking-label text-text-muted"
                data-testid="landing-or"
              >
                <span aria-hidden className="h-px flex-1 bg-ink-600" />
                {tV3("or")}
                <span aria-hidden className="h-px flex-1 bg-ink-600" />
              </p>
              {/* The two ways to SAY a need sit side by side on a wide screen:
                  in your own words, or through the short form. */}
              <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:items-start">
                <div className="min-w-0 scroll-mt-24" id="find">
                  {/* No example chips and no market counts here: the goals
                      above are the choice, and the counts are printed once,
                      in the market block. */}
                  <PublicEntry examples="none" supply={null} />
                </div>
                <LandingNeedPath locale={locale} />
              </div>
            </section>

            {/* 2. THE MARKET — figures once, then real adverts or the search. */}
            <LandingMarketFacts
              locale={locale}
              market={marketFacts}
              adverts={
                hasAdverts ? (
                  <LandingOpenJobsBand sample={market.sample} locale={activeLocale} compact />
                ) : undefined
              }
            />

            {/* 3. HOW IT WORKS */}
            <LandingHow />
          </div>
        </main>
        <SiteFooter compact />
      </div>
    </NextIntlClientProvider>
  );
}
