import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Market Map Data Model v1 — migration safety + privacy + visibility guard.
 *
 * The migration is a PREPARED, owner-gated proposal. This guard locks in its
 * safety invariants in the repo so the proposal can't silently drift into an
 * unsafe shape before the owner approves applying it:
 *   - owner-gated (draft header + @human-gate-approved) and reversible;
 *   - additive only (no drop/rename/backfill in the up migration);
 *   - owner-scoped RLS, no anon/public, no `using (true)`, no SECURITY DEFINER;
 *   - login location can never be exact (no lat/lng/address columns);
 *   - signal stores stay separate (preferred / company-need / project) and
 *     every signal carries a visibility_level.
 */

const REPO = join(__dirname, "..", "..", "..", "..");
const MIGRATION = join(
  REPO,
  "supabase/migrations/20260617120000_market_map_data_model_v1.sql",
);
const ROLLBACK = join(
  REPO,
  "supabase/rollbacks/20260617120000_market_map_data_model_v1.down.sql",
);
const up = readFileSync(MIGRATION, "utf8");
// SQL with `--` comments stripped — so prose like "no `using (true)`" in the
// header doesn't trip the destructive/RLS checks (we test real statements).
const codeLc = up
  .split("\n")
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n")
  .toLowerCase();

describe("owner-gated + reversible", () => {
  it("migration file exists with the human-gate header + annotation", () => {
    expect(existsSync(MIGRATION)).toBe(true);
    expect(up).toMatch(/needs-human-gate/i);
    expect(up).toMatch(/DO NOT APPLY automatically/i);
    expect(up).toMatch(/@human-gate-approved/);
  });
  it("ships a rollback file", () => {
    expect(existsSync(ROLLBACK)).toBe(true);
    expect(readFileSync(ROLLBACK, "utf8")).toMatch(/drop table if exists public\.preferred_locations/);
  });
});

describe("additive only — no destructive ops in the UP migration", () => {
  it("no drop table / drop column / rename / delete / truncate", () => {
    expect(codeLc).not.toMatch(/drop\s+table/);
    expect(codeLc).not.toMatch(/drop\s+column/);
    expect(codeLc).not.toMatch(/\brename\b/);
    expect(codeLc).not.toMatch(/delete\s+from/);
    expect(codeLc).not.toMatch(/truncate/);
  });
  it("does not alter the profiles/companies registration columns", () => {
    expect(codeLc).not.toMatch(/alter\s+table\s+public\.profiles/);
    expect(codeLc).not.toMatch(/alter\s+table\s+public\.companies/);
  });
});

describe("RLS — owner-scoped, no anon/public, no definer", () => {
  for (const t of ["preferred_locations", "consented_login_location_signals"]) {
    it(`${t}: enables RLS and is owner-scoped`, () => {
      expect(up).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security`));
      expect(up).toMatch(new RegExp(`${t}[\\s\\S]*profile_id = auth\\.uid\\(\\)`));
      expect(up).toMatch(new RegExp(`grant select, insert, update, delete on public\\.${t} to authenticated`));
    });
  }
  it("no RLS-loosening / anon / public / security definer", () => {
    expect(codeLc).not.toMatch(/using\s*\(\s*true\s*\)/);
    expect(codeLc).not.toMatch(/to\s+anon/);
    expect(codeLc).not.toMatch(/to\s+public/);
    expect(codeLc).not.toMatch(/security\s+definer/);
  });
});

describe("privacy — login location can never be exact", () => {
  it("consented_login_location_signals has NO lat/lng/address columns", () => {
    // Isolate the login table's CREATE statement and assert the forbidden
    // columns are absent from it.
    const m = up.match(/create table if not exists public\.consented_login_location_signals[\s\S]*?\);/);
    expect(m, "login table create block").toBeTruthy();
    const block = (m![0] ?? "").toLowerCase();
    expect(block).not.toMatch(/latitude|longitude|\blat\b|\blng\b|address/);
    // consent + approximate-only fields are present.
    expect(block).toMatch(/consent_status/);
    expect(block).toMatch(/precision_level/);
  });
});

describe("signal stores stay separate + carry visibility", () => {
  it("creates preferred_locations with intents incl. 'work'", () => {
    expect(up).toMatch(/create table if not exists public\.preferred_locations/);
    expect(up).toMatch(/intents\s+text\[\]/);
    expect(up).toMatch(/'work'/);
  });
  it("extends company_demand_locations with need_type (not a new table)", () => {
    expect(up).toMatch(/alter table public\.company_demand_locations[\s\S]*need_type/);
    expect(up).not.toMatch(/create table if not exists public\.company_need_locations/);
  });
  it("extends projects (reuses existing country/city, no parallel table)", () => {
    expect(up).toMatch(/alter table public\.projects[\s\S]*visibility_level/);
    expect(up).not.toMatch(/create table if not exists public\.project_locations/);
  });
  it("every signal store carries a visibility_level with the allowed set", () => {
    const occurrences = (up.match(/visibility_level/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(4); // 2 new tables + 2 extended
    expect(up).toMatch(/'self_only'/);
    expect(up).toMatch(/'aggregated'/);
    expect(up).toMatch(/'admin_only'/);
  });
});
