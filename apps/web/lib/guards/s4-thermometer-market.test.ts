import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  averageMidpoint,
  computeThermometer,
  salaryMidpoint,
} from "../market/thermometer";

/**
 * Guard: S4 Termometras + Rinkos analizė.
 *
 *   1. IRON RULE (doctrine §7): the thermometer NEVER returns a score with a
 *      missing component — anything missing → insufficient_data naming the
 *      missing component. Never an invented number, never a silent zero.
 *   2. The two S4 migrations stay DRAFT-headed, additive, reversible, and
 *      never loosen RLS; the autolink links ONLY on an exactly-one active
 *      same-organization assignment and does NO backfill of old entries.
 *   3. The position-average surface is an AGGREGATE-only definer RPC (no
 *      individual salary leaves the database).
 *   4. The admin market view stays honest: hand-entered averages only
 *      (source_status ladder), small-sample warning wired, the demand-side
 *      free-text/no-profession-FK reality stated in copy.
 *   5. Trust→visibility stays FACTUAL: the matching filter is a count
 *      predicate (skillsConfirmed > 0), no numeric trust score anywhere.
 */

const APP = resolve(__dirname, "..", "..");
const REPO = resolve(APP, "..", "..");
const read = (rel: string): string => readFileSync(resolve(APP, rel), "utf8");
const readRepo = (rel: string): string =>
  readFileSync(resolve(REPO, rel), "utf8");
const stripSqlComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

const MIGRATIONS = [
  "supabase/migrations/20260610213000_journal_entry_project_autolink.sql",
  "supabase/migrations/20260610214000_market_rate_averages.sql",
];

describe("S4 iron rule — no score without BOTH components", () => {
  it("both components present → the owner-locked average", () => {
    expect(computeThermometer({ positionAvgEur: 2000, marketAvgEur: 3000 })).toEqual({
      kind: "score",
      scoreEur: 2500,
    });
  });

  it("missing market → insufficient_data naming 'market'", () => {
    expect(computeThermometer({ positionAvgEur: 2000, marketAvgEur: null })).toEqual(
      { kind: "insufficient_data", missing: "market" },
    );
  });

  it("missing position → insufficient_data naming 'position'", () => {
    expect(computeThermometer({ positionAvgEur: null, marketAvgEur: 3000 })).toEqual(
      { kind: "insufficient_data", missing: "position" },
    );
  });

  it("both missing → insufficient_data 'both'", () => {
    expect(computeThermometer({ positionAvgEur: null, marketAvgEur: null })).toEqual(
      { kind: "insufficient_data", missing: "both" },
    );
  });

  it("a silent zero / NaN / negative NEVER counts as a component", () => {
    for (const bad of [0, -1, NaN, Infinity]) {
      expect(
        computeThermometer({ positionAvgEur: bad, marketAvgEur: 3000 }).kind,
      ).toBe("insufficient_data");
      expect(
        computeThermometer({ positionAvgEur: 2000, marketAvgEur: bad }).kind,
      ).toBe("insufficient_data");
    }
  });

  it("midpoint helpers never fabricate: empty in → null out", () => {
    expect(salaryMidpoint(null, null)).toBeNull();
    expect(salaryMidpoint(0, 0)).toBeNull();
    expect(salaryMidpoint(2000, 3000)).toBe(2500);
    expect(salaryMidpoint(2000, null)).toBe(2000);
    expect(averageMidpoint([])).toBeNull();
    expect(averageMidpoint([null, null])).toBeNull();
    expect(averageMidpoint([2000, 3000])).toBe(2500);
  });

  it("the player-card slot renders honest states for every missing variant", () => {
    const card = read("components/app/worker-player-card.tsx");
    expect(card).toContain("thermoMissingPosition");
    expect(card).toContain("thermoMissingMarket");
    expect(card).toContain("thermoMissingBoth");
    expect(card).toContain("thermoSmallSample");
    expect(card).toContain("player-card-thermometer");
  });
});

