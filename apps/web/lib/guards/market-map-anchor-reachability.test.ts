import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * EVERY DRAWN MARKER MUST BE REACHABLE BY POINTER.
 *
 * THE DEFECT (production walk, build `8be8502c`, 2026-09-05). The market map
 * mounted — and `autoFly` flew back — to a CONSTANT Europe centre and zoom. That
 * constant suits a large map; the dashboard result map is ~319x288. At that size
 * the Netherlands falls inside the viewport and Lithuania does not, and Leaflet
 * draws an out-of-bounds `circleMarker` as `d="M0 0"`. So a real LT need
 * produced an anchor that was in the DOM, carried `role="button"` and an
 * aria-label, was focusable, and could be activated with Enter — while having
 * ZERO geometry, so no mouse or touch user could ever hit it. Measured:
 * `NL-approx` drew `M124,145a18,18 …` (36x36 box), `LT-approx` drew `M0 0`
 * (0x0). Demand existed, the marker existed, the drilldown behind it was
 * unreachable by the ordinary path.
 *
 * A keyboard path that works is not a defence: it made the failure INVISIBLE to
 * any check that activated the anchor programmatically. These rules are here so
 * the frame can never quietly go back to being a constant.
 */

const WEB = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

const MAP = "components/app/market-map/market-map.tsx";
const MODEL = "components/app/market-map/market-map-model.ts";

/** Comments DOCUMENT the banned shapes, so prose is stripped before matching. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the map frames the anchors it drew", () => {
  it("computes the frame from the anchors, through the pure helper", () => {
    const src = code(MAP);
    expect(src).toMatch(/anchorFit\(/);
    expect(src).toMatch(/flyToBounds\(/);
  });

  it("the fit is bounded by a maxZoom the DATA chose, not a literal", () => {
    // A hard-coded zoom here is how the precision rule gets bypassed later.
    const src = code(MAP);
    expect(src).toMatch(/maxZoom:\s*fit\.maxZoom/);
  });

  it("an empty market still falls back to the honest default view", () => {
    // "No anchors" must not become a frame invented around no data.
    const src = code(MAP);
    expect(src).toMatch(/points\.length === 0/);
    expect(src).toMatch(/EUROPE_CENTER/);
  });

  it("the frame reacts to the layer and the reveal cap, not just the regions", () => {
    // The old dependency list was `[ready, selectedCode, view.regions, autoFly]`:
    // switching layer redrew the anchors without ever re-framing them.
    const src = code(MAP);
    expect(src).toMatch(
      /\[\s*ready,\s*selectedCode,\s*view,\s*layer,\s*revealCount,\s*mode,\s*autoFly\s*\]/,
    );
  });

  it("the landing's frozen composition is explicitly exempt", () => {
    // The landing is an owner-gated design contract; re-framing it would be a
    // silent visual change to a frozen surface.
    expect(code(MAP)).toMatch(/mode === "landing"/);
  });
});

describe("an approximate aggregate is never rendered at city zoom", () => {
  it("the approximate clamp is strictly wider than the city clamp", () => {
    const src = read(MODEL);
    const approx = Number(/APPROX_FIT_MAX_ZOOM = (\d+)/.exec(src)?.[1]);
    const city = Number(/ANCHOR_FIT_MAX_ZOOM = (\d+)/.exec(src)?.[1]);
    expect(Number.isFinite(approx)).toBe(true);
    expect(Number.isFinite(city)).toBe(true);
    expect(approx).toBeLessThan(city);
  });

  it("a single country-precision anchor is enough to clamp the whole fit", () => {
    const src = code(MODEL);
    expect(src).toMatch(/precision === "country"/);
    expect(src).toMatch(/anyApprox \? APPROX_FIT_MAX_ZOOM : ANCHOR_FIT_MAX_ZOOM/);
  });
});

describe("the marker keeps the affordances it already promised", () => {
  it("it stays keyboard-activatable as well as clickable", () => {
    // The pointer fix must not be taken as licence to drop the keyboard path —
    // it was the only thing that worked while the geometry was empty.
    const src = code(MAP);
    expect(src).toMatch(/setAttribute\("tabindex", "0"\)/);
    expect(src).toMatch(/setAttribute\("role", "button"\)/);
    expect(src).toMatch(/key !== "Enter" && key !== " "/);
  });
});
