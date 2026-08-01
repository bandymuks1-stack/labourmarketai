import { describe, expect, it } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * W3 row 28 — ONE Leaflet engine, pinned.
 *
 * The product once carried three separate Leaflet bootstraps (canonical
 * market map · market-map-live picker · workspace map) whose tile URLs and
 * options had drifted. The collapse: every map presentation boots through
 * `components/app/market-map/leaflet-engine.ts`. This guard makes a fourth
 * bootstrap impossible to add silently.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const ENGINE = "components/app/market-map/leaflet-engine.ts";
/** The presentations allowed to touch Leaflet at all. */
const PRESENTATIONS = [
  "components/app/market-map/market-map.tsx",
  "components/app/market-map/location-map.tsx",
  "components/app/world-state/workspace-map.tsx",
];

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      yield* walk(p);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      yield p;
    }
  }
}

describe("W3 row 28 — one Leaflet engine", () => {
  it("the old second chain is gone", () => {
    expect(existsSync(join(APP, "components/app/market-map-live.tsx"))).toBe(false);
  });

  it("the OSM tile URL exists in exactly ONE source file — the engine", () => {
    const hits: string[] = [];
    for (const dir of ["app", "components", "lib"]) {
      for (const p of walk(join(APP, dir))) {
        if (readFileSync(p, "utf8").includes("tile.openstreetmap.org")) {
          hits.push(p.slice(APP.length + 1).replace(/\\/g, "/"));
        }
      }
    }
    expect(hits).toEqual([ENGINE]);
  });

  it("only the engine calls L.map / tileLayer; presentations use mountLeafletMap", () => {
    for (const rel of PRESENTATIONS) {
      const src = read(rel);
      expect(src, `${rel} must boot via the engine`).toMatch(/mountLeafletMap\(/);
      expect(src, `${rel} must not create its own map`).not.toMatch(/L\.map\(|\.tileLayer\(/);
    }
    const engine = read(ENGINE);
    expect(engine).toMatch(/L\.map\(/);
    expect(engine).toMatch(/tileLayer\(/);
  });

  it("no runtime Leaflet import outside the engine + presentations (CSS/type-only allowed)", () => {
    const allowed = new Set([ENGINE, ...PRESENTATIONS]);
    for (const dir of ["app", "components", "lib"]) {
      for (const p of walk(join(APP, dir))) {
        const rel = p.slice(APP.length + 1).replace(/\\/g, "/");
        if (allowed.has(rel)) continue;
        const src = readFileSync(p, "utf8");
        expect(src, `${rel} imports Leaflet at runtime`).not.toMatch(
          /import\((["'])leaflet\1\)|from (["'])leaflet\2/,
        );
      }
    }
  });
});
