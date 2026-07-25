"use client";

import { useEffect } from "react";

import { markOpportunitiesShownAction } from "@/lib/marketplace/worker-opportunities-actions";
import type { MarketplaceSurface } from "@/lib/marketplace/worker-opportunities-contract";

/**
 * Reports the opportunities a surface ACTUALLY rendered to the human.
 *
 * Rendering IS the read event (canonical decision §10) — that is what keeps
 * the aggregate "new matching jobs" signal honest: it clears because the
 * worker really saw those matches, not because the server happened to load
 * them.
 *
 * `requestIds` MUST be the rendered slice, never the full loaded set. A board
 * that loads 40 rows and displays 3 after filtering reports 3.
 *
 * This component knows nothing about storage: no table name, no RPC name, no
 * Postgres error code, no availability logic. It calls the canonical
 * marketplace action and that is the whole of its knowledge.
 */
export function OpportunitiesShownMarker({
  surface,
  requestIds,
}: {
  surface: MarketplaceSurface;
  requestIds: readonly string[];
}) {
  // Re-fire only when the actual id set changes (stable join key), not on
  // every parent re-render with a fresh array identity.
  const key = [...requestIds].sort().join(",");
  useEffect(() => {
    if (key === "") return;
    // Fire-and-forget: an anti-spam marker must never break a surface. The
    // action itself never throws and returns an honest outcome.
    void markOpportunitiesShownAction(surface, key.split(","));
  }, [surface, key]);
  return null;
}
