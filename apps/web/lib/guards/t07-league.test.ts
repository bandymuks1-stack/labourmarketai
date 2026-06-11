import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * TASK 07.4 guard — šalies lyga honesty.
 *
 * The league NEVER fabricates a rating: a thermometer value exists ONLY when
 * an admin-entered market average exists AND the declared position sample is
 * n >= 2 (owner review fix); everywhere else the cell is the honest
 * insufficient-data state. People are never ranked — rows order by the raw
 * team-size count (doctrine §7, PRODUCT_CONSTITUTION §10).
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const lib = read("lib/admin/league.ts");
const page = read("app/[locale]/dashboard/admin/league/page.tsx");

const LOCALES = ["en", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl"];

describe("league data is real-rows-only with the owner-locked thermometer", () => {
  it("thermometer values come ONLY from computeThermometer (iron rule §7)", () => {
    expect(lib).toContain("computeThermometer");
    expect(lib).not.toMatch(/scoreEur\s*[:=]\s*\d/);
  });
  it("the position component requires n >= 2 (review fix parity)", () => {
    // Text-level pin (the lib is "server-only", so no runtime import here).
    expect(lib).toMatch(/LEAGUE_MIN_POSITION_N = 2/);
    expect(lib).toMatch(/declaredSampleN >= LEAGUE_MIN_POSITION_N/);
  });
  it("the market component is the admin-entered sourced table only", () => {
    expect(lib).toContain("market_rate_averages");
    expect(lib).toMatch(/\.eq\("is_active", true\)/);
  });
  it("no ranking of people — rows order by the raw team-size count", () => {
    expect(lib).toMatch(/b\.workers - a\.workers/);
    expect(code(lib)).not.toMatch(/match_score|ranking|\brating\b|top\s*\d/i);
  });
  it("availability is the real declared status, never inferred", () => {
    expect(lib).toMatch(/availability_status === "available"/);
  });
});

describe("the league page is superadmin-gated and honest", () => {
  it("requireSuperadmin is awaited before any data read", () => {
    const gateIdx = page.indexOf("requireSuperadmin");
    const dataIdx = page.indexOf("getLeague()");
    expect(gateIdx).toBeGreaterThan(-1);
    expect(dataIdx).toBeGreaterThan(gateIdx);
  });
  it("renders the method note + honest empty + insufficient-data states", () => {
    expect(page).toMatch(/league-method-note/);
    expect(page).toMatch(/league-empty/);
    expect(page).toMatch(/league-thermometer-missing/);
  });
  it("a thermometer chip renders ONLY for a real score", () => {
    expect(page).toMatch(/thermometer\.kind === "score"/);
  });
  it("is reachable from the admin hub", () => {
    const hub = read("app/[locale]/dashboard/admin/page.tsx");
    expect(hub).toMatch(/dashboard\/admin\/league/);
    expect(hub).toMatch(/hub\.league/);
  });
});

describe("league copy exists in all 10 locales", () => {
  it("admin.league + admin.hub.league present everywhere", () => {
    for (const locale of LOCALES) {
      const j = JSON.parse(read(`messages/${locale}.json`));
      for (const k of [
        "eyebrow", "title", "subtitle", "methodNote", "empty",
        "unknownCountry", "availableNow", "insufficientData", "smallSample",
      ]) {
        expect(j.admin?.league?.[k], `${locale} admin.league.${k}`).toBeTruthy();
      }
      expect(j.admin?.hub?.league, `${locale} admin.hub.league`).toBeTruthy();
    }
  });
  it("LT/EN method note names BOTH thermometer preconditions", () => {
    const lt = JSON.parse(read("messages/lt.json")).admin.league.methodNote;
    const en = JSON.parse(read("messages/en.json")).admin.league.methodNote;
    expect(lt).toMatch(/rinkos vidurk/i);
    expect(lt).toMatch(/bent 2/);
    expect(en).toMatch(/market average/i);
    expect(en).toMatch(/at least 2/);
  });
});
