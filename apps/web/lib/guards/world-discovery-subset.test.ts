import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * P8 WORLD DISCOVERY SUBSET — guard (frozen design contract §5 P8, stage H2).
 *
 * Pins the four things the subset promised and that a later "small change"
 * would most easily undo:
 *   1. the world is READ-ONLY — no write verb anywhere in its files;
 *   2. the screen cap is ONE constant (60) and every consumer reads it;
 *   3. there is NO second map surface — the World lives on the canonical
 *      `<MarketMap>` inside the existing market-map container, not on a new
 *      route and not on its own Leaflet bootstrap;
 *   4. its strings exist, translated, in all five routed locales;
 * plus the bounded-read shape: every DB leg carries the viewport's country
 * predicate and a LIMIT, and the only RPC is the existing gated demand read.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const MODEL = "lib/market-map/world-model.ts";
const READ = "lib/market-map/world-read.ts";
const ACTIONS = "lib/market-map/world-actions.ts";
const COMPONENT = "components/app/market-map/world-discovery.tsx";
const PAGE = "app/[locale]/dashboard/market-map/page.tsx";
const WORLD_FILES = [MODEL, READ, ACTIONS, COMPONENT];

const ROUTED_LOCALES = ["lt", "en", "ru", "nl", "de"] as const;

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      yield* walk(p);
    } else {
      yield p;
    }
  }
}

