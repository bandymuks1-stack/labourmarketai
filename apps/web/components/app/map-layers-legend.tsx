import { Layers } from "lucide-react";

/**
 * MapLayersLegend — the map's "what is visible now / future layers" panel
 * (map-first product direction). The map is becoming the central visual market
 * layer; this legend honestly states which layers are REAL and visible today
 * versus which are PREPARING — shown as disabled chips, never as fake markers
 * or fake data.
 *
 * Presentational only: all strings arrive already-localized. The "visible now"
 * group lists genuinely live signals (today: the user's own location signal,
 * rendered by MarketMapBase). The "future" group is disabled filter chips.
 */
export type MapLayersLabels = {
  title: string;
  intro: string;
  visibleNow: string;
  futureLayers: string;
  futureBadge: string;
  /** Real, live layers (enabled). */
  visibleItems: string[];
  /** Preparing layers (disabled chips). */
  futureItems: string[];
};

export function MapLayersLegend({ labels }: { labels: MapLayersLabels }) {
  return (
    <section
      className="card-border flex flex-col gap-3 p-4"
      data-testid="map-layers-legend"
      aria-label={labels.title}
    >
      <div className="flex items-center gap-2 text-text-primary">
        <Layers className="h-4 w-4 text-text-secondary" strokeWidth={1.75} aria-hidden />
        <h2 className="font-display text-sm font-semibold">{labels.title}</h2>
      </div>
      <p className="text-xs leading-relaxed text-text-secondary">{labels.intro}</p>

      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-label text-state-live">
          ● {labels.visibleNow}
        </span>
        <ul className="flex flex-wrap gap-1.5" data-testid="map-layers-visible">
          {labels.visibleItems.map((item) => (
            <li
              key={item}
              className="rounded-full border border-state-success/40 bg-state-success/5 px-2.5 py-1 text-[11px] text-text-primary"
            >
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-label text-text-muted">
          {labels.futureLayers}
          <span className="rounded-sm border border-state-warning/40 bg-state-warning/5 px-1.5 py-0.5 text-state-warning">
            {labels.futureBadge}
          </span>
        </span>
        <ul className="flex flex-wrap gap-1.5" data-testid="map-layers-future">
          {labels.futureItems.map((item) => (
            <li key={item}>
              <span
                aria-disabled="true"
                className="inline-block cursor-not-allowed rounded-full border border-ink-500 bg-ink-800/40 px-2.5 py-1 text-[11px] text-text-muted opacity-70"
              >
                {item}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
