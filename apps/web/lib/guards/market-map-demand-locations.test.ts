import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  summarizeDemandLocations,
  isMappableDemandLocation,
  demandLayerStatus,
  type DemandLocation,
} from "@/lib/market-map/demand-locations";

/**
 * Guard: company demand locations RED draft v1 is honest, additive and inert.
 *  - the migration is human-gated, additive, owner-scoped, no anon, no fake
 *    coordinates (the DB itself forbids unverified points);
 *  - a sibling rollback file exists;
 *  - the read model performs no external geocoding and never invents a point;
 *  - the market-map demand layer is the first REAL candidate ("schema prepared"),
 *    still with fake marker data = 0;
 *  - copy present in every active locale.
 */
const APP = join(__dirname, "..", "..");
const REPO = resolve(APP, "..", "..");
const ACTIVE = ["lt", "en", "ru"] as const;

function readRepo(rel: string): string {
  return readFileSync(resolve(REPO, rel), "utf8");
}
function readApp(rel: string): string {
  return readFileSync(join(APP, rel), "utf8");
}
function loadMessages(locale: string): Record<string, unknown> {
  return JSON.parse(readApp(join("messages", `${locale}.json`))) as Record<string, unknown>;
}
function str(root: Record<string, unknown>, path: string): string {
  let cur: unknown = root;
  for (const k of path.split(".")) {
    if (cur && typeof cur === "object") cur = (cur as Record<string, unknown>)[k];
    else return "";
  }
  return typeof cur === "string" ? cur : "";
}

const MIGRATION = "supabase/migrations/20260615120000_company_demand_locations.sql";
const ROLLBACK = "supabase/rollbacks/20260615120000_company_demand_locations.down.sql";
const READ_MODEL = "lib/market-map/demand-locations.ts";
const SHELL = "components/app/market-map-shell.tsx";

