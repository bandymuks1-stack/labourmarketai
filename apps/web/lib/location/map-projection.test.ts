import { describe, expect, it } from "vitest";
import {
  project,
  invert,
  locationToPoint,
  radiusToViewBox,
  graticule,
  COUNTRY_CENTROIDS,
  VIEW_W,
  VIEW_H,
  LAT_MAX,
  LAT_MIN,
  LNG_MIN,
  LNG_MAX,
} from "./map-projection";
import type { SelectedLocation } from "./location-model";

/**
 * Owner-smoke regression (fix/owner-smoke-map-skills-journal-edit-v1, bug 1).
 * The provider-free location map must be a REAL coordinate map: tapping it must
 * yield real coordinates (invert ∘ project = identity), the selection must plot
 * at its true position, and radius must scale with the projection.
 */

describe("project / invert round-trip", () => {
  it("project then invert recovers the original coordinate", () => {
    const cases = [
      { lat: 54.69, lng: 25.28 }, // Vilnius
      { lat: 59.44, lng: 24.75 }, // Tallinn
      { lat: 52.52, lng: 13.4 }, // Berlin
    ];
    for (const c of cases) {
      const p = project(c.lat, c.lng);
      const back = invert(p.x, p.y);
      expect(back.lat).toBeCloseTo(c.lat, 4);
      expect(back.lng).toBeCloseTo(c.lng, 4);
    }
  });

  it("box corners map to viewBox corners", () => {
    expect(project(LAT_MAX, LNG_MIN)).toEqual({ x: 0, y: 0 });
    expect(project(LAT_MIN, LNG_MAX)).toEqual({ x: VIEW_W, y: VIEW_H });
  });

  it("clamps out-of-box input instead of rendering off-canvas", () => {
    const p = project(10, 200); // far south-east of the box
    expect(p.x).toBe(VIEW_W);
    expect(p.y).toBe(VIEW_H);
  });
});

describe("locationToPoint", () => {
  const base = {
    region: null,
    address: null,
    radiusKm: 25 as const,
    savedAt: 1,
  };

  it("plots auto coordinates at their true projected position", () => {
    const loc: SelectedLocation = {
      ...base,
      source: "auto",
      lat: 54.69,
      lng: 25.28,
      country: null,
    };
    expect(locationToPoint(loc)).toEqual(project(54.69, 25.28));
  });

  it("plots a manual country-only selection at the country centroid", () => {
    const loc: SelectedLocation = {
      ...base,
      source: "manual",
      lat: null,
      lng: null,
      country: "LT",
    };
    const c = COUNTRY_CENTROIDS.LT;
    expect(locationToPoint(loc)).toEqual(project(c.lat, c.lng));
  });

  it("returns null when there is neither coordinate nor known country", () => {
    const loc: SelectedLocation = {
      ...base,
      source: "manual",
      lat: null,
      lng: null,
      country: null,
    };
    expect(locationToPoint(loc)).toBeNull();
    expect(locationToPoint(null)).toBeNull();
  });
});

describe("radiusToViewBox", () => {
  it("a larger radius produces a larger ring", () => {
    const small = radiusToViewBox(10, 55);
    const big = radiusToViewBox(100, 55);
    expect(big.rx).toBeGreaterThan(small.rx);
    expect(big.ry).toBeGreaterThan(small.ry);
  });

  it("longitude axis is wider than latitude (cos-lat stretch)", () => {
    const r = radiusToViewBox(50, 55);
    expect(r.rx).toBeGreaterThan(r.ry);
  });
});

describe("graticule", () => {
  it("produces grid lines inside the viewBox", () => {
    const g = graticule(5);
    expect(g.vertical.length).toBeGreaterThan(0);
    expect(g.horizontal.length).toBeGreaterThan(0);
    for (const v of g.vertical) {
      expect(v.x).toBeGreaterThanOrEqual(0);
      expect(v.x).toBeLessThanOrEqual(VIEW_W);
    }
    for (const h of g.horizontal) {
      expect(h.y).toBeGreaterThanOrEqual(0);
      expect(h.y).toBeLessThanOrEqual(VIEW_H);
    }
  });
});

describe("all served markets have a centroid inside the box", () => {
  it.each(Object.entries(COUNTRY_CENTROIDS))("%s centroid is in range", (_code, c) => {
    expect(c.lat).toBeGreaterThanOrEqual(LAT_MIN);
    expect(c.lat).toBeLessThanOrEqual(LAT_MAX);
    expect(c.lng).toBeGreaterThanOrEqual(LNG_MIN);
    expect(c.lng).toBeLessThanOrEqual(LNG_MAX);
  });
});
