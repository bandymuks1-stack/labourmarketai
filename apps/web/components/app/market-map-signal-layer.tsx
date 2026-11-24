import { getTranslations } from "next-intl/server";
import { MapPin, Radar } from "lucide-react";
import type { DemandSignalBoard } from "@/lib/market-map/demand-locations";

/**
 * Market-map SIGNAL-ONLY read layer. Renders REAL company demand location
 * signals (the caller's own, RLS-scoped) grouped by country — "where need
 * exists" — as an honest board, NOT plotted points. The input shape
 * (DemandSignalBoard) carries no coordinates, so this component cannot render a
 * marker or a lat/lng. Copy says plainly: signals, no map points until
 * coordinates are confirmed.
 *
 * Pure presentational server component — the shell fetches the RLS-respected
 * board and passes it in.
 */
export async function MarketMapSignalLayer({ board }: { board: DemandSignalBoard }) {
  const t = await getTranslations("marketMap");
  const tlm = await getTranslations("labourMarket");

  const countryName = (code: string): string => {
    const name = tlm(`countryNames.${code}`);
    // next-intl returns the key path when missing — fall back to the raw code.
    return name.includes("countryNames.") ? code : name;
  };

  return (
    <section
      className="flex flex-col gap-3"
      data-testid="market-map-signal-layer"
      aria-labelledby="market-map-signal-title"
    >
      <div className="flex flex-col gap-1">
        <span
          id="market-map-signal-title"
          className="flex items-center gap-2 font-display text-base font-semibold text-text-primary"
        >
          <Radar className="h-4 w-4 text-brand-blue" strokeWidth={1.75} aria-hidden />
          {t("signalLayer.title", { count: board.total })}
        </span>
        <p className="text-meta leading-relaxed text-text-muted">
          {t("signalLayer.note")}
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {board.groups.map((group) => (
          <li
            key={group.countryCode}
            data-testid={`market-map-signal-country-${group.countryCode}`}
            className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/50 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-text-primary">
                {countryName(group.countryCode)}
              </span>
              <span className="rounded-full border border-brand-blue/40 bg-brand-blue/5 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-brand-blue">
                {t("signalLayer.countryCount", { count: group.count })}
              </span>
            </div>
            <ul className="flex flex-col gap-1.5">
              {group.entries.map((e) => {
                const place = [e.city, e.locality].filter(Boolean).join(", ");
                return (
                  <li
                    key={e.id}
                    className="flex items-start gap-2 text-xs text-text-secondary"
                    data-testid="market-map-signal-entry"
                  >
                    <MapPin
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-text-primary">{e.label}</span>
                      {place && <span className="text-text-muted">{place}</span>}
                      <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                        {t(`signalLayer.precision.${e.precision}`)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>

      <p
        className="rounded-md border border-state-warning/40 bg-state-warning/5 px-2.5 py-2 text-meta leading-relaxed text-text-secondary"
        data-testid="market-map-signal-no-points"
      >
        {t("signalLayer.noPoints")}
      </p>
    </section>
  );
}
