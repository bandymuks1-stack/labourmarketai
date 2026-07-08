import { getTranslations } from "next-intl/server";
import { Radar } from "lucide-react";

import type { HubMapNode } from "./premium-hub-fixtures";
import { HubPanel } from "./premium-hub-primitives";

/** Block C — Rinkos žemėlapis. A stylized abstract market/network panel (CSS +
 *  SVG only — no external / paid map provider, no geocoding). Several ambient
 *  market points, connection lines, and one highlighted active point. */
export async function PremiumHubMarketMap({ nodes }: { nodes: HubMapNode[] }) {
  const t = await getTranslations("premiumHub");
  const active = nodes.find((n) => n.active) ?? nodes[0];
  const ambient = nodes.filter((n) => n !== active);

  return (
    <HubPanel eyebrow={t("map.title")} icon={Radar} testid="premium-hub-map" className="flex-1">
      <p className="text-sm text-text-secondary">{t("map.lead")}</p>

      <div className="relative flex-1 overflow-hidden rounded-xl border border-ink-600 bg-ink-900">
        <svg
          viewBox="0 0 400 260"
          role="img"
          aria-label={t("map.title")}
          className="h-full w-full"
          preserveAspectRatio="xMidYMid slice"
        >
          {/* faint grid — spatial depth without a real basemap */}
          <g className="stroke-ink-600/40" strokeWidth={1}>
            {[52, 104, 156, 208].map((y) => (
              <line key={`h${y}`} x1={0} y1={y} x2={400} y2={y} />
            ))}
            {[80, 160, 240, 320].map((x) => (
              <line key={`v${x}`} x1={x} y1={0} x2={x} y2={260} />
            ))}
          </g>

          {/* connection lines from the active point to the ambient market points */}
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

          {/* ambient market points */}
          <g>
            {ambient.map((n, i) => (
              <g key={`n${i}`}>
                <circle cx={n.x} cy={n.y} r={9} className="fill-brand-blue/10" />
                <circle cx={n.x} cy={n.y} r={3.5} className="fill-brand-blue/70" />
              </g>
            ))}
          </g>

          {/* the single highlighted active point — concentric glow, no motion */}
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

        {/* legend — reads over the panel, not a live-status claim */}
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
    </HubPanel>
  );
}
