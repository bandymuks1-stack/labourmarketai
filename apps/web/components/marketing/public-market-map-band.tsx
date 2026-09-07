import { getTranslations } from "next-intl/server";

import { MarketMap } from "@/components/app/market-map/market-map";
import { Reveal } from "@/components/marketing/reveal";
import {
  coverageCountryCount,
  publicCoverageView,
} from "@/lib/market-map/public-coverage";

/**
 * THE PUBLIC MARKET MAP (owner window 11 §17).
 *
 * *"PEOPLE, WORK, DEMAND AND OPPORTUNITIES EXIST IN REAL PLACES."* The map is
 * back on the landing as a product element, drawn by the SAME canonical
 * `<MarketMap>` the dashboard uses — one Leaflet engine, one tile source, real
 * WGS84 coordinates. No second map, no illustration standing in for one.
 *
 * ── WHAT IT DRAWS, AND WHY THAT IS THE HONEST MAXIMUM TODAY ────────────────
 *
 * It draws the markets the product operates in, at real centroids. It does NOT
 * draw activity, because an anonymous visitor cannot be shown any: measured
 * against production on 2026-09-07, `public_vacancies` has no `anon` grant at
 * all, and the three anon RPCs that exist return no country, region, city or
 * coordinate by their own RETURNS TABLE clauses — a boundary migration
 * (`20260824120000_public_vacancy_anon_boundary_v2`) removed the last fields
 * that leaked one, deliberately. The full evidence is in
 * `lib/market-map/public-coverage.ts`.
 *
 * So the two things §17 forbids are both avoided, and the section says which
 * is which IN WORDS rather than leaving the visitor to guess:
 *   · nothing is fabricated — every marker is a country this product serves;
 *   · it is not decorative — it answers the first question a visitor actually
 *     has, *"does this work where I am?"*, and the honest note beneath says
 *     plainly that per-place activity is not published to visitors yet.
 *
 * The owner decision that would turn coverage into the live market is one
 * migration, costed in `docs/human-gates/HG-2026-09-07-public-market-map.md`.
 * Landing it means adding a reader beside `publicCoverageView()` and changing
 * the view's `origin` — not rebuilding this section.
 *
 * The market PROOF (real vacancy / employer counts, real profession ranking)
 * renders beneath as this section's supporting evidence — §16: those numbers
 * support the product's story, they are not its definition.
 */
export async function PublicMarketMapBand({
  children,
}: {
  /** The market-proof band — rendered inside, as evidence under the map. */
  children?: React.ReactNode;
}) {
  const [t, tLm] = await Promise.all([
    getTranslations("landing.marketMap"),
    getTranslations("labourMarket"),
  ]);

  // Country NAMES are resolved on the SERVER: `labourMarket` is deliberately
  // not in MARKETING_CLIENT_MESSAGE_ROOTS, so a client component reading it
  // here would render raw keys. The view crosses the boundary already
  // localized.
  const view = publicCoverageView((code) =>
    tLm.has(`countryNames.${code}`)
      ? (tLm(`countryNames.${code}` as never) as string)
      : code,
  );
  // The map's TEXT ALTERNATIVE — the same places, as a list, always rendered.
  // The pattern is `world-discovery.tsx`'s ("the map alternative is a number +
  // the SAME places as a list"), and it matters twice here: a person who
  // cannot see or use a raster map still learns which markets exist, and the
  // section says something real before Leaflet has painted a single tile.
  const marketNames = view.regions.map((r) => r.label);

  return (
    <section id="market" className="mt-16 scroll-mt-24" aria-labelledby="market-map-title">
      <Reveal>
        <p className="font-mono text-meta uppercase tracking-label text-text-secondary">
          {t("eyebrow")}
        </p>
        <h2
          id="market-map-title"
          className="mt-3 max-w-2xl font-display text-3xl font-bold leading-[1.08] tracking-tightest sm:text-4xl"
        >
          {t("title")}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary sm:text-base">
          {t("lead")}
        </p>
      </Reveal>

      <Reveal delay={0.08}>
        <div className="mt-8">
          <MarketMap view={view} mode="landing" layer="demand" autoFly={false} />
          {/* THE CAPTION IS NOT DECORATION — it is the difference between an
              honest map and a misleading one. It names what the markers are
              and, in the same breath, what the map is not showing. */}
          <div
            data-testid="market-map-honesty"
            className="mt-3 flex flex-col gap-1.5 rounded-md border border-ink-600 bg-ink-800/40 px-3.5 py-3"
          >
            <p className="text-sm leading-relaxed text-text-primary">
              {t("shows", { count: coverageCountryCount() })}
            </p>
            <p
              data-testid="market-map-countries"
              className="text-xs leading-relaxed text-text-secondary"
            >
              {marketNames.join(" · ")}
            </p>
            <p className="text-xs leading-relaxed text-text-muted">
              {t("notPublished")}
            </p>
          </div>
        </div>
      </Reveal>

      {children}
    </section>
  );
}
