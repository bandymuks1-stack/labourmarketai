import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * AN ACCEPTED WORKER MUST BE VISIBLE TO THEIR OWN EMPLOYER (#1436).
 *
 * REPRODUCED ON PRODUCTION 2026-09-08. `accept_company_worker_invitation` — the
 * legacy roster path — links a worker into `company_workers` and writes NO
 * `engagement_contexts` row. The canonical organization graph is what every
 * authorization helper reads, so the person disappears from the organization
 * they just joined.
 *
 * Of 7 active `company_workers` rows, FOUR have a resolvable organization and
 * neither an engagement nor a membership. Under the first one's own auth, live:
 *
 *   belongs_to_organization(org)  false
 *   is_active_org_member(org)     false
 *   manages_organization(org)     false
 *
 * SIX RLS policies gate on `belongs_to_organization`, so that person cannot read
 * `organizations` (their own employer's row), `organization_roles`,
 * `training_programs`, `review_cycles`, `leave_balance_policies` or
 * `workflow_definitions`.
 *
 * ── THE DISTINCTION THIS GUARD EXISTS TO PROTECT ──────────────────────────
 *
 * The PR title says "binds organisation membership". That wording is wrong and
 * the fix must NOT follow it. Two different things:
 *
 *   engagement_contexts   a RELATIONSHIP (employee, student, collaborator…),
 *                         vocabulary held as DATA in `relationship_types` so
 *                         today's actor taxonomy is not frozen (ARCH §6.2)
 *   company_memberships   a GOVERNANCE SEAT with a role; `has_org_demand_access`
 *                         requires owner/admin/manager/external_manager
 *
 * `belongs_to_organization` already accepts EITHER — that is the multi-actor
 * model working. Writing a membership row for every accepted worker would grant
 * governance-shaped access to every employee and student, and would reduce a
 * person to a company member. IDENTITY IS NOT A FIXED ROLE.
 *
 * This guard asserts SHAPE. The migration is UNAPPLIED and owner-gated, so the
 * behavioural half is the production measurement recorded above, not a run here.
 */

const ROOT = join(__dirname, "..", "..", "..", "..");
const BASE = "20260902230000_accept_invitation_binds_org_membership_v1";
const FWD = join(ROOT, "supabase", "migrations", `${BASE}.sql`);
const DOWN = join(ROOT, "supabase", "rollbacks", `${BASE}.down.sql`);

const forward = readFileSync(FWD, "utf8");
const rollback = readFileSync(DOWN, "utf8");

/** Executable SQL only — `--` comment lines removed, so no assertion trips on
 *  the file's own explanation. */
function sqlOnly(sql: string): string {
  return sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
}

describe("#1436 — acceptance binds a RELATIONSHIP, not a governance seat", () => {
  const code = sqlOnly(forward);

  it("writes an engagement_contexts row", () => {
    expect(code).toMatch(/insert into public\.engagement_contexts/i);
    expect(code).toMatch(/'employee'/);
  });

  it("NEVER touches company_memberships", () => {
    // This is the whole point. A membership row would hand governance-shaped
    // access to every accepted employee and student, and collapse the
    // multi-actor model into "person = company member".
    expect(code).not.toMatch(/company_memberships/i);
  });

  it("grants no privilege and creates no policy", () => {
    expect(code).not.toMatch(/\bgrant\b/i);
    expect(code).not.toMatch(/\brevoke\b/i);
    expect(code).not.toMatch(/create\s+policy|drop\s+policy|alter\s+table/i);
  });

  it("resolves the organization through legacy_company_id, and tolerates absence", () => {
    expect(code).toMatch(/legacy_company_id\s*=\s*p_company_id/i);
    // A company with no organization row must not break acceptance.
    expect(code).toMatch(/if\s+v_org\s+is\s+not\s+null\s+then/i);
  });

  it("is idempotent — an existing active engagement is reused, not duplicated", () => {
    expect(code).toMatch(/if\s+v_ctx\s+is\s+null\s+then/i);
  });

  it("backfills nothing — no existing row is rewritten", () => {
    expect(code).not.toMatch(/\bupdate\s+public\.engagement_contexts/i);
    expect(code).not.toMatch(/\bdelete\s+from/i);
  });
});

describe("#1436 — the identity check survives the port", () => {
  const code = sqlOnly(forward);

  it("still requires a PENDING invitation addressed to the SESSION email", () => {
    // The live function's comment is explicit that `profiles.email` is
    // user-writable history and must never be consulted. A careless port that
    // dropped this would turn the accept into an impersonation vector.
    expect(code).toMatch(/auth\.jwt\(\)\s*->>\s*'email'/);
    expect(code).toMatch(/lower\(i\.invited_email\)\s*=\s*v_email/i);
    expect(code).toMatch(/i\.status\s*=\s*'pending'/i);
    expect(code).not.toMatch(/profiles\.email/i);
  });

  it("keeps SECURITY DEFINER with a pinned search_path", () => {
    expect(code).toMatch(/security\s+definer/i);
    expect(code).toMatch(/set\s+search_path\s+to\s+'public'/i);
  });

  it("replaces rather than drops — execute privileges are preserved", () => {
    expect(code).toMatch(/create\s+or\s+replace\s+function/i);
    expect(code).not.toMatch(/drop\s+function/i);
  });
});

describe("#1436 — it ships unapplied, with a faithful rollback", () => {
  it("carries a paired rollback", () => {
    expect(existsSync(DOWN)).toBe(true);
  });

  it("the rollback restores the pre-fix body and says what that costs", () => {
    const down = sqlOnly(rollback);
    expect(down).toMatch(/create\s+or\s+replace\s+function/i);
    expect(down).not.toMatch(/engagement_contexts/i);
    expect(rollback).toMatch(/REINTRODUCES the defect/i);
  });

  it("the rollback carries no marker — undoing needs no approval", () => {
    expect(rollback).not.toMatch(/(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i);
  });

  it("the migration states plainly that it is not approved to apply", () => {
    expect(forward).toMatch(/@human-gate-approved/);
    expect(forward).toMatch(/NOT AN APPROVAL TO APPLY/i);
    expect(forward).toMatch(/UNAPPLIED/);
  });
});
