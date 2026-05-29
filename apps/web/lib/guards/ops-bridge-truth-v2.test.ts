import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { computeJournalReviewReadiness } from "@/lib/journal/review-readiness";

/**
 * Ops-bridge truth guards v2 (12-step cycle Step 10). Locks the new
 * review-readiness + next-action surfaces against drift into fake
 * review/approval, label-based review, or external dependencies.
 */

const APP_ROOT = join(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}

const FORBIDDEN = [
  "patvirtinta",
  "automatiškai patvirtinta",
  "verified",
  "automatically approved",
  "ai matched",
  "ai suprato",
  "guaranteed",
  "best match",
];

describe("review-readiness helper stays pure + label-proof", () => {
  const src = read("lib/journal/review-readiness.ts");
  it("imports nothing external/AI/IO/clock", () => {
    expect(src).not.toMatch(/import\s+["']server-only["']/);
    for (const re of [
      /from\s+["']openai["']/i,
      /from\s+["']@anthropic/i,
      /from\s+["']tesseract/i,
      /from\s+["']stripe["']/i,
      /navigator\.geolocation/i,
      /Date\.now|new Date\(|Math\.random|fetch\(/,
    ]) {
      expect(re.test(src), `must not match ${re}`).toBe(false);
    }
  });

  it("never yields a reviewable state without explicit can_review", () => {
    for (const cap of ["can_view", "not_enabled"] as const) {
      expect(
        computeJournalReviewReadiness({
          reviewCapability: cap,
          entryHasConfirmation: false,
          entryHasUsefulText: true,
        }),
      ).toBe("not_enabled");
    }
  });

  it("can_review gates reviewed / needs_review / missing_details correctly", () => {
    expect(
      computeJournalReviewReadiness({
        reviewCapability: "can_review",
        entryHasConfirmation: true,
        entryHasUsefulText: true,
      }),
    ).toBe("reviewed");
    expect(
      computeJournalReviewReadiness({
        reviewCapability: "can_review",
        entryHasConfirmation: false,
        entryHasUsefulText: true,
      }),
    ).toBe("needs_review");
    expect(
      computeJournalReviewReadiness({
        reviewCapability: "can_review",
        entryHasConfirmation: false,
        entryHasUsefulText: false,
      }),
    ).toBe("missing_details");
  });
});

describe("worker panels still expose no fake review/approval controls", () => {
  for (const s of [
    "components/app/company-workers-section.tsx",
    "components/app/agency-workers-section.tsx",
  ]) {
    it(`${s} has no approve/reject/confirm wiring`, () => {
      const src = read(s);
      expect(src).not.toMatch(/confirm-actions|confirmEntry|rejectEntry/);
      expect(src).not.toMatch(/data-testid="[^"]*(approve|reject)[^"]*"/i);
    });
  }
});

describe("operations copy (role / setup / next-action) carries no fake claims", () => {
  for (const locale of ["lt", "en"] as const) {
    for (const role of ["company", "agency"] as const) {
      it(`${locale} ${role} operations copy is clean`, () => {
        const json = JSON.parse(read(`messages/${locale}.json`)) as Record<
          string,
          unknown
        >;
        const ops = (
          (
            (json.roleDashboards as Record<string, unknown>)[role] as Record<
              string,
              unknown
            >
          ).workers as Record<string, unknown>
        ).operations;
        const flat = JSON.stringify(ops).toLowerCase();
        for (const phrase of FORBIDDEN) {
          expect(
            flat.includes(phrase),
            `${locale}.${role}.operations must not contain "${phrase}"`,
          ).toBe(false);
        }
      });
    }
  }
});
