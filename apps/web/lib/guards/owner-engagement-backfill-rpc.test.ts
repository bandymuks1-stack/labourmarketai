import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guard for the org-owner engagement backfill (migration 0035, slice
 * sales-core-nonstop-v1 unblock). Pins the invariants so a future edit cannot
 * make it destructive, create fake worker/journal data, or grant management of
 * someone else's org: it only ever gives an organization's OWN owner the
 * 'owner' engagement_context the 0013 backfill would have created. Static
 * analysis of the SQL text (runs on owner-gated prod only).
 */

const APP = resolve(__dirname, "..", "..");
const REPO = resolve(APP, "..", "..");
const MIGRATION = "supabase/migrations/0035_org_owner_engagement_backfill.sql";
const raw = readFileSync(resolve(REPO, MIGRATION), "utf8");
const sql = raw.toLowerCase();
const code = sql
  .split(/\r?\n/)
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

describe("0035 defines a guarded SECURITY DEFINER trigger + idempotent backfill", () => {
  it("defines ensure_org_owner_engagement as SECURITY DEFINER + fixed search_path", () => {
    expect(code).toContain(
      "create or replace function public.ensure_org_owner_engagement",
    );
    expect(code).toMatch(/security definer/);
    expect(code).toMatch(/set search_path = public/);
  });

  it("creates an AFTER INSERT trigger on public.organizations", () => {
    expect(code).toMatch(/create trigger on_org_owner_engagement/);
    expect(code).toMatch(/after insert on public\.organizations/);
    // Safe re-run: drops the trigger first.
    expect(code).toMatch(/drop trigger if exists on_org_owner_engagement/);
  });

  it("is idempotent — both inserts are guarded by NOT EXISTS", () => {
    expect((code.match(/not exists\s*\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe("0035 only provisions the owner's OWN 'owner' engagement", () => {
  it("inserts only into engagement_contexts, only the 'owner' slug", () => {
    expect((code.match(/insert\s+into\s+public\.engagement_contexts/g) ?? []).length).toBe(2);
    expect(code).toMatch(/'owner'/);
    // Never an employee/manager-of-others link, never fake worker/journal data.
    expect(code).not.toMatch(/'employee'/);
    expect(code).not.toMatch(/insert\s+into\s+public\.workers/);
    expect(code).not.toMatch(/insert\s+into\s+public\.company_workers/);
    expect(code).not.toMatch(/insert\s+into\s+public\.agency_workers/);
    expect(code).not.toMatch(/insert\s+into\s+public\.journal_entries/);
    expect(code).not.toMatch(/insert\s+into\s+public\.journal_entry_confirmations/);
  });

  it("keys the engagement to the org's own owner_profile_id", () => {
    expect(code).toMatch(/owner_profile_id/);
    expect(code).toMatch(/relationship_slug = 'owner'/);
  });

  it("validates country_code against public.countries (no FK break)", () => {
    expect(code).toMatch(/from public\.countries c where c\.code =/);
  });
});

describe("0035 is additive + non-destructive + scope-safe", () => {
  it("performs no destructive / schema-shape change and no UPDATE/DELETE", () => {
    expect(code).not.toMatch(/drop\s+table/);
    expect(code).not.toMatch(/drop\s+column/);
    expect(code).not.toMatch(/\brename\b/);
    expect(code).not.toMatch(/delete\s+from/);
    expect(code).not.toMatch(/\bupdate\s+public\./);
    expect(code).not.toMatch(/alter\s+table/);
    expect(code).not.toMatch(/create\s+table/);
    expect(code).not.toMatch(/truncate/);
  });

  it("changes no RLS policy and no grant", () => {
    expect(code).not.toMatch(/create\s+policy|drop\s+policy/);
    expect(code).not.toMatch(/\bgrant\b|\brevoke\b/);
  });

  it("touches no email, payment, marketplace or outbound surface", () => {
    for (const banned of [/\bstripe\b/, /\bpayment\b/, /\bmarketplace\b/, /\bhttp/]) {
      expect(banned.test(code), `must not match ${banned}`).toBe(false);
    }
  });
});
