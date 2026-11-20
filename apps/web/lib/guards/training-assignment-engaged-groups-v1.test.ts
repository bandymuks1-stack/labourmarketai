import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  TRAINING_ASSIGNABLE_RELATIONSHIPS,
  TRAINING_LEARNING_RELATIONSHIPS,
  TRAINING_PAUSE_ELIGIBLE_RELATIONSHIPS,
  isTrainingAssignableEngagement,
} from "@/lib/training/training-model";

/**
 * TRAINING IS ASSIGNED TO THE FOUR OWNER-DECIDED GROUPS — registry 11.8,
 * migration 20261118143000_training_assignment_engaged_groups_v1 (RED,
 * human-gated). Owner decision 2026-11-18: members, interns, learners and
 * lawfully invited external people. Consistent with 20261115120000: an ended
 * relationship removes current access, never the organization's retained
 * records.
 *
 * This guard pins, from the SQL itself:
 *   1. the signature, security, search_path and grants of assign_training_v1
 *      are production's;
 *   2. the eligibility predicate is exactly: active governance membership OR
 *      a started, not-ended engagement in the programme's OWN organization
 *      with one of the eight relationships of the four groups — status
 *      'active' or 'paused' for the six non-learning slugs, 'active' ONLY for
 *      intern and student (owner decision 2026-11-18, "a paused relationship
 *      is not an end") — the same list and split the register's picker uses;
 *   3. one answer (`invalid_assignee`) — no new outcome, no new oracle;
 *   4. the programme policy only adds "the assignee reads the programme of
 *      their own assignment", and the assignment read stays the one
 *      organization-scoped predicate (history readable after the link ends);
 *   5. the rollback restores production's body (md5 of prosrc) and policy.
 * The behavioural proof is scripts/db-proof/training-assignment-engaged-groups-v1.sh.
 */

const REPO = join(__dirname, "..", "..", "..", "..");
const NAME = "20261118143000_training_assignment_engaged_groups_v1";
const MIG_PATH = join(REPO, "supabase", "migrations", `${NAME}.sql`);
const DOWN_PATH = join(REPO, "supabase", "rollbacks", `${NAME}.down.sql`);
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const MIG = read(MIG_PATH);
/** The org-member slugs (lib/operations/org-members.ts), read as text: that module is server-only. */
const MEMBERSHIP_SLUGS = [
  ...(read(join(REPO, "apps", "web", "lib", "operations", "org-members.ts"))
    .match(/export const MEMBERSHIP_SLUGS = \[([\s\S]*?)\] as const;/)?.[1] ?? "")
    .replace(/\/\/.*$/gm, "")
    .matchAll(/"([a-z_]+)"/g),
].map((m) => m[1]);
const DOWN = read(DOWN_PATH);

/** md5(prosrc) of public.assign_training_v1 on production, read 2026-10-26. */
const PRODUCTION_PROSRC_MD5 = "74795f98243e2ce340c424cf3c0ee0a5";

const code = (sql: string) =>
  sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .filter((l) => l.trim().length > 0)
    .join("\n");
const flat = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

function prosrc(sql: string): string {
  const a = sql.indexOf("$function$");
  const b = sql.indexOf("$function$", a + 10);
  expect(a, "opening $function$").toBeGreaterThan(0);
  expect(b, "closing $function$").toBeGreaterThan(a);
  return sql.slice(a + 10, b);
}

function header(sql: string): string {
  const c = code(sql);
  const at = c.search(/create or replace function public\.assign_training_v1\(/i);
  return flat(c.slice(at, c.indexOf("$function$", at)));
}

/** Statements after the function's closing quote. */
function tail(sql: string): string[] {
  const c = code(sql);
  return c
    .slice(c.lastIndexOf("$function$") + "$function$;".length)
    .split(";")
    .map(flat)
    .filter(Boolean);
}

const EXPECTED_HEADER =
  "create or replace function public.assign_training_v1(p_program_id text, p_assignee_email text, p_required_by text default null) returns text language plpgsql security definer set search_path = public as";
const GRANTS = [
  "revoke all on function public.assign_training_v1(text, text, text) from public",
  "revoke all on function public.assign_training_v1(text, text, text) from anon",
  "grant execute on function public.assign_training_v1(text, text, text) to authenticated",
];
const ORIGINAL_POLICY =
  "create policy training_programs_select on public.training_programs for select to authenticated using (public.belongs_to_organization(organization_id) or public.is_admin())";
const NEW_POLICY =
  "create policy training_programs_select on public.training_programs for select to authenticated using ( public.belongs_to_organization(organization_id) or public.is_admin() or exists ( select 1 from public.training_assignments a where a.program_id = training_programs.id and a.assignee_profile_id = auth.uid() ) )";

const ENGAGEMENT_BLOCK = /\) and not exists \(\s*select 1 from public\.engagement_contexts ec[\s\S]*?\) then\s*return 'invalid_assignee';/;

