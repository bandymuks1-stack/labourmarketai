import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guard for W9 slice 1 — organization membership revocation (P0-1).
 *
 * The W9 read-only audit found that membership on the canonical
 * `engagement_contexts` spine was IRREVOCABLE: no RPC moved `status` off
 * 'active', and `authenticated` holds only GRANT SELECT, so even a self-leave
 * was unreachable. A dismissed manager kept `manages_organization()` forever,
 * and with it the organization's journal, its membership list, invitation
 * sending, journal review — and, once W6 slice 3 lands, the right to reply and
 * dispute in the ORGANIZATION's name.
 *
 * This guard pins the shape of the fix so a later edit cannot silently:
 *   - turn revocation into a DELETE / hard delete,
 *   - drop the last-owner protection,
 *   - let a manager remove another manager or an owner (lateral escalation),
 *   - drop the audit row,
 *   - break idempotency,
 *   - widen RLS / table grants under cover of this migration, or
 *   - introduce a W6-specific exception instead of letting authorization be
 *     recomputed naturally from `status = 'active'`.
 *
 * Static analysis of SQL + TS text: the RPC itself runs only on owner-gated
 * production, so behaviour is proven by the paired e2e
 * (apps/web/tests/e2e/w9-membership-revocation.spec.ts) against a real stack.
 */

const APP = resolve(__dirname, "..", "..");
const REPO = resolve(APP, "..", "..");
function readRepo(rel: string): string {
  return readFileSync(resolve(REPO, rel), "utf8");
}

const MIGRATION =
  "supabase/migrations/20260802160000_org_membership_revocation_v1.sql";
const ROLLBACK =
  "supabase/rollbacks/20260802160000_org_membership_revocation_v1.down.sql";

const raw = readRepo(MIGRATION).toLowerCase();
/** Executable SQL only — the header prose explains the very rules we guard,
 *  so leaving comments in would create false positives. */
const code = raw
  .split(/\r?\n/)
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