describe("S4 draft migrations — draft-headed, additive, reversible", () => {
  for (const rel of MIGRATIONS) {
    const raw = readRepo(rel);
    const code = stripSqlComments(raw).toLowerCase();
    it(`${rel} is explicitly a needs-human-gate DRAFT`, () => {
      expect(raw).toMatch(/DRAFT — needs-human-gate — DO NOT APPLY/);
      expect(raw).toMatch(/apply_migration/);
    });
    it(`${rel} is additive only and carries a ROLLBACK block`, () => {
      expect(code).not.toMatch(/\bdrop\s+(table|column|function)/);
      expect(code).not.toMatch(/delete\s+from/);
      expect(raw).toMatch(/-- ROLLBACK/);
    });
    it(`${rel} never loosens RLS (no using(true), no anon)`, () => {
      expect(code).not.toMatch(/using\s*\(\s*true\s*\)/);
      expect(code).not.toMatch(/\bto\s+anon\b/);
      expect(code).not.toMatch(/\bgrant\b[\s\S]{0,120}?\bto\s+(anon|public)\b/);
    });
  }

  it("autolink links ONLY on exactly-one active same-org assignment, no backfill", () => {
    const sql = readRepo(MIGRATIONS[0]);
    const code = stripSqlComments(sql).toLowerCase();
    expect(code).toMatch(/status = 'active'/);
    expect(code).toMatch(/p\.organization_id = ec\.organization_id/);
    expect(code).toMatch(/is distinct from 1/); // ambiguity → null
    // No backfill of historical rows: the only UPDATE in the file is the
    // pre-existing supersede pointer flip, never a project_id update.
    expect(code).not.toMatch(/update\s+public\.journal_entries\s+set\s+project_id/);
  });

  it("position average leaves the DB ONLY as an aggregate (avg + n)", () => {
    const sql = readRepo(MIGRATIONS[1]);
    const code = stripSqlComments(sql).toLowerCase();
    expect(code).toMatch(/returns table \(avg_mid_eur numeric, sample_n int\)/);
    // The market table's write path is the admin RPC; direct writes revoked.
    expect(code).toMatch(/revoke insert, update, delete on public\.market_rate_averages/);
    expect(code).toMatch(/source_status\s+text not null default 'needs_source'/);
    expect(code).toMatch(/public\.is_admin\(\)/);
  });
});

describe("S4 honest market view + factual visibility signals", () => {
  it("market analysis flags small samples and the demand free-text reality", () => {
    const lib = read("lib/admin/market-analysis.ts");
    expect(lib).toMatch(/SMALL_SAMPLE_N = 5/);
    expect(lib).toMatch(/smallSample/);
    const page = read("app/[locale]/dashboard/admin/market/page.tsx");
    expect(page).toContain("freeTextNote");
    expect(page).toContain("market-small-sample");
    expect(page).toContain("requireSuperadmin");
  });

  it("LT+EN copy: method note promises real counts; demand note states no profession link", () => {
    for (const loc of ["lt", "en"] as const) {
      const market = JSON.parse(read(`messages/${loc}.json`)).admin.market as Record<
        string,
        unknown
      >;
      expect(String(market.methodNote).length).toBeGreaterThan(40);
      const demand = market.demand as Record<string, string>;
      expect(demand.freeTextNote).toMatch(loc === "lt" ? /laisvu tekstu/ : /free text/);
    }
  });

  it("all 10 locales carry the admin.market namespace", () => {
    for (const loc of ["en", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl"]) {
      const j = JSON.parse(read(`messages/${loc}.json`));
      expect(j.admin?.market?.title, `admin.market missing in ${loc}`).toBeTruthy();
      expect(j.admin?.hub?.market, `admin.hub.market missing in ${loc}`).toBeTruthy();
    }
  });

  it("matching visibility filter is a factual count predicate, not a score", () => {
    const page = read("app/[locale]/dashboard/admin/matching/page.tsx");
    expect(page).toMatch(/skillsConfirmed > 0/);
    expect(page).not.toMatch(/trust[_ ]?score/i);
  });

  it("the thermometer data builder degrades honestly on missing migrations", () => {
    const lib = read("lib/market/thermometer-data.ts");
    expect(lib).toContain("42P01");
    expect(lib).toMatch(/42883|PGRST202/);
    expect(lib).toContain("computeThermometer");
  });
});