describe("ships paired, gated as RED, after every migration on main", () => {
  it("is a §16 name, dated after the learning-access rule it must agree with", () => {
    expect(/^\d{14}_[a-z0-9_]+$/.test(NAME)).toBe(true);
    expect(NAME > "20261115120000_journal_learning_access_follows_link_v1").toBe(true);
    expect(existsSync(DOWN_PATH)).toBe(true);
    expect(MIG).toContain(`-- ROLLBACK: supabase/rollbacks/${NAME}.down.sql`);
  });

  it("the never-applied 2026-10-26 draft is gone, not shipped twice", () => {
    expect(existsSync(join(REPO, "supabase", "migrations", "20261026140000_assign_training_employees_v1.sql"))).toBe(false);
    expect(existsSync(join(REPO, "supabase", "rollbacks", "20261026140000_assign_training_employees_v1.down.sql"))).toBe(false);
  });

  it("carries the owner's approval on exactly the reviewed SQL, and the rollback carries none", () => {
    // Owner decision 2026-11-20 (coordinator relay): the apply is approved for
    // R2's reviewed version (head 2d5ddd64). The marker is the first line and
    // the ONLY change: the rest of the file hashes to the approved body, so an
    // edit below the marker fails here and needs a new approval. Not applied by
    // this repository; the apply stays a manual owner-channel step.
    expect(MIG.startsWith("-- @human-gate-approved\n")).toBe(true);
    const body = MIG.slice("-- @human-gate-approved\n".length);
    expect(createHash("md5").update(body).digest("hex")).toBe("40061333730df3b00987359b16857282");
    expect(body).not.toMatch(/(^|\n)[ \t]*--[ \t]*@human-gate-approved\b/i);
    expect(createHash("md5").update(DOWN).digest("hex")).toBe("08735a586489ebbfbe2407a3e6a05b64");
    expect(DOWN).not.toMatch(/(^|\n)[ \t]*--[ \t]*@human-gate-approved\b/i);
  });

  it("one function and one policy, in one transaction, nothing else", () => {
    for (const sql of [MIG, DOWN]) {
      const c = code(sql);
      expect(c.match(/create or replace function/gi)?.length).toBe(1);
      expect(c.match(/drop policy if exists training_programs_select on public\.training_programs;/g)?.length).toBe(1);
      expect(c.match(/create policy/gi)?.length).toBe(1);
      expect(c).toMatch(/^begin;/m);
      expect(c).toMatch(/^commit;$/m);
      expect(c).not.toMatch(/\b(drop (table|function|column|trigger)|alter (table|function|policy)|truncate|delete from|update public\.|insert into public\.(?!training_assignments|training_assignment_events)|create table|create trigger|security invoker|owner to)\b/i);
      expect(c).not.toMatch(/\bto (anon|public)\b/i);
      expect(c).not.toMatch(/using \(true\)/i);
    }
  });
});

describe("1. assign_training_v1: signature, security, search_path and grants are production's", () => {
  it("the header is identical in the migration and the rollback", () => {
    expect(header(MIG)).toBe(EXPECTED_HEADER);
    expect(header(DOWN)).toBe(EXPECTED_HEADER);
  });

  it("the grants restate production's proacl {postgres=X, authenticated=X}", () => {
    for (const sql of [MIG, DOWN]) expect(tail(sql).slice(0, 3)).toEqual(GRANTS);
  });
});