describe("1 · the World is read-only", () => {
  for (const rel of WORLD_FILES) {
    it(`${rel} has no write verb, no service role, no security definer of its own`, () => {
      const src = read(rel);
      expect(src).not.toMatch(/\.(insert|update|upsert|delete)\(/);
      expect(src).not.toMatch(/service[_-]?role|SUPABASE_SERVICE|createServiceClient/i);
      expect(src).not.toMatch(/security definer|create (or replace )?function/i);
    });
  }
  it("the only RPC is the EXISTING gated worker demand read", () => {
    const rpcs = [...read(READ).matchAll(/\.rpc\(\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(rpcs).toEqual(["list_open_demand_for_workers"]);
    expect(read(MODEL)).not.toMatch(/\.rpc\(/);
    expect(read(COMPONENT)).not.toMatch(/\.rpc\(|\.from\(/);
  });
  it("the server action validates untrusted input before reading", () => {
    const src = read(ACTIONS);
    expect(src).toMatch(/^"use server";/);
    expect(src).toMatch(/parseWorldRequest\(/);
    expect(src).toMatch(/if \(!request\) return \{ kind: "invalid" \}/);
  });
});

describe("2 · one cap constant, read everywhere", () => {
  it("WORLD_OBJECT_CAP is 60 and defined once", () => {
    expect(read(MODEL)).toMatch(/export const WORLD_OBJECT_CAP = 60;/);
    const definitions = [...read(MODEL).matchAll(/WORLD_OBJECT_CAP\s*=/g)];
    expect(definitions).toHaveLength(1);
  });
  it("clustering defaults its cap to the constant; the component prints the constant, not a literal", () => {
    expect(read(MODEL)).toMatch(/options\.cap \?\? WORLD_OBJECT_CAP/);
    const comp = read(COMPONENT);
    expect(comp).toMatch(/WORLD_OBJECT_CAP/);
    expect(comp).not.toMatch(/cap:\s*60\b/);
  });
  it("every DB leg carries the country predicate and a LIMIT bound to WORLD_ROW_LIMIT", () => {
    const src = read(READ);
    const froms = [...src.matchAll(/\.from\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(froms.sort()).toEqual(["customer_requests", "projects"]);
    expect([...src.matchAll(/\.in\("country"/g)]).toHaveLength(2);
    expect([...src.matchAll(/\.limit\(WORLD_ROW_LIMIT \+ 1\)/g)]).toHaveLength(2);
    // No unbounded select and no tenant id taken from the caller.
    expect(src).not.toMatch(/\.eq\(\s*"(profile_id|company_id|organization_id|owner_id)"/);
  });
  it("demand rows go through the ONE canonical normalisation, not a second one", () => {
    const src = read(READ);
    expect(src).toMatch(/from "@\/lib\/demand\/canonical-demand-model"/);
    for (const fn of ["toCanonicalDemand", "dedupeCanonicalDemand", "placeableDemand"]) {
      expect(src).toMatch(new RegExp(`\\b${fn}\\(`));
    }
    expect(src).not.toMatch(/quantity:\s*row\.team_size \?\? 1/);
  });
});

describe("3 · no second map surface", () => {
  it("the World mounts the canonical <MarketMap> and never boots Leaflet itself", () => {
    const comp = read(COMPONENT);
    expect(comp).toMatch(/from "\.\/market-map"/);
    expect(comp).toMatch(/<MarketMap\b/);
    expect(comp).not.toMatch(/mountLeafletMap|from "leaflet"|import\("leaflet"\)|tile\.openstreetmap/);
  });
  it("the market-map page mounts it exactly once, on the existing route", () => {
    const page = read(PAGE);
    expect([...page.matchAll(/<WorldDiscovery\b/g)]).toHaveLength(1);
    expect(existsSync(join(APP, PAGE))).toBe(true);
  });
  it("no new world/map route exists beside /dashboard/market-map", () => {
    const offenders: string[] = [];
    for (const p of walk(join(APP, "app"))) {
      if (!/page\.tsx$/.test(p)) continue;
      const rel = p.slice(APP.length + 1).replace(/\\/g, "/");
      if (rel === PAGE) continue;
      if (/\/(world|world-map|map)\/page\.tsx$/.test(rel)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
  it("no other file imports the World read or action (one mount, one entry)", () => {
    const importers: string[] = [];
    for (const dir of ["app", "components", "lib"]) {
      for (const p of walk(join(APP, dir))) {
        if (!/\.(ts|tsx)$/.test(p) || /\.test\.tsx?$/.test(p)) continue;
        const rel = p.slice(APP.length + 1).replace(/\\/g, "/");
        if (WORLD_FILES.includes(rel) || rel === PAGE) continue;
        if (/market-map\/world-(read|actions)"/.test(readFileSync(p, "utf8"))) importers.push(rel);
      }
    }
    expect(importers).toEqual([]);
  });
});

describe("4 · strings in all five routed locales", () => {
  function leaves(o: unknown, path = ""): Map<string, string> {
    const out = new Map<string, string>();
    if (typeof o === "string") out.set(path, o);
    else if (o && typeof o === "object") {
      for (const [k, v] of Object.entries(o)) {
        for (const [p, s] of leaves(v, path ? `${path}.${k}` : k)) out.set(p, s);
      }
    }
    return out;
  }
  const blocks = Object.fromEntries(
    ROUTED_LOCALES.map((loc) => [
      loc,
      leaves(
        (JSON.parse(read(`messages/${loc}.json`)) as { marketMap?: { world?: unknown } }).marketMap?.world ?? {},
      ),
    ]),
  ) as Record<(typeof ROUTED_LOCALES)[number], Map<string, string>>;
  const enKeys = [...blocks.en.keys()].sort();

  it("en defines the subset's vocabulary", () => {
    for (const k of [
      "title",
      "layers.demand",
      "layers.supply",
      "layers.projects",
      "counts.inView",
      "counts.overflow",
      "counts.truncated",
      "counts.cap",
      "provenance.fact",
      "provenance.derived",
      "state.empty.demand",
      "state.error",
      "state.noPlaces",
      "list.title",
    ]) {
      expect(enKeys, k).toContain(k);
    }
  });
  for (const loc of ROUTED_LOCALES) {
    it(`${loc}: same keys as en, non-empty, and (outside en) actually translated`, () => {
      expect([...blocks[loc].keys()].sort()).toEqual(enKeys);
      for (const [p, v] of blocks[loc]) {
        expect(v.trim().length, `${loc}.${p}`).toBeGreaterThan(0);
        if (loc !== "en") expect(v, `${loc}.${p} is still English`).not.toBe(blocks.en.get(p));
      }
    });
  }
  it("every component string comes from the namespace (no hard-coded copy)", () => {
    expect(read(COMPONENT)).toMatch(/useTranslations\("marketMap\.world"\)/);
  });
});
