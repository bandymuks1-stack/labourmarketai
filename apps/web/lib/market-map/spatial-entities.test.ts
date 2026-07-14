import { describe, expect, it } from "vitest";

import {
  SPATIAL_ENTITY_KINDS,
  SPATIAL_ENTITY_REGISTRY,
  INDIVIDUAL_PERSON_PIN_CONSENT_EXISTS,
  PERSON_PRESENCE_MIN_N,
  buildPersonPresenceLayer,
  buildCompanyTerritoryLayer,
  buildProjectLocationLayer,
  buildSpatialCollections,
  emptySpatialCollections,
  containsCoordinateKey,
  collectionsAreStrictlyTyped,
  type CompanyTerritorySourceRow,
  type ProjectLocationSourceRow,
} from "./spatial-entities";
import { DEFAULT_MIN_BUCKET, type NormalizedSignal } from "./signal-model";
import type { DemandLocation } from "./demand-locations";

// ── helpers ─────────────────────────────────────────────────────────────────

function personSignal(over: Partial<NormalizedSignal> = {}): NormalizedSignal {
  return {
    signalId: `preferred:${Math.random().toString(36).slice(2)}`,
    signalType: "preferred_location",
    ownerType: "profile",
    ownerId: "owner-1",
    country: "LT",
    region: null,
    city: "Vilnius",
    granularity: "city",
    visibilityLevel: "city_visible",
    count: 1,
    aggregatedCount: null,
    canShowExact: false,
    sourceStatus: "self_declared",
    updatedAt: null,
    ...over,
  };
}

function manyPersonSignals(n: number, over: Partial<NormalizedSignal> = {}) {
  return Array.from({ length: n }, (_, i) =>
    personSignal({ signalId: `preferred:${i}`, ownerId: `owner-${i}`, ...over }),
  );
}

function demandRow(over: Partial<DemandLocation> = {}): DemandLocation {
  return {
    id: "d1",
    requestId: "r1",
    ownerId: "o1",
    countryCode: "LT",
    region: null,
    city: "Kaunas",
    locality: null,
    addressText: null,
    locationLabel: "Kaunas site",
    latitude: 54.9,
    longitude: 23.9,
    geoPrecision: "coordinates",
    geocodeStatus: "verified",
    source: "demand_form",
    ...over,
  };
}

// ── 1. Entity union + registry ──────────────────────────────────────────────

describe("spatial entity union + registry", () => {
  it("has exactly the three owner-required kinds", () => {
    expect([...SPATIAL_ENTITY_KINDS]).toEqual([
      "person_presence",
      "company_territory",
      "project_location",
    ]);
  });

  it("every kind has its own registry contract", () => {
    for (const kind of SPATIAL_ENTITY_KINDS) {
      const c = SPATIAL_ENTITY_REGISTRY[kind];
      expect(c.kind).toBe(kind);
      expect(c.visibilityRule.length).toBeGreaterThan(10);
    }
  });

  it("the three rendering contracts are pairwise DISTINCT (never mixed)", () => {
    const renders = SPATIAL_ENTITY_KINDS.map(
      (k) => SPATIAL_ENTITY_REGISTRY[k].render,
    );
    expect(new Set(renders).size).toBe(3);
    expect(SPATIAL_ENTITY_REGISTRY.person_presence.render).toBe("area_bucket");
    expect(SPATIAL_ENTITY_REGISTRY.company_territory.render).toBe(
      "territory_shape",
    );
    expect(SPATIAL_ENTITY_REGISTRY.project_location.render).toBe("point_pin");
  });

  it("every kind pins platform-workflow-only communication (no contact bypass)", () => {
    for (const kind of SPATIAL_ENTITY_KINDS) {
      expect(SPATIAL_ENTITY_REGISTRY[kind].contactPolicy).toBe(
        "platform_workflow_only",
      );
    }
  });
});

// ── 2. Person presence — §20 aggregate-only + n<5 banding ──────────────────

