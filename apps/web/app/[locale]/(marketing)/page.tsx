import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildPageMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: "" });
}
import { HeroLiveDemo } from "@/components/marketing/hero-live-demo";
import { PlayerCardShowcase } from "@/components/marketing/player-card-showcase";
import { ProductChainBand } from "@/components/marketing/product-chain-band";
import { TrustBand } from "@/components/marketing/trust-band";
import { FinalCtaBand } from "@/components/marketing/final-cta-band";

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const tHero = await getTranslations("landing.hero");
  // Landing rebuild (owner directive 2026-07-29): the former journey band,
  // the HowItWorksBand 4-step rail, the why-now pillars grid and the
  // two-paths cards are superseded by the narrative chain
  // hero(HeroLiveDemo) → ProductChainBand → MarketMoment → … → ProofBand.
  // (HeroLiveDemo superseded LiveProductDemo on 2026-07-31 — same cinematic
  // role, now driving the canonical <MarketMap>. The old component was dead
  // and has been deleted.)
  // Their i18n keys (`journey.*`, `labourMarket.p*`, `landing.how.*`,
  // worker/employer path keys) stay in messages/*.json for a cheap restore.

  // Premium-impression cleanup v1: the `tr` (trusted) + `sec` (secondary)
  // namespaces are no longer rendered on this page (placeholder-only
  // sections were removed). The i18n keys remain in messages/*.json so a
  // future restore is a one-file change. The `shortcuts` array literal
  // (formerly fed the removed Shortcuts card) was removed for the same
  // reason; restore alongside the section when real shortcuts exist.

  return (
    <div className="mx-auto max-w-container px-6 py-14 sm:px-12">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      {/* ═══ 1. HERO = THE PRODUCT ═══════════════════════════════════════
          Owner override 2026-07-30: the landing is not documentation. The
          first screen IS a session — question, AI, map reaction, result —
          using the SAME canonical <MarketMap> the authenticated ResultPanel
          mounts, on real Leaflet/OSM tiles and real city coordinates.
          The previous hero (long copy + four KPI numbers + a decorative
          outline captioned "one city, one need") described the product
          instead of demonstrating it. */}
      <section className="flex flex-col gap-5">
        <div className="max-w-3xl">
          <h1 className="font-display text-hero font-bold tracking-tightest text-text-primary">
            {tHero('headline')}
          </h1>
          <p className="mt-3 text-lead text-text-secondary">{tHero('sub')}</p>
        </div>
        <HeroLiveDemo />
      </section>

      {/* ── The product chain — six links, journal as pivot. Carries the
             #how-it-works nav anchor (supersedes HowItWorksBand). ───────── */}
      <div id="how-it-works" className="scroll-mt-24">
        <ProductChainBand />
      </div>

      {/* OWNER SHORTENING (audit §3.1, 2026-07-29): the landing is exactly
          the seven canonical blocks — hero + live scenario, product chain,
          audience value, Player Card + proof system, market/map context,
          final CTA. Removed as self-duplication: ConversationOsPanel (the
          hero demo already SHOWS the conversation working), the audience
          chip strip (AudienceValueSections is the audience block), DraftBoard
          and MarketPulse (interior dashboards re-rendered as brochure). */}

      {/* ── Audience value blocks — workers / employers / agencies /
             training institutions / partners (#partners anchor) ─────────── */}
      {/* ── Player Card + the proof system: the CANONICAL card (§3.7),
             fact vs proven skill vs opinion, and the source-backed market
             evidence behind it ─────────────────────────────────────────── */}
      <PlayerCardShowcase />

      {/* ── Trust & security — verifiable claims only (PR-H, H) ────────── */}
      <TrustBand />

      {/* ── Final CTA band — four real doors, no dead links (PR-H, I) ──── */}
      <FinalCtaBand />

      {/*
       * Premium-impression cleanup v1: the four-card "secondary" grid
       * (Team / Comm / Companies / Shortcuts) was removed because
       * every cell rendered `<Placeholder>` content. In aggregate it
       * read as "this product is mostly empty". The journey rail
       * above + PlayerCardShowcase + DraftBoard + MarketPulse
       * already communicate the cockpit shape; this row was
       * cumulative noise. When real data exists per card, restore
       * the section using the same shape (`sec.*` i18n keys are
       * intentionally left in messages/*.json so the restore is a
       * one-file change). The `shortcuts` array literal above
       * (kept for future restore) is now unused; ESLint will accept
       * the void usage in the JSX comment block below.
       */}

      {/*
       * Step 2 (evidence hardening): the sample "Market intelligence"
       * sparkline cards (demand / workers / competition + a top-skills
       * placeholder) were REMOVED. They were illustrative sample series,
       * and on a now source-backed page they read as fake trendlines —
       * exactly what the evidence-hardening pass forbids. The real,
       * fully-sourced `<LabourMarketEvidence />` module above supersedes
       * them. The `market.*` i18n keys are kept in messages/*.json so a
       * future restore (with REAL, provenanced series) is a one-file
       * change. No-fake-charts is enforced by
       * lib/guards/public-no-fake-claims.test.ts.
       */}

      {/*
       * Premium-impression cleanup v1: the placeholder testimonial
       * was removed. A blockquote with a `<Placeholder>` reads as
       * "we don't have a real testimonial yet" — the opposite of
       * the credibility the section is meant to project. When 1+
       * real, attributable testimonial exists (with the speaker's
       * written consent on file per the platform doctrine), restore
       * this section with their actual quote + name + company +
       * permission record. The i18n / Placeholder id
       * `testimonial.featured` is intentionally kept in messages/
       * so the restore is a one-file change.
       */}
    </div>
  );
}
