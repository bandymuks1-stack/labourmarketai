import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TRAINING ASSIGNMENT REACHES THE ORGANIZATION'S EMPLOYEES — registry 11.8,
 * migration 20261026140000_assign_training_employees_v1 (RED, human-gated).
 *
 * Production walk company-governance (run 40296167812, T-2): Alfa's owner
 * could not assign a course to Alfa's own employee — `assign_training_v1`
 * admitted only GOVERNANCE members (company_memberships). The fix widens ONE
 * predicate: an active governance member OR an active, confirmed EMPLOYEE
 * engagement in the programme's own organization. Everything else is the
 * production body.
 *
 * This guard pins, from the SQL itself:
 *   1. the signature, security, search_path and grants are production's;
 *   2. the widened predicate is exactly the canonical "active employee of
 *      THIS organization" (slug 'employee', status 'active', same org, date
 *      bounds) and nothing broader (no other slug, no any-slug helper, no
 *      roster-only shortcut, no invitation state);
 *   3. outside that one block the body is byte-identical to the rollback,
 *      which is byte-identical to production (md5 of prosrc);
 *   4. one answer (`invalid_assignee`) for "no account" and "not here" —
 *      no new outcome, no new oracle;
 *   5. the walk spec keeps ONE trainee identity through the whole chain.
 * The behavioural proof is scripts/db-proof/assign-training-employees-v1.sh.
 */

const REPO = join(__dirname, "..", "..", "..", "..");
const NAME = "20261026140000_assign_training_employees_v1";
const MIG_PATH = join(REPO, "supabase", "migrations", `${NAME}.sql`);
const DOWN_PATH = join(REPO, "supabase", "rollbacks", `${NAME}.down.sql`);
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const MIG = read(MIG_PATH);
const DOWN = read(DOWN_PATH);

/** md5(prosrc) of public.assign_training_v1 on production, read 2026-10-26. */
const PRODUCTION_PROSRC_MD5 = "74795f98243e2ce340c424cf3c0ee0a5";

/** SQL without `--` comment lines or trailing `--` comments. */
const code = (sql: string) =>
  sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .filter((l) => l.trim().length > 0)
    .join("\n");

/** The text between the $function$ quotes — what Postgres stores as prosrc. */
function prosrc(sql: string): string {
  const a = sql.indexOf("$function$");
  const b = sql.indexOf("$function$", a + 10);
  expect(a, "opening $function$").toBeGreaterThan(0);
  expect(b, "closing $function$").toBeGreaterThan(a);
  return sql.slice(a + 10, b);
}

/** Everything before `as $function$` — the header Postgres compares. */
function header(sql: string): string {
  const c = code(sql);
  const at = c.search(/create or replace function public\.assign_training_v1\(/i);
  return c.slice(at, c.indexOf("$function$", at)).replace(/\s+/g, " ").trim().toLowerCase();
}

/** Statements after the closing quote — the privilege tail. */
function tail(sql: string): string[] {
  const c = code(sql);
  return c
    .slice(c.lastIndexOf("$function$") + "$function$;".length)
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim().toLowerCase())
    .filter(Boolean);
}

const EXPECTED_HEADER =
  "create or replace function public.assign_training_v1(p_program_id text, p_assignee_email text, p_required_by text default null) returns text language plpgsql security definer set search_path = public as";
const EXPECTED_TAIL = [
  "revoke all on function public.assign_training_v1(text, text, text) from public",
  "revoke all on function public.assign_training_v1(text, text, text) from anon",
  "grant execute on function public.assign_training_v1(text, text, text) to authenticated",
];

/** The one block the migration adds (from the forward body, comments stripped). */
const EMPLOYEE_BLOCK = /\) and not exists \(\s*select 1 from public\.engagement_contexts ec[\s\S]*?\) then\s*return 'invalid_assignee';/;

