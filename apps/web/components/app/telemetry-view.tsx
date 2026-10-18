"use client";

import { useEffect, useRef } from "react";
import { trackFunnel } from "@/lib/telemetry/task";
import { getFirstTouchAttribution } from "@/lib/telemetry/attribution";
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
 *
 * FIRST-TOUCH CAMPAIGN ATTRIBUTION (2026-09-20). Every view this component
 * emits — `job_opened`, `job_board_viewed`, `job_returned_after_auth`,
 * `job_compared`, … — now carries the same allowlisted `utm_*` /
 * `referrer_host` / `landing_path` first-touch block that `landing_viewed`,
 * `cta_clicked` and `registration_started` already carried. Without it a
 * campaign visitor's landing was attributable and every later step of the
 * SAME session was not, so the campaign → job → registration handoff could
 * not be measured at all (production probe 2026-09-20 12:52Z: `landing_viewed`
 * WITH `utm_content`, `job_opened` WITHOUT it, one session).
 *
 * The merge is UNDER the explicit metadata — a caller's own key always wins,
 * so no existing emission's meaning can be changed by a stored campaign
 * value. `getFirstTouchAttribution()` reads localStorage inside try/catch and
 * returns `{}` on SSR, on blocked storage and on unparseable content, so this
 * cannot throw and cannot suppress the event. No new event name, no new
 * metadata key (the server allowlist in `lib/telemetry/actions.ts` already
 * accepts all seven), no schema change.
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
        // Keyed per (event, surface): two surfaces sharing one event name
        // (e.g. opportunities + service-requests both firing
        // marketplace_or_opportunities_viewed) must dedupe independently,
        // or the second surface's view is silently dropped (audit F-T7).
        const surface =
          typeof metadata?.surface === "string" ? `.${metadata.surface}` : "";
        const key = `lm.funnel.${event}${surface}`;
        if (window.sessionStorage.getItem(key)) return;
        window.sessionStorage.setItem(key, "1");
      } catch {
        /* sessionStorage unavailable — fall through and fire anyway */
      }
    }
    // First-touch UNDER the explicit metadata: the caller's keys win.
    trackFunnel(event, { ...getFirstTouchAttribution(), ...metadata });
    // Fire exactly once on mount; `event`/`metadata` are stable per view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
