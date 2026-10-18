import { describe, expect, it } from "vitest";

import {
  DEFAULT_WORLD_BOUNDS,
  WORLD_LAYERS,
  WORLD_LAYER_TO_MAP_LAYER,
  WORLD_LIST_MEMBERS_MAX,
  WORLD_OBJECT_CAP,
  WORLD_PLACE_SCALE_MIN_ZOOM,
  boundsContain,
  buildWorldLayerView,
  clusterWorldObjects,
  countriesForBounds,
  parseWorldBounds,
  parseWorldRequest,
  parseWorldZoom,
  placeWorldRow,
  semanticScale,
  toMarketMapView,
  wrapLongitude,
  type WorldBounds,
  type WorldObject,
} from "./world-model";

const EUROPE: WorldBounds = { south: 35, west: -12, north: 63, east: 30 };

function obj(over: Partial<WorldObject> & { id: string }): WorldObject {
  return {
    layer: "demand",
    label: over.id,
    placeLabel: "Vilnius",
    country: "LT",
    lat: 54.6872,
    lng: 25.2797,
    precision: "city",
    provenance: "fact",
    weight: 1,
    ...over,
  };
}

describe("constants — the frozen contract's numbers", () => {
  it("caps the screen at 60 places and names three layers", () => {
    expect(WORLD_OBJECT_CAP).toBe(60);
    expect([...WORLD_LAYERS]).toEqual(["demand", "supply", "projects"]);
    expect(WORLD_LAYER_TO_MAP_LAYER.supply).toBe("people");
  });
});

describe("parseWorldBounds — untrusted input", () => {
  it("rejects garbage, missing fields, NaN and inverted latitudes", () => {
    expect(parseWorldBounds(null)).toBeNull();
    expect(parseWorldBounds("x")).toBeNull();
    expect(parseWorldBounds({ south: 1, west: 2, north: 3 })).toBeNull();
    expect(parseWorldBounds({ south: NaN, west: 0, north: 1, east: 1 })).toBeNull();
    expect(parseWorldBounds({ south: 5, west: 0, north: 5, east: 1 })).toBeNull();
    expect(parseWorldBounds({ south: 10, west: 0, north: 5, east: 1 })).toBeNull();
  });
  it("clamps latitude to the mercator limit and wraps longitude", () => {
    const b = parseWorldBounds({ south: -95, west: 190, north: 95, east: -190 });
    expect(b).not.toBeNull();
    expect(b!.south).toBeCloseTo(-85.05113, 4);
    expect(b!.north).toBeCloseTo(85.05113, 4);
    expect(b!.west).toBeCloseTo(-170, 6);
    expect(b!.east).toBeCloseTo(170, 6);
  });
  it("a span of 360° or more is the whole world", () => {
    const b = parseWorldBounds({ south: -60, west: -400, north: 60, east: 400 });
    expect(b).toEqual({ south: -60, west: -180, north: 60, east: 180 });
  });
  it("wrapLongitude keeps values inside [-180, 180]", () => {
    expect(wrapLongitude(0)).toBe(0);
    expect(wrapLongitude(181)).toBe(-179);
    expect(wrapLongitude(-181)).toBe(179);
    expect(wrapLongitude(540)).toBe(180);
  });
});

describe("boundsContain — antimeridian aware", () => {
  it("plain viewport", () => {
    expect(boundsContain(EUROPE, 54.7, 25.3)).toBe(true);
    expect(boundsContain(EUROPE, 40.7, -74)).toBe(false);
    expect(boundsContain(EUROPE, 70, 10)).toBe(false);
  });
  it("wrapped viewport (west > east) spans the dateline", () => {
    const pacific: WorldBounds = { south: -50, west: 150, north: 60, east: -120 };
    expect(boundsContain(pacific, 35.7, 139.7)).toBe(false); // Tokyo, west of 150
    expect(boundsContain(pacific, 21.3, -157.8)).toBe(true); // Honolulu
    expect(boundsContain(pacific, -41.3, 174.8)).toBe(true); // Wellington
    expect(boundsContain(pacific, 52.5, 13.4)).toBe(false); // Berlin
  });
});

