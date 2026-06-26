"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  MapPin,
  Crosshair,
  MapPinOff,
  Pencil,
  RotateCw,
  Trash2,
  Loader2,
  Check,
} from "lucide-react";
import { MARKET_COUNTRIES } from "@/lib/taxonomy/work-categories";
import {
  RADIUS_OPTIONS,
  DEFAULT_RADIUS_KM,
  hasCoords,
  type RadiusKm,
  type SelectedLocation,
} from "@/lib/location/location-model";
import {
  readSelectedLocation,
  writeSelectedLocation,
  clearSelectedLocation,
} from "@/lib/location/location-store";
import { MarketMapLive } from "@/components/app/market-map-live";
import { resolveLocation, type LocationPrecision } from "@/lib/location/city-coordinates";

const PRECISION_KEY: Record<LocationPrecision, string> = {
  device: "precisionDevice",
  city: "precisionCity",
  country: "precisionCountry",
  unset: "precisionUnset",
};

/**
 * Provider-free location picker (PR #484 — no Google, no paid provider).
 *
 * Two real modes, minimum user effort:
 *  1) Automatic FIRST — "Naudoti mano buvimo vietą" requests browser geolocation
 *     and saves latitude/longitude. No typing needed when it works.
 *  2) Manual fallback — if denied/unavailable, the user picks a country + city/
 *     region + radius (full address NOT required). Saved as structured location
 *     and usable for job search WITHOUT any geocoding/tile provider.
 *
 * The "map" is a provider-free location PANEL (a radius diagram + the chosen
 * place + source), never external map tiles, never a fake marker, never a
 * "provider not configured" message. The choice persists on this device
 * (localStorage) and is one-tap updatable/removable. No DB, no env key.
 */
/** The active identity for the map marker (real data only). `kind` keeps the
 *  marker honest to the active context — a company context never reuses the
 *  personal identity. When present, the map renders a premium identity pin at
 *  the chosen location instead of a plain dot. */
export type MapIdentity = {
  kind: "person" | "company";
  name: string;
  initial: string;
  avatarUrl: string | null;
  statusLabel?: string | null;
  /** Real localized profession / lead-capability label (omit when unset). */
  professionLabel?: string | null;
  /** Real localized availability label (omit when unknown). */
  availabilityLabel?: string | null;
  /** Real count of confirmed skills (worker_skills.verified); 0 → no badge. */
  verifiedSkillsCount?: number;
};

