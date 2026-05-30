import { describe, expect, it } from "vitest";

import {
  actionToDecision,
  deriveReviewResult,
  isReviewDecision,
  REVIEW_DECISIONS,
  type ConfirmationRow,
} from "./review-status";

/**
 * Pure truth-table for the manager-review evidence result derivation (slice
 * manager-review-evidence-result-v1). Proves the visible result is honest:
 *   - no evidence row → submitted;
 *   - an approval / rejection / changes-request maps to the right result;
 *   - the legacy confirmation_scope.action (0013) still maps correctly;
 *   - latest decision wins (a manager may approve after requesting changes).
 */

function row(scope: unknown, createdAt?: string): ConfirmationRow {
  return { confirmation_scope: scope, created_at: createdAt ?? null };
}

describe("deriveReviewResult", () => {
  it("submitted when there is no evidence row", () => {
    expect(deriveReviewResult(null)).toBe("submitted");
    expect(deriveReviewResult([])).toBe("submitted");
  });

  it("maps an explicit 0034 decision", () => {
    expect(deriveReviewResult([row({ decision: "approved", action: "confirm" })])).toBe(
      "approved",
    );
    expect(deriveReviewResult([row({ decision: "rejected", action: "reject" })])).toBe(
      "rejected",
    );
    expect(
      deriveReviewResult([
        row({ decision: "changes_requested", action: "request_changes" }),
      ]),
    ).toBe("changes_requested");
  });

  it("maps the legacy 0013 action when no decision is present", () => {
    expect(deriveReviewResult([row({ action: "confirm" })])).toBe("approved");
    expect(deriveReviewResult([row({ action: "reject" })])).toBe("rejected");
    expect(deriveReviewResult([row({ action: "request_changes" })])).toBe(
      "changes_requested",
    );
  });

  it("latest decision wins by created_at (approve after request-changes)", () => {
    const result = deriveReviewResult([
      row({ decision: "changes_requested" }, "2026-05-30T10:00:00Z"),
      row({ decision: "approved" }, "2026-05-30T12:00:00Z"),
    ]);
    expect(result).toBe("approved");
  });

  it("latest decision wins even when rows arrive out of order", () => {
    const result = deriveReviewResult([
      row({ decision: "approved" }, "2026-05-30T12:00:00Z"),
      row({ decision: "rejected" }, "2026-05-30T13:00:00Z"),
    ]);
    expect(result).toBe("rejected");
  });

  it("falls back to insertion order when created_at is absent", () => {
    expect(
      deriveReviewResult([
        row({ decision: "rejected" }),
        row({ decision: "approved" }),
      ]),
    ).toBe("approved");
  });

  it("ignores rows with an unrecognised scope", () => {
    expect(
      deriveReviewResult([row({ action: "noise" }), row({ decision: "approved" })]),
    ).toBe("approved");
    expect(deriveReviewResult([row(null)])).toBe("submitted");
  });
});

describe("decision helpers", () => {
  it("isReviewDecision accepts only the three decisions", () => {
    for (const d of REVIEW_DECISIONS) expect(isReviewDecision(d)).toBe(true);
    for (const bad of ["confirm", "approve", "", null, undefined, 1])
      expect(isReviewDecision(bad)).toBe(false);
  });

  it("actionToDecision maps the legacy actions", () => {
    expect(actionToDecision("confirm")).toBe("approved");
    expect(actionToDecision("reject")).toBe("rejected");
    expect(actionToDecision("request_changes")).toBe("changes_requested");
    expect(actionToDecision("other")).toBe(null);
  });
});
