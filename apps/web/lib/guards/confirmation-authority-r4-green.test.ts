import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * R-4, GREEN half (2026-09-19 completion window).
 *
 * THE DEFECT: `reviewable_journal_entry_ids()` admits anyone who passes
 * `manages_organization()` — which includes an active `company_memberships`
 * row with a managing role — so a governance member SEES the review queue.
 * `review_journal_entry()` then requires an active manager / owner /
 * external_manager ENGAGEMENT and refuses them with `no_reviewer_engagement`.
 * Production 2026-09-19: two such managers exist. The RED half (widening the
 * SQL reviewer check) stays owner-gated. What CAN be true without SQL:
 *   1. the owner sees WHO can see the queue but cannot confirm, on the People
 *      page, and grants the reviewer engagement through the EXISTING owner-only
 *      `grant_org_manager` RPC — the same authority the confirm path reads;
 *   2. the refusal names its real reason (its own sentence, not "not
 *      allowed"), and says who can change it;
 *   3. the read is RLS-scoped and bounded; no new write path, no new model.
 */
const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

const model = read("lib/operations/org-members.ts");
const panel = read("components/app/org-members-panel.tsx");
const membership = read("lib/operations/org-membership.ts");
const page = read("app/[locale]/dashboard/company/people/page.tsx");
const inbox = read("components/app/journal-inbox-entry.tsx");
const quick = read("components/app/quick-confirm-card.tsx");
const labels = read("lib/company/company-section-labels.ts");

describe("R-4 GREEN — the read: governance members without a reviewer engagement", () => {
  it("compares the membership roles manages_organization() accepts against the engagement slugs review_journal_entry() accepts", () => {
    expect(model).toMatch(/const REVIEWER_SLUGS[^;]*new Set\(\["manager", "owner", "external_manager"\]\)/);
    expect(model).toMatch(/const GOVERNANCE_ROLES = \["owner", "admin", "manager", "external_manager"\] as const/);
    expect(model).toMatch(/\.from\("company_memberships"\)[^;]*\.eq\("status", "active"\)[^;]*\.in\("role", \[\.\.\.GOVERNANCE_ROLES\]\)[^;]*\.limit\(100\)/);
    expect(model).toMatch(/if \(!profileId \|\| reviewerProfileIds\.has\(profileId\)\) return null;/);
  });

  it("never lists the registered owner and only offers the control to the registered owner (the RPC's own rule)", () => {
    expect(model).toMatch(/profileId === org\.ownerProfileId\) return null;/);
    expect(model).toMatch(/viewerIsRegisteredOwner =\s*org\.ownerProfileId !== null && user\?\.id === org\.ownerProfileId/);
    expect(panel).toMatch(/viewerIsRegisteredOwner && governanceWithoutReviewer\.length > 0/);
  });

  it("is a read only — the model writes nothing and calls no RPC", () => {
    expect(model).not.toMatch(/\.rpc\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  });
});

describe("R-4 GREEN — the grant goes through the EXISTING owner-only RPC", () => {
  it("the panel calls grantOrgManager, which calls grant_org_manager and nothing else", () => {
    expect(panel).toMatch(/grantOrgManager\(orgId, profileId, null\)/);
    expect(panel).toMatch(/data-testid=\{`grant-authority-\$\{g\.profileId\}`\}/);
    expect(membership).toMatch(/export async function grantOrgManager\(/);
    expect(membership).toMatch(/rpc\(supabase, "grant_org_manager", \{/);
    // No direct write on engagement_contexts anywhere in the membership layer.
    expect(membership).not.toMatch(/\.from\("engagement_contexts"\)[^;]*\.(insert|update|upsert|delete)\(/);
  });

  it("the People page passes both new facts to the panel", () => {
    expect(page).toMatch(/viewerIsRegisteredOwner=\{orgMembers\.viewerIsRegisteredOwner\}/);
    expect(page).toMatch(/governanceWithoutReviewer=\{orgMembers\.governanceWithoutReviewer\}/);
  });
});

describe("R-4 GREEN — the refusal names its real reason", () => {
  it("no_reviewer_engagement is its own sentence in both review surfaces, distinct from not_authorized", () => {
    for (const src of [inbox, quick]) {
      expect(src).toMatch(/case "no_reviewer_engagement":\s*\n\s*return[^;]*inbox\.result\.noReviewerEngagement/);
      expect(src).not.toMatch(/case "not_authorized":\s*\n\s*case "no_reviewer_engagement":/);
    }
  });

  it("copy exists in every active locale: panel labels, membership role names and the refusal", () => {
    expect(labels).toMatch(/authorityTitle: tOrg\("authority\.title"\)/);
    expect(labels).toMatch(/external_manager: tOrg\("roles\.external_manager"\)/);
    for (const loc of ["en", "lt", "ru", "nl", "de"]) {
      const main = JSON.parse(read(`messages/${loc}.json`)).orgMembers;
      for (const k of ["title", "intro", "grant", "granted"]) {
        expect(typeof main.authority[k], `${loc}.authority.${k}`).toBe("string");
        expect(main.authority[k].trim().length, `${loc}.authority.${k}`).toBeGreaterThan(0);
      }
      for (const r of ["admin", "external_manager"]) {
        expect(typeof main.roles[r], `${loc}.roles.${r}`).toBe("string");
      }
      const journal = JSON.parse(read(`messages/${loc}/journal.json`)).inbox.result;
      expect(typeof journal.noReviewerEngagement, `${loc}.noReviewerEngagement`).toBe("string");
      expect(journal.noReviewerEngagement, `${loc}`).not.toEqual(journal.notAuthorized);
    }
  });
});
