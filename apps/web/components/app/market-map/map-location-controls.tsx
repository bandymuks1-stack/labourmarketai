"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Crosshair,
  Loader2,
  MapPin,
  Pencil,
  RotateCw,
  Trash2,
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
import { resolveLocation, type LocationPrecision } from "@/lib/location/city-coordinates";
import {
  canRetrySucceed,
  classifyGeoFailure,
  detectInAppBrowser,
  needsOpenInBrowserGuidance,
  type GeoEnvironment,
  type GeoFailure,
} from "@/lib/browser/geo-capability";
import type { OwnLocationOverlay } from "./own-location-layer";

/**
 * LOCATION + RADIUS — the controls OF the one map.
 *
 * Formerly `market-map-base.tsx`, which carried its OWN Leaflet map next to the
 * market map. The map is now the single canonical `<MarketMap>` (mounted by
 * `world-discovery.tsx`); this module owns only the location STATE
 * (`useOwnLocation`) and the compact control bar. Same persistence (this
 * device's localStorage, one-tap updatable/removable), same geolocation
 * failure handling, same F12 safe editing (a map tap NEVER overwrites the saved
 * location — it stages a preview that needs Save), no provider, no key.
 */

const PRECISION_KEY: Record<LocationPrecision, string> = {
  device: "precisionDevice",
  city: "precisionCity",
  country: "precisionCountry",
  unset: "precisionUnset",
};

/** One honest, plain-language message per distinguishable failure state —
 *  never a technical error code, never advice that cannot work in the
 *  user's actual context. */
const GEO_HINT_KEY: Record<GeoFailure, string> = {
  denied: "geoDenied",
  "denied-in-app": "geoDeniedInApp",
  unsupported: "geoUnavailable",
  unavailable: "geoNoFix",
  timeout: "geoTimeout",
  "insecure-context": "geoInsecure",
};

function geoEnvironment(): GeoEnvironment {
  const nav = typeof navigator === "undefined" ? null : navigator;
  return {
    secureContext: typeof window === "undefined" ? true : window.isSecureContext !== false,
    apiAvailable: Boolean(nav && "geolocation" in nav),
    inApp: detectInAppBrowser(nav?.userAgent ?? null),
  };
}

