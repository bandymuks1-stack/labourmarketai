import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { MEMBERSHIP_SLUGS } from "@/lib/operations/org-members";

/**
 * INSTITUTION loop, EVIDENCE → COMPETENCY (2026-09-19).
 *
 * A learner's practice entry could never be confirmed: the only writer of
 * `journal_review_enabled` refused every relationship but `employee` with a
 * literal. The rule becomes DATA (`relationship_types.journal_reviewable`,
 * fail-closed, seeded for employee + student) — the same shape the learner
 * least-privilege ruling gave `grants_worker_visibility`. RED, owner-gated,
 * with a rollback that restores the production function verbatim.
 */

const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const MIG = "20260919210000_relationship_journal_reviewable_v1";
const read = (...p: string[]) => readFileSync(join(...p), "utf8");

describe("the migration: the rule is data, fail-closed, seeded for exactly two relationships", () => {
  const up = read(REPO, "supabase", "migrations", `${MIG}.sql`);

  it("adds journal_reviewable with a FALSE default and seeds employee + student only", () => {
    expect(up.startsWith("-- @human-gate-approved")).toBe(true);
    expect(up).toContain("add column if not exists journal_reviewable boolean not null default false;");
    expect(up).toMatch(/set journal_reviewable = true\s*\n\s*where slug in \('employee', 'student'\);/);
    expect((up.match(/set journal_reviewable = true/g) ?? []).length).toBe(1);
  });

  it("set_engagement_journal_review reads the column — no relationship literal remains in the predicate", () => {
    const fn = up.slice(up.indexOf("create or replace function public.set_engagement_journal_review"));
    expect(fn).toContain("where rt.slug = v_slug and rt.journal_reviewable");
    expect(fn).not.toContain("v_slug <> 'employee'");
    expect(fn).not.toMatch(/v_slug (not )?in \(/);
    // SECURITY DEFINER + pinned search_path restated (CREATE OR REPLACE drops
    // SET config that is not restated).
    expect(fn).toContain("security definer set search_path = public");
    // Authority ladder unchanged.
    expect(fn).toContain("if not (public.is_admin() or public.manages_organization(v_org)) then return 'not_authorized'; end if;");
  });

  it("does not touch worker visibility, RLS, table grants or the RPL layer", () => {
    expect(up).not.toMatch(/grants_worker_visibility\s*=/);
    // SQL body only — the header prose names the layers it does NOT touch.
    const body = up.slice(up.indexOf("\nbegin;"));
    expect(body).not.toMatch(/create policy|alter policy|drop policy/i);
    // The ONLY grant/revoke lines are the function's own anon closure +
    // authenticated execute (required for every SECURITY DEFINER created
    // after 20260722160000); no table privilege moves.
    const grantLines = body.split("\n").filter((l) => /^\s*(grant|revoke)\b/i.test(l));
    expect(grantLines.length).toBe(2);
    for (const l of grantLines) {
      expect(l).toContain("on function public.set_engagement_journal_review(uuid, boolean)");
    }
    expect(body).not.toMatch(/recogni[sz]ed|equivalence|qualification_asserted/i);
  });

  it("ships a rollback that restores the employee-only production function and drops the column", () => {
    const downPath = join(REPO, "supabase", "rollbacks", `${MIG}.down.sql`);
    expect(existsSync(downPath)).toBe(true);
    const down = read(downPath);
    expect(down).toContain("if v_slug <> 'employee' then return 'not_a_member_engagement'; end if;");
    expect(down).toContain("alter table public.relationship_types drop column if exists journal_reviewable;");
    expect(down).toContain("security definer set search_path = public");
  });
});

describe("the members panel reaches learners", () => {
  it("student is a listed membership slug (the existing review toggle is the only UI change)", () => {
    expect(MEMBERSHIP_SLUGS).toContain("student");
    expect(MEMBERSHIP_SLUGS).toContain("employee");
  });
});
