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
export function SessionTelemetry() {
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
    // fresh signup (a one-shot flag set by the signup surfaces). A returning
    // login never set the flag, so it is never mis-counted as a signup.
    // Read-and-clear guarantees single emission across dashboard/onboarding
    // mounts. surface = 'email' | 'google' (bounded label, no PII).
    const signupSurface = consumeSignupPending();
    if (signupSurface) {
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