export function MarketMapBase({
  identity,
  suppressOwnMarker,
}: {
  identity?: MapIdentity;
  /** Draw no own-marker / radius (company context with no confirmed location). */
  suppressOwnMarker?: boolean;
}) {
  const t = useTranslations("marketMapBase");
  const tc = useTranslations("labourMarket");

  const [selected, setSelected] = useState<SelectedLocation | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoHint, setGeoHint] = useState<"denied" | "unavailable" | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");
  const [address, setAddress] = useState("");
  const [radiusKm, setRadiusKm] = useState<RadiusKm>(DEFAULT_RADIUS_KM);
  const [manualError, setManualError] = useState<string | null>(null);

  // Restore the last chosen location (this device) and reuse it automatically.
  useEffect(() => {
    const stored = readSelectedLocation();
    if (stored) {
      setSelected(stored);
      setRadiusKm(stored.radiusKm);
    }
  }, []);

  const persist = useCallback((loc: SelectedLocation) => {
    writeSelectedLocation(loc);
    setSelected(loc);
  }, []);

  // ── Automatic mode: browser geolocation (no provider, no typing) ──
  const useMyLocation = useCallback(() => {
    setGeoHint(null);
    setManualError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoHint("unavailable");
      setManualOpen(true);
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        persist({
          source: "auto",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          country: null,
          region: null,
          address: null,
          radiusKm,
          savedAt: Date.now(),
        });
        setGeoBusy(false);
      },
      () => {
        setGeoBusy(false);
        setGeoHint("denied");
        setManualOpen(true); // immediately offer the manual form
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }, [persist, radiusKm]);

  // ── Manual mode: structured location, no geocoding/provider ──
  const saveManual = useCallback(() => {
    setManualError(null);
    if (!country) {
      setManualError(t("errorCountry"));
      return;
    }
    persist({
      source: "manual",
      lat: null,
      lng: null,
      country,
      region: region.trim() || null,
      address: address.trim() || null,
      radiusKm,
      savedAt: Date.now(),
    });
    setManualOpen(false);
  }, [country, region, address, radiusKm, persist, t]);

  // ── Map tap: set a real coordinate by tapping the interactive map ──
  // A third, fully provider-free way to choose location (works on mobile —
  // a tap is a click). The picked point is a real coordinate from the inverse
  // projection, saved as an "auto"-source location.
  const pickFromMap = useCallback(
    (lat: number, lng: number) => {
      setGeoHint(null);
      setManualError(null);
      persist({
        source: "auto",
        lat,
        lng,
        country: null,
        region: null,
        address: null,
        radiusKm,
        savedAt: Date.now(),
      });
    },
    [persist, radiusKm],
  );

  // Change the radius of the current selection in place.
  const changeRadius = useCallback(
    (r: RadiusKm) => {
      setRadiusKm(r);
      if (selected) persist({ ...selected, radiusKm: r, savedAt: Date.now() });
    },
    [selected, persist],
  );

  const editManual = useCallback(() => {
    if (selected) {
      setCountry(selected.country ?? "");
      setRegion(selected.region ?? "");
      setAddress(selected.address ?? "");
    }
    setManualOpen(true);
  }, [selected]);

  const reset = useCallback(() => {
    clearSelectedLocation();
    setSelected(null);
    setManualOpen(false);
    setCountry("");
    setRegion("");
    setAddress("");
  }, []);

  const whereText = (loc: SelectedLocation): string => {
    if (hasCoords(loc)) return `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`;
    return [loc.region, loc.country ? tc(`countryNames.${loc.country}`) : null]
      .filter(Boolean)
      .join(", ");
  };

  return (
    <section
      className="card-border flex flex-col gap-4 p-5 sm:p-6"
      data-testid="market-map-base"
    >
      <header className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold text-text-primary">
          <MapPin className="h-5 w-5 text-brand-blue" strokeWidth={1.75} aria-hidden />
          {t("title")}
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">
          {t("subtitle")}
        </p>
      </header>

      {/* REAL interactive map — OpenStreetMap tiles via Leaflet (free, no API
          key, no secret, no paid/proprietary provider). The worker sees real
          geography / streets / regions, pans/zooms, taps to set a coordinate. The
          location + radius controls below act ON this map. The only marker is
          the worker's OWN location (privacy: no other users, no fake market
          points); honest empty state = the real map with no markers yet. */}
      <div
        className="flex flex-col gap-2 rounded-xl border border-ink-500 bg-ink-900/60 p-3"
        data-testid="location-panel"
        aria-label={t("panelTitle")}
      >
        <MarketMapLive
          selected={selected}
          radiusKm={selected?.radiusKm ?? radiusKm}
          onPick={pickFromMap}
          ariaLabel={t("panelTitle")}
          identity={identity}
          suppressOwnMarker={suppressOwnMarker}
        />
        <p className="text-center text-[11px] text-text-muted" data-testid="location-map-tap-hint">
          {t("mapTapHint")}
        </p>
        {selected ? (
          <div className="flex flex-col items-center gap-1">
            <p className="text-center text-sm font-medium text-text-primary" data-testid="location-panel-where">
              {whereText(selected) || t(selected.source === "auto" ? "sourceAuto" : "sourceManual")}
            </p>
            {/* Honest precision: device / selected city / approximate country /
                not pinpointed — so a marker never looks more precise than it is. */}
            <span
              className="rounded-full border border-ink-500 px-2 py-0.5 text-[10px] font-medium text-text-muted"
              data-testid="location-precision"
            >
              {t(PRECISION_KEY[resolveLocation(selected).precision])}
            </span>
          </div>
        ) : (
          <p className="text-center text-xs text-text-muted">{t("panelEmpty")}</p>
        )}
        <p className="text-center text-[11px] text-text-muted">
          {t("radiusValue", { km: selected?.radiusKm ?? radiusKm })}
        </p>
      </div>

      {/* Primary action: automatic location first. */}
      <button
        type="button"
        onClick={useMyLocation}
        disabled={geoBusy}
        data-testid="map-locator-auto"
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-brand-blue/50 bg-brand-blue/10 px-4 py-3 text-sm font-semibold text-brand-blue transition-colors hover:border-brand-blue disabled:opacity-60"
      >
        {geoBusy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Crosshair className="h-4 w-4" strokeWidth={2} aria-hidden />
        )}
        {geoBusy ? t("autoLocating") : t("autoButton")}
      </button>

      {geoHint && (
        <p
          className="text-xs leading-relaxed text-state-warning"
          data-testid="map-locator-geo-hint"
          role="status"
        >
          {geoHint === "denied" ? t("geoDenied") : t("geoUnavailable")}
        </p>
      )}

      {/* Manual fallback — minimal typing: country + city/region + radius. */}
      {!manualOpen ? (
        <button
          type="button"
          onClick={() => setManualOpen(true)}
          data-testid="map-locator-manual-toggle"
          className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-brand-blue transition-colors hover:text-brand-cyan"
        >
          <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          {t("manualToggle")}
        </button>
      ) : (
        <div
          className="flex flex-col gap-3 rounded-xl border border-ink-500 bg-ink-800/40 p-4"
          data-testid="map-locator-manual"
        >
          <p className="text-xs leading-relaxed text-text-muted">{t("manualHint")}</p>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">{t("countryLabel")}</span>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              data-testid="map-locator-country"
              className="w-full rounded-lg border border-ink-500 bg-ink-700 px-3 py-2.5 text-sm text-text-primary outline-none focus:border-brand-blue"
            >
              <option value="">—</option>
              {MARKET_COUNTRIES.map((code) => (
                <option key={code} value={code}>
                  {tc(`countryNames.${code}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">{t("regionLabel")}</span>
            <input
              type="text"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder={t("regionPlaceholder")}
              data-testid="map-locator-region"
              className="w-full rounded-lg border border-ink-500 bg-ink-700 px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">{t("addressLabel")}</span>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t("addressPlaceholder")}
              data-testid="map-locator-address"
              className="w-full rounded-lg border border-ink-500 bg-ink-700 px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue"
            />
          </label>
          {manualError && (
            <p className="text-xs text-state-danger" data-testid="map-locator-error" role="alert">
              {manualError}
            </p>
          )}
          <button
            type="button"
            onClick={saveManual}
            data-testid="map-locator-manual-submit"
            className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-brand-blue/50 bg-brand-blue/10 px-4 py-2.5 text-sm font-semibold text-brand-blue transition-colors hover:border-brand-blue"
          >
            <Check className="h-4 w-4" strokeWidth={2} aria-hidden />
            {t("save")}
          </button>
        </div>
      )}

      {/* Radius selector — sensible defaults, applies to the chosen location. */}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-text-secondary">{t("radiusLabel")}</span>
        <select
          value={radiusKm}
          onChange={(e) => changeRadius(Number(e.target.value) as RadiusKm)}
          data-testid="map-locator-radius"
          className="w-full rounded-lg border border-ink-500 bg-ink-700 px-3 py-2.5 text-sm text-text-primary outline-none focus:border-brand-blue sm:w-fit"
        >
          {RADIUS_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {t("radiusValue", { km: r })}
            </option>
          ))}
        </select>
      </label>

      {/* Selected location readout + one-tap actions. */}
      {selected ? (
        <div
          className="flex flex-col gap-2 rounded-xl border border-brand-blue/30 bg-brand-blue/5 px-4 py-3"
          data-testid="map-locator-selected"
        >
          <p className="text-xs font-mono uppercase tracking-label text-text-muted">{t("selectedTitle")}</p>
          <p className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
            <MapPin className="h-4 w-4 text-brand-blue" strokeWidth={2} aria-hidden />
            {t(selected.source === "auto" ? "sourceAuto" : "sourceManual")}
            {whereText(selected) ? ` · ${whereText(selected)}` : ""}
          </p>
          <p className="text-[11px] leading-relaxed text-text-secondary" data-testid="map-locator-usable">
            {t("usableNote", { km: selected.radiusKm })}
          </p>
          <p className="text-[11px] leading-relaxed text-text-muted">{t("savedLocally")}</p>
          <div className="mt-1 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={useMyLocation}
              data-testid="map-locator-update"
              className="inline-flex items-center gap-1 rounded-md border border-ink-500 px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary"
            >
              <RotateCw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              {t("updateButton")}
            </button>
            <button
              type="button"
              onClick={editManual}
              data-testid="map-locator-edit"
              className="inline-flex items-center gap-1 rounded-md border border-ink-500 px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary"
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              {t("editButton")}
            </button>
            <button
              type="button"
              onClick={reset}
              data-testid="map-locator-reset"
              className="inline-flex items-center gap-1 rounded-md border border-ink-500 px-2.5 py-1 text-xs font-medium text-text-muted transition-colors hover:border-state-danger hover:text-state-danger"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              {t("resetButton")}
            </button>
          </div>
        </div>
      ) : (
        <p
          className="flex items-start gap-2 text-xs leading-relaxed text-text-muted"
          data-testid="market-map-base-empty"
        >
          <MapPinOff className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.75} aria-hidden />
          {t("emptyBody")}
        </p>
      )}
    </section>
  );
}