"use client";

import { useEffect } from "react";
import { trackWebVitals } from "@/lib/telemetry/task";
import { hasAnalyticsConsent } from "@/lib/consent/analytics-consent";
import { WEB_VITALS_SAMPLE_AFTER_MS } from "@/lib/telemetry/web-vitals";

/**
 * Sends ONE page-speed sample per page load, and only when the visitor has
 * allowed measurement (lib/telemetry/web-vitals.ts says what and why). Renders
 * nothing. A visitor who has not chosen, or refused, costs no observer and no
 * request: consent is checked before anything is set up, and again by the
 * event path itself.
 *
 * It measures the document load only. A later in-app navigation has no
 * Largest Contentful Paint of its own in the browser.
 */
export function WebVitalsBeacon() {
  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return;
    if (!hasAnalyticsConsent()) return;
    // A page opened in a background tab is painted when the person arrives,
    // not when it loaded: its numbers would describe the wait, not the page.
    if (document.visibilityState !== "visible") return;

    let lcpMs: number | null = null;
    let cls = 0;
    let sent = false;
    const observers: PerformanceObserver[] = [];
    const watch = (type: string, onEntry: (e: PerformanceEntry) => void) => {
      try {
        const o = new PerformanceObserver((list) => list.getEntries().forEach(onEntry));
        o.observe({ type, buffered: true });
        observers.push(o);
      } catch {
        /* this browser does not report the entry type */
      }
    };
    watch("largest-contentful-paint", (e) => {
      lcpMs = e.startTime;
    });
    watch("layout-shift", (e) => {
      const shift = e as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
      if (!shift.hadRecentInput && typeof shift.value === "number") cls += shift.value;
    });

    const send = () => {
      if (sent) return;
      sent = true;
      window.clearTimeout(timer);
      for (const type of ["pointerdown", "keydown"] as const) removeEventListener(type, send);
      observers.forEach((o) => o.disconnect());
      const nav = performance.getEntriesByType("navigation")[0] as
        | PerformanceNavigationTiming
        | undefined;
      const fcp = performance.getEntriesByName("first-contentful-paint")[0];
      trackWebVitals(window.location.pathname, {
        lcpMs,
        cls,
        fcpMs: fcp ? fcp.startTime : null,
        ttfbMs: nav ? nav.responseStart : null,
      });
    };
    // The browser stops updating LCP at the first interaction, so that is the
    // final value; without one, the value after the wait is taken.
    const timer = window.setTimeout(send, WEB_VITALS_SAMPLE_AFTER_MS);
    for (const type of ["pointerdown", "keydown"] as const) {
      addEventListener(type, send, { once: true, passive: true });
    }
    return () => {
      window.clearTimeout(timer);
      for (const type of ["pointerdown", "keydown"] as const) removeEventListener(type, send);
      observers.forEach((o) => o.disconnect());
    };
  }, []);
  return null;
}
