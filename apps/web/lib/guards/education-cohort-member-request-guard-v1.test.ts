import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * J-12 follow-up (owner condition 2026-11-03): `set_education_cohort_member_v1`
 * admits external managers, so it must never flip a request row and never leave
 * learner-typed request text on a member row. STATIC guard; the behavioural
 * proof is scripts/db-proof/education-cohort-member-request-guard.sh (scratch
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
const original = read("supabase/migrations/20260903120000_education_programs_cohorts_v1.sql");

describe("set_education_cohort_member_v1 request guard", () => {
  it("refuses a row in request state before writing", () => {
    expect(body).toMatch(/if v_current in \('requested', 'declined', 'withdrawn'\) then\s+raise exception 'request_row_use_decide'/);
    expect(body.indexOf("request_row_use_decide")).toBeLessThan(body.indexOf("insert into public.education_cohort_members"));
  });

  it("every write to active / left clears the request text, and only active / left rows are updated", () => {
    expect(body).toMatch(/request_label = null,\s+request_note\s+= null/);
    expect(body).toContain("where public.education_cohort_members.status in ('active', 'left');");
  });

  it("keeps the signature and the authenticated-only grant", () => {
    expect(body).toContain("revoke execute on function public.set_education_cohort_member_v1(uuid, uuid, text) from public, anon;");
    expect(body).toContain("grant execute on function public.set_education_cohort_member_v1(uuid, uuid, text) to authenticated;");
    expect(body).not.toMatch(/to anon/i);
  });

  it("the rollback restores the 20260903120000 function text exactly, in one transaction", () => {
    const fn = (s: string) => {
      const start = s.indexOf("create or replace function public.set_education_cohort_member_v1(");
      return s.slice(start, s.indexOf("$$;", start) + 3);
    };
    expect(fn(down)).toBe(fn(original));
    expect(down).toMatch(/^begin;/m);
    expect(down.trimEnd().endsWith("commit;")).toBe(true);
    expect(sql.startsWith("-- @human-gate-approved")).toBe(true);
    expect(down).not.toContain("@human-gate-approved");
  });
});
