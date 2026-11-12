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
import { ProductChainBand } from "@/components/marketing/product-chain-band";
import { TwoSidesSection } from "@/components/marketing/two-sides-section";
import { TrustBand } from "@/components/marketing/trust-band";
import { StartingContextsBand } from "@/components/marketing/starting-contexts-band";
/* `PublicMarketMapBand` is deliberately NOT imported: the band is withdrawn
   from the landing (owner decision 2026-09-27, reasoning at the render site).
   The component file and the map capability are untouched. */
import { LandingClosingBand } from "@/components/marketing/landing-primary-actions";
import { LandingOpenJobsBand } from "@/components/marketing/landing-open-jobs-band";
import { pickLandingMessages } from "@/lib/i18n/client-messages";
import { readLiveMarketLandingSnapshot } from "@/lib/market/live-market-landing";
import { resolveActiveLocale } from "@/lib/seo/metadata";
import { LandingIntentChoice } from "@/components/marketing/landing-intent-choice";
import { LandingRequestDoors } from "@/components/marketing/landing-request-doors";

/**
 * FOCUS — the previous production landing, RESTORED.
 *
 * This is not a restyling and not a new "focused" design. It
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
 * ONE LANDING (owner decision 2026-09-30). The optional LIVE arm — the
 * living-market scene, its LIVE / FOCUS switcher and the middleware rewrite
 * behind it — is removed until real demand, supply, availability, mobility
 * and project signals can carry a living market honestly. The IDEA stays a
 * product direction; the shared market reader stays (the bands below use
 * it). Nothing replaces the scene: its space goes to the person's story.
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
  const [market, t, tHero] = await Promise.all([
    // The landing renders the supply counts only; it reads `professions`
    // nowhere, so it does not pay for the per-profession reads.
    readLiveMarketLandingSnapshot({ resolveProfessions: false }),
    getTranslations("common"),
    getTranslations("landing.hero"),
  ]);

  // THE FIRST SCREEN IS THE CHOICE (owner instruction 2026-11-12: "Sumažink
  // pagrindinio puslapio sudėtingumą. Pašalink nereikalingus tekstus,
  // abstrakčius šūkius ir pasikartojančius blokus. Pirmame ekrane turi būti
  // aiškus pasirinkimas, ką žmogus nori atlikti."). The page's h1 IS the
  // question ("What do you want to do?", in the goal navigator); the owner's
  // own headline is the one supporting line under the goals, and the brand
  // eyebrow is gone (the logo is right above). The second paragraph, the
  // hero's "Start now" pair, the link down to the request doors and the three
  // abstract cards left this screen with that instruction; the request doors
  // themselves, the sentence entry and every later section stay.
  const promise = (
    <p
      className="max-w-3xl text-sm leading-snug text-text-secondary sm:text-base"
      data-testid="landing-hero-line"
    >
      {tHero("headline")}
    </p>
  );

  return (
    <NextIntlClientProvider
      messages={pickLandingMessages(await getMessages())}
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
        <SiteNav goalsOnPage />
        <main id="main-content" className="relative">
          {/* ── The restored landing body, verbatim from 7179882 ────────── */}
          <div className="mx-auto max-w-container px-4 pb-14 pt-5 sm:px-12 sm:pt-10">
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
            {/* THE ENTRY (owner decision 2026-09-29 — landing freeze lifted
                for the entry hero ONLY). Desktop: the promise left, the
                product story right, the working sentence entry full width
                beneath. Phone: promise → entry → story, so the working entry
                stays near the top. */}
            {/* NO FICTIONAL PEOPLE (owner order 2026-11-09): the living worker
                hero showed sample personas with names, professions and
                careers under a "Sample" label. Public pages show no invented
                people or numbers as if real, and carry no sample labels, so the
                hero is withdrawn and the entry hero below is the landing's
                first screen. The component stays in the repository unused. */}
              {/* With the story column gone, the left-only hero left the right
                  half of the first screen empty on desktop, and the `order-1`
                  wrapper put the entry ABOVE the h1 on phones. Source order is
                  now the phone order — promise → entry → doors — and from `xl`
                  the entry takes the right column beside the promise, with the
                  three ways and the request doors full width beneath. */}
              <section className="flex min-w-0 flex-col gap-5">
                <div className="min-w-0">
                  <LandingIntentChoice />
                </div>
                <div className="min-w-0">{promise}</div>
                <div className="scroll-mt-24 max-w-2xl" id="find">
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
                </div>
                <div>
                  <LandingRequestDoors locale={locale} />
                </div>
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
            {/* ── THE MAP BAND IS WITHDRAWN FROM THE LANDING (owner decision
                   2026-09-27). Its code and the map capability are UNTOUCHED:
                   `public-market-map-band.tsx`, `<MarketMap>` and
                   `publicCoverageView()` all still exist, and /dashboard/market-map
                   is unaffected. It is simply no longer rendered to a visitor.

                   WHY. The band could only draw `MARKET_COUNTRIES` centroids —
                   markets the product serves, never activity, because the anon
                   boundary publishes no country, region, city or coordinate. A
                   map that cannot show work geography then needed THREE lines of
                   copy to explain what its markers were not:
                   "Darbo rinka egzistuoja tikrose vietose", "Žmonės, darbai ir
                   poreikiai yra kažkur", "Tai rinkos, ne šios dienos veikla".
                   That is the product explaining its own data model to a
                   visitor, which is exactly what the owner banned — and a
                   decorative map that requires an explanation is the thing the
                   explanation was compensating for.

                   NOTHING OF VALUE WAS REMOVED WITH IT. The market PROOF — the
                   real vacancy and employer counts from the canonical snapshot —
                   was already a self-contained `<section>` with its own heading;
                   it just rendered inside the map band. It now stands on its own
                   and carries the `#market` anchor the public nav links to.

                   It comes back when it can show a visitor real opportunity
                   geography, which is a boundary decision, not a copy change. */}
            {/* TWO SIDES, ONE SPINE (premium completion 2026-10-02): the lifecycle
                shared by professionals and companies — placed directly under
                the entry, before the market proof. Presentation only. */}
            <TwoSidesSection />

            <MarketProofBand market={market} locale={locale} />

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

            {/* ── Trust & security — verifiable claims only ─────────────── */}
            <TrustBand />

            {/* ── The page ends on what to do next, not on a claim ──────── */}
            <LandingClosingBand locale={locale} />
          </div>
        </main>
        <SiteFooter />
      </div>
    </NextIntlClientProvider>
  );
}
