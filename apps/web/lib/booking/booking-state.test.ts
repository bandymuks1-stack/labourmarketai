/**
 * Booking state machine — behavioural unit tests (Step 4B, inert).
 */
import { describe, expect, it } from "vitest";
import {
  canTransitionBooking,
  nextBookingStatuses,
  isTerminalBooking,
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
