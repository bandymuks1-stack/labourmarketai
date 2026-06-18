"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Map as MapIcon, MapPinOff } from "lucide-react";
import { env } from "@/lib/env";

/**
 * Real Google Maps base map (market-map foundation, v1).
 *
 * The base TILES are real Google Maps — rendered only when a browser API key
 * exists (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY). When no key is configured, an honest
 * "config needed" fallback is shown — NEVER fake tiles.
 *
 * Platform MARKERS are intentionally NOT rendered: there is no real, consent-
 * gated, coordinate-level location data yet (the precise-location tables are
 * owner-gated and unapplied — see docs). So the map shows an honest empty state.
 * No fake markers, no hardcoded/sample marker arrays, no placeholder coords, and
 * never an exact personal residence. The key is read from env, never printed.
 */

// Initial camera framing over the served region (Baltics + Northern Europe).
// This is the map VIEWPORT only — it is NOT a data point and NOT a marker.
const VIEW = { lat: 56.0, lng: 18.0, zoom: 4 } as const;

interface GMaps {
  maps?: { Map: new (el: HTMLElement, opts: Record<string, unknown>) => unknown };
}
declare global {
  interface Window {
    google?: GMaps;
    __lmGmapsLoading?: Promise<void>;
  }
}

function loadGoogleMaps(key: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps) return Promise.resolve();
  if (window.__lmGmapsLoading) return window.__lmGmapsLoading;
  window.__lmGmapsLoading = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src =
      "https://maps.googleapis.com/maps/api/js?key=" +
      encodeURIComponent(key) +
      "&loading=async&v=weekly";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("google-maps-load-failed"));
    document.head.appendChild(s);
  });
  return window.__lmGmapsLoading;
}

export function MarketMapBase() {
  const t = useTranslations("marketMapBase");
  const key = env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!key || !ref.current) return;
    let cancelled = false;
    loadGoogleMaps(key)
      .then(() => {
        if (cancelled || !ref.current) return;
        const g = window.google;
        if (!g?.maps?.Map) {
          setStatus("error");
          return;
        }
        // Base map only — no markers are added (no real visible data yet).
        mapRef.current = new g.maps.Map(ref.current, {
          center: { lat: VIEW.lat, lng: VIEW.lng },
          zoom: VIEW.zoom,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  // ── No browser key → honest config-needed fallback (no fake tiles/markers). ──
  if (!key) {
    return (
      <section
        className="card-border flex flex-col gap-2 p-6"
        data-testid="market-map-base-config-needed"
      >
        <h2 className="flex items-center gap-2 font-display text-base font-semibold text-text-primary">
          <MapIcon className="h-5 w-5 text-brand-blue" strokeWidth={1.75} aria-hidden />
          {t("configNeededTitle")}
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">
          {t("configNeededBody")}
        </p>
        <p
          className="mt-1 flex items-start gap-2 text-xs leading-relaxed text-text-muted"
          data-testid="market-map-base-empty"
        >
          <MapPinOff className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.75} aria-hidden />
          {t("emptyBody")}
        </p>
      </section>
    );
  }

  // ── Real Google Maps base tiles + honest empty-state (no platform markers). ──
  return (
    <section
      className="card-border relative flex flex-col overflow-hidden"
      data-testid="market-map-base"
    >
      <div
        ref={ref}
        data-testid="market-map-base-canvas"
        aria-label={t("ariaLabel")}
        role="application"
        className="h-[360px] w-full bg-ink-900"
      />
      <p
        className="flex items-start gap-2 border-t border-border-subtle px-4 py-3 text-xs leading-relaxed text-text-muted"
        data-testid="market-map-base-empty"
      >
        <MapPinOff className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.75} aria-hidden />
        {t("emptyBody")}
      </p>
      {status === "error" && (
        <p className="px-4 pb-3 text-xs text-state-warning" data-testid="market-map-base-error">
          {t("error")}
        </p>
      )}
    </section>
  );
}