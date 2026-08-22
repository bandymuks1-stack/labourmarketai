"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  LANDING_EVENTS,
  landingEventMetadata,
  persistLandingMode,
  type LandingMode,
} from "@/lib/telemetry/landing-experience";
import { recordEvent } from "@/lib/telemetry/task";
import styles from "./landing-mode-switcher.module.css";

/**
 * The LIVE / FOCUS control on the primary (FOCUS) landing.
 *
 * FOCUS is the default, so this control's job is no longer just "go back" —
 * it is the ONLY invitation to discover that a living market exists here
 * (owner command §6). The invitation is the control itself: a small status
 * dot beside LIVE that breathes, plus one short attention sequence once the
 * page has settled. No popup, no banner, no toast, no tooltip, no glow, and
 * not one word added to the restored composition, which stays untouched.
 *
 * PERSISTENCE IS EXPLICIT-ONLY. This component deliberately writes nothing on
 * mount. The server resolves the arm from the cookie, and the cookie's whole
 * meaning is "the visitor chose this" — so recording FOCUS merely because
 * FOCUS rendered would forge an explicit choice for every fresh visitor and
 * make an explicit LIVE choice indistinguishable from a default. Only
 * `choose()` writes.
 *
 * Switching needs a document load, not a re-render: the two arms are separate
 * component trees with their own chrome, so the cookie is written first and
 * the page reloads into the other landing whole.
 */
export function LandingModeSwitcher() {
  const seen = useRef(false);

  useEffect(() => {
    if (seen.current) return;
    seen.current = true;
    recordEvent(
      LANDING_EVENTS.modeSeen,
      landingEventMetadata("focus", "unknown"),
    );
  }, []);

  const choose = useCallback((next: LandingMode) => {
    if (next === "focus") return;
    persistLandingMode(next);
    recordEvent(
      LANDING_EVENTS.modeChanged,
      landingEventMetadata(next, "unknown"),
    );
    window.location.reload();
  }, []);

  return (
    <div
      className={styles.modeSwitcher}
      role="group"
      aria-label="LIVE / FOCUS"
      data-testid="landing-mode-switcher"
    >
      {(["live", "focus"] as const).map((candidate) => (
        <button
          key={candidate}
          type="button"
          aria-pressed={candidate === "focus"}
          onClick={() => choose(candidate)}
        >
          {/* The status dot is a STATIC indicator that happens to breathe:
              under prefers-reduced-motion the animation is dropped and the dot
              remains, so the signal never depends on motion alone (§8). */}
          {candidate === "live" ? (
            <span className={styles.liveDot} aria-hidden />
          ) : null}
          {candidate.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