describe("demand-locations migration — additive, human-gated, owner-scoped", () => {
  const sql = readRepo(MIGRATION);
  const lower = sql.toLowerCase();
  // executable SQL only (strip line comments) for the destructive/anon checks
  const code = sql
    .split(/\r?\n/)
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n")
    .toLowerCase();

  it("is human-gated (RED) and carries an in-file rollback marker", () => {
    expect(sql).toMatch(/--\s*@human-gate-approved/i);
    expect(sql).toMatch(/--\s*rollback/i);
  });

  it("creates the new table additively, linked to the real demand row", () => {
    expect(lower).toContain("create table if not exists public.company_demand_locations");
    expect(lower).toMatch(/references\s+public\.customer_requests\(id\)/);
    expect(lower).toMatch(/references\s+public\.profiles\(id\)/);
  });

  it("is non-destructive (no drop/rename/backfill of existing objects)", () => {
    expect(code).not.toMatch(/drop\s+table\s+(if\s+exists\s+)?public\.customer_requests/);
    expect(code).not.toMatch(/drop\s+column/);
    expect(code).not.toMatch(/\brename\b/);
    expect(code).not.toMatch(/\bupdate\s+public\./);
    expect(code).not.toMatch(/\bdelete\s+from\b/);
  });

  it("enables RLS, owner-scoped read + admin, NO anon / NO public / NO using(true)", () => {
    expect(lower).toContain("enable row level security");
    expect(lower).toMatch(/for\s+select\s+using\s*\(\s*owner_id\s*=\s*auth\.uid\(\)\s+or\s+public\.is_admin\(\)\s*\)/);
    expect(code).not.toMatch(/\bto\s+anon\b/);
    expect(code).not.toMatch(/\busing\s*\(\s*true\s*\)/);
    expect(code).not.toMatch(/\bto\s+public\b/);
  });

  it("write policy forbids attaching a location to someone else's demand", () => {
    // WITH CHECK requires owner_id = auth.uid() AND the referenced
    // customer_requests row to belong to auth.uid() (no request_id spoofing).
    expect(lower).toMatch(/with\s+check\s*\([\s\S]*?owner_id\s*=\s*auth\.uid\(\)/);
    expect(lower).toMatch(/exists\s*\([\s\S]*?from\s+public\.customer_requests\s+cr[\s\S]*?cr\.id\s*=\s*request_id[\s\S]*?cr\.profile_id\s*=\s*auth\.uid\(\)/);
  });

  it("grants to authenticated only — never anon/public/service_role", () => {
    expect(lower).toMatch(/grant[\s\S]*?on\s+public\.company_demand_locations\s+to\s+authenticated/);
    expect(code).not.toMatch(/grant[\s\S]{0,120}?to\s+(anon|public|service_role)\b/);
  });

  it("adds NO new SECURITY DEFINER function", () => {
    expect(code).not.toMatch(/security\s+definer/);
  });

  it("forbids fake/unverified coordinates at the DB level", () => {
    // coordinates only when geocode_status is verified/manual
    expect(lower).toMatch(/check\s*\(\s*latitude\s+is\s+null\s+or\s+geocode_status\s+in\s*\(\s*'verified'\s*,\s*'manual'\s*\)/);
    // both-or-neither + WGS84 ranges
    expect(lower).toMatch(/latitude\s+between\s+-90\s+and\s+90/);
    expect(lower).toMatch(/longitude\s+between\s+-180\s+and\s+180/);
  });

  it("has a sibling rollback file that drops the new table", () => {
    expect(existsSync(resolve(REPO, ROLLBACK))).toBe(true);
    expect(readRepo(ROLLBACK).toLowerCase()).toContain("drop table if exists public.company_demand_locations");
  });
});

describe("demand-locations read model — no geocoder, never invents a point", () => {
  // Strip comments — the module's own doc-comment legitimately names
  // Mapbox/Google/Nominatim to state it does NOT use them.
  const src = readApp(READ_MODEL)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");

  it("has NO external geocoding API / key / network call", () => {
    expect(src).not.toMatch(/mapbox/i);
    expect(src).not.toMatch(/google[^\n]*maps/i);
    expect(src).not.toMatch(/nominatim|opencage|geocod(e|ing)\s*api|geocode\.|maps\.googleapis/i);
    expect(src).not.toMatch(/\bfetch\s*\(|axios|https?:\/\//i);
    expect(src).not.toMatch(/process\.env[^\n]*(MAP|GEOCODE|TOKEN|KEY)/i);
  });

  it("has NO seeded markers / coordinate literals", () => {
    expect(src).not.toMatch(/markers?\s*[:=]\s*\[/i);
    expect(src).not.toMatch(/coordinates\s*[:=]\s*\[/i);
    // no numeric lat/lng literals in the source (counts/null-checks only)
    expect(src).not.toMatch(/latitude\s*[:=]\s*-?\d/);
    expect(src).not.toMatch(/longitude\s*[:=]\s*-?\d/);
  });

  it("empty input → all-zero summary, schema_prepared status (current reality)", () => {
    const s = summarizeDemandLocations([]);
    expect(s).toEqual({ total: 0, withCoordinates: 0, mappable: 0, signalOnly: 0, byCountry: {} });
    expect(demandLayerStatus(s)).toBe("schema_prepared");
    expect(demandLayerStatus(null)).toBe("schema_prepared");
  });

  it("country/city without confirmed coordinates is signal-only, never mappable", () => {
    const signal: DemandLocation = {
      id: "r1",
      requestId: "req1",
      ownerId: "own1",
      countryCode: "LT",
      region: null,
      city: "Vilnius",
      locality: null,
      addressText: null,
      locationLabel: "Vilnius region site",
      latitude: null,
      longitude: null,
      geoPrecision: "city",
      geocodeStatus: "pending",
      source: "demand_form",
    };
    expect(isMappableDemandLocation(signal)).toBe(false);
    const s = summarizeDemandLocations([signal]);
    expect(s).toMatchObject({ total: 1, withCoordinates: 0, mappable: 0, signalOnly: 1, byCountry: { LT: 1 } });
    expect(demandLayerStatus(s)).toBe("signal_only");
  });

  it("coordinates are honoured only when verified/manual", () => {
    // illustrative synthetic value (1,1) — a unit-test fixture, never product data
    const base: DemandLocation = {
      id: "r2",
      requestId: "req2",
      ownerId: "own2",
      countryCode: "LT",
      region: null,
      city: null,
      locality: null,
      addressText: null,
      locationLabel: "confirmed point",
      latitude: 1,
      longitude: 1,
      geoPrecision: "coordinates",
      geocodeStatus: "verified",
      source: "manual",
    };
    expect(isMappableDemandLocation(base)).toBe(true);
    expect(isMappableDemandLocation({ ...base, geocodeStatus: "pending" })).toBe(false);
  });
});

describe("market-map demand layer — first real candidate, still 0 fake markers", () => {
  const shell = readApp(SHELL);

  it("marks the demand layer as schemaPrepared and renders the schema note", () => {
    expect(shell).toMatch(/key:\s*"demand"[^}]*status:\s*"schemaPrepared"/);
    expect(shell).toMatch(/data-testid="market-map-demand-schema-note"/);
    expect(shell).toMatch(/layerSchemaPrepared/);
  });

  it("still seeds NO markers / coordinates in the shell", () => {
    expect(shell).not.toMatch(/markers?\s*[:=]\s*\[/i);
    expect(shell).not.toMatch(/coordinates\s*[:=]\s*\[/i);
    expect(shell).not.toMatch(/\blat\b\s*[:=].*\blng\b/i);
    expect(shell).not.toMatch(/mapbox|google[^\n]*maps/i);
  });
});

describe("demand-locations copy — present in every active locale", () => {
  for (const locale of ACTIVE) {
    const m = loadMessages(locale);
    it(`${locale}: layerSchemaPrepared + demandSchemaNote present`, () => {
      expect(str(m, "marketMap.layerSchemaPrepared"), `${locale} layerSchemaPrepared`).toBeTruthy();
      expect(str(m, "marketMap.demandSchemaNote"), `${locale} demandSchemaNote`).toBeTruthy();
    });
  }
  it("lt schema note frames demand as signal-only, not a live point (migration now applied)", () => {
    // company_demand_locations is applied (2026-06-16); the note no longer
    // references a RED/unapplied migration — it honestly frames demand as
    // signals, with exact points only once locations are confirmed.
    const note = str(loadMessages("lt"), "marketMap.demandSchemaNote");
    expect(note).toMatch(/signal/i);
    expect(note).not.toMatch(/RED|migracij/i);
  });
});
