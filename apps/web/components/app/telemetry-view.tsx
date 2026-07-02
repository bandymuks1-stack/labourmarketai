"use client";

import { useEffect, useRef } from "react";
import { trackFunnel } from "@/lib/telemetry/task";
import type {
  FunnelEventName,
  FunnelMetadata,
} from "@/lib/telemetry/funnel-events";

/**
 * Mount-fire activation-funnel beacon (P0-A). Renders nothing; on mount it
 * fires a single funnel "viewed" event through the existing fire-and-forget
 * telemetry pipe. Safe to drop into a server-rendered page — it is a client
 * component, so the server page never imports the telemetry pipe directly.
 *
 * - `once` (default true): de-duplicates per browser tab session via
 *   sessionStorage so re-renders / soft navigations back to the same view
 *   don't spam the funnel. This is NOT continuous tracking — it fires at
 *   most once per (event, tab session).
 * - Never throws, never blocks render (`trackFunnel` is fire-and-forget).
 */
export function TelemetryView({
  event,
  metadata,
  once = true,
}: {
  event: FunnelEventName;
  metadata?: FunnelMetadata;
  once?: boolean;
}) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (once && typeof window !== "undefined") {
      try {
        const key = `lm.funnel.${event}`;
        if (window.sessionStorage.getItem(key)) return;
        window.sessionStorage.setItem(key, "1");
      } catch {
        /* sessionStorage unavailable — fall through and fire anyway */
      }
    }
    trackFunnel(event, metadata);
    // Fire exactly once on mount; `event`/`metadata` are stable per view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
