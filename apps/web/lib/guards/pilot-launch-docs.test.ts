/**
 * Pinning tests for the pilot-launch sprint v2 documentation set.
 *
 * Encodes the doctrine that the sprint promised + ships docs land at
 * known paths so future structural changes (rename, move) trigger
 * explicit updates instead of silent drift.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(process.cwd(), "..", "..");
function r(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf-8");
}
function exists(rel: string): boolean {
  return existsSync(join(REPO_ROOT, rel));
}

describe("Phase 0 — baseline doc", () => {
  it("docs/owner/pilot_launch_baseline_v1.md exists", () => {
    expect(exists("docs/owner/pilot_launch_baseline_v1.md")).toBe(true);
  });
});

describe("Phase 1 — tester ops docs", () => {
  it.each([
    "docs/pilot/TESTER_START_HERE_LT.md",
    "docs/pilot/TESTER_START_HERE_EN.md",
    "docs/pilot/OWNER_TEST_SESSION_SCRIPT_LT.md",
    "docs/pilot/PILOT_FEEDBACK_REVIEW_PROCESS_LT.md",
  ])("%s exists", (path) => {
    expect(exists(path)).toBe(true);
  });

  it("LT tester doc mentions the floating feedback widget", () => {
    expect(r("docs/pilot/TESTER_START_HERE_LT.md")).toMatch(
      /Pranešti apie tekstą/,
    );
  });

  it("EN tester doc mentions the production URL", () => {
    expect(r("docs/pilot/TESTER_START_HERE_EN.md")).toMatch(
      /app\.labourmarket\.ai/,
    );
  });
});

describe("Phase 2 — policy docs", () => {
  it.each([
    "docs/policies/account-and-role-model-v1.md",
    "docs/policies/organization-profile-creation-policy-v1.md",
    "docs/policies/pilot-terms-and-responsibility-v1.md",
    "docs/policies/risk-monitoring-and-fraud-response-v1.md",
    "docs/policies/journal-evidence-and-correction-policy-v1.md",
  ])("%s exists", (path) => {
    expect(exists(path)).toBe(true);
  });

  it("organisation policy covers multi-org / multi-country + 'no fake companies'", () => {
    const src = r("docs/policies/organization-profile-creation-policy-v1.md");
    expect(src).toMatch(/multi-org/i);
    expect(src).toMatch(/multi-country/i);
    expect(src).toMatch(/no fake companies/i);
  });

  it("pilot terms doc honestly enumerates what the platform does NOT commit to", () => {
    const src = r("docs/policies/pilot-terms-and-responsibility-v1.md");
    expect(src).toMatch(/does NOT commit/i);
    expect(src).toMatch(/Real-time notifications/i);
  });
});

describe("Phase 4 — sports-team model docs", () => {
  it.each([
    "docs/vision/company-as-sports-team-model-v1.md",
    "docs/audit/team-management-gap-audit-v1.md",
  ])("%s exists", (path) => {
    expect(exists(path)).toBe(true);
  });

  it("vision doc maps sports terms to product schema", () => {
    expect(r("docs/vision/company-as-sports-team-model-v1.md")).toMatch(
      /engagement_contexts/i,
    );
  });
});

describe("Phase 5 — visual design package", () => {
  it("docs/design/visual-upgrade-mission-control-v1.md exists", () => {
    expect(exists("docs/design/visual-upgrade-mission-control-v1.md")).toBe(true);
  });

  it("design doc lists 3–5 high-impact routes for visual upgrade", () => {
    const src = r("docs/design/visual-upgrade-mission-control-v1.md");
    expect(src).toMatch(/admin command center/i);
    expect(src).toMatch(/dashboard/i);
    expect(src).toMatch(/communication/i);
  });
});

describe("Phase 7 — organisation profile creation audit", () => {
  it("docs/audit/organization-profile-creation-gap-audit-v1.md exists", () => {
    expect(exists("docs/audit/organization-profile-creation-gap-audit-v1.md")).toBe(true);
  });
});
