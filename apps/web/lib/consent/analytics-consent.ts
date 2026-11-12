/**
 * ANALYTICS CONSENT — the one switch in front of every non-essential item the
 * product stores on, or reads from, a visitor's device (owner decision
 * 2026-11-03).
 *
 * WHY. ePrivacy Directive Art. 5(3) (Lithuania: Law on Electronic
 * Communications, Art. 61(3)) allows storing or reading information on a
 * device without consent ONLY when it is strictly necessary for a service the
 * person asked for. Campaign attribution, funnel counters and the per-tab
 * analytics session id are not. EDPB Guidelines 2/2023 on the technical scope
 * of Art. 5(3) bring tracking links (URL tags) and script-triggered sending
 * inside the rule as well, so carrying `utm_*` through the URL does not take
 * attribution outside it. Hence: no analytics item before an explicit yes.
 *
 * WHAT IS STORED HERE. One key, `lm.consent.analytics.v1`, holding the
 * person's own choice (granted / refused) and the day it was made. Remembering
 * a choice the person just made is strictly necessary for honouring it; the
 * key carries no identifier.
 *
 * WHAT IT GATES (every consumer checks `hasAnalyticsConsent()` first):
 *   - `lm.attr.first` first-touch campaign data (lib/telemetry/attribution.ts);
 *   - `lm.pilot.session` and every client analytics event (lib/telemetry/task.ts);
 *   - the `lm.funnel.*` once-per-tab and last-seen markers.
 * Refusing or withdrawing removes all of them from the device at once.
 *
 * A choice is asked again after CONSENT_VALID_DAYS. The product works the
 * same whatever the answer.
 */

export const ANALYTICS_CONSENT_KEY = "lm.consent.analytics.v1";

/** A choice is asked again after this many days (12 months). */
export const CONSENT_VALID_DAYS = 365;

/** Fired on `window` whenever the choice changes (granted, refused, reset). */
export const ANALYTICS_CONSENT_EVENT = "lm:analytics-consent";

export type AnalyticsConsentChoice = "granted" | "refused";

export type AnalyticsConsentRecord = {
  readonly choice: AnalyticsConsentChoice;
  /** YYYY-MM-DD, the day the choice was made. */
  readonly decidedOn: string;
};

/** Every non-essential device item the product may write, and only after a
 *  granted choice. Exact keys, plus prefixes for the `lm.funnel.*` family. */
export const NON_ESSENTIAL_LOCAL_KEYS = ["lm.attr.first"] as const;
export const NON_ESSENTIAL_SESSION_KEYS = ["lm.pilot.session"] as const;
export const NON_ESSENTIAL_KEY_PREFIXES = ["lm.funnel."] as const;

const DAY_MS = 86_400_000;

/**
 * THE BANNER IS IN THE FIRST PAINT (UX-3). It used to appear only after hydration,
 * because the choice lives on the device, and its height pushed the whole page down
 * on every first visit. The server now renders it, and this script, inline in
 * <head>, marks the document before paint when a valid choice exists, so a person
 * who already chose never sees it (`html[data-consent-decided]` in globals.css).
 * The same rules as `parseConsentRecord`; lib/guards/consent-banner-first-paint.test.ts
 * runs both on the same values. It reads the one key and writes nothing to the device.
 */
export const CONSENT_BOOTSTRAP_SCRIPT =
  "(function(){try{var v=JSON.parse(localStorage.getItem(" +
  JSON.stringify(ANALYTICS_CONSENT_KEY) +
  "));if(!v||typeof v!=='object'||Array.isArray(v))return;" +
  "if(v.choice!=='granted'&&v.choice!=='refused')return;" +
  "if(typeof v.decidedOn!=='string'||!/^\\d{4}-\\d{2}-\\d{2}$/.test(v.decidedOn))return;" +
  "var d=Date.parse(v.decidedOn+'T00:00:00Z');if(isNaN(d)||Date.now()-d>" +
  String(CONSENT_VALID_DAYS * DAY_MS) +
  ")return;document.documentElement.setAttribute('data-consent-decided','');}catch(e){}})();";

function todayIso(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Pure: parse a stored value; anything malformed, unknown or expired is
 *  "no choice yet" (null) — never a granted consent. */
export function parseConsentRecord(raw: string | null, now: Date = new Date()): AnalyticsConsentRecord | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const { choice, decidedOn } = v as Record<string, unknown>;
    if (choice !== "granted" && choice !== "refused") return null;
    if (typeof decidedOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(decidedOn)) return null;
    const decided = Date.parse(`${decidedOn}T00:00:00Z`);
    if (Number.isNaN(decided)) return null;
    if (now.getTime() - decided > CONSENT_VALID_DAYS * DAY_MS) return null;
    return { choice, decidedOn };
  } catch {
    return null;
  }
}

/** The current choice on this device, or null when none was made (or it
 *  expired, or storage is unavailable). */
export function readAnalyticsConsent(now: Date = new Date()): AnalyticsConsentRecord | null {
  if (typeof window === "undefined") return null;
  try {
    return parseConsentRecord(window.localStorage.getItem(ANALYTICS_CONSENT_KEY), now);
  } catch {
    return null;
  }
}

/** True ONLY for an explicit, unexpired yes. No choice = no. */
export function hasAnalyticsConsent(): boolean {
  return readAnalyticsConsent()?.choice === "granted";
}

function isNonEssentialKey(key: string, exact: readonly string[]): boolean {
  return exact.includes(key) || NON_ESSENTIAL_KEY_PREFIXES.some((p) => key.startsWith(p));
}

function purgeFrom(storage: Storage, exact: readonly string[]): void {
  const doomed: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key && isNonEssentialKey(key, exact)) doomed.push(key);
  }
  for (const key of doomed) storage.removeItem(key);
}

/** Remove every non-essential item from this device (local and session
 *  storage). Safe to call at any time; never throws. */
export function purgeAnalyticsStorage(): void {
  if (typeof window === "undefined") return;
  try {
    purgeFrom(window.localStorage, NON_ESSENTIAL_LOCAL_KEYS);
  } catch {
    /* storage unavailable */
  }
  try {
    purgeFrom(window.sessionStorage, NON_ESSENTIAL_SESSION_KEYS);
  } catch {
    /* storage unavailable */
  }
}

function announce(): void {
  try {
    window.dispatchEvent(new Event(ANALYTICS_CONSENT_EVENT));
  } catch {
    /* no window events */
  }
}

/** Record the person's choice. A refusal removes every non-essential item. */
export function setAnalyticsConsent(choice: AnalyticsConsentChoice, now: Date = new Date()): void {
  if (typeof window === "undefined") return;
  if (choice === "refused") purgeAnalyticsStorage();
  try {
    const record: AnalyticsConsentRecord = { choice, decidedOn: todayIso(now) };
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, JSON.stringify(record));
  } catch {
    /* storage unavailable: the choice holds for this page only, and without
       a stored yes nothing non-essential is written anyway */
  }
  announce();
}

/** Run `fn` now if consent is granted, otherwise once when it is granted
 *  later on this page. Returns an unsubscribe function. */
export function whenAnalyticsConsentGranted(fn: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  if (hasAnalyticsConsent()) {
    fn();
    return () => {};
  }
  const onChange = () => {
    if (!hasAnalyticsConsent()) return;
    window.removeEventListener(ANALYTICS_CONSENT_EVENT, onChange);
    fn();
  };
  window.addEventListener(ANALYTICS_CONSENT_EVENT, onChange);
  return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, onChange);
}
