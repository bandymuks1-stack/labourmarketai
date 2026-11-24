import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * W8 service_offerings — migration safety + RLS guard.
 *
 * The services foundation is RED-class (a new table + RLS, owner-applied). This
 * guard statically pins the safety invariants of the migration + rollback so a
 * future edit can't loosen them:
 *   - additive only (CREATE, never ALTER/DROP of an existing table);
 *   - RLS enabled, every policy owner-scoped (provider_id = auth.uid());
 *   - NO `using (true)`, NO grants to anon/public — `authenticated` only;
 *   - the human-gate annotation is present;
 *   - a guarded, reversible rollback exists (refuses to drop a non-empty table).
 */

// guards → lib → web → apps → repo root, then supabase/...
const REPO = join(__dirname, "..", "..", "..", "..");
const MIG = join(REPO, "supabase", "migrations", "20260627121713_service_offerings.sql");
const ROLLBACK = join(REPO, "supabase", "rollbacks", "20260627121713_service_offerings.down.sql");
const read = (p: string) => readFileSync(p, "utf8");

describe("service_offerings migration is additive + RLS-safe", () => {
  const sql = read(MIG).toLowerCase();

  it("creates the table additively (create if not exists, no destructive ops)", () => {
    expect(sql).toMatch(/create table if not exists public\.service_offerings/);
    // No ALTER/DROP of any OTHER existing table (only this new table + its policies).
    expect(sql).not.toMatch(/alter table public\.(?!service_offerings)/);
    expect(sql).not.toMatch(/drop table(?! if exists public\.service_offerings)/);
    expect(sql).not.toMatch(/delete from|truncate /);
  });

  it("enables RLS and scopes every policy to the owner (provider_id = auth.uid())", () => {
    expect(sql).toMatch(/alter table public\.service_offerings enable row level security/);
    // Each policy verb is present and owner-scoped.
    for (const verb of ["select", "insert", "update", "delete"]) {
      expect(sql, `policy for ${verb}`).toMatch(
        new RegExp(`create policy service_offerings_${verb}`),
      );
    }
    expect(sql).toMatch(/provider_id = auth\.uid\(\)/);
  });

  it("never opens the table with using(true) or to anon/public", () => {
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/);
    expect(sql).not.toMatch(/to anon\b/);
    expect(sql).not.toMatch(/to public\b/);
    // The only grant target is `authenticated`.
    expect(sql).toMatch(/grant select, insert, update, delete on public\.service_offerings to authenticated/);
  });

  it("carries the human-gate annotation (RED, owner-applied)", () => {
    expect(read(MIG)).toMatch(/@human-gate-approved/);
    expect(read(MIG)).toMatch(/DO NOT APPLY automatically/i);
  });
});

describe("service_offerings rollback is present and guarded", () => {
  it("exists and refuses to drop a non-empty table", () => {
    expect(existsSync(ROLLBACK), "rollback file present").toBe(true);
    const down = read(ROLLBACK).toLowerCase();
    expect(down).toMatch(/refusing automatic rollback/);
    expect(down).toMatch(/drop table if exists public\.service_offerings/);
  });
});
