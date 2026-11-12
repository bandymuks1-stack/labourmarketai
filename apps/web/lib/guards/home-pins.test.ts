import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { pinnableAreas } from "@/lib/home/home-pins";
import { routeRequirement } from "@/lib/auth/role-gated-routes";

/**
 * PIN TO HOME (owner P0 2026-11-12) — the contract that survives refactors.
 *
 *  1. REUSE: pins live in the existing per-user store `dashboard_preferences`
 *     (migration 20260714211000 — own-row RLS, rollback shipped). No new
 *     table, no new migration, no second preferences store.
 *  2. PINNING NEVER GRANTS ACCESS: candidates are the home's own areas,
 *     filtered by the one role table; the save action validates ids.
 *  3. HONEST STORAGE: while the store is not applied the strip keeps the
 *     choice on the device and says so; a failed read is named, never shown
 *     as "nothing pinned".
 *  4. Accessible controls and translated copy in all 11 locales.
 */

const APP_ROOT = resolve(__dirname, "..", "..");
const REPO_ROOT = resolve(APP_ROOT, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");

const server = read("lib/home/home-pins-server.ts");
const actions = read("lib/home/home-pins-actions.ts");
const section = read("components/app/home/home-pins-section.tsx");
const strip = read("components/app/home/home-pins-strip.tsx");

describe("the existing per-user store is reused", () => {
  const MIGRATION = "20260714211000_dashboard_preferences_v1";

  it("reads and writes dashboard_preferences, and only that", () => {
    expect(server).toMatch(/\.from\("dashboard_preferences"\)/);
    const tables = [...server.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]);
    expect(new Set(tables)).toEqual(new Set(["dashboard_preferences"]));
  });

  it("that store is own-row RLS with a rollback, and this work adds no migration", () => {
    const sql = readFileSync(join(REPO_ROOT, "supabase/migrations", `${MIGRATION}.sql`), "utf8");
    expect(sql).toMatch(/enable row level security/);
    expect(sql.match(/profile_id = auth\.uid\(\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(existsSync(join(REPO_ROOT, "supabase/rollbacks", `${MIGRATION}.down.sql`))).toBe(true);
    const migrations = readdirSync(join(REPO_ROOT, "supabase/migrations"));
    expect(migrations.filter((f) => /home_pin|pinned_/i.test(f))).toEqual([]);
  });

  it("every row is the caller's own and the other keys of the row are kept", () => {
    expect(server).toMatch(/auth\.getUser\(\)/);
    expect(server.match(/\.eq\("profile_id", user\.id\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(server).toMatch(/profile_id: user\.id/);
    expect(server).toMatch(/\{ \.\.\.current, \[HOME_PINS_KEY\]:/);
  });

  it("no client-supplied profile id reaches the store", () => {
    expect(actions).not.toMatch(/profile_?[iI]d/);
    expect(strip).not.toMatch(/profile_?[iI]d/);
  });
});

describe("pinning never grants access", () => {
  it("the action validates ids against the home's own areas before writing", () => {
    expect(actions).toMatch(/validateHomePins\(pins, context/);
    expect(actions).toMatch(/if \(!valid\) return "failed";/);
    expect(actions.indexOf("validateHomePins")).toBeLessThan(actions.indexOf("writeHomePins(context"));
  });

  it("the section drops areas the one role table gates behind another role", () => {
    expect(section).toMatch(/routeRequirement\(/);
    expect(section).toMatch(/reachableIds\.has\(id\)/);
  });

  it("no pinnable area is an operator route", () => {
    for (const context of ["person", "company"] as const) {
      for (const area of pinnableAreas(context)) {
        expect(routeRequirement(area.href)?.kind, area.href).not.toBe("admin");
      }
    }
  });

  it("person areas need at most the worker role; company areas at most the company role", () => {
    for (const area of pinnableAreas("person")) {
      const need = routeRequirement(area.href);
      if (need?.kind === "role") expect(need.role, area.href).toBe("worker");
    }
    for (const area of pinnableAreas("company")) {
      const need = routeRequirement(area.href);
      if (need?.kind === "role") expect(need.role, area.href).toBe("company");
    }
  });

  it("the strip renders only areas it was handed and spells no route", () => {
    expect(strip).not.toMatch(/href[=:]\s*["'`]\//);
    expect(strip).toMatch(/byId\.get\(id\)/);
  });
});

describe("storage is honest", () => {
  it("a missing store means 'this device', a failed read is named", () => {
    expect(server).toMatch(/isMissingTableCode\(error\.code\) \? \{ status: "device" \} : \{ status: "failed" \}/);
    expect(section).toMatch(/read\.status === "failed"[\s\S]{0,200}readFailed/);
    expect(strip).toMatch(/mode === "device" && \([\s\S]{0,200}labels\.deviceOnly/);
  });

  it("the device copy is used only as the fallback and is validated on read", () => {
    expect(strip).toMatch(/if \(storage !== "device"\) return;/);
    expect(strip).toMatch(/validateHomePins\(JSON\.parse\(raw\), context\)/);
  });
});

describe("the strip is accessible", () => {
  it("every control is a named 44px button; reorder needs no drag", () => {
    expect(strip).toMatch(/aria-label=\{named\(labels\.moveEarlier, area\.label\)\}/);
    expect(strip).toMatch(/aria-label=\{named\(labels\.moveLater, area\.label\)\}/);
    expect(strip).toMatch(/aria-label=\{named\(labels\.unpin, area\.label\)\}/);
    expect(strip).toMatch(/aria-label=\{named\(labels\.pin, area\.label\)\}/);
    expect(strip).toMatch(/size-11/);
    expect(strip).toMatch(/min-h-11/);
    expect(strip).not.toMatch(/draggable|onDrag/);
  });

  it("changes are announced and motion respects reduced motion", () => {
    expect(strip).toMatch(/aria-live="polite"/);
    expect(strip).toMatch(/aria-pressed=\{editing\}/);
    expect(strip).toMatch(/motion-reduce:transition-none/);
  });
});

describe("both homes mount it behind a placeholder that takes room", () => {
  it("personal home", () => {
    expect(read("components/app/today/today-screen.tsx")).toMatch(
      /<Suspense fallback=\{<HomePinsPending \/>\}>\s*<HomePinsSection context="person" role="worker" \/>/,
    );
  });
  it("organisation home, with the acting role's defaults", () => {
    expect(read("components/app/organization/company-model-screen.tsx")).toMatch(
      /<Suspense fallback=\{<HomePinsPending \/>\}>\s*<HomePinsSection context="company" role=\{role\} \/>/,
    );
    expect(read("app/[locale]/dashboard/page.tsx")).toMatch(
      /<CompanyModelScreen role=\{activeRole === "agency" \? "agency" : "company"\} \/>/,
    );
  });
});

describe("copy exists and is translated in all 11 locales", () => {
  const LOCALES = readdirSync(join(APP_ROOT, "messages"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
  type Pins = Record<string, string | Record<string, string>>;
  const pins = (loc: string) =>
    (JSON.parse(read(`messages/${loc}.json`)) as { homePins: Pins }).homePins;
  const flat = (p: Pins): Array<[string, string]> =>
    Object.entries(p).flatMap(([k, v]) =>
      typeof v === "string" ? [[k, v] as [string, string]] : Object.entries(v).map(([k2, v2]) => [`${k}.${k2}`, v2] as [string, string]),
    );
  const en = new Map(flat(pins("en")));

  it("11 catalogues", () => expect(LOCALES).toHaveLength(11));

  it.each(LOCALES)("%s", (loc) => {
    const mine = new Map(flat(pins(loc)));
    expect([...mine.keys()].sort()).toEqual([...en.keys()].sort());
    for (const [key, value] of mine) {
      expect(value.trim(), `${loc} ${key}`).not.toBe("");
      expect(value).not.toContain("[EN]");
      expect(value.toLowerCase()).not.toMatch(/\bdemo\b/);
      if (loc !== "en") expect(value, `${loc} homePins.${key} untranslated`).not.toBe(en.get(key));
    }
    for (const key of ["pin", "unpin", "moveEarlier", "moveLater"]) {
      expect(mine.get(key), `${loc} ${key} placeholder`).toContain("{name}");
    }
  });
});
