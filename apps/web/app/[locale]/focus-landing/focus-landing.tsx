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
import { TrustBand } from "@/components/marketing/trust-band";
import { StartingContextsBand } from "@/components/marketing/starting-contexts-band";
import { PublicMarketMapBand } from "@/components/marketing/public-market-map-band";
import { LandingPrimaryActions, LandingClosingBand } from "@/components/marketing/landing-primary-actions";
import { LandingOpenJobsBand } from "@/components/marketing/landing-open-jobs-band";
import {
  MARKETING_CLIENT_MESSAGE_ROOTS,
  pickMessages,
} from "@/lib/i18n/client-messages";
import { readLiveMarketLandingSnapshot } from "@/lib/market/live-market-landing";
import { resolveActiveLocale } from "@/lib/seo/metadata";
import { LandingModeSwitcher } from "./landing-mode-switcher";

/**
 * FOCUS — the previous production landing, RESTORED.
 *
 * This is not a calmer restyling of LIVE and not a new "focused" design. It
 * is the landing labourmarket.ai actually served in production immediately
 * before the living-market surface replaced it, recovered from git rather
 * than rebuilt from a screenshot:
 *
 *   source: apps/web/app/[locale]/(marketing)/page.tsx
 *   provenance: 7179882 — the state of `main` immediately before #1221
 *           (5c78ac5) deleted that file; content last shaped by #1176.
 *
 * `(marketing)/page.tsx` is the only file that has ever served `/{locale}`,
 * and `git log --diff-filter=D` shows 5c78ac5 deleted it, so 7179882 is its
 * final production state by definition rather than by judgement.
 *
 * The composition started as that file's, node for node, and has since been
 * changed only by named owner decisions — P1 (2026-09-05) put <PublicEntry>
 * where the scripted <HeroLiveDemo> scenario played; window 11 (2026-09-07,
 * §§16–20) moved the map and the starting contexts above the product chain;
 * and landing §22 + PUBLIC_LANDING_REAL_JOB_DISCOVERY (2026-09-23) put the
 * VALUE first. The order today:
 *
 *   hero (what / who / why) + one clear next step + <PublicEntry>
 *   → the market in places (+ its proof)
 *   → a few REAL open jobs, from the board itself
 *   → starting contexts → the product chain (#how-it-works)
 *   → the sample Player Card → trust → the closing next step
 *
 * The same wrapper class and the same #how-it-works anchor throughout.
 *
 * ── COMPATIBILITY ONLY — NO MODERNISATION ─────────────────────────────────
 * The original rendered inside the (marketing) route group, whose layout
 * supplied the chrome. `/{locale}` sits outside that group, so this component
 * reproduces that layout directly — same skip link, same <AmbientGlow>, same
 * <MarketingFunnelBeacon>, same <SiteNav>, same <main id="main-content">,
 * same <SiteFooter>, same marketing message pick — rather than visually
 * approximating it. Nothing here is a redesign of the restored landing.
 *
 * The one genuinely new element is <LandingModeSwitcher>: the control that
 * lets a visitor return to LIVE. Without it FOCUS would be a one-way door.
 * It is deliberately floating and self-contained so the historical layout
 * does not have to be edited to make room for it.
 */
