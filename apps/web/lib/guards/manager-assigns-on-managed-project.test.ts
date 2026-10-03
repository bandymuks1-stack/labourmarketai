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
  resolve(root, "supabase/migrations/20261002142000_manager_assigns_roster_worker_on_managed_project_v1.sql"),
  "utf8",
);
const down = readFileSync(
  resolve(root, "supabase/rollbacks/20261002142000_manager_assigns_roster_worker_on_managed_project_v1.down.sql"),
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
  it("is FAIL-CLOSED: the whole authorization is coalesce-wrapped and sorts after the null-safe security fix", () => {
    expect(mig).toMatch(/if not coalesce\(\(\s*\(public\.can_manage_project\(pid\)/);
    expect(mig).toMatch(/or public\.is_admin\(\)\s*\), false\) then/);
    expect("20261002142000_manager_assigns_roster_worker_on_managed_project_v1" > "20261002141500_work_task_authz_null_safe_v1").toBe(true);
  });

  it("touches none of the eight null-safe security functions", () => {
    for (const fn of [
      "update_work_task_v2", "set_work_task_status_v2", "link_journal_entry_to_task_v1",
      "unlink_journal_entry_from_task_v1", "add_work_task_dependency_v1",
      "start_workflow_instance_v1", "create_invitation_v1", "create_invitation_v2",
    ]) {
      expect(mig).not.toContain(fn);
      expect(down).not.toContain(fn);
    }
  });
  it("the rollback body equals the latest earlier definition of assign_worker_to_project (comment-insensitive)", () => {
    const fnBody = (sql: string): string => {
      const text = sql.replace(/\r\n/g, "\n");
      const i = text.toLowerCase().indexOf("create or replace function public.assign_worker_to_project");
      const m = /\bas\s+(\$[a-z_]*\$)/i.exec(text.slice(i));
      const start = i + m!.index + m![0].length;
      return text
        .slice(start, text.indexOf(m![1], start))
        .split("\n")
        .filter((l) => !l.trim().startsWith("--"))
        .map((l) => l.replace(/\s--\s.*$/, ""))
        .filter((l) => l.trim() !== "")
        .join("\n");
    };
    const prior = readFileSync(
      resolve(root, "supabase/migrations/20260928220000_placement_opens_client_collaboration_v1.sql"),
      "utf8",
    );
    expect(fnBody(down)).toBe(fnBody(prior));
  });

  it("the auth block differs from the rollback ONLY by the fail-closed wrapper and the manager branch", () => {
    const norm = (s: string) => s.replace(/\r\n/g, "\n");
    const up = norm(mig);
    const dn = norm(down);
    const block = (s: string) => s.slice(s.indexOf("  if not"), s.indexOf("    raise exception 'Not authorized to assign"));
    const stripped = block(up)
      .replace("if not coalesce((", "if not (")
      .replace(/\n    -- MANAGER OF THIS PROJECT'S ORGANIZATION[\s\S]*?\n    or public\.is_admin\(\)/, "\n    or public.is_admin()")
      .replace("  ), false) then", "  ) then");
    expect(stripped.trim()).toBe(block(dn).trim());
  });
});
