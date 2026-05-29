import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guard for the engagement-context provisioning RPCs (migration 0032,
 * slice engagement-context-provisioning-rpc-v1). Pins the safety + honesty
 * invariants of the SECURITY DEFINER write path so a future edit cannot
 * silently: drop ownership re-validation, widen who may be set up for review,
 * enable journal review, create fake data, or turn the migration destructive /
 * broaden RLS or table grants. Static analysis of the SQL text (the RPC runs
 * on owner-gated prod only).
 */

const APP = resolve(__dirname, "..", "..");
const REPO = resolve(APP, "..", "..");
const MIGRATION =
  "supabase/migrations/0032_engagement_context_provisioning_rpc.sql";
const raw = readFileSync(resolve(REPO, MIGRATION), "utf8");
const sql = raw.toLowerCase();
/** Executable SQL only — strip `--` line comments (the header prose explains
 *  the very rules we guard, which would create false matches). */
const code = sql
  .split(/\r?\n/)
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

describe("0032 defines both provisioning RPCs as guarded SECURITY DEFINER", () => {
  for (const fn of [
    "provision_company_worker_engagement_context",
    "provision_agency_worker_engagement_context",
  ]) {
    it(`${fn} is defined`, () => {
      expect(code).toContain(`create or replace function public.${fn}`);
    });
  }

  it("both functions are SECURITY DEFINER + set search_path = public", () => {
    expect((code.match(/security definer/g) ?? []).length).toBe(2);
    expect((code.match(/set search_path = public/g) ?? []).length).toBe(2);
  });

  it("re-validates ownership (owns_company / owns_agency) OR is_admin", () => {
    expect(code).toMatch(/owns_company\([^)]*\)\s+or\s+public\.is_admin\(\)/);
    expect(code).toMatch(/owns_agency\([^)]*\)\s+or\s+public\.is_admin\(\)/);
    expect(code).toContain("return 'not_owner'");
  });
});

describe("0032 rejects every unsafe / incomplete state", () => {
  for (const outcome of [
    "not_owner",
    "not_linked",
    "profile_missing",
    "role_not_assigned",
    "role_not_allowed",
    "organization_missing",
  ]) {
    it(`returns '${outcome}' for that condition`, () => {
      expect(code).toContain(`return '${outcome}'`);
    });
  }

  it("only reviewer-eligible roles (company_admin / agency_admin) may be set up", () => {
    // The role gate must reference exactly the reviewer roles.
    expect(code).toMatch(
      /v_role not in\s*\(\s*'company_admin'\s*,\s*'agency_admin'\s*\)/,
    );
    // A label like foreman / project_manager / worker must NOT appear in the
    // allow-set (they are not reviewer-eligible).
    expect(code).not.toMatch(
      /v_role not in\s*\([^)]*'(foreman|project_manager|worker)'[^)]*\)/,
    );
  });
});

describe("0032 is idempotent + connects only a real org link", () => {
  it("is idempotent (already_connected, then connected)", () => {
    expect(code).toContain("return 'already_connected'");
    expect(code).toContain("return 'connected'");
  });

  it("links the worker to the EXISTING mirrored organization (no org create)", () => {
    expect(code).toMatch(/from public\.organizations/);
    expect(code).toMatch(/legacy_company_id = p_company_id/);
    expect(code).toMatch(/legacy_agency_id = p_agency_id/);
    expect(code).not.toMatch(/insert\s+into\s+public\.organizations/);
  });

  it("inserts ONLY an employee engagement_context (no fake worker/journal data)", () => {
    expect(code).toMatch(/insert\s+into\s+public\.engagement_contexts/);
    expect(code).toMatch(/'employee'/);
    expect(code).not.toMatch(/insert\s+into\s+public\.workers/);
    expect(code).not.toMatch(/insert\s+into\s+public\.journal_entries/);
    expect(code).not.toMatch(/insert\s+into\s+public\.journal_entry_confirmations/);
    expect(code).not.toMatch(/insert\s+into\s+public\.companies/);
    expect(code).not.toMatch(/insert\s+into\s+public\.projects/);
  });
});

describe("0032 never enables review and approves/rejects nothing", () => {
  it("does not set journal_review_enabled = true anywhere", () => {
    expect(code).not.toMatch(/journal_review_enabled\s*=\s*true/);
    // It only RECORDS journal_review_enabled=false in the audit payload.
    expect(code).toMatch(/'journal_review_enabled',\s*false/);
  });

  it("contains no approve/reject/confirm write", () => {
    expect(code).not.toMatch(/confirmation_scope/);
    expect(code).not.toMatch(/\bapprove\b|\breject\b/);
  });
});

describe("0032 writes an append-only audit trail", () => {
  it("appends to public.audit_logs with the real actor (auth.uid())", () => {
    expect(code).toMatch(/insert\s+into\s+public\.audit_logs/);
    expect(code).toContain("auth.uid()");
    expect(code).toContain("'provision_company_worker_engagement_context'");
    expect(code).toContain("'provision_agency_worker_engagement_context'");
  });
});

describe("0032 is additive + non-destructive + scope-safe", () => {
  it("performs no destructive or schema-shape change", () => {
    expect(code).not.toMatch(/drop\s+table/);
    expect(code).not.toMatch(/drop\s+column/);
    expect(code).not.toMatch(/\brename\b/);
    expect(code).not.toMatch(/delete\s+from/);
    expect(code).not.toMatch(/\bupdate\s+public\./); // no backfill / mutation
    expect(code).not.toMatch(/alter\s+table/);
    expect(code).not.toMatch(/create\s+table/);
  });

  it("changes no RLS policy and no TABLE grant", () => {
    expect(code).not.toMatch(/create\s+policy|drop\s+policy/);
    expect(code).not.toMatch(/grant[^;]*\bon\s+(table\s+)?public\.\w+/);
    expect(code).not.toMatch(/grant[^;]*\bon\s+all\s+tables/);
  });

  it("grants EXECUTE on the two functions to authenticated only", () => {
    expect((code.match(/grant execute on function/g) ?? []).length).toBe(2);
    expect(code).toMatch(/revoke all on function[\s\S]*?from public/);
    expect(code).toContain("to authenticated");
  });

  it("imports / calls no email, payment, marketplace or outbound surface", () => {
    for (const banned of [
      /\bemail\b/,
      /\bstripe\b/,
      /\bpayment\b/,
      /\bmarketplace\b/,
      /\bhttp/,
    ]) {
      expect(banned.test(code), `must not match ${banned}`).toBe(false);
    }
  });
});
