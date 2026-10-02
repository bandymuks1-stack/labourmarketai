import { NextIntlClientProvider } from "next-intl";
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";
import { AmbientGlow } from "@/components/decor/ambient-glow";
import { MarketingFunnelBeacon } from "@/components/app/marketing-funnel-beacon";
import { SiteFooter } from "@/components/layouts/site-footer";
import { SiteNav } from "@/components/layouts/site-nav";
import { PublicEntry } from "@/components/marketing/public-entry";
import { MarketProofBand } from "@/components/marketing/market-proof-band";
import { PlayerCardShowcase } from "@/components/marketing/player-card-showcase";
import { ProductChainBand } from "@/components/marketing/product-chain-band";
import { HomeSides } from "@/components/marketing/public/home-sides";
import { HomeWorldHero } from "@/components/marketing/public/world-heroes";
import { CinematicStorySection } from "@/components/marketing/public/cinematic-story-section";
import { TrustBand } from "@/components/marketing/trust-band";
import { StartingContextsBand } from "@/components/marketing/starting-contexts-band";
import { LandingClosingBand } from "@/components/marketing/landing-primary-actions";
import { LandingOpenJobsBand } from "@/components/marketing/landing-open-jobs-band";
import {
  MARKETING_CLIENT_MESSAGE_ROOTS,
  pickMessages,
} from "@/lib/i18n/client-messages";
import { readLiveMarketLandingSnapshot } from "@/lib/market/live-market-landing";
import { resolveActiveLocale } from "@/lib/seo/metadata";

/**
 * THE LANDING — one world of work (owner directive 2026-10-02, CURRENT x Q).
 *
 * First screen: a real professional in a real working context, with the
 * relationships around him (person, team, project, work, record, history)
 * embedded in the scene (<HomeWorldHero>). Then the working sentence entry, the
 * signature transition (one shift becomes professional history while the
 * company gains context), the two doors, and the real market below.
 *
 * 2026-10-02 (owner, premium design programme): the signature transition became
 * the CINEMATIC STORY (components/marketing/public/cinematic-story.tsx) — one
 * continuous scroll-driven story over one persistent set of entities (person,
 * company, team, work -> record -> history -> next) instead of a replayed strip.
 *
 * Supersedes the living-worker carousel hero, the entry journey story and the
 * six-step two-sides strip as the FIRST impression; those components still
 * exist and are unchanged (living-worker-hero, landing-journey, two-sides-*).
 * Same chrome as before: skip link, <AmbientGlow>, <MarketingFunnelBeacon>,
 * <SiteNav>, <main id="main-content">, <SiteFooter>, marketing message pick.
 * The market map band stays withdrawn (owner decision 2026-09-27).
 * provenance: 7179882 — the pre-#1221 landing, since moved only by named owner
 * decisions (the latest: the world-of-work hero, 2026-10-02).
 */
export async function FocusLanding({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const activeLocale = resolveActiveLocale(locale);
  const [market, t] = await Promise.all([
    readLiveMarketLandingSnapshot({ resolveProfessions: false }),
    getTranslations("common"),
  ]);

  return (
    <NextIntlClientProvider
      messages={pickMessages(
        await getMessages(),
        MARKETING_CLIENT_MESSAGE_ROOTS,
      )}
    >
      <div className="relative min-h-screen" data-landing-mode="focus">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:border focus:border-brand-blue focus:bg-ink-800 focus:px-4 focus:py-2 focus:font-mono focus:text-xs focus:uppercase focus:tracking-label focus:text-text-primary"
        >
          {t("skipToContent")}
        </a>
        <AmbientGlow />
        <MarketingFunnelBeacon />
        <SiteNav />
        <main id="main-content" className="relative">
          <HomeWorldHero />
          <div className="mx-auto max-w-container px-6 py-14 sm:px-12">
            {/* THE WORKING ENTRY: the visitor's own sentence goes through the ONE
                deterministic router; the page says what it understood. */}
            <section>
              <PublicEntry
                supply={
                  market.activeVacancies !== null && market.distinctEmployers !== null
                    ? {
                        vacancies: market.activeVacancies,
                        employers: market.distinctEmployers,
                        refreshedAt: market.lastRefreshedAt,
                      }
                    : null
                }
              />
            </section>
          </div>

          {/* THE CINEMATIC STORY: full-bleed, one stage, one set of entities. The
              camera, focus and relationships change as the page scrolls; the
              scenes run from a person to a company and back to the next chapter. */}
          <div>
            <CinematicStorySection audience="home" />
          </div>

          <div className="mx-auto max-w-container px-6 pb-14 sm:px-12">
            <HomeSides />

            <MarketProofBand market={market} locale={locale} />
            <LandingOpenJobsBand sample={market.sample} locale={activeLocale} />
            <StartingContextsBand />
            <div id="how-it-works" className="scroll-mt-24">
              <ProductChainBand />
            </div>
            <PlayerCardShowcase />
            <TrustBand />
            <LandingClosingBand locale={locale} />
          </div>
        </main>
        <SiteFooter />
      </div>
    </NextIntlClientProvider>
  );
}
