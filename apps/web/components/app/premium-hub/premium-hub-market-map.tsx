import { getTranslations } from "next-intl/server";
import { Radar } from "lucide-react";

import type { MarketVM } from "./premium-hub-data";
import { HubEmptyState, HubPanel, HubZoneLink } from "./premium-hub-primitives";

/**
 * Block C — the market DOOR: real signal counts, and one way into the canonical
 * map.
 *
 * WHAT WAS REMOVED AND WHY (W3 row 4). This panel used to draw a 400x260 `<svg>`
 * "network" of dots whose own comment admitted the positions were decorative and
 * not geographic. The count of dots was real; every position was invented. That
 * is a picture of a map rather than a map — the thing the canonical `MarketMap`
 * doctrine forbids ("no SVG illustration standing in for a map"), and the thing
 * the owner command means by fiktyvūs grafikai.
 *
 * It was NOT replaced with a second `<MarketMap>`. This route is a second
 * dashboard scheduled for removal, and mounting a real Leaflet instance inside
 * it would add weight to a surface that is leaving. Everything real survives:
 * the three signal counts, the honest empty state, and the door to
 * `/dashboard/market-map` where the canonical map actually lives.
 */
export async function PremiumHubMarketMap({ market }: { market: MarketVM }) {
  const t = await getTranslations("premiumHub");

  if (market.status === "empty") {
    return (
      <HubPanel
        eyebrow={t("map.title")}
        icon={Radar}
        testid="premium-hub-map"
        className="flex-1"
      >
        <HubEmptyState
          icon={Radar}
          title={t("map.empty.title")}
          body={t("map.empty.body")}
          ctaLabel={t("map.empty.cta")}
          href="/dashboard/market-map"
        />
      </HubPanel>
    );
  }

  const rows = [
    { label: t("map.signals.preferred"), value: String(market.preferred) },
    { label: t("map.signals.needs"), value: String(market.needs) },
    {
      label: t("map.signals.login"),
      value: market.loginConsented ? t("yes") : t("no"),
    },
  ];

  return (
    <HubPanel eyebrow={t("map.title")} icon={Radar} testid="premium-hub-map" className="flex-1">
      <p className="text-sm text-text-secondary">{t("map.lead")}</p>

      {/* The signal zone is ONE door to the canonical map. It was already a
          single link rather than a tappable mini-map, because a map that looks
          active and ignores taps reads as broken — the same reasoning that now
          removes the drawing entirely. No nested interactive elements. */}
      <HubZoneLink
        href="/dashboard/market-map"
        ariaLabel={t("map.open")}
        testid="hub-map-open-link"
        className="-m-2 flex flex-col gap-4 p-2"
      >
      <dl className="grid grid-cols-3 gap-3">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex flex-col gap-1 rounded-xl border border-ink-600 bg-ink-800/40 p-3"
          >
            <dd className="font-display text-xl font-bold tracking-tightest tabular-nums text-text-primary">
              {r.value}
            </dd>
            <dt className="font-mono text-meta uppercase tracking-label text-text-muted">
              {r.label}
            </dt>
          </div>
        ))}
      </dl>
      </HubZoneLink>
    </HubPanel>
  );
}
