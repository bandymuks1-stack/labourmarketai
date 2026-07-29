import { Layers } from "lucide-react";

/**
 * MapLayersLegend — the ONE unified market-map layers panel.
 *
 * The map is a single shared market surface; the active identity only changes
 * which layers are focused/highlighted, never whether a separate map exists.
 * This panel lists the REAL "visible now" layers WITH their state —
 *   - active     : a real signal is on the map (e.g. my person signal),
 *   - incomplete : the layer exists in context but has no location yet (e.g. a
 *                  selected company with no confirmed location — honest, never a
 *                  fake company point),
 *   - off-map    : real data exists but carries no coordinates yet (e.g. own
 *                  needs/demands) so it lives in this panel, "not on map yet" —
 * and the disabled "future layers" (preparing, never fake markers).
 *
 * Presentational only: all strings arrive already-localized. No coordinates,
 * no fake markers, no fake data.
 */
export type MapLayerState = "active" | "incomplete" | "off-map";

export type MapVisibleRow = {
  /** Already-localized label. */
  label: string;
  state: MapLayerState;
  /** Optional already-localized one-line state caption. */
  hint?: string | null;
  /** Where the user FIXES an incomplete layer (dead-UI rule C) —
   *  same-page anchor or locale-prefixed route, already resolved. */
  href?: string;
};

export type MapLayersLabels = {
  title: string;
  intro: string;
  visibleNow: string;
  futureLayers: string;
  futureBadge: string;
  /** Real visible-now layers with state (active / incomplete / off-map). */
  visibleRows: MapVisibleRow[];
  /** Preparing layers (disabled chips). */
  futureItems: string[];
};

const STATE_DOT: Record<MapLayerState, string> = {
  active: "bg-state-live",
  incomplete: "bg-state-warning",
  "off-map": "bg-text-muted",
};

const STATE_RING: Record<MapLayerState, string> = {
  active: "border-state-success/40 bg-state-success/5",
  incomplete: "border-state-warning/40 bg-state-warning/5",
  "off-map": "border-ink-500 bg-ink-800/40",
};

export function MapLayersLegend({ labels }: { labels: MapLayersLabels }) {
  return (
    <section
      className="flex flex-col gap-3"
      data-testid="map-layers-legend"
      aria-label={labels.title}
    >
      <div className="flex items-center gap-2 text-text-primary">
        <Layers className="h-4 w-4 text-text-secondary" strokeWidth={1.75} aria-hidden />
        <h2 className="font-display text-sm font-semibold">{labels.title}</h2>
      </div>
      <p className="text-xs leading-relaxed text-text-secondary">{labels.intro}</p>

      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
          {labels.visibleNow}
        </span>
        <ul className="flex flex-col gap-1.5" data-testid="map-layers-visible">
          {labels.visibleRows.map((row) => {
            const body = (
              <>
                <span
                  aria-hidden
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${STATE_DOT[row.state]}`}
                />
                <span className="min-w-0">
                  <span className="block text-sm text-text-primary">{row.label}</span>
                  {row.hint && (
                    <span className="block text-meta leading-relaxed text-text-muted">
                      {row.hint}
                    </span>
                  )}
                </span>
              </>
            );
            // Dead-UI rule C (owner smoke 2026-07-05): an "incomplete — add
            // your location" row must ACT, not only explain — rows may carry
            // an href to the surface where the user fixes the gap.
            return row.href ? (
              <li key={row.label}>
                <a
                  href={row.href}
                  className={`flex items-start gap-2 rounded-md border px-3 py-2 transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue ${STATE_RING[row.state]}`}
                  data-testid="map-layer-fix-link"
                >
                  {body}
                </a>
              </li>
            ) : (
              <li
                key={row.label}
                className={`flex items-start gap-2 rounded-md border px-3 py-2 ${STATE_RING[row.state]}`}
              >
                {body}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="inline-flex items-center gap-1.5 font-mono text-meta uppercase tracking-label text-text-muted">
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
                className="inline-block cursor-not-allowed rounded-full border border-ink-500 bg-ink-800/40 px-2.5 py-1 text-meta text-text-muted opacity-70"
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
