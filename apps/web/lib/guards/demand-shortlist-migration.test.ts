import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guard for the demand_shortlist migration (Full Cycle Sprint v1, Slice 3).
 * Pins that the scouting shortlist is ADDITIVE + owner-scoped and changes NO
 * existing RLS — the cycle's scouting stage must not loosen visibility.
 */

const REPO = resolve(__dirname, "..", "..", "..", "..");
const readRepo = (rel: string) => readFileSync(resolve(REPO, rel), "utf8");

const MIG = "supabase/migrations/20260612220000_demand_shortlist.sql";
const DOWN = "supabase/rollbacks/20260612220000_demand_shortlist.down.sql";
const sql = readRepo(MIG).toLowerCase();
const code = sql
  .split(/\r?\n/)
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n");

describe("demand_shortlist migration — additive, owner-scoped, no existing-RLS change", () => {
  it("creates the demand_shortlist table with the four scouting statuses", () => {
    expect(code).toContain("create table if not exists public.demand_shortlist");
    for (const s of ["saved", "interested", "not_fit", "reviewed"]) {
      expect(code).toContain(`'${s}'`);
    }
    // one row per (owner, demand, worker)
    expect(code).toMatch(/unique \(owner_id, request_id, worker_id\)/);
  });

  it("is owner-scoped via the existing auth model (owner_id = auth.uid())", () => {
    expect(code).toMatch(/owner_id\s*=\s*auth\.uid\(\)/);
    expect(code).toMatch(/create policy demand_shortlist_select/);
    expect(code).toMatch(/create policy demand_shortlist_write/);
  });

  it("touches ONLY the new table — no alter/drop of any existing policy/table", () => {
    // create policy on the NEW table is fine; altering/dropping EXISTING RLS is not.
    expect(code).not.toMatch(/alter\s+policy/);
    expect(code).not.toMatch(/drop\s+policy/);
    // every create-policy / create-table / grant targets demand_shortlist only
    const createdPolicies = code.match(/create policy\s+(\w+)/g) ?? [];
    for (const p of createdPolicies) {
      expect(p).toMatch(/demand_shortlist/);
    }
    expect(code).not.toMatch(/using\s*\(\s*true\s*\)/);
    expect(code).not.toMatch(/\bto\s+anon\b/);
    expect(code).not.toMatch(/security\s+definer/);
  });

  it("grants only to authenticated (never anon/public)", () => {
    expect(code).toMatch(/grant[\s\S]*on public\.demand_shortlist to authenticated/);
    expect(code).not.toMatch(/grant[\s\S]*to\s+(anon|public)\b/);
  });

  it("ships a guarded, reversible rollback file", () => {
    const down = readRepo(DOWN).toLowerCase();
    expect(down).toContain("drop table if exists public.demand_shortlist");
    // guarded: refuses to drop if rows exist (history = evidence)
    expect(down).toMatch(/count\(\*\)[\s\S]*raise exception/);
  });
});
