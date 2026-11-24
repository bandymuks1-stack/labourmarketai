import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { matchWorkerToNeed, distanceKm } from "@/lib/market/match-v1";
import { needFromRoleText } from "@/lib/opportunities/opportunity-need";

/**
 * LOCATION MATCHING GUARDS (PR8 — Market Map / Location / Radius).
 *
 * Locks in:
 *  1. city-tier matching works end-to-end when BOTH sides know their city,
 *     and degrades honestly (country tier) when either side doesn't;
 *  2. unknown location is NEVER a penalty;
 *  3. the radius tier is engine-real (haversine) and fires ONLY on real
 *     coordinates — no geocoding, no external location APIs anywhere in the
 *     location/matching modules (offline mandate);
 *  4. the location-label RPC exposes ONLY a coarse place label — never
 *     address_text/locality/contacts (SQL pins) — and the rollback restores
 *     the exact Model-A definition;
 *  5. worker preferred locations stay own-rows (§20) — read only through
 *     the worker's own context builder.
 */

const APP_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");

const SUBJECT = {
  skills: [{ uri: "order-picking", evidence: "work_journal" as const }],
  professionSlug: "warehouse_worker",
  country: "LT",
  availabilityStatus: "available",
};

describe("city tier — fires only when BOTH sides know the city", () => {
  it("same city (case/space-insensitive) → city_match reason", () => {
    const { need } = needFromRoleText("warehouse worker order picking", "LT", "Vilnius");
    const m = matchWorkerToNeed(need, { ...SUBJECT, city: "  vilnius " });
    expect(m.reasons.some((r) => r.code === "city_match")).toBe(true);
  });

  it("different city in the same country → country tier, NEVER a gap", () => {
    const { need } = needFromRoleText("warehouse worker order picking", "LT", "Vilnius");
    const m = matchWorkerToNeed(need, { ...SUBJECT, city: "Kaunas" });
    expect(m.reasons.some((r) => r.code === "city_match")).toBe(false);
    expect(m.reasons.some((r) => r.code === "country_match")).toBe(true);
    expect(m.gaps.some((g) => g.code === "country_mismatch")).toBe(false);
  });

  it("unknown worker city → country tier; unknown everything → missing data, not a penalty", () => {
    const { need } = needFromRoleText("warehouse worker order picking", "LT", "Vilnius");
    const withCountry = matchWorkerToNeed(need, { ...SUBJECT, city: null });
    expect(withCountry.reasons.some((r) => r.code === "country_match")).toBe(true);

    const noLocation = matchWorkerToNeed(need, {
      ...SUBJECT,
      city: null,
      country: null,
    });
    expect(noLocation.missingData).toContain("location_unknown");
    expect(noLocation.gaps.some((g) => g.code === "country_mismatch")).toBe(false);
  });
});

describe("radius tier — real math, real coordinates only", () => {
  it("haversine is sane (Vilnius↔Kaunas ≈ 92km)", () => {
    const km = distanceKm(54.6872, 25.2797, 54.8985, 23.9036);
    expect(km).toBeGreaterThan(85);
    expect(km).toBeLessThan(100);
  });

  it("no coordinates → radius tier never fires (no invention)", () => {
    const { need } = needFromRoleText("warehouse worker order picking", "LT", "Vilnius");
    const m = matchWorkerToNeed({ ...need, radiusKm: 30 }, { ...SUBJECT, city: "Vilnius" });
    expect(m.reasons.some((r) => r.code === "location_within_radius")).toBe(false);
    expect(m.gaps.some((g) => g.code === "location_outside_radius")).toBe(false);
  });
});

describe("offline mandate — no geocoders, no external location APIs", () => {
  const MODULES = [
    "lib/opportunities/worker-subject.ts",
    "lib/opportunities/opportunity-need.ts",
    "lib/opportunities/load-worker-opportunities.ts",
    "lib/scouting/scouting.ts",
    "lib/market/match-v1.ts",
    "lib/location/city-coordinates.ts",
    "lib/location/location-model.ts",
    "lib/market-map/demand-locations.ts",
    "lib/market-map/signals.ts",
  ];
  // Vendor names + outbound HTTP only. Bare "geocod…" is NOT banned — the
  // domain model legitimately names the DB's geocode_status column; what is
  // banned is any actual external service.
  const FORBIDDEN = [
    /nominatim|mapbox|opencage|googleapis|maps\.google|positionstack|here\.com|geoapify|locationiq/i,
    /\bfetch\s*\(\s*["'`]http/i,
  ];

  it("location/matching modules contain no external location service", () => {
    for (const rel of MODULES) {
      const src = stripComments(read(rel));
      for (const re of FORBIDDEN) {
        expect(re.test(src), `${rel} matches ${re}`).toBe(false);
      }
    }
  });
});

describe("location-label RPC migration pins (coarse label ONLY)", () => {
  const migration = readFileSync(
    join(REPO_ROOT, "supabase", "migrations", "20260705130000_worker_demand_location_label.sql"),
    "utf8",
  );
  const rollback = readFileSync(
    join(REPO_ROOT, "supabase", "rollbacks", "20260705130000_worker_demand_location_label.down.sql"),
    "utf8",
  );
  const code = migration
    .split(/\r?\n/)
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");

  it("adds location_label and nothing personal", () => {
    expect(code).toMatch(/location_label text/);
    // The coarse label may come from city / location_label / cr.location —
    // NEVER from the finer address/locality columns or personal fields.
    expect(code).not.toMatch(/address_text/);
    expect(code).not.toMatch(/\blocality\b/);
    expect(code).not.toMatch(/need_summary|notes|profile_id,|phone|email/);
  });

  it("keeps the Model-A verified-company gate and worker-caller gate", () => {
    expect(code).toMatch(/verification_status = 'verified'/);
    expect(code).toMatch(/from public\.workers w where w\.profile_id = uid/);
    expect(code).toMatch(/grant execute on function[\s\S]*?to authenticated/);
    expect(migration).toMatch(/@human-gate-approved/);
  });

  it("rollback restores the Model-A definition without location_label", () => {
    // Comment-stripped: the header legitimately names this migration's file.
    const rollbackCode = rollback
      .split(/\r?\n/)
      .map((l) => l.replace(/--.*$/, ""))
      .join("\n");
    expect(rollbackCode).toMatch(
      /create or replace function public\.list_open_demand_for_workers/,
    );
    expect(rollbackCode).not.toMatch(/location_label/);
    expect(rollbackCode).toMatch(/route_status/);
  });
});

describe("worker preferred locations stay own-rows (§20)", () => {
  it("only the OWN context builder reads preferred_locations, scoped to the caller", () => {
    const subjectSrc = read("lib/opportunities/worker-subject.ts");
    expect(subjectSrc).toMatch(/from\("preferred_locations"\)/);
    expect(subjectSrc).toMatch(/eq\("profile_id", profileId\)/);
    // The company-facing supply builder must NEVER read worker preferred
    // locations — that boundary is a §20 privacy line.
    const supplySrc = read("lib/market/match-subject.ts");
    expect(supplySrc).not.toMatch(/preferred_locations/);
  });
});
