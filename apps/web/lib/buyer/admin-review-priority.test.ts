import { describe, expect, it } from "vitest";

import {
  adminReviewPriorityOrder,
  computeAdminReviewPriority,
  type AdminReviewPriorityStatus,
} from "./admin-review-priority";

/**
 * Admin manual-review priority — deterministic logic guard (PR B).
 * Pins the full classification so the admin triage view cannot drift.
 */

const USEFUL = "Reikia 3 plytelių klojėjų vonios remontui Vilniuje."; // > 20 chars

describe("computeAdminReviewPriority", () => {
  const cases: ReadonlyArray<{
    name: string;
    description: string | null;
    attachmentCount: number;
    status: string;
    expected: AdminReviewPriorityStatus;
  }> = [
    {
      name: "needs_followup always → manual_review_needed",
      description: USEFUL,
      attachmentCount: 2,
      status: "needs_followup",
      expected: "manual_review_needed",
    },
    {
      name: "no files → missing_files",
      description: USEFUL,
      attachmentCount: 0,
      status: "submitted",
      expected: "missing_files",
    },
    {
      name: "files but thin description → missing_description",
      description: "remontas",
      attachmentCount: 1,
      status: "submitted",
      expected: "missing_description",
    },
    {
      name: "files + useful description → review_ready",
      description: USEFUL,
      attachmentCount: 1,
      status: "submitted",
      expected: "review_ready",
    },
    {
      name: "no files wins over thin description when both missing",
      description: null,
      attachmentCount: 0,
      status: "draft",
      expected: "missing_files",
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const r = computeAdminReviewPriority({
        description: c.description,
        attachmentCount: c.attachmentCount,
        status: c.status,
      });
      expect(r.status).toBe(c.expected);
      expect(r.order).toBe(adminReviewPriorityOrder(c.expected));
    });
  }

  it("review_ready sorts above the waiting states", () => {
    expect(adminReviewPriorityOrder("review_ready")).toBeLessThan(
      adminReviewPriorityOrder("missing_files"),
    );
    expect(adminReviewPriorityOrder("manual_review_needed")).toBeLessThan(
      adminReviewPriorityOrder("missing_description"),
    );
  });

  it("non-finite attachment count is treated as zero files", () => {
    const r = computeAdminReviewPriority({
      description: USEFUL,
      attachmentCount: Number.NaN,
      status: "submitted",
    });
    expect(r.hasFiles).toBe(false);
    expect(r.status).toBe("missing_files");
  });
});
