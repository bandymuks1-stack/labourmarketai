/**
 * Real-visitor page-speed samples (speed P0, 2026-11-12).
 *
 * Lab numbers differ by tool and machine; the owner's gate is the 75th
 * percentile from real visitors. One `web_vitals` event per page load carries
 * the Largest Contentful Paint (in the event's `duration_ms`), the layout
 * shift up to the moment of the sample, the first paint and the server
 * response time. It travels the existing first-party event path, so it is
 * sent only after the visitor allowed measurement and never otherwise.
 *
 * PURE: no window, no network. The browser part is
 * components/app/web-vitals-beacon.tsx.
 */

export const WEB_VITALS_EVENT = "web_vitals";

/** A sample is taken at the first interaction, or this long after the page
 *  became visible, whichever comes first. The page is still open then, so
 *  the event is not lost to an unload. */
export const WEB_VITALS_SAMPLE_AFTER_MS = 10_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPAQUE = /^[A-Za-z0-9_-]{20,}$/;

/**
 * The route a sample is filed under: the path with every record id or token
 * replaced by `:id`. A job id is not personal, but an invitation path carries
 * a token, and neither is needed to know which KIND of page was slow.
 */
export function webVitalsRoute(pathname: string): string {
  const cleaned = (pathname || "/").split("?")[0].split("#")[0];
  const parts = cleaned
    .split("/")
    .map((seg) => (UUID.test(seg) || OPAQUE.test(seg) || /^\d{4,}$/.test(seg) ? ":id" : seg));
  return parts.join("/").slice(0, 240) || "/";
}

export interface WebVitalsReading {
  /** Largest Contentful Paint so far, ms since navigation start. */
  readonly lcpMs: number | null;
  /** Cumulative layout shift so far (unitless). */
  readonly cls: number | null;
  readonly fcpMs: number | null;
  /** Time to the first byte of the document, ms. */
  readonly ttfbMs: number | null;
}

export interface WebVitalsSample {
  readonly durationMs: number;
  readonly metadata: Record<string, number>;
}

const boundedMs = (v: number | null): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 120_000 ? Math.round(v) : null;

/**
 * The event to send, or null when there is no usable LCP: a page that was
 * never painted (opened in a background tab) says nothing about speed.
 */
export function buildWebVitalsSample(reading: WebVitalsReading): WebVitalsSample | null {
  const lcp = boundedMs(reading.lcpMs);
  if (lcp === null || lcp === 0) return null;
  const metadata: Record<string, number> = {};
  if (typeof reading.cls === "number" && Number.isFinite(reading.cls) && reading.cls >= 0 && reading.cls <= 10) {
    metadata.cls = Math.round(reading.cls * 1000) / 1000;
  }
  const fcp = boundedMs(reading.fcpMs);
  if (fcp !== null) metadata.fcp_ms = fcp;
  const ttfb = boundedMs(reading.ttfbMs);
  if (ttfb !== null) metadata.ttfb_ms = ttfb;
  return { durationMs: lcp, metadata };
}
