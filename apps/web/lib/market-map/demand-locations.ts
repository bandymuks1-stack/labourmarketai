/**
 * Company demand locations — typed read model for the live market map's first
 * REAL geo layer (RED draft v1). A demand location is WHERE a company actually
 * needs workers / a brigade / a service / a project executed — a labour-market
 * signal, never the company's registration address and never a fake marker.
 *
 * This module is pure and inert: it defines the row shape (mirroring the
 * `public.company_demand_locations` RED-draft migration) and honest derivations
 * over rows that the UI/RPC will pass in ONCE the migration is owner-applied.
 * It performs NO database read, NO network call, and NO geocoding — there is no
 * external geocoder (Mapbox / Google / Nominatim) and no map API key anywhere.
 *
 * Honesty rule (doctrine §7/§18): a location only becomes a real, mappable point
 * when its coordinates are present AND geocoding is verified/manual. Until then
 * the demand layer reports "schema prepared", never an invented point. This file
 * contains NO coordinate literals and seeds NO points.
 */

import type { CountryCode } from "@/lib/labour-market/country-evidence";

/** How precisely a demand location is known (matches the DB CHECK). */
export type DemandGeoPrecision =
  | "country"
  | "city"
  | "address"
  | "coordinates"
  | "unknown";

/** Lifecycle of the (optional, owner-gated) geocoding step (matches the DB CHECK). */
export type DemandGeocodeStatus =
  | "not_required"
  | "pending"
  | "verified"
  | "failed"
  | "manual";

/** Where the location came from (matches the DB CHECK). */
export type DemandLocationSource = "demand_form" | "admin" | "import" | "manual";

/**
 * One row of `public.company_demand_locations`. `latitude`/`longitude` are
 * nullable and, per the DB CHECK, may only be set once `geocodeStatus` is
 * `verified` or `manual` — so unverified rows can never carry coordinates.
 */
export interface DemandLocation {
  id: string;
  requestId: string;
  ownerId: string;
  countryCode: string;
  region: string | null;
  city: string | null;
  locality: string | null;
  addressText: string | null;
  locationLabel: string;
  latitude: number | null;
  longitude: number | null;
  geoPrecision: DemandGeoPrecision;
  geocodeStatus: DemandGeocodeStatus;
  source: DemandLocationSource;
}

/**
 * A demand location is a REAL mappable point only when it carries coordinates
 * AND those coordinates were verified or manually confirmed. Free-text-only
 * rows (country/city without confirmed coordinates) are NOT plotted — they are
 * a signal that a need exists, surfaced as a list/aggregate, not a fake marker.
 */
export function isMappableDemandLocation(row: DemandLocation): boolean {
  return (
    row.latitude !== null &&
    row.longitude !== null &&
    (row.geocodeStatus === "verified" || row.geocodeStatus === "manual")
  );
}

/** Honest, fake-data-free summary the market-map demand layer renders. */
export interface DemandLocationSummary {
  /** Total demand-location rows known. */
  total: number;
  /** Rows that carry any (verified/manual) coordinates. */
  withCoordinates: number;
  /** Rows that are actually plottable as real points right now. */
  mappable: number;
  /** Rows that signal a need but have no confirmed point yet. */
  signalOnly: number;
  /** Count by ISO-2 country code (real dimension, no invented places). */
  byCountry: Record<string, number>;
}

/**
 * Summarize demand locations into counts only — never synthesizes a point.
 * With no rows (the current reality, since the migration is not applied) every
 * count is 0, which is exactly what the foundation should show.
 */
export function summarizeDemandLocations(
  rows: readonly DemandLocation[],
): DemandLocationSummary {
  const byCountry: Record<string, number> = {};
  let withCoordinates = 0;
  let mappable = 0;

  for (const row of rows) {
    byCountry[row.countryCode] = (byCountry[row.countryCode] ?? 0) + 1;
    if (row.latitude !== null && row.longitude !== null) withCoordinates += 1;
    if (isMappableDemandLocation(row)) mappable += 1;
  }

  return {
    total: rows.length,
    withCoordinates,
    mappable,
    signalOnly: rows.length - mappable,
    byCountry,
  };
}

/**
 * Status of the demand layer on the market map. Until the RED migration is
 * applied AND real rows exist, the layer is `schema_prepared` — the honest
 * "ready as a plan, no points yet" state the foundation renders.
 */
export type DemandLayerStatus = "schema_prepared" | "signal_only" | "live";

export function demandLayerStatus(
  summary: DemandLocationSummary | null,
): DemandLayerStatus {
  if (!summary || summary.total === 0) return "schema_prepared";
  if (summary.mappable === 0) return "signal_only";
  return "live";
}

/** A country filter dimension is real only if it's a supported country code. */
export function isSupportedDemandCountry(
  code: string,
  supported: readonly CountryCode[],
): boolean {
  return (supported as readonly string[]).includes(code);
}

/**
 * One demand signal for the market-map read layer. By design this shape carries
 * NO latitude/longitude — the signal layer can render only "where need exists"
 * (country/city/label), never a coordinate or a plotted point.
 */
export interface DemandSignalEntry {
  id: string;
  requestId: string;
  countryCode: string;
  city: string | null;
  locality: string | null;
  label: string;
  precision: DemandGeoPrecision;
}

export interface DemandSignalCountryGroup {
  countryCode: string;
  count: number;
  entries: DemandSignalEntry[];
}

export interface DemandSignalBoard {
  total: number;
  groups: DemandSignalCountryGroup[];
}

/**
 * Build the signal-only read board: real demand locations grouped by country,
 * showing where need exists WITHOUT any coordinate. A coordinate-confirmed,
 * mappable row is deliberately EXCLUDED — that belongs to a future marker layer,
 * not the signal layer. The output type has no lat/lng, so a point can never be
 * rendered from it. Groups are sorted by count (desc) then country code.
 */
export function buildDemandSignalBoard(
  rows: readonly DemandLocation[],
): DemandSignalBoard {
  const byCountry = new Map<string, DemandSignalEntry[]>();
  for (const row of rows) {
    // signal-only: never include a mappable (coordinate-confirmed) row here.
    if (isMappableDemandLocation(row)) continue;
    const entry: DemandSignalEntry = {
      id: row.id,
      requestId: row.requestId,
      countryCode: row.countryCode,
      city: row.city,
      locality: row.locality,
      label: row.locationLabel,
      precision: row.geoPrecision,
    };
    const list = byCountry.get(row.countryCode);
    if (list) list.push(entry);
    else byCountry.set(row.countryCode, [entry]);
  }

  const groups: DemandSignalCountryGroup[] = [...byCountry.entries()]
    .map(([countryCode, entries]) => ({ countryCode, count: entries.length, entries }))
    .sort((a, b) => b.count - a.count || a.countryCode.localeCompare(b.countryCode));

  return { total: groups.reduce((n, g) => n + g.count, 0), groups };
}
