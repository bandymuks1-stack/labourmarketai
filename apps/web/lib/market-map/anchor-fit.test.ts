import { describe, expect, it } from "vitest";

import {
  anchorFit,
  ANCHOR_FIT_MAX_ZOOM,
  APPROX_FIT_MAX_ZOOM,
  type MarketMapView,
  type MarketRegion,
} from "@/components/app/market-map/market-map-model";

/**
 * THE MAP MUST FRAME WHAT IT DREW — the unit half of the 2026-09-05 fix.
 *
 * A production walk on build `8be8502c` found a real Lithuanian need whose
 * marker no pointer could ever hit: at the dashboard result map's ~319x288 the
 * fixed Europe frame put NL inside the viewport and LT outside it, and Leaflet
 * draws an out-of-bounds circleMarker as `d="M0 0"` — announced, focusable,
 * keyboard-activatable, and with zero geometry. The evidence is in
 * `probe-anchor-geometry-8be8502c.log`: NL drew `M124,145a18,18 …` (36x36), LT
 * drew nothing.
 *
 * The frame is now computed from the anchors. These pin the two rules that a
 * plausible future patch would quietly undo: cover everything drawn, and never
 * zoom past the precision the data actually has.
 */

function anchor(over: Partial<MarketRegion["anchors"][number]> = {}) {
  return {
    id: "NL-Rotterdam",
    label: "Rotterdam",
    country: "NL",
    lat: 51.92,
    lng: 4.48,
    weight: 3,
    layer: "demand",
    precision: "city",
    ...over,
  } as MarketRegion["anchors"][number];
}

function view(anchors: MarketRegion["anchors"]): MarketMapView {
  return {
    regions: [
      {
        code: "NL",
        label: "Netherlands",
        intensity: 0.5,
        anchors,
      } as unknown as MarketRegion,
    ],
    origin: "live",
    center: [52.2, 6.0],
    zoom: 5,
  } as MarketMapView;
}

describe("the fit covers every anchor the map drew", () => {
  it("returns one point per drawn anchor", () => {
    const fit = anchorFit(
      view([anchor(), anchor({ id: "LT-approx", lat: 55.17, lng: 23.88 })]),
      "demand",
    );
    expect(fit.points).toEqual([
      [51.92, 4.48],
      [55.17, 23.88],
    ]);
  });

  it("ignores anchors of a layer that is not drawn", () => {
    // The map draws ONE layer at a time; framing another layer's anchors would
    // pan away from what the person is actually looking at.
    const fit = anchorFit(view([anchor(), anchor({ id: "s1", layer: "people" })]), "demand");
    expect(fit.points).toHaveLength(1);
  });

  it("respects the reveal cap, so the frame matches what is on screen", () => {
    // Fitting anchors that were never drawn would frame empty space and fight
    // the landing's staged reveal.
    const fit = anchorFit(
      view([anchor(), anchor({ id: "b" }), anchor({ id: "c" })]),
      "demand",
      2,
    );
    expect(fit.points).toHaveLength(2);
  });

  it("an empty market yields no points, so the caller keeps its honest default", () => {
    // A frame invented around no data would claim a market that is not there.
    expect(anchorFit(view([]), "demand").points).toEqual([]);
  });
});

describe("the fit never claims more precision than the data has", () => {
  it("an approximate anchor clamps the zoom to country level", () => {
    const fit = anchorFit(view([anchor({ id: "LT-approx", precision: "country" })]), "demand");
    expect(fit.anyApprox).toBe(true);
    expect(fit.maxZoom).toBe(APPROX_FIT_MAX_ZOOM);
  });

  it("ONE approximate anchor among city ones is enough to clamp", () => {
    // Otherwise a single dashed country aggregate gets rendered at city zoom
    // because it happened to share the frame — the exact lie the dashed marker
    // exists to prevent.
    const fit = anchorFit(
      view([anchor(), anchor({ id: "LT-approx", precision: "country" })]),
      "demand",
    );
    expect(fit.maxZoom).toBe(APPROX_FIT_MAX_ZOOM);
  });

  it("an all-city set may go closer", () => {
    const fit = anchorFit(view([anchor(), anchor({ id: "NL-Utrecht" })]), "demand");
    expect(fit.anyApprox).toBe(false);
    expect(fit.maxZoom).toBe(ANCHOR_FIT_MAX_ZOOM);
  });

  it("the approximate clamp is strictly wider than the city one", () => {
    expect(APPROX_FIT_MAX_ZOOM).toBeLessThan(ANCHOR_FIT_MAX_ZOOM);
  });
});
