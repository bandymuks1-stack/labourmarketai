"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import { trackFunnel } from "@/lib/telemetry/task";
import {
  captureFirstTouchAttribution,
  getFirstTouchAttribution,
} from "@/lib/telemetry/attribution";

/**
 * Public acquisition-funnel beacon (Pre-Advertising Launch Readiness v1).
 *
 * Mounted once in the marketing layout so EVERY public/ad landing captures
 * first-touch campaign attribution and emits a single `landing_viewed`
 * funnel event through the existing RLS-safe `pilot_events` pipe. This is the
 * top of the funnel a paid-ad visitor reaches BEFORE the login wall — the
 * piece that makes a campaign measurable without any third-party tracker.
 *
 * Privacy: fires once per tab-session, carries only bounded funnel dimensions
 * (audience, landing_path, utm_*). Never captures a query string verbatim,
 * a full referrer URL, or any user-entered value.
 */

const FIRED_KEY = "lm.funnel.landing_fired";

/** Coarse, non-PII audience label derived from the landing path. */
function audienceFromPath(pathname: string): string {
  // Strip the leading locale segment (e.g. /en/for-workers → for-workers).
  const seg = pathname.split("/").filter(Boolean);
  const first = seg[0] && seg[0].length <= 4 ? seg.slice(1) : seg;
  const top = first[0] ?? "";
  if (top === "for-workers" || top === "worker-intake") return "workers";
  if (top === "for-companies" || top === "company-need") return "companies";
  if (top === "for-agencies") return "agencies";
  if (!top) return "home";
  return "other";
}

export function MarketingFunnelBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    // First-touch attribution is idempotent and survives across the whole
    // session; capture it on every marketing mount so a direct ad landing
    // on any public page is attributed.
    captureFirstTouchAttribution();

    // `landing_viewed` fires once per tab-session — navigating between
    // marketing pages must not spam the funnel.
    let alreadyFired = false;
    try {
      alreadyFired = window.sessionStorage.getItem(FIRED_KEY) === "1";
    } catch {
      /* sessionStorage unavailable — fall back to firing once per mount */
    }
    if (alreadyFired) return;
    try {
      window.sessionStorage.setItem(FIRED_KEY, "1");
    } catch {
      /* ignore */
    }

    trackFunnel(FUNNEL_EVENTS.landingViewed, {
      audience: audienceFromPath(pathname),
      landing_path: pathname.slice(0, 120),
      ...getFirstTouchAttribution(),
    });
    // Intentionally run once on first marketing mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