describe("person presence layer (§20)", () => {
  it("no individual-pin consent exists — the layer stays aggregate-only", () => {
    expect(INDIVIDUAL_PERSON_PIN_CONSENT_EXISTS).toBe(false);
  });

  it(`buckets with n >= ${PERSON_PRESENCE_MIN_N} carry an exact count`, () => {
    const out = buildPersonPresenceLayer(manyPersonSignals(5));
    expect(out).toHaveLength(1);
    expect(out[0].band).toEqual({ kind: "exact", count: 5 });
  });

  it(`buckets with ${DEFAULT_MIN_BUCKET} <= n < ${PERSON_PRESENCE_MIN_N} collapse to the "<5" band WITHOUT the exact count`, () => {
    const out = buildPersonPresenceLayer(manyPersonSignals(4));
    expect(out).toHaveLength(1);
    expect(out[0].band).toEqual({ kind: "small_sample" });
    // The exact small count is not representable anywhere on the entity.
    expect(JSON.stringify(out[0])).not.toContain('"count"');
  });

  it(`buckets below the individual-protection floor (n < ${DEFAULT_MIN_BUCKET}) show NOTHING`, () => {
    expect(buildPersonPresenceLayer(manyPersonSignals(2))).toEqual([]);
    expect(buildPersonPresenceLayer(manyPersonSignals(1))).toEqual([]);
  });

  it("default-closed: private / self_only person signals never reach the layer", () => {
    for (const visibilityLevel of ["private", "self_only"] as const) {
      const out = buildPersonPresenceLayer(
        manyPersonSignals(10, { visibilityLevel }),
      );
      expect(out).toEqual([]);
    }
  });

  it("login signals count only when explicitly consented", () => {
    const consented = manyPersonSignals(6, {
      signalType: "login_location",
      ownerType: "login",
      visibilityLevel: "aggregated",
      sourceStatus: "consented",
    });
    expect(buildPersonPresenceLayer(consented)).toHaveLength(1);

    const revoked = manyPersonSignals(6, {
      signalType: "login_location",
      ownerType: "login",
      visibilityLevel: "aggregated",
      sourceStatus: "revoked",
    });
    expect(buildPersonPresenceLayer(revoked)).toEqual([]);
  });

  it("non-person signal types (company/demand/project) never leak into the person layer", () => {
    const out = buildPersonPresenceLayer([
      ...manyPersonSignals(10, {
        signalType: "company_need_location",
        ownerType: "demand",
        visibilityLevel: "city_visible",
      }),
      ...manyPersonSignals(10, {
        signalType: "project_location",
        ownerType: "project",
        visibilityLevel: "city_visible",
      }),
    ]);
    expect(out).toEqual([]);
  });

  it("a person entity NEVER carries exact coordinates — no coordinate-shaped key anywhere (unless the explicit consent path existed)", () => {
    // Even hostile input carrying canShowExact=true cannot produce a
    // coordinate: the output type has no place to put one.
    const out = buildPersonPresenceLayer(
      manyPersonSignals(9, { canShowExact: true }),
    );
    expect(out.length).toBeGreaterThan(0);
    for (const e of out) {
      expect(containsCoordinateKey(e)).toBe(false);
    }
  });

  it("aggregates carry no owner ids (anonymised)", () => {
    const out = buildPersonPresenceLayer(manyPersonSignals(7));
    expect(JSON.stringify(out)).not.toMatch(/owner/i);
  });
});

// ── 3. Company operating territory ──────────────────────────────────────────

