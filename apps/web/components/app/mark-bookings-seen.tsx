"use client";

import { useEffect } from "react";

import { markBookingRequestsSeen } from "@/lib/booking/booking-actions";

/**
 * Stamps the caller's booking-loop seen timestamp on mount (audit PR5 —
 * mirrors MarkServiceRequestsSeen). Opening /dashboard/bookings IS the read
 * event that clears the "new responses" dashboard/bell markers. Fire-and-
 * forget: the action is rollout-safe (no-op while the owner-gated seen
 * migration is unapplied) and a failure must never affect the page.
 */
export function MarkBookingsSeen() {
  useEffect(() => {
    void markBookingRequestsSeen();
  }, []);
  return null;
}
