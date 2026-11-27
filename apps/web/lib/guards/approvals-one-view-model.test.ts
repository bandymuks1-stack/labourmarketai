import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WAITING FOR APPROVAL: ONE VIEW MODEL, ONE COUNT (duplication audit ORG-6,
 * docs/audits/DUPLICATION_AUDIT.md). The company home's approvals card counted
 * with the active-organization count while the today view counted the queue
 * rows of the same organization, so the two could name different numbers for
 * the same entries. Both now show `loadOrganizationApprovals`, which builds the
 * one `todayViewApprovals` model.
 */
const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const cardOf = (src: string) => src.slice(src.indexOf("export async function OrganizationApprovalsCard"));

describe("the approvals cards share one view model", () => {
  it("the loader builds the one model, and the today view reads it", () => {
    const src = read("lib/company/organization-today-view.ts");
    expect(src).toMatch(/export async function loadOrganizationApprovals\(/);
    expect(src).toMatch(/approvals: todayViewApprovals\(\{/);
    expect(src).toMatch(/loadOrganizationApprovals\(\{ organizationId, exceptions: true \}\)/);
    expect(src.match(/todayViewApprovals\(/g)).toHaveLength(1);
  });

  it("the home card reads the same loader and counts nothing of its own", () => {
    const card = cardOf(read("components/app/arena/confirm-pulse.tsx"));
    expect(card).toMatch(/loadOrganizationApprovals\(\{ organizationId: context\.activeOrganizationId, exceptions: false \}\)/);
    expect(card).not.toMatch(/countReviewablePendingEntries|countReviewableEntriesEverywhere|fetchQuickReviewQueue|organizationApprovalsView\(/);
    expect(card).toMatch(/t\("title", \{ n: waiting \}\)/);
  });
});
