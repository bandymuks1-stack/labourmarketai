/**
 * First-touch campaign attribution (Pre-Advertising Launch Readiness v1).
 *
 * Captures the `utm_*` params + referrer host + landing path of the FIRST
 * page a visitor lands on, so a later conversion (registration, company-need
 * submission) can be attributed to a paid campaign — WITHOUT a third-party
 * tracker and WITHOUT any schema change. The values ride as bounded,
 * allowlisted metadata on the existing `pilot_events` pipe
 * (`lib/telemetry/actions.ts`), which caps every scalar at 200 chars.
 *
 * Privacy / safety contract:
 *   - First-touch is stored ONCE in `localStorage` (`lm.attr.first`) and is
 *     NEVER overwritten by a later visit — the original source wins.
 *   - Only the five `utm_*` params, the referrer HOST (not the full URL),
 *     and the landing PATH (not its query string) are kept.
 *   - Every value is sanitized: control chars stripped, `<`/`>` removed,
 *     length-capped. Values are only ever stored/echoed as plain strings —
 *     they are never evaluated, never placed in a URL, never rendered as
 *     HTML.
 *   - No user-entered value is captured here. No cookie is written.
 */

import type { FunnelMetadata } from "@/lib/telemetry/funnel-events";

const STORE_KEY = "lm.attr.first";
const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

/** The bounded first-touch attribution shape actually persisted/returned. */
export type FirstTouchAttribution = Pick<
  FunnelMetadata,
  | "utm_source"
  | "utm_medium"
  | "utm_campaign"
  | "utm_content"
  | "utm_term"
  | "referrer_host"
  | "landing_path"
>;

const VALUE_MAX = 120;

/** Strip anything unsafe and length-cap. Returns `undefined` for empty /
 *  unusable input so absent keys never get stored. Values are plain data
 *  only — never executed, never used to build a URL. Implemented with a
 *  codepoint filter (not a regex) so ASCII control chars are dropped without
 *  a control-character regex. */
function sanitizeValue(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  let cleaned = "";
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    // Drop ASCII control chars (0x00–0x1F and DEL 0x7F) and angle brackets.
    if (code < 0x20 || code === 0x7f) continue;
    if (ch === "<" || ch === ">") continue;
    cleaned += ch;
  }
  cleaned = cleaned.trim().slice(0, VALUE_MAX);
  return cleaned.length > 0 ? cleaned : undefined;
}

/** Referrer HOST only, e.g. 'google.com'. Never the full referrer URL
 *  (which can carry PII in its own query string). Same-origin referrers
 *  are dropped (they are internal navigation, not an acquisition source). */
function referrerHost(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const ref = document.referrer;
  if (!ref) return undefined;
  try {
    const url = new URL(ref);
    if (typeof window !== "undefined" && url.host === window.location.host) {
      return undefined;
    }
    return sanitizeValue(url.host);
  } catch {
    return undefined;
  }
}

function readStore(): FirstTouchAttribution | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as FirstTouchAttribution;
    }
  } catch {
    /* localStorage / JSON unavailable — treat as no first-touch */
  }
  return null;
}

/**
 * Capture first-touch attribution the first time a visitor lands. Idempotent:
 * if a first-touch record already exists it is returned unchanged (the
 * original campaign is never overwritten). Returns the stored attribution,
 * or `null` when there is nothing worth recording (no utm, no external
 * referrer) and none was stored before.
 *
 * Safe to call on every marketing page mount — it self-guards against
 * overwrite and against SSR.
 */
export function captureFirstTouchAttribution(): FirstTouchAttribution | null {
  if (typeof window === "undefined") return null;

  const existing = readStore();
  if (existing) return existing;

  const params = new URLSearchParams(window.location.search);
  const record: FirstTouchAttribution = {};
  for (const key of UTM_KEYS) {
    const value = sanitizeValue(params.get(key));
    if (value) record[key] = value;
  }
  const host = referrerHost();
  if (host) record.referrer_host = host;
  const landing = sanitizeValue(window.location.pathname);
  if (landing) record.landing_path = landing;

  // Only persist when there is a real acquisition signal (a utm or an
  // external referrer). A bare organic landing with no query and no
  // referrer stores nothing, so `getFirstTouchAttribution` stays empty
  // and conversion events aren't padded with noise.
  const hasSignal =
    UTM_KEYS.some((k) => record[k]) || Boolean(record.referrer_host);
  if (!hasSignal) return null;

  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(record));
  } catch {
    /* storage full / blocked — attribution is best-effort */
  }
  return record;
}

/** Return the stored first-touch attribution as bounded funnel metadata to
 *  attach to a conversion event, or an empty object if none was captured. */
export function getFirstTouchAttribution(): FirstTouchAttribution {
  return readStore() ?? {};
}
