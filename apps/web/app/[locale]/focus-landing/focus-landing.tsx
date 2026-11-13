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
import { LandingHow, LandingMarketFacts, LandingNeedPath } from "@/components/marketing/landing-v3";
import { landingV3Copy } from "@/lib/marketing/landing-v3-copy";
import { ChevronDown } from "lucide-react";

/** Folds the request block on a narrow screen, before first paint. It is
 *  sent open; `lg` (1024px) is where it moves beside the sentence field. */
const REQUEST_BLOCK_FOLD_SCRIPT =
  '(function(){try{var d=document.getElementById("request");if(d&&window.matchMedia("(max-width: 1023px)").matches)d.removeAttribute("open")}catch(e){}})()';

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
  const [market, t, tHero, tRequest] = await Promise.all([
    // The landing renders the supply counts only; it reads `professions`
    // nowhere, so it does not pay for the per-profession reads.
    readLiveMarketLandingSnapshot({ resolveProfessions: false }),
    getTranslations("common"),
    getTranslations("landing.hero"),
    getTranslations("landing.requestDoors"),
  ]);

  const v3 = landingV3Copy(locale);
  // PREVIEW ONLY: this branch is rendered with no database behind it, so the
  // canonical snapshot is empty. To look at the block with real figures the
  // screenshot run passes the numbers production showed at capture time
  // (`LANDING_V3_PREVIEW_MARKET="adverts,employers,ISO date"`). Removed with
  // the prototype; the real page reads only the canonical snapshot.
  const previewMarket = process.env.LANDING_V3_PREVIEW_MARKET?.split(",");
  const marketFacts =
    market.activeVacancies !== null && market.distinctEmployers !== null
      ? { adverts: market.activeVacancies, employers: market.distinctEmployers, refreshedAt: market.lastRefreshedAt }
      : previewMarket && previewMarket.length === 3
        ? { adverts: Number(previewMarket[0]), employers: Number(previewMarket[1]), refreshedAt: previewMarket[2] ?? null }
        : null;

  // PREVIEW ONLY (same reason as the figures above): the adverts the live
  // page showed at capture time, in the canonical preview shape.
  const previewAdverts = process.env.LANDING_V3_PREVIEW_ADVERTS;
  const advertSample: typeof market.sample =
    market.sample.basis === "live"
      ? market.sample
      : previewAdverts
        ? { basis: "live", vacancies: JSON.parse(previewAdverts) }
        : market.sample;

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
              {/* ── LANDING V3 PREVIEW (prototype; see
                     docs/audits/evidence/landing-v3/OUTLINE.md) ──────────
                     1. ONE goal centre: the question, one line saying who it
                        is for and what is free, the goals (phone: four first,
                        the rest under "more choices"), and — as an
                        ALTERNATIVE way into the same actions — the sentence
                        field.
                     2. ONE "submit a need" path (the three services behind it).
                     3. Market figures in ONE place, with their source.
                     4. ONE compact explanation with links to the detail. */}
              <section className="flex min-w-0 flex-col gap-4">
                <LandingIntentChoice
                  lead={v3.lead}
                  phoneMore={{ ids: ["partners", "agencies"], label: v3.moreChoices }}
                />
                <p className="flex items-center gap-3 text-xs font-medium uppercase tracking-label text-text-muted">
                  <span aria-hidden className="h-px flex-1 bg-ink-600" />
                  {v3.or}
                  <span aria-hidden className="h-px flex-1 bg-ink-600" />
                </p>
                {/* The two ways to SAY a need sit side by side on a wide
                    screen: in your own words, or through the short form. */}
                <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:items-start">
                  <div className="min-w-0 scroll-mt-24" id="find">
                    <PublicEntry examples="none" supply={null} />
                  </div>
                  <LandingNeedPath locale={locale} copy={v3} />
                </div>
              </section>
            <LandingMarketFacts
              locale={locale}
              copy={v3}
              market={marketFacts}
              adverts={
                advertSample.basis === "live" && advertSample.vacancies.length > 0 ? (
                  <LandingOpenJobsBand sample={advertSample} locale={activeLocale} compact />
                ) : undefined
              }
            />
            <LandingHow copy={v3} />
          </div>
        </main>
        <SiteFooter compact />
      </div>
    </NextIntlClientProvider>
  );
}
