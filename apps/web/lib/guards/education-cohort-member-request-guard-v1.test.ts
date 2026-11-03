import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * J-12 access closure (owner approval with conditions, 2026-11-03): an external
 * manager without an explicit institution delegation may neither change
 * membership nor read what the learner submitted; request rows go only through
 * the J-12 commands; nothing is destroyed. STATIC guard; the behavioural proof
 * is scripts/db-proof/education-cohort-member-request-guard.sh (scratch
 * PostgreSQL 16, not part of CI).
 */
const ROOT = join(process.cwd(), "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const NAME = "20261103090000_education_cohort_member_request_guard_v1";
const sql = read(`supabase/migrations/${NAME}.sql`);
const down = read(`supabase/rollbacks/${NAME}.down.sql`);
const body = sql
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");
const sliceFn = (s: string, name: string) => {
  const start = s.indexOf(`create or replace function public.${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  return s.slice(start, s.indexOf("$$;", start) + 3);
};
const slicePolicy = (s: string) => {
  const start = s.indexOf("create policy education_cohort_members_select");
  expect(start).toBeGreaterThan(-1);
  return s.slice(start, s.indexOf(");", start) + 2);
};
const applied0903 = read("supabase/migrations/20260903120000_education_programs_cohorts_v1.sql");
const applied1102 = read("supabase/migrations/20261102160000_education_cohort_join_requests_v1.sql");

describe("membership command", () => {
  const member = sliceFn(body, "set_education_cohort_member_v1");

  it("is gated by the J-12 decider basis (internal owner/admin/manager), never manages_organization", () => {
    expect(member).toContain("v_basis := public.education_cohort_decider_basis_v1(v_org);");
    expect(member).not.toContain("manages_organization");
  });

  it("refuses a row in request state before writing", () => {
    expect(member).toMatch(/if v_current in \('requested', 'declined', 'withdrawn'\) then\s+raise exception 'request_row_use_decide'/);
    expect(member.indexOf("request_row_use_decide")).toBeLessThan(member.indexOf("insert into public.education_cohort_members"));
    expect(member).toContain("where public.education_cohort_members.status in ('active', 'left');");
  });

  it("destroys nothing and is traceable: no request text cleared, an audit row with the basis", () => {
    expect(member).not.toMatch(/request_label\s*=\s*null|request_note\s*=\s*null/);
    expect(member).toMatch(/insert into public\.audit_logs[\s\S]*'authority_basis', v_basis/);
  });
});

describe("accept keeps the learner's own request record", () => {
  it("decide no longer nulls the label or note; everything else is the applied text", () => {
    const decide = sliceFn(body, "decide_education_cohort_join_v1");
    expect(decide).not.toMatch(/request_label = null|request_note = null/);
    expect(decide).toContain("v_basis := public.education_cohort_decider_basis_v1(v_org);");
    expect(decide).toContain("'education_cohort_join_accepted_v1'");
  });
});

describe("who reads a membership row", () => {
  it("only the learner, the institution's own deciders and admin — no manages_organization path", () => {
    const policy = slicePolicy(body);
    expect(policy).toContain("profile_id = auth.uid()");
    expect(policy).toContain("public.is_education_cohort_internal_decider_v1(public.education_cohort_organization_v1(cohort_id))");
    expect(policy).toContain("public.is_admin()");
    expect(policy).not.toContain("manages_organization");
  });
});

describe("grants and rollback", () => {
  it("keeps both commands authenticated-only", () => {
    for (const sig of ["set_education_cohort_member_v1(uuid, uuid, text)", "decide_education_cohort_join_v1(uuid, uuid, text)"]) {
      expect(body).toContain(`revoke execute on function public.${sig} from public, anon;`);
      expect(body).toContain(`grant execute on function public.${sig} to authenticated;`);
    }
    expect(body).not.toMatch(/to anon/i);
  });

  it("the rollback restores all three objects' applied text exactly, in one transaction", () => {
    expect(sliceFn(down, "set_education_cohort_member_v1")).toBe(sliceFn(applied0903, "set_education_cohort_member_v1"));
    expect(sliceFn(down, "decide_education_cohort_join_v1")).toBe(sliceFn(applied1102, "decide_education_cohort_join_v1"));
    expect(slicePolicy(down)).toBe(slicePolicy(applied1102));
    expect(down).toMatch(/^begin;/m);
    expect(down.trimEnd().endsWith("commit;")).toBe(true);
    expect(sql.startsWith("-- @human-gate-approved")).toBe(true);
    expect(down).not.toContain("@human-gate-approved");
  });
});
