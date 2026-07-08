import { getTranslations } from "next-intl/server";
import { Radar } from "lucide-react";

import type { MarketVM } from "./premium-hub-data";
import { HubEmptyState, HubPanel } from "./premium-hub-primitives";

/** Abstract node layout (viewBox 0–400 x, 0–260 y). These are DECORATIVE
 *  positions, not geographic coordinates — the panel stays a stylized CSS/SVG
 *  network with no external/paid map provider and no geocoding. The number of
 *  points shown reflects the caller's REAL signal count; positions do not. */
const NODE_LAYOUT: ReadonlyArray<{ x: number; y: number }> = [
  { x: 232, y: 132 }, // index 0 = the highlighted active point
  { x: 128, y: 96 },
  { x: 300, y: 168 },
  { x: 64, y: 190 },
  { x: 256, y: 74 },
  { x: 150, y: 214 },
  { x: 344, y: 120 },
  { x: 196, y: 150 },
];

/** Block C — Rinkos žemėlapis. Stylized provider-free market panel driven by the
 *  caller's REAL signal counts (preferred locations, needs, consented login).
 *  Honest empty state when no signals exist yet. */
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

  // Show one point per signal (capped to the decorative layout); the first is the
  // highlighted active point.
  const shown = Math.max(1, Math.min(market.total, NODE_LAYOUT.length));
  const nodes = NODE_LAYOUT.slice(0, shown);
  const active = nodes[0];
  const ambient = nodes.slice(1);

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

      <div className="relative overflow-hidden rounded-xl border border-ink-600 bg-ink-900">
        <svg
          viewBox="0 0 400 260"
          role="img"
          aria-label={t("map.title")}
          className="h-full w-full"
          preserveAspectRatio="xMidYMid slice"
        >
          <g className="stroke-ink-600/40" strokeWidth={1}>
            {[52, 104, 156, 208].map((y) => (
              <line key={`h${y}`} x1={0} y1={y} x2={400} y2={y} />
            ))}
            {[80, 160, 240, 320].map((x) => (
              <line key={`v${x}`} x1={x} y1={0} x2={x} y2={260} />
            ))}
          </g>

          <g className="stroke-brand-blue/30" strokeWidth={1.25} strokeLinecap="round">
            {ambient.map((n, i) => (
              <line
                key={`c${i}`}
                x1={active.x}
                y1={active.y}
                x2={n.x}
                y2={n.y}
                strokeDasharray="3 5"
              />
            ))}
          </g>

          <g>
            {ambient.map((n, i) => (
              <g key={`n${i}`}>
                <circle cx={n.x} cy={n.y} r={9} className="fill-brand-blue/10" />
                <circle cx={n.x} cy={n.y} r={3.5} className="fill-brand-blue/70" />
              </g>
            ))}
          </g>

          <g>
            <circle cx={active.x} cy={active.y} r={26} className="fill-brand-cyan/5" />
            <circle cx={active.x} cy={active.y} r={16} className="fill-brand-cyan/10" />
            <circle
              cx={active.x}
              cy={active.y}
              r={9}
              className="fill-brand-cyan/20 stroke-brand-cyan/60"
              strokeWidth={1.5}
            />
            <circle cx={active.x} cy={active.y} r={4.5} className="fill-brand-cyan" />
          </g>
        </svg>

        <div className="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1.5">
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-label text-text-secondary">
            <span className="h-2 w-2 rounded-full bg-brand-cyan" aria-hidden />
            {t("map.activePoint")}
          </span>
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-label text-text-muted">
            <span className="h-2 w-2 rounded-full bg-brand-blue/70" aria-hidden />
            {t("map.points")}
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-3">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex flex-col gap-1 rounded-xl border border-ink-600 bg-ink-800/40 p-3"
          >
            <dd className="font-display text-xl font-bold tracking-tightest tabular-nums text-text-primary">
              {r.value}
            </dd>
            <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {r.label}
            </dt>
          </div>
        ))}
      </dl>
    </HubPanel>
  );
}
