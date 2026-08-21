import { getTranslations, setRequestLocale } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { AmbientGlow } from "@/components/decor/ambient-glow";
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
import { LandingModeSwitcher } from "./landing-mode-switcher";

/**
 * FOCUS — the STABLE BASELINE.
 *
 * This is not a calmer restyling of the LIVE landing. It is the actual
 * previous production landing, recovered from git rather than rebuilt from
 * memory, so that LIVE / FOCUS is a legitimate control comparison:
 *
 *   source: apps/web/app/[locale]/(marketing)/page.tsx
 *   at:     7179882 — the state of `main` immediately before #1221
 *           (5c78ac5) deleted it; content last shaped by 239a012 (#1176).
 *
 * The composition below is that file's, link for link: hero copy + the
 * cinematic <HeroLiveDemo> over the canonical <MarketMap>, then the product
 * chain carrying the #how-it-works anchor, market proof, the Player Card
 * showcase, the trust band and the final CTA band. All six components are the
 * originals, still present in the tree and unmodified by this change.
 *
 * ── COMPATIBILITY CHANGES, AND NOTHING MORE ────────────────────────────────
 * The original rendered inside the (marketing) route group, which supplied the
 * ambient glow, <SiteNav> and <SiteFooter>. `/{locale}` now lives outside that
 * group, so this component reproduces that chrome directly — same components,
 * same order — rather than visually approximating it.
 *
 * The message provider is the marketing pick, exactly as the (marketing)
 * layout does it, so the baseline gets the client messages its components
 * expect without shipping the union pick.
 *
 * The one genuinely new element is <LandingModeSwitcher>: the experiment
 * control that lets a visitor return to LIVE. Without it FOCUS would be a
 * one-way door.
 *
 * DATA SAFETY: <MarketProofBand> no longer renders the static "35,000+ /
 * 7,000+ / 21" strings it shipped with. It reads the same canonical
 * count_public_vacancies_v1 projection the LIVE panel reads, and `regions` is
 * dropped because that contract exposes no region count. Stale numbers are
 * not restored, and no new aggregation truth is introduced.
 */
export async function StableLanding({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const tHero = await getTranslations("landing.hero");

  return (
    <NextIntlClientProvider
      messages={pickMessages(
        await getMessages(),
        MARKETING_CLIENT_MESSAGE_ROOTS,
      )}
    >
      <div className="relative min-h-screen" data-landing-mode="focus">
        <AmbientGlow />
        <SiteNav />
        <main id="main-content" className="relative">
          <div className="mx-auto max-w-container px-6 py-14 sm:px-12">
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

            <div id="how-it-works" className="scroll-mt-24">
              <ProductChainBand />
            </div>

            <MarketProofBand />

            <PlayerCardShowcase />

            <TrustBand />

            <FinalCtaBand />
          </div>
        </main>
        <SiteFooter />
        <LandingModeSwitcher />
      </div>
    </NextIntlClientProvider>
  );
}
