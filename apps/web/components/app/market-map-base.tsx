"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  MapPin,
  LocateFixed,
  Search,
  MapPinOff,
  X,
  Loader2,
} from "lucide-react";
import { env } from "@/lib/env";
import {
  loadGoogleMaps,
  createMap,
  setSelfMarker,
  reverseGeocode,
  forwardGeocode,
  mapsReady,
  type GMap,
  type GMarker,
} from "@/lib/maps/google-maps-loader";
import {
  readMyLocation,
  writeMyLocation,
  clearMyLocation,
  hasCoords,
  type MyMapLocation,
} from "@/lib/maps/my-location-store";

/**
 * Real, working market-map locator (v2).
 *
 * Two REAL modes, on mobile and desktop:
 *  1) Automatic — "use my location" requests browser geolocation, centers the
 *     real Google Maps view on the user, drops their OWN marker, and reverse-
 *     geocodes a readable place.
 *  2) Manual — the user types a city/region/address; it is geocoded to a point,
 *     centered and marked. Manual mode works even when geolocation is denied.
 *
 * The user's chosen point is the user's OWN consented location (real marker, not
 * fake/sample). It persists on this device (localStorage) so it survives refresh
 * — no DB write, no migration. When the map provider is not configured or fails
 * to load, the screen stays usable through manual entry behind an HONEST,
 * non-technical fallback — never a raw API/env-key string (the missing config is
 * documented for the owner in the PR + docs/setup/GOOGLE_MAPS_SETUP.md, never in
 * the UI). See lib/guards/map-locator-real.test.ts.
 */

// Initial camera framing over the served region (Baltics + Northern Europe).
// VIEWPORT only — not a data point, not a marker.
const VIEW = { lat: 56.0, lng: 18.0, zoom: 4 } as const;
const SELECTED_ZOOM = 11;

