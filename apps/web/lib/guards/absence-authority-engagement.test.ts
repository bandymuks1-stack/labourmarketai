import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Employers see and decide the absences of people who joined through an
 * invitation (engagement_contexts only) — through an ABSENCE-ONLY predicate.
 * caller_manages_worker itself is never widened: it is the unbound branch of
 * task eligibility, where an org-unbound engagement would leak across sibling
 * organizations (20260808150000).
 */
const ROOT = resolve(__dirname, "..", "..", "..", "..");
const NAME = "20261011160000_absence_authority_engagement_v1";
const sqlOnly = (s: string) => s.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const up = sqlOnly(readFileSync(resolve(ROOT, `supabase/migrations/${NAME}.sql`), "utf8"));
const downPath = resolve(ROOT, `supabase/rollbacks/${NAME}.down.sql`);

describe("absence authority for engagement employees", () => {
  it("adds an org-bound engagement branch with the work-plan slugs, never touching caller_manages_worker", () => {
    expect(up).toMatch(/create or replace function public\.caller_manages_worker_absence\(p_worker_id uuid\)/);
    expect(up).toMatch(/ec\.relationship_slug in \('employee', 'collaborator', 'freelancer'\)/);
    expect(up).toMatch(/public\.manages_organization\(ec\.organization_id\)/);
    expect(up).not.toMatch(/function public\.caller_manages_worker\(/);
    expect(up).not.toMatch(/work_task_assignee_eligible_v1|set_project_responsible_v1/);
  });

  it("keeps managers to requested rows and the scheduling view to the minimised columns", () => {
    expect(up).toMatch(/caller_manages_worker_absence\(worker_id\) and status = 'requested'/);
    expect(up).toMatch(/select a\.id,\s*a\.worker_id,\s*a\.start_date,\s*a\.end_date,\s*a\.half_day,\s*a\.status\s+from public\.worker_absences a/);
    expect(up).not.toMatch(/absence_type|\bnote\b/);
    expect(up).not.toMatch(/to anon|to public|using \(true\)/i);
  });

  it("ships a rollback that restores caller_manages_worker and drops the predicate", () => {
    expect(existsSync(downPath)).toBe(true);
    const down = sqlOnly(readFileSync(downPath, "utf8"));
    expect(down).toMatch(/caller_manages_worker\(worker_id\) and status = 'requested'/);
    expect(down).toMatch(/drop function if exists public\.caller_manages_worker_absence\(uuid\)/);
  });
});
