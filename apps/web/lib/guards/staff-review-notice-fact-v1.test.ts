import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REVIEW_NOTICE_SURFACES, REVIEW_NOTICE_VERSION } from "@/lib/operations/auto-review-model";

/**
 * Owner decision 1, step 2 (RED 20261012190000): the auditable acceptance fact
 * and the ONE door that writes it. Pins what a later edit could widen.
 */
const REPO = join(__dirname, "..", "..", "..", "..");
const read = (p: string) => readFileSync(join(REPO, p), "utf8");
const SQL = read("supabase/migrations/20261012190000_staff_review_notice_on_acceptance_v1.sql");
const DOWN = read("supabase/rollbacks/20261012190000_staff_review_notice_on_acceptance_v1.down.sql");
const stmts = SQL.replace(/--[^\n]*/g, "").toLowerCase();

describe("the acceptance fact — additive, readable as the row already is, writable by no client", () => {
  it("adds three nullable columns and touches no policy or table grant", () => {
    for (const c of ["review_notice_version text", "review_notice_surface text", "review_notice_at timestamptz"]) {
      expect(stmts).toContain(`add column if not exists ${c}`);
    }
    expect(stmts).not.toMatch(/create policy|alter policy|drop policy/);
    expect(stmts).not.toMatch(/grant [a-z, ]+ on (table )?public\./);
  });

  it("the SQL surface allowlist equals the app's, and the version shape matches the app's", () => {
    const list = /p_surface not in \(([^)]*)\)/.exec(stmts)?.[1] ?? "";
    expect(list.replace(/['\s]/g, "").split(",").sort()).toEqual([...REVIEW_NOTICE_SURFACES].sort());
    expect(new RegExp("^staff-review-notice-v[0-9]{1,3}$").test(REVIEW_NOTICE_VERSION)).toBe(true);
  });

  it("the door is authenticated-only", () => {
    expect(stmts).toContain("revoke all on function public.record_staff_review_notice_v1(uuid, text, text, boolean) from public;");
    expect(stmts).toContain("revoke all on function public.record_staff_review_notice_v1(uuid, text, text, boolean) from anon;");
    expect(stmts).toContain("grant execute on function public.record_staff_review_notice_v1(uuid, text, text, boolean) to authenticated;");
  });
});

describe("the door — the caller's own acceptance, one organization, a manager's choice wins", () => {
  it("only the caller's own accepted row, once, while fresh", () => {
    expect(stmts).toMatch(/a\.profile_id = uid\s+and a\.decision = 'accepted'/);
    expect(stmts).toContain("'already_recorded'");
    expect(stmts).toContain("interval '15 minutes'");
  });

  it("organization isolation: the engagement is the invitation's organization's active employee relationship of the caller", () => {
    expect(stmts).toMatch(/ec\.id = v_acc\.relationship_id\s+and ec\.profile_id = uid\s+and ec\.organization_id = v_inv\.organization_id\s+and ec\.relationship_slug = 'employee'\s+and ec\.status = 'active'/);
  });

  it("switches review on only when asked, only for a relationship this acceptance created, never over a manager's choice", () => {
    expect(stmts).toContain("if coalesce(p_enable_review, false) then");
    expect(stmts).toContain("v_acc.relationship is distinct from 'engagement_created'");
    expect(stmts).toMatch(/l\.action = 'set_engagement_journal_review'/);
    expect(stmts).toContain("'auto_enable_engagement_journal_review'");
    expect(stmts).toContain("'staff_review_notice_accepted'");
  });

  it("the rollback never destroys an acceptance fact", () => {
    expect(DOWN).toMatch(/if exists \(select 1 from public\.invitation_acceptances where review_notice_version is not null\)/);
    expect(DOWN).toContain("columns kept");
  });
});
