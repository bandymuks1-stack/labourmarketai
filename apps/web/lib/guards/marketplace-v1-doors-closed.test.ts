import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Marketplace v1 write RPCs are CLOSED once v2 exists (convergence audit P1).
 * create_ / update_ / set_marketplace_listing_status_v1 are the frozen
 * pre-universal doors: no expiry check, no amount contract. After
 * 20261003151400 nothing but v2 can write a listing through PostgREST.
 */
const REPO = join(__dirname, "..", "..", "..", "..");
const read = (p: string) => readFileSync(p, "utf8");
const ddl = (p: string) =>
  read(p)
    .split("\n")
    .filter((l) => !/^\s*--/.test(l))
    .join("\n");

const MIG = join(REPO, "supabase", "migrations", "20261003151400_marketplace_v1_write_rpcs_closed_v1.sql");
const DOWN = join(REPO, "supabase", "rollbacks", "20261003151400_marketplace_v1_write_rpcs_closed_v1.down.sql");

const V1 = [
  "create_marketplace_listing_v1",
  "update_marketplace_listing_v1",
  "set_marketplace_listing_status_v1",
] as const;

describe("20261003151400 closes the v1 write doors", () => {
  it("ships with a rollback and the human-gate marker (RED: REVOKE)", () => {
    expect(existsSync(MIG)).toBe(true);
    expect(existsSync(DOWN)).toBe(true);
    expect(read(MIG)).toContain("@human-gate-approved");
    expect(read(DOWN)).not.toContain("@human-gate-approved");
  });

  for (const fn of V1) {
    it(`${fn}: revoked from public, anon and authenticated`, () => {
      const d = ddl(MIG);
      for (const role of ["public", "anon", "authenticated"]) {
        expect(d).toMatch(new RegExp(`revoke execute on function public\\.${fn}\\([^)]*\\) from ${role};`));
      }
    });
    it(`${fn}: rollback restores authenticated only`, () => {
      const d = ddl(DOWN);
      expect(d).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to authenticated;`));
      expect(d).not.toMatch(/to (anon|public)/);
    });
  }

  it("grants nothing, redefines no function, touches no policy / table, leaves delete_v1 alone", () => {
    const d = ddl(MIG);
    expect(d).not.toMatch(/\bgrant\b/i);
    expect(d).not.toMatch(/create (or replace )?function|alter table|create policy|drop policy|drop function/i);
    expect(d).not.toContain("delete_marketplace_listing_v1");
  });

  it("v2 stays the single contract (the migration that defines it is untouched)", () => {
    const v2 = ddl(join(REPO, "supabase", "migrations", "20261003150300_marketplace_index_v1.sql"));
    expect(v2).toContain("create_marketplace_listing_v2");
    expect(v2).toContain("'listing expired'");
  });
});