export function useOwnLocation() {
  const [selected, setSelected] = useState<SelectedLocation | null>(null);
  const [radiusKm, setRadiusKm] = useState<RadiusKm>(DEFAULT_RADIUS_KM);
  const [mapEditMode, setMapEditMode] = useState(false);
  const [previewPoint, setPreviewPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [pickLockedHint, setPickLockedHint] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoHint, setGeoHint] = useState<GeoFailure | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");
  const [address, setAddress] = useState("");
  const [manualError, setManualError] = useState<"country" | null>(null);

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

  const locateMe = useCallback(() => {
    setGeoHint(null);
    setManualError(null);
    const env = geoEnvironment();
    if (!env.secureContext || !env.apiAvailable) {
      setGeoHint(classifyGeoFailure(env, null));
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
      (err) => {
        setGeoBusy(false);
        setGeoHint(classifyGeoFailure(env, err?.code ?? null));
        setManualOpen(true); // immediately offer the manual form
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }, [persist, radiusKm]);

  const saveManual = useCallback(() => {
    setManualError(null);
    if (!country) {
      setManualError("country");
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
  }, [country, region, address, radiusKm, persist]);

  // F12 safe editing: a tap NEVER writes directly. With a saved location and
  // edit mode OFF the tap is inert (a hint says how to change it); otherwise
  // it stages a PREVIEW point that needs an explicit Save.
  const pickFromMap = useCallback(
    (lat: number, lng: number) => {
      setGeoHint(null);
      setManualError(null);
      if (selected && !mapEditMode) {
        setPickLockedHint(true);
        return;
      }
      setPickLockedHint(false);
      setPreviewPoint({ lat, lng });
    },
    [selected, mapEditMode],
  );

  const savePreview = useCallback(() => {
    if (!previewPoint) return;
    persist({
      source: "auto",
      lat: previewPoint.lat,
      lng: previewPoint.lng,
      country: null,
      region: null,
      address: null,
      radiusKm,
      savedAt: Date.now(),
    });
    setPreviewPoint(null);
    setMapEditMode(false);
  }, [previewPoint, persist, radiusKm]);

  const cancelPreview = useCallback(() => {
    setPreviewPoint(null);
    setMapEditMode(false);
  }, []);

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

  return {
    selected,
    radiusKm: selected?.radiusKm ?? radiusKm,
    pickFromMap,
    previewPoint,
    mapEditMode,
    setMapEditMode,
    pickLockedHint,
    setPickLockedHint,
    geoBusy,
    geoHint,
    manualOpen,
    setManualOpen,
    country,
    setCountry,
    region,
    setRegion,
    address,
    setAddress,
    manualError,
    locateMe,
    saveManual,
    savePreview,
    cancelPreview,
    changeRadius,
    editManual,
    reset,
  };
}

export type OwnLocationState = ReturnType<typeof useOwnLocation>;

/** The overlay the one map draws for this state. */
export function overlayFor(
  s: OwnLocationState,
  extra: { identity?: OwnLocationOverlay["identity"]; suppress?: boolean },
): OwnLocationOverlay {
  return {
    selected: s.selected,
    radiusKm: s.radiusKm,
    identity: extra.identity,
    suppress: extra.suppress,
    previewPoint: s.previewPoint,
    onPick: s.pickFromMap,
  };
}

export function MapLocationControls({ state: s }: { state: OwnLocationState }) {
  const t = useTranslations("marketMapBase");
  const tc = useTranslations("labourMarket");

  const whereText = (loc: SelectedLocation): string => {
    if (hasCoords(loc)) return `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`;
    return [loc.region, loc.country ? tc(`countryNames.${loc.country}`) : null]
      .filter(Boolean)
      .join(", ");
  };

  const field =
    "w-full rounded-lg border border-ink-500 bg-ink-700 px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue";

  return (
    <div className="flex flex-col gap-2" id="market-map-base" data-testid="market-map-base">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={s.locateMe}
          disabled={s.geoBusy}
          data-testid="map-locator-auto"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-brand-blue/50 bg-brand-blue/10 px-3 text-sm font-semibold text-brand-blue transition-colors hover:border-brand-blue disabled:opacity-60"
        >
          {s.geoBusy ? (
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
          ) : (
            <Crosshair className="h-4 w-4" strokeWidth={2} aria-hidden />
          )}
          {s.geoBusy ? t("autoLocating") : t("autoButton")}
        </button>
        <label className="flex items-center gap-2">
          <select
            value={s.radiusKm}
            onChange={(e) => s.changeRadius(Number(e.target.value) as RadiusKm)}
            aria-label={t("radiusLabel")}
            data-testid="map-locator-radius"
            className="min-h-11 rounded-lg border border-ink-500 bg-ink-700 px-3 text-sm text-text-primary outline-none focus:border-brand-blue"
          >
            {RADIUS_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {t("radiusValue", { km: r })}
              </option>
            ))}
          </select>
        </label>
        {!s.manualOpen && s.selected ? (
          <button
            type="button"
            onClick={s.editManual}
            data-testid="map-locator-edit"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-ink-500 px-3 text-sm font-medium text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {t("editButton")}
          </button>
        ) : null}
        {!s.manualOpen && !s.selected ? (
          <button
            type="button"
            onClick={() => s.setManualOpen(true)}
            data-testid="map-locator-manual-toggle"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-ink-500 px-3 text-sm font-medium text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {t("manualToggle")}
          </button>
        ) : null}
      </div>

      {s.geoHint && (
        <div
          className="flex flex-col items-start gap-2 rounded-xl border border-state-warning/30 bg-state-warning/5 p-3"
          data-testid="map-locator-geo-hint"
          role="status"
        >
          <p className="text-xs leading-relaxed text-state-warning">
            {t(GEO_HINT_KEY[s.geoHint])}
          </p>
          {needsOpenInBrowserGuidance(s.geoHint, geoEnvironment()) && (
            <p
              className="text-xs leading-relaxed text-text-secondary"
              data-testid="map-locator-open-in-browser"
            >
              {t("geoOpenInBrowser")}
            </p>
          )}
          {canRetrySucceed(s.geoHint) && (
            <button
              type="button"
              onClick={s.locateMe}
              disabled={s.geoBusy}
              data-testid="map-locator-retry"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-ink-500 px-3 text-xs font-medium text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary disabled:opacity-60"
            >
              <RotateCw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              {t("geoRetry")}
            </button>
          )}
        </div>
      )}

      {s.manualOpen ? (
        <div
          className="grid gap-3 rounded-xl border border-ink-500 bg-ink-800/40 p-3 sm:grid-cols-3"
          data-testid="map-locator-manual"
        >
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">{t("countryLabel")}</span>
            <select
              value={s.country}
              onChange={(e) => s.setCountry(e.target.value)}
              data-testid="map-locator-country"
              className={field}
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
              value={s.region}
              onChange={(e) => s.setRegion(e.target.value)}
              placeholder={t("regionPlaceholder")}
              data-testid="map-locator-region"
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">{t("addressLabel")}</span>
            <input
              type="text"
              value={s.address}
              onChange={(e) => s.setAddress(e.target.value)}
              placeholder={t("addressPlaceholder")}
              data-testid="map-locator-address"
              className={field}
            />
          </label>
          {s.manualError ? (
            <p
              className="text-xs text-state-danger sm:col-span-3"
              data-testid="map-locator-error"
              role="alert"
            >
              {t("errorCountry")}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 sm:col-span-3">
            <button
              type="button"
              onClick={s.saveManual}
              data-testid="map-locator-manual-submit"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-brand-blue/50 bg-brand-blue/10 px-4 text-sm font-semibold text-brand-blue transition-colors hover:border-brand-blue"
            >
              <Check className="h-4 w-4" strokeWidth={2} aria-hidden />
              {t("save")}
            </button>
            <button
              type="button"
              onClick={() => s.setManualOpen(false)}
              className="inline-flex min-h-11 items-center rounded-lg border border-ink-500 px-4 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              {t("previewCancel")}
            </button>
          </div>
        </div>
      ) : null}

      {/* F12 safe editing: state-aware map hint + explicit controls. */}
      {s.previewPoint ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border border-state-warning/40 bg-state-warning/5 p-3"
          data-testid="map-preview-controls"
        >
          <p className="min-w-0 flex-1 text-xs text-text-primary">
            {t("previewTitle")} · {s.previewPoint.lat.toFixed(4)}, {s.previewPoint.lng.toFixed(4)}
          </p>
          <button
            type="button"
            onClick={s.savePreview}
            data-testid="map-preview-save"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-brand-blue/50 bg-brand-blue/10 px-3 text-xs font-semibold text-brand-blue transition-colors hover:border-brand-blue"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {t("previewSave")}
          </button>
          <button
            type="button"
            onClick={s.cancelPreview}
            data-testid="map-preview-cancel"
            className="inline-flex min-h-11 items-center rounded-md border border-ink-500 px-3 text-xs font-medium text-text-secondary transition-colors hover:border-state-danger hover:text-state-danger"
          >
            {t("previewCancel")}
          </button>
        </div>
      ) : s.mapEditMode ? (
        <p className="text-xs text-brand-cyan" data-testid="location-map-edit-hint">
          {t("mapEditHint")}
        </p>
      ) : s.selected ? (
        <div className="flex flex-wrap items-center gap-2">
          <p
            className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-text-primary"
            data-testid="map-locator-selected"
          >
            <MapPin className="h-4 w-4 shrink-0 text-brand-blue" strokeWidth={2} aria-hidden />
            <span className="min-w-0 truncate" data-testid="location-panel-where">
              {whereText(s.selected) ||
                t(s.selected.source === "auto" ? "sourceAuto" : "sourceManual")}
            </span>
          </p>
          <span
            className="rounded-full border border-ink-500 px-2 py-0.5 text-meta font-medium text-text-muted"
            data-testid="location-precision"
          >
            {t(PRECISION_KEY[resolveLocation(s.selected).precision])}
          </span>
          <button
            type="button"
            onClick={() => {
              s.setMapEditMode(true);
              s.setPickLockedHint(false);
            }}
            data-testid="map-edit-mode-toggle"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-ink-500 px-3 text-xs font-medium text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {t("mapEditButton")}
          </button>
          <button
            type="button"
            onClick={s.reset}
            data-testid="map-locator-reset"
            className="inline-flex min-h-11 items-center gap-1 rounded-md border border-ink-500 px-3 text-xs font-medium text-text-muted transition-colors hover:border-state-danger hover:text-state-danger"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {t("resetButton")}
          </button>
          {s.pickLockedHint ? (
            <p
              className="w-full text-meta text-state-warning"
              data-testid="location-map-locked-hint"
              role="status"
            >
              {t("mapLockedHint")}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-meta text-text-muted" data-testid="location-map-tap-hint">
          {t("mapTapHint")}
        </p>
      )}
    </div>
  );
}
