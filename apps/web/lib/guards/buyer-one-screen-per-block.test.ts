import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE BUYER WORKSPACE IS BLOCKS, NOT ONE LONG PAGE (owner decision 0034,
 * 2026-11-24). Measured on main: 4.4 screens at 390 px (docs/audits/
 * page-length-2026-11-24). Each block has its own address and nothing was
 * removed: requests (default), the new-request form, the profile, the notes.
 */
const PAGE = readFileSync(join(__dirname, "..", "..", "app/[locale]/dashboard/buyer/page.tsx"), "utf8");

describe("buyer workspace: one screen per block", () => {
  it("has the four blocks, each with its own ?tab= address", () => {
    expect(PAGE).toMatch(/const BUYER_TABS = \["requests", "new", "profile", "notes"\] as const/);
    expect(PAGE).toContain("`/dashboard/buyer?tab=${id}`");
    expect(PAGE).toContain('data-testid="buyer-tabs"');
  });

  it("an unknown tab falls back to the requests block", () => {
    expect(PAGE).toMatch(/BUYER_TABS\.includes\(asked as BuyerTab\) \? \(asked as BuyerTab\) : "requests"/);
  });

  it("the form, the profile and the notes are each drawn only on their own block", () => {
    expect(PAGE).toMatch(/view=\{tab === "new" \? "form" : "list"\}/);
    expect(PAGE).toMatch(/\{tab === "profile" \? \(\s*<>\s*<CompanyActionNextActions/);
    expect(PAGE).toMatch(/\{tab === "notes" \? \(\s*<section[\s\S]{0,120}data-testid="buyer-dashboard-first-action"/);
  });

  it("nothing was removed: every block's content is still on the page", () => {
    for (const id of [
      "buyer-dashboard-customer-state",
      "buyer-dashboard-pilot-disclaimer",
      "buyer-dashboard-find-provider",
      "buyer-dashboard-first-action",
      "buyer-dashboard-profile-link",
    ]) {
      expect(PAGE, id).toContain(`data-testid="${id}"`);
    }
    expect(PAGE).toContain("<OrgTier1Warning />");
    expect(PAGE).toContain("<DemandDraftForm");
  });
});
