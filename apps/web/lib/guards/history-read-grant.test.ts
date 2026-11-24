import { execFileSync } from "node:child_process";
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

// ── The two pages a grant opens, read-only (coordinator 2026-11-24, #3736/#3759) ──
import { isHistoryGrantPath } from "@/lib/organization-evidence/history-grant-paths";

const APP = (p: string) => readFileSync(join(ROOT, "apps/web", p), "utf8");
const LAYOUT = APP("app/[locale]/dashboard/layout.tsx");
const HISTORY_PAGE = APP("app/[locale]/dashboard/company/history/page.tsx");
const PERSON_PAGE = APP("app/[locale]/dashboard/company/people/[personId]/page.tsx");
const ACCESS = APP("lib/organization-evidence/history-read-access.ts");

describe("a history read grant opens exactly two pages", () => {
  it("only the company history and one person's page", () => {
    expect(isHistoryGrantPath("/dashboard/company/history")).toBe(true);
    expect(isHistoryGrantPath("/dashboard/company/history/")).toBe(true);
    expect(isHistoryGrantPath("/dashboard/company/people/abc-123")).toBe(true);
    for (const p of [
      "/dashboard/company",
      "/dashboard/company/people",
      "/dashboard/company/people/abc/edit",
      "/dashboard/company/history/import",
      "/dashboard/company/settings",
      "/dashboard/hours",
      "/dashboard",
      "/dashboard/admin",
      "",
      null,
    ]) {
      expect(isHistoryGrantPath(p as string), String(p)).toBe(false);
    }
  });

  it("the layout admits a grant only inside the company refusal arm, only on those paths, only with a live grant", () => {
    expect(LAYOUT).toMatch(
      /const historyGrantPage =\s*companyMembershipArm && isHistoryGrantPath\(gatedPath\) && \(await hasLiveHistoryReadGrant\(\)\);/,
    );
    expect(LAYOUT).toMatch(
      /if \(companyMembershipArm && requirement && !workspaceOpensCompanySpace\(workspace\) && !historyGrantPage\)/,
    );
    // No other refusal (admin, worker, buyer) consults the grant.
    expect((LAYOUT.match(/hasLiveHistoryReadGrant\(/g) ?? []).length).toBe(1);
  });

  it("the page gate: company space first, then a live grant, else the unchanged redirect", () => {
    const body = ACCESS.slice(ACCESS.indexOf("export async function requireCompanyOrHistoryGrant"));
    const full = body.indexOf('return "full";');
    const grant = body.indexOf('if (await hasLiveHistoryReadGrant()) return "grant";');
    const fallback = body.indexOf('await requireRoleOrRedirect(locale, "company");');
    expect(full).toBeGreaterThan(-1);
    expect(grant).toBeGreaterThan(full);
    expect(fallback).toBeGreaterThan(grant);
    expect(ACCESS).toMatch(/rpc\("my_history_read_grants_v1"\)/);
    expect(ACCESS).not.toMatch(/createAdminClient|service_role|SUPABASE_SERVICE/i);
  });

  it("only these two pages use the grant gate", () => {
    const hits = execFileSync("git", ["grep", "-l", "-F", "await requireCompanyOrHistoryGrant(", "--", "apps/web/app"], {
      cwd: ROOT,
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .sort();
    expect(hits).toEqual(
      [
        "apps/web/app/[locale]/dashboard/company/history/page.tsx",
        "apps/web/app/[locale]/dashboard/company/people/[personId]/page.tsx",
      ].sort(),
    );
  });

  it("the history page renders no write control for a grant", () => {
    const grantBranch = HISTORY_PAGE.slice(
      HISTORY_PAGE.indexOf('if (access === "grant") {'),
      HISTORY_PAGE.indexOf('data-testid="company-history">'),
    );
    expect(grantBranch).toContain('data-access="read-grant"');
    expect(grantBranch).toContain("<CompanyWorkHistory");
    for (const write of [
      "EvidenceImportSection",
      "EvidenceImportSessions",
      "HistoryDuplicateReview",
      "HistoryQualitySection",
      "HistoricalPhotoImport",
      "PerformingCompanyPanel",
      "/dashboard/hours",
    ]) {
      expect(grantBranch, write).not.toContain(write);
    }
  });

  it("the person page hides the profile link, photos and documents for a grant and keeps ?org=", () => {
    expect(PERSON_PAGE).toContain('const readGrant = access === "grant";');
    expect(PERSON_PAGE).toContain("loadCompanyPerson(locale, personId, org)");
    expect(PERSON_PAGE).toMatch(/person\.linkedWorkerId && !readGrant \?/);
    expect(PERSON_PAGE).toMatch(/\{readGrant \? null : \(\s*<EvidenceMediaStrip/);
    expect(PERSON_PAGE).toMatch(/\{readGrant \? null : person\.linkedWorkerId \? \(\s*<LinkedDocuments/);
  });
});
