"use client";

import { useEffect } from "react";
import { markServiceRequestsSeen } from "@/lib/marketplace/service-requests";

/**
 * Marks the marketplace request loop as "seen" for the current user when the
 * service-requests page mounts (fire-and-forget). This is what clears the
 * dashboard "new" markers after the user has actually looked at the loop.
 * Renders nothing. Rollout-safe — the action is a no-op if the seen RPC is not
 * applied yet.
 */
export function MarkServiceRequestsSeen() {
  useEffect(() => {
    void markServiceRequestsSeen();
  }, []);
  return null;
}
