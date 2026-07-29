import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { Link } from "@/lib/i18n/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: "" });
}
import { Button } from "@/components/ui/Button";
import { LiveTicker } from "@/components/app/live-ticker";
import { MarketCounters } from "@/components/app/market-counters";
import { DraftBoard } from "@/components/marketing/draft-board";
import { MarketPulse } from "@/components/marketing/market-pulse";
import { PlayerCardShowcase } from "@/components/marketing/player-card-showcase";
import { LabourMarketEvidence } from "@/components/marketing/labour-market-evidence";
import { LiveProductDemo } from "@/components/marketing/live-product-demo";
import { ProductChainBand } from "@/components/marketing/product-chain-band";
import { MarketMoment } from "@/components/marketing/market-moment";
import { ProofBand } from "@/components/marketing/proof-band";
import { ConversationOsPanel } from "@/components/marketing/conversation-os-panel";
import { AudienceValueSections } from "@/components/marketing/audience-value-sections";
import { TrustBand } from "@/components/marketing/trust-band";
import { FinalCtaBand } from "@/components/marketing/final-cta-band";

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("hero");
  const tlm = await getTranslations("labourMarket");
  const audienceKeys = [
    "aWorkers",
    "aJobseekers",
    "aFreelancers",
    "aStudents",
    "aChangers",
    "aEmployers",
    "aAgencies",
    "aClients",
  ] as const;
  // Landing rebuild (owner directive 2026-07-29): the former journey band,
  // the HowItWorksBand 4-step rail, the why-now pillars grid and the
  // two-paths cards are superseded by the narrative chain
  // hero(LiveProductDemo) → ProductChainBand → MarketMoment → … → ProofBand.
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
      <section className="grid items-start gap-12 lg:grid-cols-[1fr_1.35fr]">
        <div>
          <p className="inline-flex items-center gap-2 rounded-sm border border-ink-500 px-3 py-1 font-mono text-[11px] uppercase tracking-label text-text-secondary">
            <span className="live-dot" aria-hidden />
            {t("chip")}
          </p>
          <h1 className="mt-6 font-display text-5xl font-bold leading-[1.04] tracking-tightest sm:text-7xl">
            {t("headline")}
            <br />
            <span className="text-gradient-accent">{t("headlineAccent")}</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-text-secondary sm:text-lg">
            {t("subcopy")}
          </p>

          {/* Living work-passport signals (DESIGN.md hero: skill / evidence /
              availability / daily-work). Honest concept labels; colours follow
              the design system (cyan active · emerald confirmed · blue primary ·
              amber attention) — no fabricated numbers. */}
          <ul className="mt-6 flex flex-wrap gap-2" data-testid="hero-signals">
            {(
              [
                ["s1", "bg-brand-cyan"],
                ["s2", "bg-state-success"],
                ["s3", "bg-brand-blue"],
                ["s4", "bg-state-amber"],
              ] as const
            ).map(([k, dot]) => (
              <li
                key={k}
                className="inline-flex items-center gap-2 rounded-full border border-ink-500 bg-ink-800/40 px-3 py-1.5 text-xs font-medium text-text-secondary"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
                {t(`signals.${k}`)}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Link href="/auth/signup" className="w-full sm:w-auto">
              <Button className="w-full rounded-xl">{t("ctaPrimary")} →</Button>
            </Link>
            <Link href="/company-need" className="w-full sm:w-auto">
              <Button variant="secondary" className="w-full rounded-xl">
                {t("businessLink")} →
              </Button>
            </Link>
          </div>

          <div className="mt-12">
            <MarketCounters />
          </div>

          {/*
           * Premium-impression cleanup v1: the placeholder "Trusted by"
           * logos row was removed. Six empty Placeholder slots read as
           * "no logos yet" to a first-time visitor — the opposite of
           * trust. When 3+ real partner permissions exist, restore the
           * strip with real SVGs in `<Placeholder id="partners.logo.N" />`
           * slots. The i18n key `trusted.title` is intentionally left
           * in messages/*.json so the next restore is a one-file change.
           */}
        </div>

        {/* Hero right — the product WORKING (landing rebuild 2026-07-29).
            The wall-sized static world map is superseded by a live, honestly
            labelled sample sequence of the real core loop. */}
        <LiveProductDemo />
      </section>

      {/* ── Live ticker (full-width hero strip) ──────────────────────── */}
      <div className="mt-10">
        <LiveTicker />
      </div>

      {/* ── The product chain — six links, journal as pivot. Carries the
             #how-it-works nav anchor (supersedes HowItWorksBand). ───────── */}
      <div id="how-it-works" className="scroll-mt-24">
        <ProductChainBand />
      </div>

      {/* ── One city, one need, a visible answer — the map moment ──────── */}
      <MarketMoment />

      {/* ── Conversation as the operating system (PR-H, G) ─────────────── */}
      <ConversationOsPanel />

      {/* ── Audience band — whole labour market, not construction-only ─── */}
      <section className="mt-16">
        <p className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-brand-cyan">
          <span className="live-dot" aria-hidden />
          {tlm("audienceEyebrow")}
        </p>
        <h2 className="mt-3 max-w-3xl font-display text-3xl font-bold tracking-tightest text-text-primary sm:text-4xl">
          {tlm("audienceTitle")}
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-secondary sm:text-base">
          {tlm("audienceSubcopy")}
        </p>
        <ul className="mt-6 flex flex-wrap gap-2">
          {audienceKeys.map((k) => (
            <li
              key={k}
              className="inline-flex items-center gap-2 rounded-full border border-ink-500 bg-ink-800/40 px-3.5 py-1.5 text-sm text-text-secondary transition-colors hover:border-brand-blue/50 hover:text-text-primary"
            >
              <span
                className="h-1.5 w-1.5 rounded-full bg-brand-cyan/70"
                aria-hidden
              />
              {tlm(k)}
            </li>
          ))}
        </ul>
      </section>

      {/* ── Audience value blocks — workers / employers / agencies /
             training institutions / partners (PR-H, B–F) ───────────────── */}
      <AudienceValueSections />

      {/* ── Labour-market evidence (source-backed, Step 1) ───────────── */}
      <LabourMarketEvidence />

      {/* ── Player card showcase (5b.3) ──────────────────────────────── */}
      <PlayerCardShowcase />

      {/* ── Draft Board (5b.4) ───────────────────────────────────────── */}
      <DraftBoard />

      {/* ── Market Pulse (5b.4) ──────────────────────────────────────── */}
      <MarketPulse />

      {/* ── Fact vs proven skill vs opinion — the reputation model ─────── */}
      <ProofBand />

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