export function MarketMapBase() {
  const t = useTranslations("marketMapBase");
  const key = env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GMap | null>(null);
  const markerRef = useRef<GMarker | null>(null);

  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">(
    key ? "loading" : "error",
  );
  const [selected, setSelected] = useState<MyMapLocation | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoHint, setGeoHint] = useState<"denied" | "unavailable" | null>(null);
  const [manualQuery, setManualQuery] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  // Restore any previously chosen location (this device) on mount.
  useEffect(() => {
    setSelected(readMyLocation());
  }, []);

  // Center the live map + (re)place the self marker for a coordinate location.
  const applyToMap = useCallback((loc: MyMapLocation) => {
    const map = mapRef.current;
    if (!map || !hasCoords(loc)) return;
    map.setCenter({ lat: loc.lat, lng: loc.lng });
    map.setZoom(SELECTED_ZOOM);
    markerRef.current = setSelfMarker(
      map,
      { lat: loc.lat, lng: loc.lng },
      markerRef.current,
    );
  }, []);

  // Load the real Google Maps base when a browser key is configured.
  useEffect(() => {
    if (!key || !canvasRef.current) return;
    let cancelled = false;
    loadGoogleMaps(key)
      .then(() => {
        if (cancelled || !canvasRef.current) return;
        const stored = readMyLocation();
        const center =
          stored && hasCoords(stored)
            ? { lat: stored.lat, lng: stored.lng }
            : { lat: VIEW.lat, lng: VIEW.lng };
        const map = createMap(
          canvasRef.current,
          center,
          stored && hasCoords(stored) ? SELECTED_ZOOM : VIEW.zoom,
        );
        if (!map) {
          setMapStatus("error");
          return;
        }
        mapRef.current = map;
        if (stored && hasCoords(stored)) {
          markerRef.current = setSelfMarker(
            map,
            { lat: stored.lat, lng: stored.lng },
            null,
          );
        }
        setMapStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setMapStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const persist = useCallback(
    (loc: MyMapLocation) => {
      writeMyLocation(loc);
      setSelected(loc);
      applyToMap(loc);
    },
    [applyToMap],
  );

  // ── Automatic mode: browser geolocation → center + marker + reverse geocode ──
  const useMyLocation = useCallback(() => {
    setGeoHint(null);
    setManualError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoHint("unavailable");
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const at = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        let label = t("autoDefaultLabel");
        if (mapsReady()) {
          const place = await reverseGeocode(at);
          if (place) label = place;
        }
        persist({ ...at, label, mode: "auto", savedAt: Date.now() });
        setGeoBusy(false);
      },
      () => {
        setGeoBusy(false);
        setGeoHint("denied");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }, [persist, t]);

  // ── Manual mode: typed place → geocode (with provider) or label-only fallback ─
  const submitManual = useCallback(async () => {
    const q = manualQuery.trim();
    setManualError(null);
    if (q.length === 0) return;
    setManualBusy(true);
    try {
      if (mapsReady()) {
        const hit = await forwardGeocode(q);
        if (!hit) {
          setManualError(t("notFound"));
          return;
        }
        persist({
          lat: hit.lat,
          lng: hit.lng,
          label: hit.label,
          mode: "manual",
          savedAt: Date.now(),
        });
      } else {
        // Provider unavailable — still record the typed place so it is used for
        // job search / suggestions. Honest: no fake point on the map.
        persist({
          lat: null,
          lng: null,
          label: q,
          mode: "manual",
          savedAt: Date.now(),
        });
      }
      setManualQuery("");
    } finally {
      setManualBusy(false);
    }
  }, [manualQuery, persist, t]);

  const clear = useCallback(() => {
    clearMyLocation();
    setSelected(null);
    if (markerRef.current) {
      markerRef.current.setMap(null);
      markerRef.current = null;
    }
    if (mapRef.current) {
      mapRef.current.setCenter({ lat: VIEW.lat, lng: VIEW.lng });
      mapRef.current.setZoom(VIEW.zoom);
    }
  }, []);

  const mapAvailable = !!key && mapStatus !== "error";

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

      {/* Real Google Maps canvas (mounted whenever a browser key exists so the
          ref attaches and the map can render on mobile + desktop). */}
      {!!key && (
        <div
          ref={canvasRef}
          data-testid="market-map-base-canvas"
          aria-label={t("ariaLabel")}
          role="application"
          className={`h-[300px] w-full overflow-hidden rounded-xl border border-ink-500 bg-ink-900 sm:h-[360px] ${
            mapStatus === "error" ? "hidden" : ""
          }`}
        />
      )}

      {/* Honest, NON-TECHNICAL fallback when the map provider is not configured
          or failed to load. Manual entry below stays fully usable. */}
      {!mapAvailable && (
        <div
          className="flex items-start gap-2 rounded-xl border border-dashed border-ink-500 bg-ink-800/40 p-4"
          data-testid="market-map-base-fallback"
        >
          <MapPinOff
            className="mt-0.5 h-5 w-5 shrink-0 text-text-muted"
            strokeWidth={1.75}
            aria-hidden
          />
          <p className="text-sm leading-relaxed text-text-secondary">
            {t("fallbackBody")}
          </p>
        </div>
      )}

      {/* Controls: automatic + manual modes (both always available). */}
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={useMyLocation}
          disabled={geoBusy}
          data-testid="map-locator-auto"
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-brand-blue/50 bg-brand-blue/10 px-4 py-3 text-sm font-semibold text-brand-blue transition-colors hover:border-brand-blue disabled:opacity-60 sm:w-fit"
        >
          {geoBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <LocateFixed className="h-4 w-4" strokeWidth={2} aria-hidden />
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

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitManual();
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">
              {t("manualLabel")}
            </span>
            <input
              type="text"
              value={manualQuery}
              onChange={(e) => setManualQuery(e.target.value)}
              placeholder={t("manualPlaceholder")}
              data-testid="map-locator-manual-input"
              className="w-full rounded-lg border border-ink-500 bg-ink-700 px-3 py-2.5 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue"
            />
          </label>
          <button
            type="submit"
            disabled={manualBusy || manualQuery.trim().length === 0}
            data-testid="map-locator-manual-submit"
            className="inline-flex items-center justify-center gap-2 self-end rounded-lg border border-ink-500 bg-ink-700 px-4 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:border-brand-blue disabled:opacity-60"
          >
            {manualBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Search className="h-4 w-4" strokeWidth={2} aria-hidden />
            )}
            {manualBusy ? t("manualSearching") : t("manualButton")}
          </button>
        </form>

        {manualError && (
          <p
            className="text-xs leading-relaxed text-state-danger"
            data-testid="map-locator-error"
            role="alert"
          >
            {manualError}
          </p>
        )}
      </div>

      {/* Selected location readout (the user's own consented point/label). */}
      {selected ? (
        <div
          className="flex items-start justify-between gap-3 rounded-xl border border-brand-blue/30 bg-brand-blue/5 px-4 py-3"
          data-testid="map-locator-selected"
        >
          <span className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
              <MapPin className="h-4 w-4 text-brand-blue" strokeWidth={2} aria-hidden />
              {t("selectedPrefix")} {selected.label}
            </span>
            <span className="text-[11px] leading-relaxed text-text-muted">
              {hasCoords(selected) ? t("coordsHidden") : t("savedManualNote")}
            </span>
          </span>
          <button
            type="button"
            onClick={clear}
            data-testid="map-locator-clear"
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-text-muted transition-colors hover:text-text-secondary"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {t("clearButton")}
          </button>
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