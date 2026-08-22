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
 * The LIVE / FOCUS control on the restored landing.
 *
 * FOCUS is a different component tree with different chrome, so the mode is
 * resolved on the SERVER from the bounded cookie. Changing it therefore needs
 * a document load rather than a client re-render — the cookie is written
 * first, then `location.reload()`, so the visitor lands on the other landing
 * whole rather than on a half-swapped one.
 *
 * Deliberately floating and self-contained: the restored landing's layout is
 * the historical one and must not be edited to make room for a control that
 * did not exist in it.
 */
export function LandingModeSwitcher() {
  const seen = useRef(false);

  useEffect(() => {
    if (seen.current) return;
    seen.current = true;
    // The server resolved this arm from the cookie; re-align the persistence
    // record so a stale localStorage value cannot disagree with what the
    // visitor is actually looking at.
    persistLandingMode("focus");
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
          {candidate.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
