import { describe, expect, it } from "vitest";

import { decideTopSlot, type TopSlotSignals } from "./top-slot";

/**
 * Pins the audit-PR6 priority ladder for the dashboard top slot. If a future
 * change reshuffles what claims the above-the-fold card, this test forces the
 * conversation to happen in review, not in production.
 */

const NONE: TopSlotSignals = {
  pendingInvitations: 0,
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

  it("an ACCEPTED outgoing request beats everything except an invitation", () => {
    expect(
      decideTopSlot({
        ...NONE,
        acceptedOutgoing: 1,
        pendingIncomingServiceRequests: 2,
        pendingIncomingBookings: 1,
        bookingResponsesNew: 1,
        isFirstUse: true,
      }),
    ).toBe("accepted_request");
  });

  it("a pending invitation wins over every other state", () => {
    expect(
      decideTopSlot({
        pendingInvitations: 1,
        acceptedOutgoing: 5,
        pendingIncomingServiceRequests: 5,
        pendingIncomingBookings: 5,
        bookingResponsesNew: 5,
        isFirstUse: true,
      }),
    ).toBe("invitation");
  });

  it("counts are gates, not weights — zero never claims the slot", () => {
    expect(
      decideTopSlot({ ...NONE, acceptedOutgoing: 0, bookingResponsesNew: 0 }),
    ).toBeNull();
  });
});
