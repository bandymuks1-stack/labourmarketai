/**
 * Guard for the demand-intake consolidation migration (Phase 3 / Slice 3.1).
 * Pins: ONE canonical intake (customer_requests), additive + reversible, the
 * owner-scoped save RPC (no RLS loosening, no direct cross-profile insert),
 * pilot_drafts folded (not dropped here), default-closed preserved.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIG_DIR = join(__dirname, "..", "..", "..", "..", "supabase", "migrations");

function migration(): { name: string; sql: string } {
  const file = readdirSync(MIG_DIR).find((f) => f.endsWith("_demand_intake_consolidation.sql"));
  if (!file) throw new Error("demand_intake_consolidation migration not found");
  return { name: file, sql: readFileSync(join(MIG_DIR, file), "utf8") };
}
const code = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

describe("Guard: demand-intake consolidation migration", () => {
  const { name, sql } = migration();
  const exec = code(sql);

  it("filename matches §16", () => {
    expect(name).toMatch(/^\d{14}_demand_intake_consolidation\.sql$/);
  });

  it("extends the CANONICAL intake (customer_requests), not a new table", () => {
    expect(exec).not.toMatch(/create table/i);
    expect(exec).toMatch(/alter table public\.customer_requests[\s\S]*add column if not exists kind/i);
    expect(exec).toMatch(/add column if not exists payload jsonb/i);
    expect(exec).toMatch(/add column if not exists original_language/i); // §2 multilingual
  });

  it("one-draft-per-(profile,kind) via a partial unique index", () => {
    expect(exec).toMatch(/create unique index[\s\S]*customer_requests[\s\S]*\(\s*profile_id\s*,\s*kind\s*\)[\s\S]*where status\s*=\s*'draft'/i);
  });

  it("save is an owner-scoped SECURITY DEFINER RPC (insert RLS is admin-only)", () => {
    expect(exec).toMatch(/create or replace function public\.save_demand_draft[\s\S]*security definer/i);
    expect(exec).toMatch(/uid uuid := auth\.uid\(\)/i);
    expect(exec).toMatch(/profile_id = uid/i); // acts only on the caller's own draft
    expect(exec).toMatch(/grant execute on function public\.save_demand_draft[\s\S]*to authenticated/i);
    expect(exec).toMatch(/revoke all on function public\.save_demand_draft[\s\S]*from public/i);
  });

  it("does not fold/merge leads (kept as a distinct pre-auth funnel, §17.2)", () => {
    expect(exec).not.toMatch(/\bleads\b/i);
  });

  it("default-closed: no RLS widening; additive + reversible", () => {
    expect(exec).not.toMatch(/create policy|alter policy/i);
    expect(exec).not.toMatch(/using\s*\(\s*true\s*\)/i);
    expect(exec).not.toMatch(/\bto\s+anon\b/i);
    expect(exec).not.toMatch(/drop\s+table\b/i);
    expect(exec).not.toMatch(/drop\s+column\b/i);
    expect(exec).not.toMatch(/drop\s+function\b/i); // drops live only in ROLLBACK comment
    expect(sql).toMatch(/--[^\n]*\brollback\b/i);
  });
});
