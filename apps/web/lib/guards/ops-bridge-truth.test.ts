import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { computeEmploymentJournalContext } from "@/lib/operations/employment-journal-context";

/**
 * Ops-bridge truth guards (bridge cycle PR F). Lock the employment↔journal
 * bridge against drift into fake coordination, fake review, or external
 * dependencies. Behavioural + source-level.
 */

const APP_ROOT = join(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}

describe("employment-journal context helper is pure + conservative", () => {
  const src = read("lib/operations/employment-journal-context.ts");

  it("imports nothing external (no AI / GPS / payment / IO / clock)", () => {
    expect(src).not.toMatch(/import\s+["']server-only["']/);
    for (const re of [
      /from\s+["']openai["']/i,
      /from\s+["']@anthropic/i,
      /from\s+["']tesseract/i,
      /from\s+["']stripe["']/i,
      /from\s+["']twilio["']/i,
      /navigator\.geolocation/i,
      /Date\.now|new Date\(|Math\.random|fetch\(/,
    ]) {
      expect(re.test(src), `must not match ${re}`).toBe(false);
    }
    // Only allowed import is the role-capability map.
    expect(src).toMatch(/from\s+["']\.\/role-capabilities["']/);
  });

  it("reviewer roles are admins only — never foreman / project_manager", () => {
    // Capture just the REVIEWER_ROLES Set literal body.
    const m = src.match(/REVIEWER_ROLES[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/);
    expect(m, "REVIEWER_ROLES Set not found").toBeTruthy();
    const block = m![1];
    expect(block).toContain("company_admin");
    expect(block).toContain("agency_admin");
    expect(block).not.toContain("foreman");
    expect(block).not.toContain("project_manager");
  });
});

describe("bridge truth — behavioural invariants", () => {
  it("foreman / project_manager NEVER get review, even with the flag on", () => {
    for (const role of ["foreman", "project_manager"]) {
      const r = computeEmploymentJournalContext({
        relationship: "company",
        operationsRole: role,
        journalReviewEnabled: true,
      });
      expect(r.reviewCapability, role).toBe("not_enabled");
      expect(r.coordinationStatus, role).toBe("not_enabled");
    }
  });

  it("review needs an enabled reviewer role AND the explicit flag", () => {
    expect(
      computeEmploymentJournalContext({
        relationship: "company",
        operationsRole: "company_admin",
        journalReviewEnabled: false,
      }).reviewCapability,
    ).toBe("can_view");
    expect(
      computeEmploymentJournalContext({
        relationship: "company",
        operationsRole: "company_admin",
        journalReviewEnabled: true,
      }).reviewCapability,
    ).toBe("can_review");
  });

  it("no relationship → everything not_enabled", () => {
    const r = computeEmploymentJournalContext({
      relationship: null,
      operationsRole: "company_admin",
      journalReviewEnabled: true,
    });
    expect(r.coordinationStatus).toBe("not_enabled");
  });
});

describe("worker panels expose NO fake review/approval controls", () => {
  for (const s of [
    "components/app/company-workers-section.tsx",
    "components/app/agency-workers-section.tsx",
  ]) {
    it(`${s} has no approve/reject/confirm review UI`, () => {
      const src = read(s);
      // No wiring to the journal confirm/reject server actions.
      expect(src).not.toMatch(/confirm-actions|confirmEntry|rejectEntry/);
      expect(src).not.toMatch(/data-testid="[^"]*(approve|reject)[^"]*"/i);
    });
  }
});
