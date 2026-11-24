"use client";

import { useEffect, useRef } from "react";

import { markBookingRequestsSeen } from "@/lib/booking/booking-actions";
import { trackFunnel } from "@/lib/telemetry/task";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

/**
 * Stamps the caller's booking-loop seen timestamp on mount (audit PR5 —
 * mirrors MarkServiceRequestsSeen). Opening /dashboard/bookings IS the read
 * event that clears the "new responses" dashboard/bell markers. Fire-and-
 * forget: the action is rollout-safe (no-op while the owner-gated seen
 * migration is unapplied) and a failure must never affect the page.
 */
export function MarkBookingsSeen() {
  const ran = useRef(false);
  useEffect(() => {
    void markBookingRequestsSeen();
    // Funnel: the worker viewed their booking inbox. Once per mount,
    // fire-and-forget, no ids — Worker Launch Readiness v1.
    if (!ran.current) {
      ran.current = true;
      trackFunnel(FUNNEL_EVENTS.bookingViewed, { surface: "booking" });
    }
  }, []);
  return null;
}
