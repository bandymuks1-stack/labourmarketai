/**
 * Booking state machine — behavioural unit tests (Step 4B, inert).
 */
import { describe, expect, it } from "vitest";
import {
  canTransitionBooking,
  nextBookingStatuses,
  isTerminalBooking,
  countOwnerResponsesSince,
  BOOKING_TERMINAL,
} from "./booking-state";

describe("booking transitions — only a worker may accept", () => {
  it("worker can accept or decline a proposal", () => {
    expect(canTransitionBooking("proposed", "accepted", "worker")).toBe(true);
    expect(canTransitionBooking("proposed", "declined", "worker")).toBe(true);
  });

  it("company CANNOT accept on the worker's behalf (no fake acceptance)", () => {
    expect(canTransitionBooking("proposed", "accepted", "company")).toBe(false);
    expect(canTransitionBooking("proposed", "accepted", "system")).toBe(false);
  });

  it("company may withdraw; system may expire", () => {
    expect(canTransitionBooking("proposed", "withdrawn", "company")).toBe(true);
    expect(canTransitionBooking("proposed", "expired", "system")).toBe(true);
  });

  it("terminal states allow no further transition", () => {
    for (const s of BOOKING_TERMINAL) {
      expect(isTerminalBooking(s)).toBe(true);
      expect(nextBookingStatuses(s, "worker")).toEqual([]);
      expect(nextBookingStatuses(s, "company")).toEqual([]);
    }
  });

  it("nextBookingStatuses is actor-scoped", () => {
    expect(nextBookingStatuses("proposed", "worker").sort()).toEqual(["accepted", "declined"]);
    expect(nextBookingStatuses("proposed", "company")).toEqual(["withdrawn"]);
    expect(nextBookingStatuses("proposed", "system")).toEqual(["expired"]);
  });
});

describe("countOwnerResponsesSince — only real worker responses count (no fake badge)", () => {
  const seen = "2026-07-05T00:00:00Z";

  it("withdrawn / expired / proposed rows never count — they are not worker responses", () => {
    expect(
      countOwnerResponsesSince(
        [
          { status: "withdrawn", isOwner: true, updatedAt: "2026-07-06T00:00:00Z" },
          { status: "expired", isOwner: true, updatedAt: "2026-07-06T00:00:00Z" },
          { status: "proposed", isOwner: true, updatedAt: "2026-07-06T00:00:00Z" },
        ],
        seen,
      ),
    ).toBe(0);
  });

  it("a row with an unparseable timestamp is ignored, never fabricated into a count", () => {
    expect(
      countOwnerResponsesSince(
        [{ status: "accepted", isOwner: true, updatedAt: "not-a-date" }],
        seen,
      ),
    ).toBe(0);
  });

  it("a response stamped exactly at seenAt is not 'new' (strictly after)", () => {
    expect(
      countOwnerResponsesSince([{ status: "accepted", isOwner: true, updatedAt: seen }], seen),
    ).toBe(0);
  });

  it("counts only the caller's OWN proposals the worker answered after seenAt", () => {
    expect(
      countOwnerResponsesSince(
        [
          { status: "accepted", isOwner: true, updatedAt: "2026-07-06T00:00:00Z" },
          { status: "declined", isOwner: false, updatedAt: "2026-07-06T00:00:00Z" },
        ],
        seen,
      ),
    ).toBe(1);
  });
});
