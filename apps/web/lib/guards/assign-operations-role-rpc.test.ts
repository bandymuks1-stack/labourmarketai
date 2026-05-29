import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guard for the operations-role assignment RPCs (migration 0031,
 * slice ops-role-assign-rpc-v1). Pins the safety + honesty invariants of
 * the SECURITY DEFINER write path so a future edit cannot silently:
 *   - drop ownership re-validation,
 *   - widen the allowed role set,
 *   - enable journal review from a label,
 *   - skip the audit trail, or
 *   - turn the migration destructive / broaden RLS or table grants.
 * Static analysis of the SQL text (the RPC runs on owner-gated prod only).
 */

const APP = resolve(__dirname, "..", "..");
const REPO = resolve(APP, "..", "..");
function readRepo(rel: string): string {
  return readFileSync(resolve(REPO, rel), "utf8");
}

const MIGRATION = "supabase/migrations/0031_assign_operations_role_rpcs.sql";
const raw = readRepo(MIGRATION);
const sql = raw.toLowerCase();
/** Executable SQL only — strip `--` line comments (header prose explains
 *  the very rules we guard, so it would create false matches). */
const code = sql
  .split(/\r?\n/)
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

describe("0031 defines both owner/admin-scoped assignment RPCs", () => {
  for (const fn of [
    "assign_company_worker_role",
    "assign_agency_worker_role",
  ]) {
    it(`${fn} is a SECURITY DEFINER function with a pinned search_path`, () => {
      expect(code).toContain(`create or replace function public.${fn}`);
    });
  }

  it("both functions are SECURITY DEFINER + set search_path = public", () => {
    const definers = code.match(/security definer/g) ?? [];
    expect(definers.length).toBe(2);
    const searchPaths = code.match(/set search_path = public/g) ?? [];
    expect(searchPaths.length).toBe(2);
  });

  it("re-validates ownership (owns_company / owns_agency) OR is_admin", () => {
    expect(code).toMatch(/owns_company\([^)]*\)\s+or\s+public\.is_admin\(\)/);
    expect(code).toMatch(/owns_agency\([^)]*\)\s+or\s+public\.is_admin\(\)/);
    // A non-owner, non-admin caller is turned away.
    expect(code).toContain("return 'not_owner'");
  });

  it("requires an existing relationship (never creates a link)", () => {
    expect(code).toContain("return 'not_linked'");
    expect(code).not.toMatch(/insert\s+into\s+public\.company_workers/);
    expect(code).not.toMatch(/insert\s+into\s+public\.agency_workers/);
  });
});

describe("0031 validates the conservative role set + safe clearing", () => {
  it("only the five allowed roles pass validation", () => {
    for (const role of [
      "worker",
      "foreman",
      "project_manager",
      "company_admin",
      "agency_admin",
    ]) {
      expect(code).toContain(`'${role}'`);
    }
    // An out-of-set role is rejected.
    expect(code).toContain("return 'invalid_role'");
  });

  it("supports clearing role + title safely", () => {
    expect(code).toContain("return 'cleared'");
    // Clearing sets role + title to null.
    expect(code).toMatch(/operations_role\s*=\s*null/);
    expect(code).toMatch(/operations_title\s*=\s*null/);
  });

  it("supports a successful assignment", () => {
    expect(code).toContain("return 'assigned'");
  });
});

describe("0031 never enables journal review from a label", () => {
  it("rejects any review-enable attempt", () => {
    expect(code).toContain("return 'review_not_allowed'");
  });

  it("never SETs journal_review_enabled = true (always forces false)", () => {
    // Any UPDATE assignment of the review flag must be to false.
    expect(code).not.toMatch(/journal_review_enabled\s*=\s*true/);
    expect(code).toMatch(/journal_review_enabled\s*=\s*false/);
  });
});

describe("0031 writes an append-only audit trail", () => {
  it("appends to public.audit_logs with the real actor (auth.uid())", () => {
    expect(code).toMatch(/insert\s+into\s+public\.audit_logs/);
    expect(code).toContain("auth.uid()");
    // The action names are recorded for both relationship kinds.
    expect(code).toContain("'assign_company_worker_role'");
    expect(code).toContain("'assign_agency_worker_role'");
  });
});

describe("0031 is additive + non-destructive + scope-safe", () => {
  it("performs no destructive or schema-shape change", () => {
    expect(code).not.toMatch(/drop\s+table/);
    expect(code).not.toMatch(/drop\s+column/);
    expect(code).not.toMatch(/\brename\b/);
    expect(code).not.toMatch(/delete\s+from/);
    expect(code).not.toMatch(/alter\s+table/);
    expect(code).not.toMatch(/create\s+table/);
  });

  it("changes no RLS policy and no TABLE grant", () => {
    expect(code).not.toMatch(/create\s+policy|drop\s+policy/);
    // Only FUNCTION execute grants are allowed — no grant/revoke on a table.
    expect(code).not.toMatch(/grant[^;]*\bon\s+(table\s+)?public\.\w+_workers/);
    expect(code).not.toMatch(/grant[^;]*\bon\s+all\s+tables/);
  });

  it("grants EXECUTE on the two functions to authenticated only", () => {
    const grants = code.match(/grant execute on function/g) ?? [];
    expect(grants.length).toBe(2);
    expect(code).toMatch(/revoke all on function[\s\S]*?from public/);
    expect(code).toContain("to authenticated");
  });

  it("imports / calls no email, payment, marketplace or outbound surface", () => {
    for (const banned of [
      /\bsend\b/,
      /\bemail\b/,
      /\binvit/,
      /\bstripe\b/,
      /\bpayment\b/,
      /\bmarketplace\b/,
      /\bhttp/,
    ]) {
      expect(banned.test(code), `must not match ${banned}`).toBe(false);
    }
  });
});
