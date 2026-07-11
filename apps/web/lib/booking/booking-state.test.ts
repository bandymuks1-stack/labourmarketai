/**
 * Booking state machine — behavioural unit tests (Step 4B, inert).
 */
import { describe, expect, it } from "vitest";
import {
  canTransitionBooking,
  nextBookingStatuses,
  isTerminalBooking,
  countOwnerResponsesSince,
  deriveBookingDisplayState,
  BOOKING_TERMINAL,
  STALE_AFTER_DAYS,
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

describe("deriveBookingDisplayState — display-only, never a fake 'expired'", () => {
  const now = "2026-07-11T12:00:00Z";
  const daysBefore = (iso: string, days: number): string =>
    new Date(Date.parse(iso) - days * 24 * 60 * 60 * 1000).toISOString();

  it("a fresh proposed row awaits a response", () => {
    expect(
      deriveBookingDisplayState(
        { status: "proposed", createdAt: daysBefore(now, 1) },
        now,
      ),
    ).toBe("awaiting_response");
    // Just under the threshold is still "awaiting".
    expect(
      deriveBookingDisplayState(
        { status: "proposed", createdAt: daysBefore(now, STALE_AFTER_DAYS - 1) },
        now,
      ),
    ).toBe("awaiting_response");
  });

  it("a proposed row unanswered for STALE_AFTER_DAYS+ days is stale — NOT 'expired'", () => {
    const state = deriveBookingDisplayState(
      { status: "proposed", createdAt: daysBefore(now, STALE_AFTER_DAYS + 7) },
      now,
    );
    expect(state).toBe("no_response_stale");
    // The DB truth stays 'proposed'; the display state never invents the
    // reserved (writer-less) 'expired' status.
    expect(state).not.toBe("expired");
  });

  it("boundary: exactly STALE_AFTER_DAYS days old is already stale (age >= threshold)", () => {
    expect(
      deriveBookingDisplayState(
        { status: "proposed", createdAt: daysBefore(now, STALE_AFTER_DAYS) },
        now,
      ),
    ).toBe("no_response_stale");
    // One millisecond younger than the threshold is still awaiting.
    const justUnder = new Date(
      Date.parse(now) - (STALE_AFTER_DAYS * 24 * 60 * 60 * 1000 - 1),
    ).toISOString();
    expect(
      deriveBookingDisplayState({ status: "proposed", createdAt: justUnder }, now),
    ).toBe("awaiting_response");
  });

  it("terminal statuses pass through unchanged (age is irrelevant)", () => {
    for (const s of BOOKING_TERMINAL) {
      expect(
        deriveBookingDisplayState(
          { status: s, createdAt: daysBefore(now, STALE_AFTER_DAYS + 30) },
          now,
        ),
      ).toBe(s);
    }
  });

  it("unparseable timestamps degrade to awaiting_response — staleness is never claimed without proof", () => {
    expect(
      deriveBookingDisplayState({ status: "proposed", createdAt: "not-a-date" }, now),
    ).toBe("awaiting_response");
    expect(
      deriveBookingDisplayState(
        { status: "proposed", createdAt: daysBefore(now, 30) },
        "not-a-date",
      ),
    ).toBe("awaiting_response");
  });

  it("the exported threshold is the contract's 14 days", () => {
    expect(STALE_AFTER_DAYS).toBe(14);
  });
});