describe("company territory layer", () => {
  const hq: CompanyTerritorySourceRow = {
    id: "c1",
    kind: "headquarters",
    country: "LT",
    region: null,
    city: "Vilnius",
    label: "HQ",
    latitude: 54.68,
    longitude: 25.28,
  };

  it("maps company_locations rows into territory entities (with optional center)", () => {
    const out = buildCompanyTerritoryLayer([
      hq,
      { ...hq, id: "c2", kind: "operating", latitude: null, longitude: null },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].territoryKind).toBe("headquarters");
    expect(out[0].center).toEqual({ latitude: 54.68, longitude: 25.28 });
    expect(out[1].center).toBeNull();
    for (const e of out) expect(e.entity).toBe("company_territory");
  });

  it("skips rows with an invalid country (nothing invented)", () => {
    expect(buildCompanyTerritoryLayer([{ ...hq, country: "Lietuva" }])).toEqual([]);
  });

  it("coordinate-verified demand locations become demand anchors; unverified rows are excluded", () => {
    const out = buildCompanyTerritoryLayer(
      [],
      [
        demandRow(),
        demandRow({ id: "d2", geocodeStatus: "pending", latitude: null, longitude: null }),
      ],
    );
    expect(out).toHaveLength(1);
    expect(out[0].territoryKind).toBe("demand_anchor");
  });

  it("company territory is NEVER a person-confusable point-pin (registry contract)", () => {
    expect(SPATIAL_ENTITY_REGISTRY.company_territory.render).not.toBe("point_pin");
    expect(SPATIAL_ENTITY_REGISTRY.company_territory.render).not.toBe("area_bucket");
  });
});

// ── 4. Project location ─────────────────────────────────────────────────────

describe("project location layer", () => {
  const row: ProjectLocationSourceRow = {
    id: "p1",
    country: "LT",
    city: "Klaipėda",
    granularity: "city",
    locationConfirmed: true,
    status: "active",
  };

  it("maps real project rows; rows without a country are skipped", () => {
    const out = buildProjectLocationLayer([row, { ...row, id: "p2", country: null }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      entity: "project_location",
      id: "project:p1",
      confirmed: true,
    });
  });

  it("the confirmed flag reflects explicit confirmation only", () => {
    const out = buildProjectLocationLayer([{ ...row, locationConfirmed: false }]);
    expect(out[0].confirmed).toBe(false);
  });
});

// ── 5. Typed collections — layer separation guard ───────────────────────────

describe("typed collections — never a mixed bag", () => {
  it("empty collections are strictly typed", () => {
    expect(collectionsAreStrictlyTyped(emptySpatialCollections())).toBe(true);
  });

  it("buildSpatialCollections routes every source into ITS OWN typed array", () => {
    const c = buildSpatialCollections({
      signals: [
        ...manyPersonSignals(6),
        personSignal({
          signalId: "project:x",
          signalType: "project_location",
          ownerType: "project",
        }),
      ],
      companyLocations: [
        {
          id: "c1",
          kind: "operating",
          country: "DE",
          region: null,
          city: null,
          label: null,
          latitude: null,
          longitude: null,
        },
      ],
      demandLocations: [demandRow()],
      projects: [
        {
          id: "p1",
          country: "NL",
          city: null,
          granularity: "country",
          locationConfirmed: false,
          status: "draft",
        },
      ],
    });
    expect(c.personPresence.every((e) => e.entity === "person_presence")).toBe(true);
    expect(c.companyTerritories.every((e) => e.entity === "company_territory")).toBe(true);
    expect(c.projectLocations.every((e) => e.entity === "project_location")).toBe(true);
    expect(collectionsAreStrictlyTyped(c)).toBe(true);
    // No combined array exists on the shape.
    expect(Object.keys(c).sort()).toEqual([
      "companyTerritories",
      "personPresence",
      "projectLocations",
    ]);
  });

  it("collectionsAreStrictlyTyped rejects a person entity smuggling coordinates", () => {
    const c = emptySpatialCollections();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (c.personPresence as any[]).push({
      entity: "person_presence",
      areaKey: "LT||Vilnius",
      country: "LT",
      region: null,
      city: "Vilnius",
      granularity: "city",
      band: { kind: "small_sample" },
      latitude: 54.68, // smuggled — must be rejected
    });
    expect(collectionsAreStrictlyTyped(c)).toBe(false);
  });

  it("containsCoordinateKey detects nested coordinate keys", () => {
    expect(containsCoordinateKey({ a: { deep: { lng: 1 } } })).toBe(true);
    expect(containsCoordinateKey({ a: [{ latitude: 2 }] })).toBe(true);
    expect(containsCoordinateKey({ country: "LT", band: { kind: "exact", count: 5 } })).toBe(false);
  });
});
