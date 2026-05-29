import { describe, expect, it } from "vitest";

import { computeJournalReviewReadiness } from "./review-readiness";

/**
 * Journal review-readiness guard (Step 7). Pins the conservative gate:
 * nothing is reviewable unless the reviewer truly has can_review.
 */

describe("computeJournalReviewReadiness", () => {
  it("not_enabled when reviewer cannot review (can_view)", () => {
    expect(
      computeJournalReviewReadiness({
        reviewCapability: "can_view",
        entryHasConfirmation: false,
        entryHasUsefulText: true,
      }),
    ).toBe("not_enabled");
  });

  it("not_enabled when reviewer capability is not_enabled (e.g. foreman)", () => {
    expect(
      computeJournalReviewReadiness({
        reviewCapability: "not_enabled",
        entryHasConfirmation: false,
        entryHasUsefulText: true,
      }),
    ).toBe("not_enabled");
  });

  it("reviewed when can_review and a confirmation exists", () => {
    expect(
      computeJournalReviewReadiness({
        reviewCapability: "can_review",
        entryHasConfirmation: true,
        entryHasUsefulText: true,
      }),
    ).toBe("reviewed");
  });

  it("missing_details when can_review, unconfirmed, no useful text", () => {
    expect(
      computeJournalReviewReadiness({
        reviewCapability: "can_review",
        entryHasConfirmation: false,
        entryHasUsefulText: false,
      }),
    ).toBe("missing_details");
  });

  it("needs_review when can_review, unconfirmed, useful text present", () => {
    expect(
      computeJournalReviewReadiness({
        reviewCapability: "can_review",
        entryHasConfirmation: false,
        entryHasUsefulText: true,
      }),
    ).toBe("needs_review");
  });

  it("confirmation takes priority over missing text", () => {
    expect(
      computeJournalReviewReadiness({
        reviewCapability: "can_review",
        entryHasConfirmation: true,
        entryHasUsefulText: false,
      }),
    ).toBe("reviewed");
  });
});
