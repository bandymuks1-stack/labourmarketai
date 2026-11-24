/**
 * Guard for the keystone membership-engagement-reroute migration.
 * Pins the guardrails of TASK 01 so a future edit can't quietly break them:
 *   - membership is on the CANONICAL engagement_contexts model (no new table,
 *     no company_workers/agency_workers writes in the new RPCs)
 *   - every engagement write is hash-chained (hash_self via digest), never a
 *     raw INSERT that skips the audit hash
 *   - the review gate is rerouted to engagement_contexts.journal_review_enabled
 *   - approval actually verifies a declared skill (the proof)
 *   - additive + reversible; default-closed (no RLS widening)
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIG_DIR = join(__dirname, "..", "..", "..", "..", "supabase", "migrations");

function migration(): { name: string; sql: string } {
  const file = readdirSync(MIG_DIR).find((f) => f.endsWith("_membership_engagement_reroute.sql"));
  if (!file) throw new Error("membership_engagement_reroute migration not found");
  return { name: file, sql: readFileSync(join(MIG_DIR, file), "utf8") };
}

// executable SQL only (strip comments — the prose/ROLLBACK legitimately mentions
// drop/legacy/etc.)
function code(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

describe("Guard: membership-engagement-reroute migration", () => {
  const { name, sql } = migration();
  const exec = code(sql);

  it("filename matches §16", () => {
    expect(name).toMatch(/^\d{14}_membership_engagement_reroute\.sql$/);
  });

  it("adds the two additive columns to engagement_contexts", () => {
    expect(exec).toMatch(/alter table public\.engagement_contexts[\s\S]*add column if not exists operations_role text/i);
    expect(exec).toMatch(/add column if not exists journal_review_enabled boolean not null default false/i);
  });

  it("membership stays canonical — no new membership table, no legacy writes in the new RPCs", () => {
    expect(exec).not.toMatch(/create table/i); // no parallel membership concept
    // the new membership RPCs must not INSERT/UPDATE the legacy link tables
    expect(exec).not.toMatch(/insert\s+into\s+public\.(company_workers|agency_workers)\b/i);
    expect(exec).not.toMatch(/update\s+public\.(company_workers|agency_workers)\b/i);
    // membership is expressed via engagement_contexts relationship slugs
    expect(exec).toMatch(/relationship_slug.*'employee'|'employee'/i);
    expect(exec).toMatch(/'manager'/);
  });

  it("every engagement INSERT is hash-chained (hash_self via digest)", () => {
    const inserts = exec.match(/insert into public\.engagement_contexts[\s\S]*?;/gi) ?? [];
    expect(inserts.length).toBeGreaterThanOrEqual(2); // add_org_member + grant_org_manager
    for (const ins of inserts) {
      expect(ins, "engagement insert must compute hash_self via digest").toMatch(/hash_self/i);
      expect(ins).toMatch(/digest\(/i);
    }
  });

  it("review gate is rerouted to engagement_contexts.journal_review_enabled (off legacy)", () => {
    expect(exec).toMatch(/review_journal_entry/);
    expect(exec).toMatch(/reviewable_journal_entry_ids/);
    expect(exec).toMatch(/ec\.journal_review_enabled/i);
    // the rerouted functions must NOT re-introduce the legacy enabled-join
    expect(exec).not.toMatch(/journal_review_enabled\s+is\s+true[\s\S]*company_workers/i);
  });

  it("approval verifies a declared skill — the proof", () => {
    expect(exec).toMatch(/confirm_entry_and_verify_skills/);
    expect(exec).toMatch(/update public\.worker_skills[\s\S]*set verified\s*=\s*true/i);
    expect(exec).toMatch(/source\s*=\s*'manager_confirmed'/i);
    // confirmed skills must belong to the worker (no verifying someone else's skill)
    expect(exec).toMatch(/skill_not_owned/);
  });

  it("default-closed: no RLS policy widening", () => {
    expect(exec).not.toMatch(/create policy|alter policy/i);
    expect(exec).not.toMatch(/using\s*\(\s*true\s*\)/i);
    expect(exec).not.toMatch(/\bto\s+anon\b/i);
  });

  it("additive + reversible (no destructive drop in executable SQL; has ROLLBACK)", () => {
    expect(exec).not.toMatch(/drop\s+table\b/i);
    expect(exec).not.toMatch(/drop\s+column\b/i);
    expect(exec).not.toMatch(/drop\s+function\b/i); // drops live only in the ROLLBACK comment
    expect(sql).toMatch(/--[^\n]*\brollback\b/i);
  });

  it("new RPCs are granted to authenticated, revoked from public", () => {
    for (const fn of ["add_org_member", "grant_org_manager", "set_engagement_journal_review", "confirm_entry_and_verify_skills"]) {
      expect(exec).toMatch(new RegExp(`grant execute on function public\\.${fn}\\b[\\s\\S]*?to authenticated`, "i"));
      expect(exec).toMatch(new RegExp(`revoke all on function public\\.${fn}\\b[\\s\\S]*?from public`, "i"));
    }
  });
});
