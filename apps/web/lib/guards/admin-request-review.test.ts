import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Source-level guards for the admin manual-review clarity work (PR B).
 *
 *   1. The priority helper is PURE (no server-only, no clock/network).
 *   2. The admin listing is READ-ONLY (no mutation, no AI/OCR/extraction).
 *   3. The admin dashboard mounts the review section.
 *   4. LT + EN copy is present and honest (no fake AI/verification).
 */

const APP_ROOT = join(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}

const FORBIDDEN = [
  "ai suprato",
  "automatiškai patikrinta",
  "garantuotai tinkamiausias",
  "patvirtinta",
  "verified",
  "automatically verified",
  "ai understood",
  "best match",
];

describe("Guard: admin-review-priority helper is pure", () => {
  const src = read("lib/buyer/admin-review-priority.ts");
  it("is NOT server-only", () => {
    expect(src).not.toMatch(/import\s+["']server-only["']/);
  });
  it("has no clock / network / randomness", () => {
    expect(src).not.toMatch(/Date\.now|new Date\(|Math\.random|fetch\(/);
  });
  it("exports the four admin-review statuses", () => {
    for (const s of [
      "review_ready",
      "manual_review_needed",
      "missing_description",
      "missing_files",
    ]) {
      expect(src).toContain(`"${s}"`);
    }
  });
});

describe("Guard: admin request-review listing is read-only", () => {
  const src = read("lib/buyer/admin-request-review.ts");

  it("is server-only", () => {
    expect(src).toMatch(/import\s+["']server-only["']/);
  });

  it("performs no mutation and no fake intelligence", () => {
    // Strip comments so the doctrine notes don't false-trigger.
    const codeOnly = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    expect(codeOnly).not.toMatch(/\.insert\(/);
    expect(codeOnly).not.toMatch(/\.update\(/);
    expect(codeOnly).not.toMatch(/\.delete\(/);
    expect(codeOnly).not.toMatch(/\.upsert\(/);
    expect(codeOnly).not.toMatch(/\.rpc\(/);
    // No extraction / analysis mutation, no signed-url minting here.
    expect(codeOnly).not.toMatch(/extracted_text/);
    expect(codeOnly).not.toMatch(/createSignedUrl/);
    expect(codeOnly).not.toMatch(/analysis_status/);
  });

  it("derives priority from the deterministic helper", () => {
    expect(src).toMatch(/computeAdminReviewPriority\(/);
  });
});

describe("Guard: admin dashboard mounts the review section", () => {
  const src = read("app/[locale]/dashboard/admin/page.tsx");
  it("imports + renders the read-only review listing", () => {
    expect(src).toMatch(
      /from\s+["']@\/lib\/buyer\/admin-request-review["']/,
    );
    expect(src).toMatch(/listRequestsForAdminReview\(/);
    expect(src).toMatch(/data-testid="admin-request-review"/);
  });
  it("is still gated by requireSuperadmin", () => {
    expect(src).toMatch(/requireSuperadmin\(\s*locale\s*\)/);
  });
});

describe("Guard: admin requestReview copy is present + honest (LT + EN)", () => {
  for (const locale of ["lt", "en"] as const) {
    it(`${locale}.json admin.requestReview keys present + no fake claims`, () => {
      const json = JSON.parse(read(`messages/${locale}.json`)) as Record<
        string,
        unknown
      >;
      const rr = (json.admin as Record<string, unknown>)
        .requestReview as Record<string, unknown>;
      expect(rr, `${locale} admin.requestReview missing`).toBeTruthy();
      for (const key of ["title", "help", "empty", "migrationBlocker"]) {
        expect(rr[key], `${locale} admin.requestReview.${key}`).toBeTruthy();
      }
      const priority = rr.priority as Record<string, string>;
      const action = rr.action as Record<string, string>;
      for (const s of [
        "review_ready",
        "manual_review_needed",
        "missing_description",
        "missing_files",
      ]) {
        expect(priority[s], `${locale} priority.${s}`).toBeTruthy();
        expect(action[s], `${locale} action.${s}`).toBeTruthy();
      }
      const flat = JSON.stringify(rr).toLowerCase();
      for (const phrase of FORBIDDEN) {
        expect(
          flat.includes(phrase),
          `${locale} admin.requestReview must not contain "${phrase}"`,
        ).toBe(false);
      }
    });
  }
});
