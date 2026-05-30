import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guard for manager review → evidence result (migration 0034, slice
 * manager-review-evidence-result-v1). Pins the safety + honesty invariants of
 * the SECURITY DEFINER review write/read path so a future edit cannot silently:
 * drop reviewer-scope re-validation (authorized vs unauthorized), record a
 * review WITHOUT journal_review_enabled, stop persisting the evidence row, hide
 * the result from the worker, create fake data, or turn the migration
 * destructive / broaden RLS or table grants. Static analysis of the SQL text
 * (the RPCs run on owner-gated prod only).
 */

const APP = resolve(__dirname, "..", "..");
const REPO = resolve(APP, "..", "..");
const MIGRATION = "supabase/migrations/0034_manager_review_evidence_result.sql";
const raw = readFileSync(resolve(REPO, MIGRATION), "utf8");
const sql = raw.toLowerCase();
/** Executable SQL only — strip `--` line comments. */
const code = sql
  .split(/\r?\n/)
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

describe("0034 defines two guarded SECURITY DEFINER functions", () => {
  for (const fn of ["review_journal_entry", "reviewable_journal_entry_ids"]) {
    it(`${fn} is defined`, () => {
      expect(code).toContain(`create or replace function public.${fn}`);
    });
  }

  it("both functions are SECURITY DEFINER + set search_path = public", () => {
    expect((code.match(/security definer/g) ?? []).length).toBe(2);
    expect((code.match(/set search_path = public/g) ?? []).length).toBe(2);
  });
});

describe("0034 authorizes only managers / admins (unauthorized is blocked)", () => {
  it("re-validates reviewer scope: is_admin() OR manages_organization()", () => {
    expect(code).toMatch(/public\.is_admin\(\)\s+or\s+public\.manages_organization\(/);
    expect(code).toContain("return 'not_authorized'");
  });

  it("the read RPC gates the listed set on the same reviewer scope", () => {
    expect(code).toMatch(
      /public\.is_admin\(\)\s+or\s+public\.manages_organization\(ec\.organization_id\)/,
    );
  });
});

describe("0034 records a result ONLY when journal_review_enabled is true", () => {
  it("checks journal_review_enabled on the employment relationship", () => {
    // Both the write gate and the read gate must require the flag.
    expect(
      (code.match(/journal_review_enabled is true/g) ?? []).length,
    ).toBeGreaterThanOrEqual(3);
    expect(code).toContain("return 'review_not_enabled'");
  });

  it("never enables/forces review from a label (reads cw/aw link tables)", () => {
    expect(code).toMatch(/from public\.company_workers/);
    expect(code).toMatch(/from public\.agency_workers/);
  });
});

describe("0034 supports exactly the three decisions", () => {
  it("rejects an unknown decision", () => {
    expect(code).toMatch(
      /p_decision not in\s*\(\s*'approved'\s*,\s*'rejected'\s*,\s*'changes_requested'\s*\)/,
    );
    expect(code).toContain("return 'invalid_decision'");
  });

  it("maps each decision to a confirmation action", () => {
    expect(code).toMatch(/'approved'\s+then\s+'confirm'/);
    expect(code).toMatch(/'rejected'\s+then\s+'reject'/);
    expect(code).toMatch(/'changes_requested'\s+then\s+'request_changes'/);
  });
});

describe("0034 persists the evidence result (append-only) + audit", () => {
  it("inserts ONE append-only journal_entry_confirmations row carrying the decision", () => {
    expect(code).toMatch(/insert\s+into\s+public\.journal_entry_confirmations/);
    expect(code).toMatch(/'decision'/);
  });

  it("appends an audit_logs row with the real actor (auth.uid())", () => {
    expect(code).toMatch(/insert\s+into\s+public\.audit_logs/);
    expect(code).toContain("auth.uid()");
    expect(code).toContain("'review_journal_entry'");
  });

  it("returns the decision verbatim on success", () => {
    expect(code).toMatch(/return p_decision/);
  });
});

describe("0034 read RPC returns the gated pending set", () => {
  it("returns setof uuid of unreviewed entries", () => {
    expect(code).toMatch(/returns setof uuid/);
    expect(code).toMatch(/select je\.id/);
    // Pending = no evidence row yet.
    expect(code).toMatch(/not exists\s*\(\s*[\s\S]*?journal_entry_confirmations/);
  });
});

describe("0034 is additive + non-destructive + scope-safe", () => {
  it("creates no fake worker/journal/org data", () => {
    expect(code).not.toMatch(/insert\s+into\s+public\.workers/);
    expect(code).not.toMatch(/insert\s+into\s+public\.journal_entries\b/);
    expect(code).not.toMatch(/insert\s+into\s+public\.organizations/);
    expect(code).not.toMatch(/insert\s+into\s+public\.engagement_contexts/);
  });

  it("performs no destructive / schema-shape change and no UPDATE", () => {
    expect(code).not.toMatch(/drop\s+table/);
    expect(code).not.toMatch(/drop\s+column/);
    expect(code).not.toMatch(/\brename\b/);
    expect(code).not.toMatch(/delete\s+from/);
    expect(code).not.toMatch(/alter\s+table/);
    expect(code).not.toMatch(/create\s+table/);
    expect(code).not.toMatch(/\bupdate\s+public\./);
  });

  it("changes no RLS policy and no TABLE grant", () => {
    expect(code).not.toMatch(/create\s+policy|drop\s+policy/);
    expect(code).not.toMatch(/grant[^;]*\bon\s+(table\s+)?public\.\w+/);
    expect(code).not.toMatch(/grant[^;]*\bon\s+all\s+tables/);
  });

  it("grants EXECUTE on the two functions to authenticated only", () => {
    expect((code.match(/grant execute on function/g) ?? []).length).toBe(2);
    expect((code.match(/revoke all on function/g) ?? []).length).toBe(2);
    expect(code).toContain("to authenticated");
  });

  it("imports / calls no email, payment, marketplace or outbound surface", () => {
    for (const banned of [/\bstripe\b/, /\bpayment\b/, /\bmarketplace\b/, /\bhttp/]) {
      expect(banned.test(code), `must not match ${banned}`).toBe(false);
    }
  });
});

describe("the evidence result stays visible to worker / company / admin (RLS, 0013)", () => {
  // The result is read back through the existing journal_entry_confirmations
  // SELECT policy — it must admit the worker (owns_worker), the org manager
  // (manages_organization) and admin. This is what makes requirement #4 hold
  // without any new RLS in 0034.
  const rls = readFileSync(
    resolve(REPO, "supabase/migrations/0013_work_journal_m1.sql"),
    "utf8",
  ).toLowerCase();

  it("journal_entry_confirmations SELECT admits worker + manager + admin", () => {
    const policy = rls.slice(
      rls.indexOf("create policy journal_entry_confirmations_select"),
      rls.indexOf("create policy journal_entry_confirmations_insert"),
    );
    expect(policy).toContain("owns_worker");
    expect(policy).toContain("manages_organization");
    expect(policy).toContain("is_admin()");
  });
});
