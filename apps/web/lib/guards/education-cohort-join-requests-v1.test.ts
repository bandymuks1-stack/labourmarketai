import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * J-12 learner join requests (owner decision 2026-11-02; ARCH-3 resolved for
 * EDU-2). STATIC guard over the migration, its rollback and the app wiring.
 * The behavioural proof is scripts/db-proof/education-cohort-join-requests.sh
 * (scratch PostgreSQL 16, probes as `authenticated` / `anon`; 54+ assertions at
 * the time of writing; NOT part of CI — it needs a database).
 */

const ROOT = join(process.cwd(), "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const NAME = "20261102160000_education_cohort_join_requests_v1";
const sql = read(`supabase/migrations/${NAME}.sql`);
const down = read(`supabase/rollbacks/${NAME}.down.sql`);
const body = sql
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");
const fn = (name: string) => {
  const start = body.indexOf(`function public.${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  return body.slice(start, body.indexOf("$$;", start));
};

describe("one membership store (decision 0016)", () => {
  it("adds no table: a request is a state of education_cohort_members", () => {
    expect(body).not.toMatch(/create table/i);
    expect(body).toMatch(/check \(status in \('active', 'left', 'requested', 'declined', 'withdrawn'\)\)/);
  });

  it("adds no new reference to profiles (the erasure registry stays complete)", () => {
    expect(body).not.toMatch(/references public\.profiles/i);
  });
});

describe("authority", () => {
  it("only a manager of the cohort's organisation opens a group or decides a request", () => {
    for (const name of ["set_education_cohort_join_requests_v1", "decide_education_cohort_join_v1", "archive_education_cohort_v1"]) {
      expect(fn(name)).toContain("public.manages_organization(v_org)");
    }
  });

  it("nobody decides their own request", () => {
    expect(fn("decide_education_cohort_join_v1")).toMatch(/p_profile_id = v_uid then raise exception 'self_decision_not_allowed'/);
  });

  it("the learner acts only on their own row, only while the group is open", () => {
    const req = fn("request_education_cohort_join_v1");
    expect(req).toContain("join_requests_closed");
    expect(req).toMatch(/values\s*\(p_cohort_id, v_uid, 'requested'/);
    expect(fn("withdraw_education_cohort_join_v1")).toMatch(/profile_id = v_uid and status = 'requested'/);
  });

  it("a request to an archived institution is refused, and a decline is not answered by re-asking at once", () => {
    const req = fn("request_education_cohort_join_v1");
    expect(req).toContain("join public.organizations o on o.id = c.organization_id and o.archived_at is null");
    expect(req).toMatch(/v_status = 'declined' and v_decided > now\(\) - interval '30 days' then\s+raise exception 'request_cooldown'/);
  });

  it("the decider is never written into the learner-readable row; the audit log records it", () => {
    const decide = fn("decide_education_cohort_join_v1");
    expect(decide).not.toMatch(/added_by = v_uid/);
    expect(decide).toContain("insert into public.audit_logs");
    expect(fn("request_education_cohort_join_v1")).toMatch(/added_by\s+= null/);
  });

  it("accepting creates the student relationship exactly as an accepted invitation does", () => {
    const decide = fn("decide_education_cohort_join_v1");
    expect(decide).toMatch(/relationship_slug = 'student' and status = 'active'/);
    expect(decide).toContain("(p_profile_id, v_org, 'student', 'active', false, null,");
  });

  it("the finder excludes the caller's own groups and lists only open ones or the caller's open outcomes", () => {
    const list = fn("list_open_education_cohorts_v1");
    expect(list).toContain("m.profile_id = auth.uid()");
    expect(list).toContain("m.status is distinct from 'active'");
    expect(list).toMatch(/c\.join_requests_open or m\.status in \('requested', 'declined'\)/);
  });

  it("every command is authenticated-only", () => {
    for (const sig of [
      "set_education_cohort_join_requests_v1(uuid, boolean)",
      "archive_education_cohort_v1(uuid)",
      "list_open_education_cohorts_v1()",
      "request_education_cohort_join_v1(uuid, text, text)",
      "withdraw_education_cohort_join_v1(uuid)",
      "decide_education_cohort_join_v1(uuid, uuid, text)",
    ]) {
      expect(body).toContain(`revoke execute on function public.${sig} from public, anon;`);
      expect(body).toContain(`grant execute on function public.${sig} to authenticated;`);
    }
    expect(body).not.toMatch(/to anon/i);
  });
});

describe("migration shape", () => {
  it("carries the human-gate marker; the rollback carries none", () => {
    expect(sql.startsWith("-- @human-gate-approved")).toBe(true);
    expect(down).not.toContain("@human-gate-approved");
  });

  it("the rollback is one guarded transaction that refuses while request data exists", () => {
    expect(down).toMatch(/^begin;/m);
    expect(down.trimEnd().endsWith("commit;")).toBe(true);
    expect(down).toContain("where requested_at is not null");
    expect(down).toContain("where join_requests_open");
    expect(down.indexOf("raise exception")).toBeLessThan(down.indexOf("drop function"));
  });
});

describe("app wiring", () => {
  const web = (rel: string) => read(`apps/web/${rel}`);

  it("the institution read degrades to the old columns before the migration, never to 'unavailable'", () => {
    const programs = web("lib/education/programs.ts");
    expect(programs).toContain('full.error.code !== "42703"');
    expect(programs).toContain("joinRequestsOpen: typeof c.join_requests_open === \"boolean\" ? c.join_requests_open : null");
  });

  it("the learner section says the record stays a declaration until the institution confirms it", () => {
    for (const locale of ["lt", "en"]) {
      const m = JSON.parse(web(`messages/${locale}.json`));
      expect(m.learnerCohortJoin.declaredNote.length).toBeGreaterThan(40);
    }
    expect(web("components/app/learner-cohort-join-section.tsx")).toContain('data-testid="learner-cohort-join-declared"');
  });
});