export async function FocusLanding({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const activeLocale = resolveActiveLocale(locale);
  // The SAME canonical snapshot LIVE reads, through the SAME 300 s
  // `unstable_cache` entry — one market truth, one freshness window, no
  // FOCUS-only reader (owner command §9/§12).
  const [market, t, tHero] = await Promise.all([
    // FOCUS renders the supply counts only; it reads `professions`
    // nowhere, so it does not pay for the per-profession reads. Same
    // reader, same freshness window, same market numbers as LIVE.
    readLiveMarketLandingSnapshot({ resolveProfessions: false }),
    getTranslations("common"),
    getTranslations("landing.hero"),
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
          {/* ── The restored landing body, verbatim from 7179882 ────────── */}
          <div className="mx-auto max-w-container px-6 py-14 sm:px-12">
            {/* ── VALUE FIRST (owner directive 2026-09-23, landing §22 "fix
                   the story, not CSS"). The h1 says WHAT this is and WHO it
                   is for; the sub says what a person accomplishes here and
                   WHY it is different; the actions say what to do NEXT —
                   before any control asks anything. This supersedes #1609
                   §16, which had made the h1 an instruction for the field
                   below; the field's own label still carries that instruction.

                   Entry: the first screen understands a REAL sentence
                   (frozen design contract 2026-09-05, package P1). The
                   visitor's own words go through the ONE deterministic
                   router, the page says what it understood, and the auth
                   doors carry the sentence. The public numbers are the SAME
                   canonical snapshot the market proof band prints, omitted
                   when the reader cannot answer. */}
            <section className="flex flex-col gap-5">
              <div className="max-w-3xl">
                <h1 className="font-display text-hero font-bold tracking-tightest text-text-primary">
                  {tHero("headline")}
                </h1>
                <p className="mt-3 text-lead text-text-secondary">
                  {tHero("sub")}
                </p>
                <div className="mt-6">
                  <LandingPrimaryActions locale={locale} surface="landing_hero" />
                </div>
              </div>
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

            {/* ── §17 THE MARKET, IN PLACES ─────────────────────────────
                   Second, directly under the entry, because it answers the
                   question a visitor has immediately after "what is this?" —
                   *does it work where I am?* The canonical <MarketMap> draws
                   the markets this product operates in, at real centroids,
                   and says in words what it is NOT showing.

                   The market PROOF renders INSIDE it. That is the §16 move:
                   46k vacancies and 8k employers used to be a section of their
                   own, which made the counts read as the product's definition.
                   As evidence under the map they support the story instead of
                   being it. Nothing was removed — same band, same canonical
                   snapshot, same figures. ─────────────────────────────── */}
            <PublicMarketMapBand>
              <MarketProofBand market={market} locale={locale} />
            </PublicMarketMapBand>

            {/* ── REAL OPPORTUNITIES (owner directive 2026-09-23,
                   PUBLIC_LANDING_REAL_JOB_DISCOVERY). Right after the market
                   says it exists, a few of its real, current vacancies —
                   the board's own first page through the board's own card,
                   read once by the SAME snapshot reader above. Omitted when
                   that read could not answer; never a placeholder. ───────── */}
            <LandingOpenJobsBand sample={market.sample} locale={activeLocale} />

            {/* ── §20 STARTING CONTEXTS ─────────────────────────────────
                   Moved UP, from the very bottom of a 4,967px page to the
                   third screen. A visitor who does not want to type a sentence
                   had to scroll past everything to find a door; §19 asks how
                   long it takes before someone understands how to start, and
                   the honest answer was "too long". Same five real
                   destinations, reframed as contexts (§20). ────────────── */}
            <StartingContextsBand />

            {/* ── The product chain — six links, journal as pivot. Carries
                   the #how-it-works nav anchor.

                   Now BELOW the map and the doors (§19). All six steps and all
                   six bodies are intact — this is a change of order, not of
                   content: the chain explains the product to someone who has
                   decided to care, and it was standing between the entry and
                   the reason to use it. ─────────────────────────────────── */}
            <div id="how-it-works" className="scroll-mt-24">
              <ProductChainBand />
            </div>

            {/* ── Player Card: the real card, the real component (§19 — kept
                   in full, moved down). It is the densest thing on the page and
                   it belongs after the explanation it illustrates, not before
                   it. ─────────────────────────────────────────────────── */}
            <PlayerCardShowcase />

            {/* ── Trust & security — verifiable claims only ─────────────── */}
            <TrustBand />

            {/* ── The page ends on what to do next, not on a claim ──────── */}
            <LandingClosingBand locale={locale} />
          </div>
        </main>
        <SiteFooter />
        <LandingModeSwitcher />
      </div>
    </NextIntlClientProvider>
  );
}
