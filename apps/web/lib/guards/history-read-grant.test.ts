import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { chooseGrant } from "@/lib/organization-evidence/history-read-grant";

/**
 * Owner request 2026-11-23: a time-boxed READ-ONLY grant to an organization's
 * history (20261124053000_history_read_grant_v1, RED, needs-human-gate). The
 * four owner conditions are pinned here so a later edit cannot quietly turn
 * the grant into write, export or a standing membership.
 */
const ROOT = join(__dirname, "../../../..");
const MIGRATION = readFileSync(
  join(ROOT, "supabase/migrations/20261124053000_history_read_grant_v1.sql"),
  "utf8",
);
const ROLLBACK = readFileSync(
  join(ROOT, "supabase/rollbacks/20261124053000_history_read_grant_v1.down.sql"),
  "utf8",
);
const RESOLVER = readFileSync(join(ROOT, "apps/web/lib/organization-evidence/history-read-grant.ts"), "utf8");
const code = MIGRATION.replace(/--[^\n]*\n/g, "\n");

describe("history read grant: read-only by construction", () => {
  it("adds SELECT policies only — no insert, update, delete or all policy", () => {
    const policies = [...code.matchAll(/create policy\s+(\w+)\s+on\s+public\.(\w+)\s+for\s+(\w+)/gi)];
    expect(policies.length).toBe(9);
    for (const p of policies) expect(p[3].toLowerCase(), p[1]).toBe("select");
    expect(code).not.toMatch(/alter policy|drop policy|create or replace function/i);
  });

  it("opens only the history tables, never journals, workers, media, timesheets or conversations", () => {
    const tables = [...code.matchAll(/create policy\s+\w+\s+on\s+public\.(\w+)/gi)].map((m) => m[1]).sort();
    expect(tables).toEqual(
      [
        "organization_evidence_competency_signals",
        "organization_evidence_events",
        "organization_evidence_parties",
        "organization_evidence_records",
        "organization_history_periods",
        "organization_people",
        "organizations",
        "projects",
        "work_objects",
      ].sort(),
    );
  });

  it("the grant table is closed to the API and every grant expires within 4 hours", () => {
    expect(code).toMatch(/revoke all on table public\.organization_history_read_grants_v1 from public, anon, authenticated;/);
    expect(code).toMatch(/expires_at <= granted_at \+ interval '4 hours'/);
    expect(code).not.toMatch(/grant\s+(select|insert|update|delete|all)[^;]*organization_history_read_grants_v1[^;]*to\s+authenticated/i);
  });

  it("a grant is live only for its own person, unrevoked and unexpired", () => {
    expect(code).toMatch(/g\.profile_id = auth\.uid\(\)\s+and g\.revoked_at is null\s+and now\(\) < g\.expires_at/);
  });

  it("no existing helper is widened", () => {
    expect(code).not.toMatch(/manages_organization|belongs_to_organization|is_org_member_or_engaged_v1|company_memberships/);
  });

  it("the rollback refuses while a grant is live and removes every policy and function", () => {
    expect(ROLLBACK).toMatch(/history_read_grant_live/);
    expect((ROLLBACK.match(/drop policy if exists/g) ?? []).length).toBe(9);
    expect(ROLLBACK).toMatch(/drop function if exists public\.has_history_read_grant_v1\(uuid\);/);
    expect(ROLLBACK).toMatch(/drop function if exists public\.my_history_read_grants_v1\(\);/);
  });

  it("the app tries the governed organization first and never hands the grant to a write door", () => {
    expect(RESOLVER).toMatch(/const governed = await resolveEvidenceOrganization\(caller, requestedOrganizationId\);\s*if \(governed\.ok\)/);
    expect(RESOLVER).toMatch(/readOnly: true/);
    expect(RESOLVER).not.toMatch(/createAdminClient|service_role|SUPABASE_SERVICE/i);
  });
});

describe("chooseGrant", () => {
  const a = { organization_id: "11111111-1111-4111-8111-111111111111", organization_name: "Alpha", expires_at: "x" };
  const b = { organization_id: "22222222-2222-4222-8222-222222222222", organization_name: "Beta", expires_at: "x" };

  it("one live grant and no choice → that grant", () => {
    expect(chooseGrant([a], null)).toBe(a);
  });
  it("several grants and no choice → none (never the first one)", () => {
    expect(chooseGrant([a, b], null)).toBeNull();
  });
  it("a named organization → only a grant the caller holds, by id or exact name", () => {
    expect(chooseGrant([a, b], b.organization_id)).toBe(b);
    expect(chooseGrant([a, b], "alpha")).toBe(a);
    expect(chooseGrant([a], "33333333-3333-4333-8333-333333333333")).toBeNull();
  });
  it("no grant → none", () => {
    expect(chooseGrant([], null)).toBeNull();
  });
});
