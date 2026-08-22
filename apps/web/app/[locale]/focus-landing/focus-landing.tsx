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
import { HeroLiveDemo } from "@/components/marketing/hero-live-demo";
import { MarketProofBand } from "@/components/marketing/market-proof-band";
import { PlayerCardShowcase } from "@/components/marketing/player-card-showcase";
import { ProductChainBand } from "@/components/marketing/product-chain-band";
import { TrustBand } from "@/components/marketing/trust-band";
import { FinalCtaBand } from "@/components/marketing/final-cta-band";
import {
  MARKETING_CLIENT_MESSAGE_ROOTS,
  pickMessages,
} from "@/lib/i18n/client-messages";
import { readLiveMarketLandingSnapshot } from "@/lib/market/live-market-landing";
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
 * The composition below is that file's, node for node: hero copy + the
 * cinematic <HeroLiveDemo> over the canonical <MarketMap>, then the product
 * chain carrying the #how-it-works anchor, the market proof band, the Player
 * Card showcase, the trust band and the final CTA band — same order, same
 * wrapper classes, same anchor. All six components are the ORIGINALS: they
 * survived #1221 untouched (`git diff 7179882 main -- components/marketing/`
 * is empty) and this change does not modify any of them.
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
  // The SAME canonical snapshot LIVE reads, through the SAME 300 s
  // `unstable_cache` entry — one market truth, one freshness window, no
  // FOCUS-only reader (owner command §9/§12).
  const [market, t, tHero] = await Promise.all([
    readLiveMarketLandingSnapshot(),
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
            {/* ── Hero: the first screen IS a session — question, AI, map
                   reaction, result — on the SAME canonical <MarketMap> the
                   authenticated ResultPanel mounts. ───────────────────── */}
            <section className="flex flex-col gap-5">
              <div className="max-w-3xl">
                <h1 className="font-display text-hero font-bold tracking-tightest text-text-primary">
                  {tHero("headline")}
                </h1>
                <p className="mt-3 text-lead text-text-secondary">
                  {tHero("sub")}
                </p>
              </div>
              <HeroLiveDemo />
            </section>

            {/* ── The product chain — six links, journal as pivot. Carries
                   the #how-it-works nav anchor. ─────────────────────────── */}
            <div id="how-it-works" className="scroll-mt-24">
              <ProductChainBand />
            </div>

            {/* ── Market proof — the CURRENT verified counts from the
                   canonical public vacancy contract, the same projection the
                   LIVE panel renders, plus the data-derived top-profession
                   ranking. Coverage framing only; Sweden is named as the
                   source of the figures, never as the product's scope. ──── */}
            <MarketProofBand market={market} locale={locale} />

            {/* ── Player Card + the proof system: fact vs proven skill vs
                   opinion, and the source-backed market evidence. ──────── */}
            <PlayerCardShowcase />

            {/* ── Trust & security — verifiable claims only ─────────────── */}
            <TrustBand />

            {/* ── Final CTA band — four real doors, no dead links ───────── */}
            <FinalCtaBand />
          </div>
        </main>
        <SiteFooter />
        <LandingModeSwitcher />
      </div>
    </NextIntlClientProvider>
  );
}
