import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A manager may staff a project they MANAGE from that project's own company
 * roster — and nothing more (owner decision 2026-10-01). These pins read the
 * migration text: the branch is inline, keyed to the project's own organization
 * and company, and the shared predicates (which would widen READ exposure) are
 * not redefined here.
 */
const root = resolve(__dirname, "../../../..");
const mig = readFileSync(
  resolve(root, "supabase/migrations/20261001170000_manager_assigns_roster_worker_on_managed_project_v1.sql"),
  "utf8",
);
const down = readFileSync(
  resolve(root, "supabase/rollbacks/20261001170000_manager_assigns_roster_worker_on_managed_project_v1.down.sql"),
  "utf8",
);

describe("manager assigns on a managed project", () => {
  it("the manager branch is keyed to THIS project's organization and company roster", () => {
    expect(mig).toMatch(/mcw\.company_id = mp\.company_id/);
    expect(mig).toMatch(/mcw\.worker_id = w_id/);
    expect(mig).toMatch(/mcw\.status = 'active'/);
    expect(mig).toMatch(/mp\.id = pid/);
    expect(mig).toMatch(/mp\.organization_id is not null/);
    expect(mig).toMatch(/public\.manages_organization\(mp\.organization_id\)/);
  });

  it("read exposure is unchanged: the shared predicates are not redefined", () => {
    expect(mig).not.toMatch(/create or replace function public\.caller_manages_worker/i);
    expect(mig).not.toMatch(/create or replace function public\.can_manage_project/i);
    expect(mig).not.toMatch(/create or replace function public\.manages_organization/i);
    expect(mig.match(/create or replace function/gi)?.length).toBe(1);
  });

  it("owner/admin and engagement paths are untouched and the function stays definer-only for signed-in users", () => {
    expect(mig).toMatch(/caller_manages_worker_by_roster\(w_id\)/);
    expect(mig).toMatch(/caller_has_booking_engagement_for_project\(w_id, pid\)/);
    expect(mig).toMatch(/public\.is_admin\(\)/);
    expect(mig).toMatch(/revoke all on function public\.assign_worker_to_project\(text, text\) from public, anon/);
    expect(mig).toMatch(/grant execute on function public\.assign_worker_to_project\(text, text\) to authenticated/);
  });

  it("the rollback restores the pre-change gate (no manager branch)", () => {
    expect(down).not.toMatch(/manages_organization/);
    expect(down).toMatch(/caller_manages_worker_by_roster\(w_id\)/);
  });
});
