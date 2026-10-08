import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard: work_plan_worker_in_scope_v1 covers the roster + v2 engagement truths.
 *
 * Proven failure (2026-10-07): a worker linked via company_workers (roster
 * invite) or an employee with only an engagement_contexts row was refused as
 * worker_not_in_scope, so planning was unreachable for the normal population.
 * Pins: additive CREATE OR REPLACE, same security posture, both new branches,
 * manager relationships NOT worker scope, no authority loosening, rollback
 * restores the previous three-branch body.
 */
const repo = resolve(__dirname, "..", "..", "..", "..");
const exec = (rel: string) =>
  readFileSync(resolve(repo, rel), "utf8")
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

const up = exec("supabase/migrations/20261007140000_work_plan_scope_roster_engagement_v1.sql");
const down = exec("supabase/rollbacks/20261007140000_work_plan_scope_roster_engagement_v1.down.sql");

describe("Guard: work-plan scope roster + engagement", () => {
  it("keeps signature, SECURITY DEFINER, search_path and grants", () => {
    expect(up).toMatch(/create or replace function public\.work_plan_worker_in_scope_v1\(\s*p_organization_id uuid,\s*p_worker_id uuid\s*\) returns boolean/);
    expect(up).toMatch(/security definer set search_path = public, pg_temp/);
    expect(up).toMatch(/revoke all on function public\.work_plan_worker_in_scope_v1\(uuid, uuid\) from anon/);
    expect(up).toMatch(/grant execute on function public\.work_plan_worker_in_scope_v1\(uuid, uuid\) to authenticated/);
    expect(up).not.toMatch(/drop |truncate|delete from|to anon|to public/i);
  });

  it("keeps the three existing branches and adds roster + engagement branches", () => {
    for (const t of ["company_worker_engagements", "company_memberships", "agency_workers"]) {
      expect(up).toContain(`public.${t}`);
    }
    expect(up).toMatch(/from public\.company_workers cw[\s\S]*cw\.status = 'active'/);
    expect(up).toMatch(/from public\.engagement_contexts ec[\s\S]*ec\.status = 'active'/);
    expect(up).toMatch(/ec\.relationship_slug in \('employee', 'collaborator', 'freelancer'\)/);
    expect(up).toMatch(/ec\.organization_id = p_organization_id/);
  });

  it("does not treat manager/owner relationships as worker scope or touch authority", () => {
    expect(up).not.toMatch(/'manager'|'owner'|'external_manager'/);
    expect(up).not.toMatch(/manages_organization|create_work_plan_entry_v1/);
  });

  it("rollback restores the previous three-branch body without the new tables", () => {
    expect(down).toMatch(/create or replace function public\.work_plan_worker_in_scope_v1/);
    expect(down).not.toMatch(/company_workers|engagement_contexts/);
    expect(down).toMatch(/agency_workers/);
  });
});