describe("ships paired, gated as RED, forward-only", () => {
  it("is a §16 name with its paired rollback", () => {
    expect(/^\d{14}_[a-z0-9_]+$/.test(NAME)).toBe(true);
    expect(existsSync(DOWN_PATH)).toBe(true);
    expect(MIG).toMatch(/(^|\n)-- ROLLBACK \(down\): supabase\/rollbacks\/20261026140000_assign_training_employees_v1\.down\.sql/);
  });

  it("is a DRAFT: no approval marker until the owner approves the apply", () => {
    // The owner adds `-- @human-gate-approved` (and the booking-engagement-end
    // approved-marker list entry) in the approving commit — never this branch.
    expect(MIG).not.toMatch(/(^|\n)[ \t]*--[ \t]*@human-gate-approved\b/i);
    expect(DOWN).not.toMatch(/(^|\n)[ \t]*--[ \t]*@human-gate-approved\b/i);
  });

  it("redefines exactly one function and touches nothing else", () => {
    for (const sql of [MIG, DOWN]) {
      const c = code(sql);
      expect(c.match(/create or replace function/gi)?.length).toBe(1);
      expect(c).not.toMatch(/\b(drop|alter|truncate|delete from|update public\.|create table|create policy|create trigger|security invoker|owner to)\b/i);
      expect(c).not.toMatch(/\bexecute\s+(format|'|v_)/i);
      expect(c).not.toMatch(/\bto (anon|public)\b/i);
    }
  });
});

describe("1. signature, security, search_path and grants are production's", () => {
  it("the header is identical in the migration and the rollback", () => {
    expect(header(MIG)).toBe(EXPECTED_HEADER);
    expect(header(DOWN)).toBe(EXPECTED_HEADER);
  });

  it("the privilege tail restates production's proacl {postgres=X, authenticated=X}", () => {
    expect(tail(MIG)).toEqual(EXPECTED_TAIL);
    expect(tail(DOWN)).toEqual(EXPECTED_TAIL);
  });
});

describe("2. the widened predicate is the canonical active-employee test, nothing broader", () => {
  const body = code(prosrc(MIG));
  const block = body.match(EMPLOYEE_BLOCK)?.[0] ?? "";

  it("governance membership stays the first branch, unchanged", () => {
    expect(body).toMatch(
      /if not exists \(\s*select 1 from public\.company_memberships m\s+where m\.profile_id = v_target\s+and m\.organization_id = prog\.organization_id\s+and m\.status = 'active'\s+\) and not exists \(/,
    );
  });

  it("the employee branch: same person, SAME organization, 'employee', active, inside its dates", () => {
    expect(block, "the employee block exists").not.toBe("");
    expect(block).toMatch(/ec\.profile_id = v_target/);
    expect(block).toMatch(/ec\.organization_id = prog\.organization_id/);
    expect(block).toMatch(/ec\.relationship_slug = 'employee'/);
    expect(block).toMatch(/ec\.status = 'active'/);
    expect(block).toMatch(/\(ec\.started_at is null or ec\.started_at <= current_date\)/);
    expect(block).toMatch(/\(ec\.ended_at is null or ec\.ended_at > current_date\)/);
  });

  it("no other relationship, status or invitation state is widened in", () => {
    expect(block.match(/'[a-z_]+'/g)?.sort()).toEqual(["'active'", "'employee'", "'invalid_assignee'"]);
    expect(body).not.toMatch(/relationship_slug\s+in\s*\(|relationship_slug\s*<>|relationship_slug\s*!=/i);
    expect(body).not.toMatch(/'(invited|pending|paused|ended|accepted|collaborator|freelancer|consultant|student|volunteer|intern|manager|owner)'/);
    expect(body).not.toMatch(/invitations|company_workers|agency_workers/);
  });

  it("no any-slug membership helper stands in for employment", () => {
    expect(body).not.toMatch(/profile_is_member_of_organization_v1|belongs_to_organization|is_org_member_or_engaged_v1|is_active_org_member|team_member_at_v1/);
  });

  it("the caller gate and the verified-email resolver are untouched (resolver called once)", () => {
    expect(body).toMatch(/if prog\.id is null or not public\.has_org_demand_access\(prog\.organization_id\) then\s+return 'not_found';/);
    expect(body.match(/public\.profile_id_by_verified_email_v1\(/g)?.length).toBe(1);
    expect(body).not.toMatch(/\b(p|profiles)\.email\b/);
  });
});

describe("3. outside the one block the body is production's, byte for byte", () => {
  it("the rollback body IS production (md5 of prosrc)", () => {
    expect(createHash("md5").update(prosrc(DOWN)).digest("hex")).toBe(PRODUCTION_PROSRC_MD5);
  });

  it("removing the employee block (and its comment) from the migration yields the rollback body", () => {
    const fwd = code(prosrc(MIG)).replace(EMPLOYEE_BLOCK, ") then\n    return 'invalid_assignee';");
    expect(fwd.replace(/\s+/g, " ")).toBe(code(prosrc(DOWN)).replace(/\s+/g, " "));
  });
});

describe("4. one answer, no new outcome", () => {
  const outcomes = (sql: string) =>
    [...new Set([...code(prosrc(sql)).matchAll(/return '([a-z_]+)'/g)].map((m) => m[1]))].sort();

  it("the migration returns exactly production's outcome set", () => {
    expect(outcomes(MIG)).toEqual(outcomes(DOWN));
    expect(outcomes(MIG)).toEqual(
      ["already_assigned", "assigned", "inactive_program", "invalid", "invalid_assignee", "limit_reached", "not_found"],
    );
  });

  it("'no account' and 'not in this organization / not an active employee' share invalid_assignee", () => {
    const body = code(prosrc(MIG));
    expect(body).toMatch(/if v_target is null then return 'invalid_assignee'; end if;/);
    expect(body.match(/'invalid_assignee'/g)?.length).toBe(2);
  });
});

describe("5. the production walk keeps ONE trainee through assign -> see -> complete -> owner reads", () => {
  const SPEC = join(REPO, "apps", "web", "tests", "e2e", "prod-company-governance.spec.ts");
  const spec = existsSync(SPEC) ? read(SPEC) : "";

  it("T-2 assigns TRAINEE.email and T-3 signs in as TRAINEE.slot — one constant, never two", () => {
    expect(spec).toMatch(/const TRAINEE = \{ slot: "worker", email: PROD_QA_SECOND_WORKER_EMAIL \} as const;/);
    expect(spec).toMatch(/fill\(TRAINEE\.email\)/);
    expect(spec).toMatch(/as\(browser, TRAINEE\.slot, \{ phone: true \}\)/);
    // No bare identity in the training half: every reference goes through TRAINEE.
    const training = spec.slice(spec.indexOf("11.8 training & certification (T)"));
    expect(training).not.toMatch(/fill\(PROD_QA_[A-Z_]+_EMAIL\)/);
    expect(training).not.toMatch(/as\(browser, "worker"[,)]/);
  });

  it("PASS only on proof: the fresh course is assigned and completed — no 'already_*' acceptance", () => {
    expect(spec).toMatch(/"trn", \["assigned"\]\)/);
    expect(spec).toMatch(/"trn", \["completed"\]\)/);
    expect(spec).not.toMatch(/"trn", \["assigned", "already_assigned"\]\)/);
    expect(spec).not.toMatch(/"trn", \["completed", "already_completed"\]\)/);
  });
});