describe("parseWorldZoom / parseWorldRequest", () => {
  it("zoom must be a finite number within Leaflet's range", () => {
    expect(parseWorldZoom(5.4)).toBe(5);
    expect(parseWorldZoom(-1)).toBeNull();
    expect(parseWorldZoom(25)).toBeNull();
    expect(parseWorldZoom("5")).toBeNull();
  });
  it("a request is valid only when every part is", () => {
    expect(parseWorldRequest({ bounds: EUROPE, zoom: 5, layer: "demand" })).toEqual({
      bounds: EUROPE,
      zoom: 5,
      layer: "demand",
    });
    expect(parseWorldRequest({ bounds: EUROPE, zoom: 5, layer: "jobs" })).toBeNull();
    expect(parseWorldRequest({ bounds: null, zoom: 5, layer: "demand" })).toBeNull();
    expect(parseWorldRequest(undefined)).toBeNull();
  });
});

describe("semanticScale", () => {
  it("countries below the place threshold, places at and above it", () => {
    expect(semanticScale(3)).toBe("country");
    expect(semanticScale(WORLD_PLACE_SCALE_MIN_ZOOM - 1)).toBe("country");
    expect(semanticScale(WORLD_PLACE_SCALE_MIN_ZOOM)).toBe("place");
    expect(semanticScale(12)).toBe("place");
  });
});

describe("countriesForBounds — the bounded predicate", () => {
  const points = [
    { country: "LT", lat: 54.69, lng: 25.28 },
    { country: "NL", lat: 52.37, lng: 4.89 },
    { country: "US", lat: 40.71, lng: -74.0 },
    { country: "us", lat: 40.71, lng: -74.0 }, // not ISO-2 upper → ignored
    { country: "GE", lat: 41.72, lng: 44.83 },
  ];
  it("returns only countries with a placeable point inside, sorted and unique", () => {
    expect(countriesForBounds(EUROPE, points)).toEqual(["LT", "NL"]);
  });
  it("empty for open sea — the read layer then runs no query", () => {
    expect(countriesForBounds({ south: -40, west: -40, north: -20, east: -20 }, points)).toEqual([]);
  });
  it("the default viewport covers the served European markets", () => {
    expect(countriesForBounds(DEFAULT_WORLD_BOUNDS, points)).toEqual(["LT", "NL"]);
  });
});

describe("placeWorldRow — fact vs derived, never invented", () => {
  it("a known city is a FACT at city precision, keeping the stated label", () => {
    const p = placeWorldRow("nl", "Rotterdam, Zuid-Holland");
    expect(p).toMatchObject({ precision: "city", provenance: "fact", placeLabel: "Rotterdam, Zuid-Holland" });
    expect(p!.lat).toBeCloseTo(51.9244, 3);
  });
  it("an unknown city falls to the country centroid as DERIVED, labelled by code only", () => {
    const p = placeWorldRow("LT", "Utena");
    expect(p).toMatchObject({ precision: "country", provenance: "derived", placeLabel: "LT" });
  });
  it("no city at all is also DERIVED", () => {
    expect(placeWorldRow("DE", null)).toMatchObject({ provenance: "derived", placeLabel: "DE" });
  });
  it("no country / unknown country → null (counted as unplaced by the caller)", () => {
    expect(placeWorldRow(null, "Vilnius")).toBeNull();
    expect(placeWorldRow("", "Vilnius")).toBeNull();
    expect(placeWorldRow("XX", "Vilnius", {})).toBeNull();
  });
});

