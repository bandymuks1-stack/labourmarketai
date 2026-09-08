"use client";

import { useEffect, useRef } from "react";
import { consumeSignupPending, trackFunnel } from "@/lib/telemetry/task";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

/**
 * Session-level activation beacon (P0-A). Mounted once in the dashboard
 * layout so it covers every authenticated surface. Renders nothing.
 *
 * Fires two funnel events through the existing fire-and-forget pipe:
 *   - `login_succeeded` — once per browser tab session (the user reached an
 *     authenticated surface). De-duplicated via sessionStorage.
 *   - `return_visit_detected` — when the last-seen calendar day differs from
 *     today (a genuine return on a later day). Uses localStorage to remember
 *     only a coarse YYYY-MM-DD string — no identity, no history.
 *
 * No continuous listeners; runs exactly once on mount.
 */
type SessionTelemetryProps = {
  /** Which authed surface mounts this beacon. Every genuinely NEW account is
   *  routed through /onboarding by the auth callback (and the middleware)
   *  BEFORE any dashboard mounts, so ONLY the onboarding surface may EMIT
   *  `signup_completed`. Both auth surfaces are account-creating for a new
   *  Google identity and both optimistically mark a pending signup at press
   *  time — so a marker that first reaches the dashboard belongs to a
   *  RETURNING login whose signup never was: it is cleared silently, never
   *  emitted. Default "dashboard" (the non-emitting surface) so a future
   *  mount point cannot overcount by omission. */
  surface?: "onboarding" | "dashboard";
};

export function SessionTelemetry({
  surface = "dashboard",
}: SessionTelemetryProps) {
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (typeof window === "undefined") return;

    // login_succeeded — once per tab session.
    try {
      const key = "lm.funnel.login_succeeded";
      if (!window.sessionStorage.getItem(key)) {
        window.sessionStorage.setItem(key, "1");
        trackFunnel(FUNNEL_EVENTS.loginSucceeded);
      }
    } catch {
      /* sessionStorage unavailable — skip silently */
    }

    // signup_completed — fires exactly once, only when THIS session is a
    // fresh signup (a one-shot flag set by the account-creating surfaces) AND
    // this mount is the onboarding surface — the only surface a brand-new
    // account can reach first. Read-and-clear guarantees single emission;
    // the dashboard read clears a stale marker (a returning Google login)
    // WITHOUT emitting. signupSurface = 'email' | 'google' (bounded label,
    // no PII).
    const signupSurface = consumeSignupPending();
    if (signupSurface && surface === "onboarding") {
      trackFunnel(FUNNEL_EVENTS.signupCompleted, { surface: signupSurface });
    }

    // return_visit_detected — last-seen day differs from today.
    try {
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const seenKey = "lm.funnel.last_seen_day";
      const last = window.localStorage.getItem(seenKey);
      if (last && last !== today) {
        trackFunnel(FUNNEL_EVENTS.returnVisitDetected);
      }
      window.localStorage.setItem(seenKey, today);
    } catch {
      /* localStorage unavailable — skip silently */
    }
  }, []);
  return null;
}
