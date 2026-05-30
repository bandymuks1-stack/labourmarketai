import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guard for the journal-review enable toggle + per-row engagement read
 * (migration 0033, slice feat/journal-review-enable-toggle-v1). Pins the
 * safety + honesty invariants of the SECURITY DEFINER write/read path so a
 * future edit cannot silently: drop ownership re-validation, enable journal
 * review WITHOUT a real engagement context, widen who may review, approve /
 * reject anything, create fake data, or turn the migration destructive /
 * broaden RLS or table grants. Static analysis of the SQL text (the RPCs run
 * on owner-gated prod only).
 */

const APP = resolve(__dirname, "..", "..");
const REPO = resolve(APP, "..", "..");
const MIGRATION = "supabase/migrations/0033_journal_review_enable_toggle.sql";
const raw = readFileSync(resolve(REPO, MIGRATION), "utf8");
const sql = raw.toLowerCase();
/** Executable SQL only — strip `--` line comments (the header prose explains
 *  the very rules we guard, which would create false matches). */
const code = sql
  .split(/\r?\n/)
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

const SET_FNS = [
  "set_company_worker_journal_review",
  "set_agency_worker_journal_review",
];
const READ_FNS = [
  "company_worker_engagement_links",
  "agency_worker_engagement_links",
];

describe("0033 defines four guarded SECURITY DEFINER functions", () => {
  for (const fn of [...SET_FNS, ...READ_FNS]) {
    it(`${fn} is defined`, () => {
      expect(code).toContain(`create or replace function public.${fn}`);
    });
  }

  it("all four functions are SECURITY DEFINER + set search_path = public", () => {
    expect((code.match(/security definer/g) ?? []).length).toBe(4);
    expect((code.match(/set search_path = public/g) ?? []).length).toBe(4);
  });

  it("re-validates ownership (owns_company / owns_agency) OR is_admin", () => {
    expect((code.match(/owns_company\([^)]*\)\s+or\s+public\.is_admin\(\)/g) ?? []).length).toBe(2);
    expect((code.match(/owns_agency\([^)]*\)\s+or\s+public\.is_admin\(\)/g) ?? []).length).toBe(2);
    expect(code).toContain("return 'not_owner'");
  });
});

describe("0033 enables review ONLY with a real engagement context", () => {
  it("returns 'engagement_context_missing' when no active employee link exists", () => {
    expect(code).toContain("return 'engagement_context_missing'");
  });

  it("checks for an active 'employee' engagement_context before enabling", () => {
    // The gate must read engagement_contexts for the worker profile + org with
    // the employee slug + active status.
    expect(code).toMatch(/from public\.engagement_contexts/);
    expect((code.match(/relationship_slug = 'employee'/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(code).toMatch(/status = 'active'/);
  });

  it("only reviewer-eligible roles (company_admin / agency_admin) may enable", () => {
    expect(code).toMatch(
      /v_role not in\s*\(\s*'company_admin'\s*,\s*'agency_admin'\s*\)/,
    );
    expect(code).not.toMatch(
      /v_role not in\s*\([^)]*'(foreman|project_manager|worker)'[^)]*\)/,
    );
    expect(code).toContain("return 'role_not_allowed'");
    expect(code).toContain("return 'role_not_assigned'");
  });
});

describe("0033 disable is always safe + the toggle is idempotent", () => {
  it("disabling only ever sets journal_review_enabled = false", () => {
    expect(code).toMatch(/journal_review_enabled = false/);
    expect(code).toContain("return 'disabled'");
  });

  it("is idempotent (already_enabled / already_disabled)", () => {
    expect(code).toContain("return 'already_enabled'");
    expect(code).toContain("return 'already_disabled'");
  });

  it("enabling sets journal_review_enabled = true only inside the set RPCs", () => {
    // Exactly the two set RPCs flip it on (one each).
    expect((code.match(/journal_review_enabled = true/g) ?? []).length).toBe(2);
    expect(code).toContain("return 'enabled'");
  });
});

describe("0033 per-row read RPCs are owner-gated + link-only", () => {
  it("return setof uuid of bridged worker_ids, gated by ownership", () => {
    expect((code.match(/returns setof uuid/g) ?? []).length).toBe(2);
    // Both read functions select worker_id joined through engagement_contexts.
    expect(code).toMatch(/select cw\.worker_id/);
    expect(code).toMatch(/select aw\.worker_id/);
    expect(code).toMatch(/join public\.engagement_contexts/);
  });
});

describe("0033 approves/rejects nothing + writes an audit trail", () => {
  it("contains no approve/reject/confirm write", () => {
    expect(code).not.toMatch(/confirmation_scope/);
    expect(code).not.toMatch(/\bapprove\b|\breject\b/);
    expect(code).not.toMatch(/insert\s+into\s+public\.journal_entry_confirmations/);
  });

  it("appends to public.audit_logs with the real actor (auth.uid())", () => {
    expect(code).toMatch(/insert\s+into\s+public\.audit_logs/);
    expect(code).toContain("auth.uid()");
    expect(code).toContain("'set_company_worker_journal_review'");
    expect(code).toContain("'set_agency_worker_journal_review'");
  });
});

describe("0033 is additive + non-destructive + scope-safe", () => {
  it("creates no fake worker/journal/org data", () => {
    expect(code).not.toMatch(/insert\s+into\s+public\.workers/);
    expect(code).not.toMatch(/insert\s+into\s+public\.journal_entries/);
    expect(code).not.toMatch(/insert\s+into\s+public\.organizations/);
    expect(code).not.toMatch(/insert\s+into\s+public\.engagement_contexts/);
    expect(code).not.toMatch(/insert\s+into\s+public\.projects/);
  });

  it("performs no destructive or schema-shape change", () => {
    expect(code).not.toMatch(/drop\s+table/);
    expect(code).not.toMatch(/drop\s+column/);
    expect(code).not.toMatch(/\brename\b/);
    expect(code).not.toMatch(/delete\s+from/);
    expect(code).not.toMatch(/alter\s+table/);
    expect(code).not.toMatch(/create\s+table/);
  });

  it("only mutates the journal_review_enabled flag on the link tables", () => {
    // Every UPDATE targets company_workers / agency_workers (no other table is
    // mutated; no backfill).
    const updates = code.match(/update\s+public\.(\w+)/g) ?? [];
    for (const u of updates) {
      expect(["update public.company_workers", "update public.agency_workers"]).toContain(u);
    }
  });

  it("changes no RLS policy and no TABLE grant", () => {
    expect(code).not.toMatch(/create\s+policy|drop\s+policy/);
    expect(code).not.toMatch(/grant[^;]*\bon\s+(table\s+)?public\.\w+/);
    expect(code).not.toMatch(/grant[^;]*\bon\s+all\s+tables/);
  });

  it("grants EXECUTE on the four functions to authenticated only", () => {
    expect((code.match(/grant execute on function/g) ?? []).length).toBe(4);
    expect((code.match(/revoke all on function/g) ?? []).length).toBe(4);
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
