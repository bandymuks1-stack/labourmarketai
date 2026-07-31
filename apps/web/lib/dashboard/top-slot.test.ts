import { describe, expect, it } from "vitest";

import { decideTopSlot, type TopSlotSignals } from "./top-slot";

/**
 * Pins the audit-PR6 priority ladder for the dashboard top slot. If a future
 * change reshuffles what claims the above-the-fold card, this test forces the
 * conversation to happen in review, not in production.
 */

const NONE: TopSlotSignals = {
  acceptedOutgoing: 0,
  pendingIncomingServiceRequests: 0,
  pendingIncomingBookings: 0,
  bookingResponsesNew: 0,
  isFirstUse: false,
};

describe("decideTopSlot priority ladder", () => {
  it("nothing pending, settled user → no slot (work card leads)", () => {
    expect(decideTopSlot(NONE)).toBeNull();
  });

  it("first-use is the weakest slot", () => {
    expect(decideTopSlot({ ...NONE, isFirstUse: true })).toBe("new_user");
  });

  it("booking responses beat first-use", () => {
    expect(
      decideTopSlot({ ...NONE, bookingResponsesNew: 1, isFirstUse: true }),
    ).toBe("booking_response");
  });

  it("a pending incoming booking beats passive booking news", () => {
    expect(
      decideTopSlot({
        ...NONE,
        pendingIncomingBookings: 1,
        bookingResponsesNew: 3,
      }),
    ).toBe("incoming_booking");
  });

  it("an open incoming service request beats a booking proposal", () => {
    expect(
      decideTopSlot({
        ...NONE,
        pendingIncomingServiceRequests: 2,
        pendingIncomingBookings: 1,
      }),
    ).toBe("incoming_service_request");
  });

  it("an ACCEPTED outgoing request beats every other state", () => {
    expect(
      decideTopSlot({
        acceptedOutgoing: 1,
        pendingIncomingServiceRequests: 2,
        pendingIncomingBookings: 1,
        bookingResponsesNew: 1,
        isFirstUse: true,
      }),
    ).toBe("accepted_request");
  });

  // W3 row 6 — the ladder has no `invitation` rung any more. It is asserted as
  // an ABSENCE rather than deleted silently, because a rung whose card no
  // longer exists on this page would resolve to an empty slot: the capability
  // moved to the Context Panel's work context, it was not dropped.
  it("has no invitation rung — that capability is the Context Panel's", () => {
    const kinds = [
      decideTopSlot({ ...NONE, acceptedOutgoing: 1 }),
      decideTopSlot({ ...NONE, pendingIncomingServiceRequests: 1 }),
      decideTopSlot({ ...NONE, pendingIncomingBookings: 1 }),
      decideTopSlot({ ...NONE, bookingResponsesNew: 1 }),
      decideTopSlot({ ...NONE, isFirstUse: true }),
      decideTopSlot(NONE),
    ];
    expect(kinds).not.toContain("invitation");
  });

  it("counts are gates, not weights — zero never claims the slot", () => {
    expect(
      decideTopSlot({ ...NONE, acceptedOutgoing: 0, bookingResponsesNew: 0 }),
    ).toBeNull();
  });
});
