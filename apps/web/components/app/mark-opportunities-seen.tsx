"use client";

import { useEffect } from "react";

import { markOpportunitiesSeenAction } from "@/lib/opportunities/seen-actions";

/**
 * Marks the given opportunity ids as SEEN on mount (Job Recommendation
 * Engine surfacing — mirrors MarkBookingsSeen / MarkServiceRequestsSeen).
 * Rendering a recommendation IS the read event that clears the aggregate
 * "new matching jobs" spine signal and retires the "Nauja" chip. Fire-and-
 * forget: the action is rollout-safe (no-op while the owner-gated
 * worker_opportunity_seen migration is unapplied) and a failure must never
 * affect the page.
 */
export function MarkOpportunitiesSeen({
  requestIds,
}: {
  requestIds: readonly string[];
}) {
  // Re-fire only when the actual id set changes (stable join key), not on
  // every parent re-render with a fresh array identity.
  const key = [...requestIds].sort().join(",");
  useEffect(() => {
    if (key === "") return;
    void markOpportunitiesSeenAction(key.split(","));
  }, [key]);
  return null;
}