describe("W9 slice 1 — the revocation RPC exists and is definer-safe", () => {
  it("defines exactly one new SECURITY DEFINER function with a pinned search_path", () => {
    expect(code).toContain(
      "create or replace function public.end_org_membership_v1",
    );
    expect(code.match(/create or replace function/g) ?? []).toHaveLength(1);
    expect(code.match(/security definer/g) ?? []).toHaveLength(1);
    expect(code.match(/set search_path = public/g) ?? []).toHaveLength(1);
  });

  it("revokes PUBLIC + anon and grants EXECUTE to authenticated only", () => {
    expect(code).toContain(
      "revoke all on function public.end_org_membership_v1(uuid, text) from public",
    );
    expect(code).toContain(
      "revoke all on function public.end_org_membership_v1(uuid, text) from anon",
    );
    expect(code).toContain(
      "grant execute on function public.end_org_membership_v1(uuid, text) to authenticated",
    );
    expect(code).not.toMatch(/to +anon\b/);
    expect(code).not.toMatch(/to +service_role\b/);
  });

  it("carries the owner-approved human-gate marker, attributed and scoped", () => {
    // The marker asserts that the OWNER approved the RED migration-safety
    // findings. It was added only after that approval on PR #975 — never on the
    // agent's initiative. Matched with the SAME line-anchored pattern the
    // safety script uses (.github/scripts/migration-safety.mjs).
    const MARKER = /(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i;
    expect(MARKER.test(readRepo(MIGRATION))).toBe(true);
    // The approval must stay attributable, and must name what was approved.
    expect(raw).toContain("pr #975");
    for (const finding of [
      "security-definer-function",
      "grant-or-revoke",
      "data-dml",
    ]) {
      expect(raw).toContain(finding);
    }
  });

  it("states that production apply is NOT covered by the merge approval", () => {
    // The single most important honesty invariant of this header: approving the
    // gate + merge is NOT approving `apply_migration` against production.
    expect(raw).toContain("production apply is **not** approved");
    expect(raw).toContain("pending_separate_owner_approval");
    expect(raw).toContain("never `db push`");
  });
});

describe("revocation is a state transition, never a deletion", () => {
  it("moves the engagement to the existing terminal status 'ended'", () => {
    expect(code).toContain("update public.engagement_contexts");
    expect(code).toContain("set status                 = 'ended'");
  });

  it("contains no DELETE / DROP TABLE / TRUNCATE of any kind", () => {
    expect(code).not.toMatch(/\bdelete\s+from\b/);
    expect(code).not.toMatch(/\btruncate\b/);
    expect(code).not.toMatch(/\bdrop\s+table\b/);
  });

  it("clears the review grant and the primary flag in the same statement", () => {
    expect(code).toContain("journal_review_enabled = false");
    expect(code).toContain("is_primary             = false");
  });

  it("does not touch any policy, table grant or schema object", () => {
    expect(code).not.toMatch(/create policy|drop policy|alter policy/);
    expect(code).not.toMatch(/alter table/);
    expect(code).not.toMatch(/grant .* on (public\.)?[a-z_]+ to/);
    expect(code).not.toMatch(/create table/);
  });
});

describe("authority ladder", () => {
  it("admin, org owner, manager and self are the only four capacities", () => {
    expect(code).toContain("public.is_admin()");
    expect(code).toContain("v_org_owner = uid");
    expect(code).toContain("public.manages_organization(v_org)");
    expect(code).toContain("v_profile = uid");
    for (const capacity of ["'admin'", "'owner'", "'manager'", "'self'"]) {
      expect(code).toContain(`v_capacity := ${capacity}`);
    }
  });

  it("a manager can never end an owner / manager / external_manager engagement", () => {
    expect(code).toMatch(
      /manages_organization\(v_org\)\s*\n?\s*and v_slug not in \('owner', 'manager', 'external_manager'\)/,
    );
  });

  it("an unrelated caller gets not_found, never an existence oracle", () => {
    expect(code).toContain("'outcome', 'not_found'");
  });
});

describe("last-owner protection", () => {
  it("refuses when the target is the organization's registered owner", () => {
    expect(code).toContain("v_profile = v_org_owner");
    expect(code).toContain("'outcome', 'last_owner'");
  });

  it("also refuses the final active 'owner' engagement (defence in depth)", () => {
    expect(code).toContain("relationship_slug = 'owner'");
    expect(code).toContain("v_other_owners = 0");
  });

  it("runs both checks BEFORE any write", () => {
    const lastOwner = code.indexOf("v_other_owners = 0");
    const update = code.indexOf("update public.engagement_contexts");
    expect(lastOwner).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(lastOwner);
  });

  it("keys the guard on the CURRENT owner pointer, so a transferred-away owner is not protected", () => {
    // Transfer itself is out of scope (W9 audit: MISSING), but the guard must
    // not hard-code "slug = owner ⇒ never removable", or a former owner could
    // never be cleaned up after a future transfer.
    expect(code).toContain("select o.owner_profile_id into v_org_owner");
  });
});

describe("idempotency + audit", () => {
  it("an already-ended membership returns already_ended", () => {
    expect(code).toContain("v_status = 'ended'");
    expect(code).toContain("'outcome', 'already_ended'");
  });

  it("writes exactly one audit_logs row, and only on a real state change", () => {
    expect(code.match(/insert into public\.audit_logs/g) ?? []).toHaveLength(1);
    expect(code).toContain("'end_org_membership'");
    const alreadyEnded = code.indexOf("'outcome', 'already_ended'");
    const audit = code.indexOf("insert into public.audit_logs");
    // the idempotent early-return sits BEFORE the audit insert
    expect(audit).toBeGreaterThan(alreadyEnded);
  });

  it("the audit payload records who, from which role, to which role, and why", () => {
    for (const field of [
      "'organization_id'",
      "'profile_id'",
      "'from_role'",
      "'to_role'",
      "'from_status'",
      "'to_status'",
      "'actor_capacity'",
      "'self_initiated'",
      "'reason'",
    ]) {
      expect(code).toContain(field);
    }
    expect(code).toContain("uid,\n    'end_org_membership'");
  });
});

describe("authorization is recomputed naturally — no W6 special case", () => {
  it("the migration never mentions experience / dispute / W6 objects", () => {
    expect(raw).not.toContain("experience_records");
    expect(raw).not.toContain("experience_responses");
    expect(code).not.toContain("dispute");
  });

  it("manages_organization still filters on status = 'active' (the mechanism)", () => {
    const m0013 = readRepo(
      "supabase/migrations/0013_work_journal_m1.sql",
    ).toLowerCase();
    const fn = m0013.slice(
      m0013.indexOf("create or replace function public.manages_organization"),
    );
    const body = fn.slice(0, fn.indexOf("$$;") + 3);
    expect(body).toContain("ec.status = 'active'");
    expect(body).toContain(
      "ec.relationship_slug in ('manager','owner','external_manager')",
    );
  });

  it("the org journal, membership list and invitation gate all key off manages_organization", () => {
    const m0013 = readRepo(
      "supabase/migrations/0013_work_journal_m1.sql",
    ).toLowerCase();
    // journal_entries_select
    expect(m0013).toMatch(
      /create policy journal_entries_select[\s\S]{0,400}manages_organization\(ec\.organization_id\)/,
    );
    // engagement_contexts_select
    expect(m0013).toMatch(
      /create policy engagement_contexts_select[\s\S]{0,200}manages_organization\(organization_id\)/,
    );
    const inv = readRepo(
      "supabase/migrations/20260712200000_canonical_invitations_v1.sql",
    ).toLowerCase();
    expect(inv).toContain("public.manages_organization(p_organization_id)");
  });
});

describe("paired rollback", () => {
  const down = readRepo(ROLLBACK).toLowerCase();

  it("drops only the new function", () => {
    expect(down).toContain(
      "drop function if exists public.end_org_membership_v1(uuid, text)",
    );
    expect(down).not.toMatch(/\bdrop\s+table\b/);
  });

  it("never re-activates already-ended memberships", () => {
    expect(down).not.toMatch(/set\s+status\s*=\s*'active'/);
    expect(down).not.toMatch(/\bupdate\s+public\.engagement_contexts\b/);
  });
});

describe("app layer", () => {
  const action = readRepo("apps/web/lib/operations/org-membership.ts");
  const readModel = readRepo("apps/web/lib/operations/org-members.ts");
  const panel = readRepo("apps/web/components/app/org-members-panel.tsx");

  it("the server action calls the RPC and never writes the table directly", () => {
    expect(action).toContain('rpc(supabase, "end_org_membership_v1"');
    expect(action).not.toMatch(/from\("engagement_contexts"\)[\s\S]{0,120}\.(update|delete)\(/);
  });

  it("degrades honestly to needs_migration while the migration is unapplied", () => {
    expect(action).toContain('return { ok: false, code: "needs_migration" }');
    expect(action).toContain("42883");
  });

  it("treats already_ended as success (idempotent from the UI too)", () => {
    expect(action).toContain(
      'outcome === "ended" || outcome === "already_ended"',
    );
  });

  it("the members list now covers manager engagements, not employees only", () => {
    expect(readModel).toContain("MEMBERSHIP_SLUGS");
    expect(readModel).toContain('"manager"');
    expect(readModel).toContain('.in("relationship_slug", [...MEMBERSHIP_SLUGS])');
    expect(readModel).toContain('.eq("status", "active")');
  });

  it("the panel offers no remove control for the registered owner", () => {
    expect(readModel).toContain("isRegisteredOwner");
    expect(panel).toContain("m.isRegisteredOwner ?");
    expect(panel).toContain("org-member-owner-locked-");
  });

  it("removal asks for confirmation before it fires", () => {
    expect(panel).toContain("confirm-remove-");
    expect(panel).toContain("cancel-remove-");
    expect(panel).toContain("endOrgMembership");
  });
});
