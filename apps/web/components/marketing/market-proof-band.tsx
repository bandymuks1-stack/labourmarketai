import { getTranslations } from "next-intl/server";
import type { LiveMarketLandingSnapshot } from "@/lib/market/live-market-landing";
import { Reveal } from "@/components/marketing/reveal";
import { Card } from "@/components/ui/Card";

/**
 * MARKET PROOF BAND — FOCUS's view of the ONE canonical market truth.
 *
 * ONE CANONICAL SOURCE (owner command 2026-08-22 §9): this band no longer
 * renders the rounded, plus-suffixed floors it shipped with, nor the static
 * region count beside them. A floor is a dated marketing approximation; the
 * platform KNOWS the current counts, so showing an August 2026 reading as the
 * market right now was the drift the owner ended. The figures are deliberately
 * not repeated here — the guard forbids a market total appearing in this file
 * at all, comments included. FOCUS and LIVE now read the SAME projection:
 *
 *   count_public_vacancies_v1
 *     -> readPublicVacancySupplyCounts  (lib/vacancy-store/public-vacancy-preview.ts)
 *     -> readLiveMarketLandingSnapshot  (lib/market/live-market-landing.ts)
 *
 * The snapshot is passed in rather than read here, so FOCUS resolves it once
 * per render and shares the SAME `unstable_cache` (300 s) entry LIVE uses.
 * No second reader, no second RPC, no client polling: when supply moves, both
 * presentations converge inside one freshness window.
 *
 * EXACT, NEVER SUBSTITUTED. The counts render verbatim through
 * `Intl.NumberFormat` — never rounded, never re-bucketed, never floored. When
 * the reader cannot answer, the counts are OMITTED (owner command §16): a
 * stale floor under a "verified market data" heading is worse than no number.
 * The provenance line is omitted with them — it describes those figures, and
 * claiming verified data beside no data would be its own small dishonesty.
 *
 * SCOPE HONESTY (§13). labourmarket.ai is a European platform; these exact
 * figures describe only the coverage currently connected. Sweden is therefore
 * the SOURCE of the numbers, carried as a subordinate provenance line — never
 * a country-total claim, never the product identity. The coverage framing
 * rule (no adoption verbs, no "all Europe" totals) still holds and is
 * enforced by the coverage-claim module under lib/analytics.
 *
 * REGIONS, AUDITED AND REMOVED (§15). The third stat was a static Sweden
 * coverage fact ("21 regions"), not a live measure — the public vacancy
 * contract exposes no region count, and inventing one is forbidden. Inside a
 * band that now states current verified data it could only ever read as a
 * current European statistic while silently going stale, so the metric is
 * removed rather than demoted; the grid drops to two columns and nothing else
 * about the composition moves.
 *
 * TOP PROFESSIONS: unchanged. The ranking is a bounded, data-derived ordering
 * of profession families, shown WITHOUT absolute counts because grouping
 * covers only part of the listings (the visible note says so). Names render
 * from the canonical `professions` taxonomy catalogs — never ad-hoc labels.
 *
 * LCP: server component. Its one data dependency is the shared cached
 * snapshot the page already awaited, so this adds no request-time work.
 */

/**
 * Stat keys, in display order. Only the LABEL lives in
 * `landing.marketProof.stats.*` now — the value comes from the canonical
 * snapshot, so no message catalog can carry a market total again.
 */
export const MARKET_PROOF_STATS = ["vacancies", "employers"] as const;

/**
 * Top profession families by active-ad count (production read-back
 * 2026-08-17 21:23 UTC — see the file header). Slugs are canonical
 * `professions` taxonomy keys; the guard test asserts each exists in every
 * locale catalog so a typo can never render a raw slug.
 */
export const TOP_PROFESSION_FAMILY_SLUGS = [
  "caregiver",
  "teacher",
  "sales_assistant",
  "warehouse_worker",
  "driver",
  "cleaner",
] as const;

export async function MarketProofBand({
  market,
  locale,
}: {
  /** The SAME canonical snapshot LIVE renders — resolved once by the page. */
  readonly market: LiveMarketLandingSnapshot;
  readonly locale: string;
}) {
  const t = await getTranslations("landing.marketProof");
  const review = await getTranslations("livingMarketReview");
  const professions = await getTranslations("professions");

  // Exact counts or nothing: a count the canonical reader could not return is
  // omitted, never filled with a constant (owner command §16).
  const supply =
    market.activeVacancies !== null && market.distinctEmployers !== null
      ? {
          vacancies: market.activeVacancies,
          employers: market.distinctEmployers,
        }
      : null;
  const numbers = new Intl.NumberFormat(locale);
  const swedenName =
    new Intl.DisplayNames([locale], { type: "region" }).of("SE") ?? "SE";
  const refreshedAt = market.lastRefreshedAt
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(new Date(market.lastRefreshedAt))
    : null;

  return (
    <section className="mt-16" aria-labelledby="market-proof-title">
      <Reveal>
        <p className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("eyebrow")}
        </p>
        <h2
          id="market-proof-title"
          className="mt-3 max-w-2xl font-display text-3xl font-bold tracking-tightest text-text-primary sm:text-4xl"
        >
          {t("title")}
        </h2>
      </Reveal>

      <Reveal delay={0.06}>
        {/* Canonical <Card> primitive — the visual-contract ratchet forbids
            new raw card-class call sites (visual-contract-v1.test.ts). */}
        {supply ? (
          <div
            className="mt-8 grid gap-5 sm:grid-cols-2"
            data-basis={market.basis}
          >
            {MARKET_PROOF_STATS.map((key) => (
              <Card key={key} className="flex flex-col gap-1.5">
                <div data-testid={`market-proof-${key}`}>
                  <p className="font-display text-3xl font-bold tracking-tightest text-text-primary sm:text-4xl">
                    {numbers.format(supply[key])}
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
                    {t(`stats.${key}.label`)}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        ) : null}
      </Reveal>

      {/* Provenance, subordinate by construction (§13/§14): the European
             product identity stays in the heading above; Sweden is named only
             as the SOURCE of these exact figures, alongside the reader's own
             refresh stamp. No pinned "as of <date>" string can go stale here. */}
      {supply ? (
        <Reveal delay={0.1}>
          <p
            className="mt-4 text-meta text-text-muted"
            data-testid="market-proof-basis"
          >
            {review("verifiedMarketData")}
            {refreshedAt ? ` · ${refreshedAt}` : ""}
            {` · ${review("dataSourceLabel")} · ${swedenName}`}
          </p>
        </Reveal>
      ) : null}

      {/* ── Top professions in demand — ranking only, no absolute counts:
             profession grouping covers part of the listings, so counts over
             the grouped subset would understate the market while reading as
             totals. The ranking itself is stable and safe. ─────────────── */}
      <Reveal delay={0.14}>
        <h3 className="mt-10 font-display text-xl font-semibold tracking-tightest text-text-primary">
          {t("topTitle")}
        </h3>
        <ol
          className="mt-4 flex flex-wrap gap-2"
          data-testid="market-proof-professions"
        >
          {TOP_PROFESSION_FAMILY_SLUGS.map((slug, i) => (
            <li
              key={slug}
              className="flex items-center gap-2 rounded-full border border-ink-500 bg-ink-800/40 px-3.5 py-1.5"
            >
              <span className="font-mono text-meta font-semibold text-brand-cyan">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-sm font-medium text-text-primary">
                {professions(slug)}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 max-w-2xl text-meta text-text-muted">
          {t("topNote")}
        </p>
      </Reveal>
    </section>
  );
}