describe("clusterWorldObjects — viewport, scale, determinism", () => {
  const vilnius = [obj({ id: "a", weight: 3 }), obj({ id: "b", weight: 2 })];
  const kaunas = obj({ id: "c", placeLabel: "Kaunas", lat: 54.8985, lng: 23.9036, weight: 1 });
  const ny = obj({ id: "d", country: "US", placeLabel: "New York", lat: 40.7128, lng: -74.006, weight: 9 });

  it("drops what lies outside the viewport and counts it", () => {
    const r = clusterWorldObjects([...vilnius, kaunas, ny], { bounds: EUROPE, zoom: 7 });
    expect(r.outOfViewObjects).toBe(1);
    expect(r.inViewObjects).toBe(3);
    expect(r.inViewWeight).toBe(6);
  });
  it("place scale: one cluster per place, biggest first", () => {
    const r = clusterWorldObjects([kaunas, ...vilnius], { bounds: EUROPE, zoom: 7 });
    expect(r.scale).toBe("place");
    expect(r.clusters.map((c) => [c.label, c.count, c.weight])).toEqual([
      ["Vilnius", 2, 5],
      ["Kaunas", 1, 1],
    ]);
    expect(r.clusters[0].precision).toBe("city");
    expect(r.clusters[0].provenance).toBe("fact");
  });
  it("country scale: one cluster per country on its centroid, position marked approximate", () => {
    const r = clusterWorldObjects([kaunas, ...vilnius], { bounds: EUROPE, zoom: 4 });
    expect(r.scale).toBe("country");
    expect(r.clusters).toHaveLength(1);
    expect(r.clusters[0]).toMatchObject({ label: "LT", count: 3, weight: 6, precision: "country" });
    expect(r.clusters[0].lat).not.toBeCloseTo(54.6872, 2);
  });
  it("one derived member makes the cluster derived; one country-precision member makes it approximate", () => {
    const derived = obj({ id: "e", precision: "country", provenance: "derived", lat: 54.69, lng: 25.28 });
    const r = clusterWorldObjects([...vilnius, derived], { bounds: EUROPE, zoom: 7 });
    expect(r.clusters[0].provenance).toBe("derived");
    expect(r.clusters[0].precision).toBe("country");
  });
  it("the same rows in any order yield the same clusters in the same order", () => {
    const a = clusterWorldObjects([kaunas, ny, ...vilnius], { bounds: { south: 30, west: -80, north: 65, east: 30 }, zoom: 7 });
    const b = clusterWorldObjects([...vilnius, ny, kaunas].reverse(), { bounds: { south: 30, west: -80, north: 65, east: 30 }, zoom: 7 });
    expect(a).toEqual(b);
  });
  it("carries at most WORLD_LIST_MEMBERS_MAX members and counts the rest", () => {
    const many = Array.from({ length: WORLD_LIST_MEMBERS_MAX + 5 }, (_, i) => obj({ id: `m${i}` }));
    const r = clusterWorldObjects(many, { bounds: EUROPE, zoom: 7 });
    expect(r.clusters[0].members).toHaveLength(WORLD_LIST_MEMBERS_MAX);
    expect(r.clusters[0].moreMembers).toBe(5);
  });
});

describe("the cap — folded, counted, never silently dropped", () => {
  // 100 distinct places inside Europe, weights 1..100.
  const places: WorldObject[] = Array.from({ length: 100 }, (_, i) =>
    obj({
      id: `p${i}`,
      placeLabel: `P${i}`,
      lat: 40 + (i % 20) * 1.0,
      lng: -10 + Math.floor(i / 20) * 5.0,
      weight: i + 1,
    }),
  );
  it("renders at most the cap and accounts for every folded object and unit of weight", () => {
    const r = clusterWorldObjects(places, { bounds: EUROPE, zoom: 8 });
    expect(r.clusters).toHaveLength(WORLD_OBJECT_CAP);
    expect(r.overflow.clusters).toBe(100 - WORLD_OBJECT_CAP);
    expect(r.overflow.objects).toBe(100 - WORLD_OBJECT_CAP);
    expect(r.renderedObjects + r.overflow.objects).toBe(r.inViewObjects);
    const renderedWeight = r.clusters.reduce((n, c) => n + c.weight, 0);
    expect(renderedWeight + r.overflow.weight).toBe(r.inViewWeight);
  });
  it("keeps the heaviest places when folding", () => {
    const r = clusterWorldObjects(places, { bounds: EUROPE, zoom: 8 });
    const minKept = Math.min(...r.clusters.map((c) => c.weight));
    expect(minKept).toBe(100 - WORLD_OBJECT_CAP + 1);
  });
  it("a custom cap is honoured and never below one", () => {
    expect(clusterWorldObjects(places, { bounds: EUROPE, zoom: 8, cap: 10 }).clusters).toHaveLength(10);
    expect(clusterWorldObjects(places, { bounds: EUROPE, zoom: 8, cap: 0 }).clusters).toHaveLength(1);
  });
  it("at country scale a hundred places collapse to their countries — no overflow", () => {
    const r = clusterWorldObjects(places, { bounds: EUROPE, zoom: 4 });
    expect(r.clusters).toHaveLength(1);
    expect(r.overflow.clusters).toBe(0);
    expect(r.clusters[0].count).toBe(100);
  });
});

