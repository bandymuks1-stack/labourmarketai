import { describe, expect, it } from "vitest";

import { computeRequestTimeline } from "./request-timeline";

/**
 * Buyer request derived-timeline guard (PR G). Pins the deterministic
 * event derivation from existing timestamps + status only.
 */

describe("computeRequestTimeline", () => {
  it("always starts with request_created at the request time", () => {
    const t = computeRequestTimeline({
      createdAt: "2026-05-01T10:00:00Z",
      status: "draft",
      attachments: [],
    });
    expect(t).toHaveLength(1);
    expect(t[0]).toEqual({ key: "request_created", at: "2026-05-01T10:00:00Z" });
  });

  it("adds file_attached (with count + latest time) and the not-enabled note", () => {
    const t = computeRequestTimeline({
      createdAt: "2026-05-01T10:00:00Z",
      status: "draft",
      attachments: [
        { createdAt: "2026-05-02T09:00:00Z" },
        { createdAt: "2026-05-03T08:00:00Z" },
      ],
    });
    const fileEvent = t.find((e) => e.key === "file_attached");
    expect(fileEvent).toEqual({
      key: "file_attached",
      at: "2026-05-03T08:00:00Z",
      count: 2,
    });
    expect(t.some((e) => e.key === "automatic_reading_not_enabled")).toBe(true);
  });

  it("adds manual_review_pending only for submitted/in_review/needs_followup", () => {
    for (const status of ["submitted", "in_review", "needs_followup"]) {
      const t = computeRequestTimeline({
        createdAt: "2026-05-01T10:00:00Z",
        status,
        attachments: [],
      });
      expect(
        t.some((e) => e.key === "manual_review_pending"),
        `pending expected for ${status}`,
      ).toBe(true);
    }
    for (const status of ["draft", "approved", "closed"]) {
      const t = computeRequestTimeline({
        createdAt: "2026-05-01T10:00:00Z",
        status,
        attachments: [],
      });
      expect(
        t.some((e) => e.key === "manual_review_pending"),
        `pending NOT expected for ${status}`,
      ).toBe(false);
    }
  });

  it("full workflow order is deterministic", () => {
    const t = computeRequestTimeline({
      createdAt: "2026-05-01T10:00:00Z",
      status: "submitted",
      attachments: [{ createdAt: "2026-05-02T09:00:00Z" }],
    });
    expect(t.map((e) => e.key)).toEqual([
      "request_created",
      "file_attached",
      "automatic_reading_not_enabled",
      "manual_review_pending",
    ]);
  });

  it("no files → no file/not-enabled events", () => {
    const t = computeRequestTimeline({
      createdAt: "2026-05-01T10:00:00Z",
      status: "submitted",
      attachments: [],
    });
    expect(t.some((e) => e.key === "file_attached")).toBe(false);
    expect(t.some((e) => e.key === "automatic_reading_not_enabled")).toBe(false);
  });
});