describe("2. eligibility = the four groups, active, in the programme's own organization", () => {
  const body = code(prosrc(MIG));
  const block = body.match(ENGAGEMENT_BLOCK)?.[0] ?? "";
  const slugLists = [...block.matchAll(/relationship_slug in \(([^)]*)\)/g)].map((m) =>
    [...m[1].matchAll(/'([a-z_]+)'/g)].map((s) => s[1]),
  );
  const slugs = slugLists.flat();
  /** The two arms of the status split, as written in the body. */
  const SPLIT =
    /and \(\s*\(ec\.relationship_slug in \(([^)]*)\)\s+and ec\.status in \('active', 'paused'\)\)\s+or \(ec\.relationship_slug in \(([^)]*)\)\s+and ec\.status = 'active'\)\s+\)/;
  const split = block.match(SPLIT);
  const listOf = (s: string | undefined) => [...(s ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();

  it("governance membership stays the first branch, unchanged", () => {
    expect(body).toMatch(
      /if not exists \(\s*select 1 from public\.company_memberships m\s+where m\.profile_id = v_target\s+and m\.organization_id = prog\.organization_id\s+and m\.status = 'active'\s+\) and not exists \(/,
    );
  });

  it("the engagement branch: same person, SAME organization, current, inside its dates", () => {
    expect(block, "the engagement block exists").not.toBe("");
    expect(block).toMatch(/ec\.profile_id = v_target/);
    expect(block).toMatch(/ec\.organization_id = prog\.organization_id/);
    expect(block).toMatch(/\(ec\.started_at is null or ec\.started_at <= current_date\)/);
    expect(block).toMatch(/\(ec\.ended_at is null or ec\.ended_at > current_date\)/);
    expect(block).not.toMatch(/'(ended|invited|pending)'/);
  });

  it("the status split (owner decision 2026-11-18): paused only for the non-learning slugs", () => {
    expect(split, "the two-arm status split exists").not.toBeNull();
    expect(listOf(split?.[1])).toEqual(
      ["collaborator", "consultant", "employee", "freelancer", "manager", "owner"],
    );
    expect(listOf(split?.[2])).toEqual(["intern", "student"]);
    // the dates apply to BOTH arms: they sit outside the split
    const after = block.slice(block.indexOf(split?.[0] ?? "\u0000") + (split?.[0].length ?? 0));
    expect(after).toMatch(/^\s*and \(ec\.started_at is null or ec\.started_at <= current_date\)\s+and \(ec\.ended_at is null or ec\.ended_at > current_date\)/);
    // exactly two status tests, 'paused' exactly once, never next to a learning slug
    expect(block.match(/ec\.status/g)?.length).toBe(2);
    expect(block.match(/'paused'/g)?.length).toBe(1);
    expect(slugLists).toHaveLength(2);
  });

  it("a learning slug can never be combined with 'paused'", () => {
    for (const s of ["intern", "student"]) expect(listOf(split?.[1])).not.toContain(s);
    expect(listOf(split?.[1]).sort()).toEqual([...TRAINING_PAUSE_ELIGIBLE_RELATIONSHIPS].sort());
    expect(listOf(split?.[2]).sort()).toEqual([...TRAINING_LEARNING_RELATIONSHIPS].sort());
    for (const s of TRAINING_LEARNING_RELATIONSHIPS) {
      expect(isTrainingAssignableEngagement({ relationshipSlug: s, status: "paused", startedAt: null, endedAt: null }, "2026-11-18")).toBe(false);
      expect(isTrainingAssignableEngagement({ relationshipSlug: s, status: "active", startedAt: null, endedAt: null }, "2026-11-18")).toBe(true);
    }
  });

  it("the picker applies the same split and dates as the RPC (P3-3)", () => {
    const at = (relationshipSlug: string, status: string, startedAt: string | null, endedAt: string | null) =>
      isTrainingAssignableEngagement({ relationshipSlug, status, startedAt, endedAt }, "2026-11-18");
    for (const s of TRAINING_PAUSE_ELIGIBLE_RELATIONSHIPS) {
      expect(at(s, "active", null, null)).toBe(true);
      expect(at(s, "paused", null, null)).toBe(true);
      expect(at(s, "ended", null, null)).toBe(false);
    }
    expect(at("employee", "paused", "2026-01-01", "2026-11-17")).toBe(false);
    expect(at("employee", "active", null, "2026-11-18")).toBe(false);
    expect(at("employee", "active", "2026-11-19", null)).toBe(false);
    expect(at("employee", "active", "2026-11-18", "2026-11-19")).toBe(true);
    expect(at("volunteer", "active", null, null)).toBe(false);
    const SERVICE = read(join(REPO, "apps", "web", "lib", "training", "training.ts"));
    const fn = SERVICE.slice(SERVICE.indexOf("export async function getTrainingAssignees"));
    expect(fn).toMatch(/\.in\("status", \["active", "paused"\]\)/);
    expect(fn).toMatch(/started_at, ended_at/);
    expect(fn).toMatch(/isTrainingAssignableEngagement\(/);
  });

  it("exactly the eight relationships of the owner decision — no volunteer, viewer or unemployed", () => {
    expect([...slugs].sort()).toEqual(
      ["collaborator", "consultant", "employee", "freelancer", "intern", "manager", "owner", "student"],
    );
    expect(slugs).not.toContain("volunteer");
    expect(slugs).not.toContain("viewer");
  });

  it("the register's picker offers the same eight, all of them org-member slugs", () => {
    expect([...TRAINING_ASSIGNABLE_RELATIONSHIPS].sort()).toEqual([...slugs].sort());
    for (const s of TRAINING_ASSIGNABLE_RELATIONSHIPS) expect(MEMBERSHIP_SLUGS).toContain(s);
  });

  it("no any-slug helper stands in for the four groups", () => {
    expect(body).not.toMatch(/profile_is_member_of_organization_v1|belongs_to_organization|is_org_member_or_engaged_v1|team_member_at_v1/);
    expect(body).not.toMatch(/invitations|company_workers|agency_workers/);
  });

  it("the caller gate is untouched; the assignee is a profile id OR a verified e-mail", () => {
    expect(body).toMatch(/if prog\.id is null or not public\.has_org_demand_access\(prog\.organization_id\) then\s+return 'not_found';/);
    expect(body.match(/public\.profile_id_by_verified_email_v1\(/g)?.length).toBe(1);
    expect(body).toMatch(/if v_who ~\* '\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\$' then\s+select p\.id into v_target from public\.profiles p where p\.id = v_who::uuid;/);
    expect(body).not.toMatch(/\b(p|profiles)\.email\b/);
  });
});

describe("3. one answer, no new outcome", () => {
  const outcomes = (sql: string) =>
    [...new Set([...code(prosrc(sql)).matchAll(/return '([a-z_]+)'/g)].map((m) => m[1]))].sort();

  it("the migration returns exactly production's outcome set", () => {
    expect(outcomes(MIG)).toEqual(outcomes(DOWN));
    expect(outcomes(MIG)).toEqual(
      ["already_assigned", "assigned", "inactive_program", "invalid", "invalid_assignee", "limit_reached", "not_found"],
    );
  });

  it("'unknown' and 'not in a group here' share invalid_assignee", () => {
    const body = code(prosrc(MIG));
    expect(body).toMatch(/if v_target is null then return 'invalid_assignee'; end if;/);
    expect(body.match(/'invalid_assignee'/g)?.length).toBe(2);
  });
});

describe("4. least privilege: the policy adds only the assignee's own programme", () => {
  it("the new policy is the original plus one own-assignment arm", () => {
    expect(tail(MIG)).toContain(flat(NEW_POLICY));
  });

  it("the assignment read is untouched: the organization keeps its own records after the link ends", () => {
    for (const sql of [MIG, DOWN]) {
      expect(code(sql)).not.toMatch(/training_can_view_assignment_v1|training_assignments_select/);
    }
  });
});

describe("5. the rollback restores production", () => {
  it("the rollback body IS production (md5 of prosrc)", () => {
    expect(createHash("md5").update(prosrc(DOWN)).digest("hex")).toBe(PRODUCTION_PROSRC_MD5);
  });

  it("the rollback restores the original programme policy", () => {
    expect(tail(DOWN)).toContain(ORIGINAL_POLICY);
  });

  it("the rollback body is the governance-only predicate", () => {
    const body = code(prosrc(DOWN));
    expect(body).not.toMatch(/engagement_contexts/);
    expect(body).toMatch(/m\.status = 'active'\s+\) then\s+return 'invalid_assignee';/);
  });
});

describe("6. the actions and the register submit the picker's profile id", () => {
  const ACTIONS = read(join(REPO, "apps", "web", "lib", "training", "training-actions.ts"));
  const REGISTER = read(join(REPO, "apps", "web", "components", "app", "training-register.tsx"));

  it("assign keeps refuseStaleWorkspace and passes a picked profile id, else the e-mail", () => {
    const fn = ACTIONS.slice(ACTIONS.indexOf("export async function assignTrainingAction"));
    expect(fn.slice(0, 200)).toMatch(/await refuseStaleWorkspace\(displayedWorkspaceOf\(formData\)\);/);
    expect(fn).toMatch(/formData\.get\("assigneeProfileId"\)/);
    expect(fn).toMatch(/p_assignee_email: assignee/);
  });

  it("the picker lists the organization's people by profile id", () => {
    expect(REGISTER).toMatch(/name="assigneeProfileId"/);
    expect(REGISTER).toMatch(/getTrainingAssignees\(/);
  });
});