describe("toMarketMapView — the canonical projection", () => {
  it("one region per country, one anchor per cluster, live origin, derived → country precision", () => {
    const r = clusterWorldObjects(
      [obj({ id: "a" }), obj({ id: "b", country: "NL", placeLabel: "Amsterdam", lat: 52.374, lng: 4.8897, precision: "country", provenance: "derived" })],
      { bounds: EUROPE, zoom: 7 },
    );
    const view = toMarketMapView(r.clusters, "demand");
    expect(view.origin).toBe("live");
    expect(view.regions.map((x) => x.code)).toEqual(["LT", "NL"]);
    const nl = view.regions.find((x) => x.code === "NL")!;
    expect(nl.anchors[0]).toMatchObject({ layer: "demand", precision: "country", country: "NL" });
    expect(nl.intensity).toBeGreaterThan(0);
  });
  it("uses the map layer of the world layer (supply draws as people)", () => {
    const r = clusterWorldObjects([obj({ id: "a", layer: "supply" })], { bounds: EUROPE, zoom: 7 });
    expect(toMarketMapView(r.clusters, "supply").regions[0].anchors[0].layer).toBe("people");
  });
});

describe("buildWorldLayerView — named states", () => {
  const base = { layer: "demand" as const, bounds: EUROPE, zoom: 7, countries: ["LT"] };
  it("ok when something is drawn", () => {
    const v = buildWorldLayerView({ ...base, objects: [obj({ id: "a" })] });
    expect(v.state).toEqual({ kind: "ok" });
    expect(v.counts.renderedClusters).toBe(1);
    expect(v.view.regions).toHaveLength(1);
  });
  it("empty when the read succeeded and found nothing in view", () => {
    const v = buildWorldLayerView({ ...base, objects: [] });
    expect(v.state).toEqual({ kind: "empty" });
  });
  it("unavailable when no known place lies in the viewport (no query was run)", () => {
    const v = buildWorldLayerView({ ...base, countries: [], objects: [] });
    expect(v.state).toEqual({ kind: "unavailable", reason: "no_known_places_in_view" });
  });
  it("error is NOT empty: the view is cleared and the reason named", () => {
    const v = buildWorldLayerView({ ...base, objects: [obj({ id: "a" })], error: "own_demand_read_failed" });
    expect(v.state).toEqual({ kind: "error", reason: "own_demand_read_failed" });
    expect(v.clusters).toHaveLength(0);
    expect(v.view.regions).toHaveLength(0);
  });
  it("carries unplaced / withheld / truncated / notes through untouched", () => {
    const v = buildWorldLayerView({
      ...base,
      objects: [],
      unplaced: 2,
      withheld: 1,
      truncated: true,
      notes: ["aggregate_only"],
    });
    expect(v.counts).toMatchObject({ unplaced: 2, withheld: 1, truncated: true });
    expect(v.notes).toEqual(["aggregate_only"]);
    expect(v.countries).toEqual(["LT"]);
  });
});
