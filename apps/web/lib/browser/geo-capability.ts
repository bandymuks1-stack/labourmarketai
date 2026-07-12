/**
 * Geolocation capability model (user-journey root-cause repair v1).
 *
 * Root cause repaired: browser location failures were collapsed into two
 * states ("denied" / "unavailable"), so a worker inside the Facebook or
 * Instagram in-app browser — where the permission prompt often never appears —
 * got generic "allow location in settings" advice that cannot work there, and
 * a timeout looked identical to a hard denial.
 *
 * This module is CAPABILITY-based, not browser-name-based: the user agent is
 * only used to make the RECOVERY GUIDANCE contextual (how to open the page in
 * a real browser); the failure itself is always classified from the real
 * signal (secure context, API presence, GeolocationPositionError code).
 *
 * Pure functions only — no DOM access at module scope, fully unit-testable.
 * The UI decides copy; this module decides WHICH state the user is in and
 * whether a retry can even succeed (retry is only offered when it can).
 */

/** Every distinguishable way device location can fail. */
export type GeoFailure =
  /** Page not served over HTTPS — the API is disabled by the platform. */
  | "insecure-context"
  /** navigator.geolocation missing entirely. */
  | "unsupported"
  /** Permission denied (GeolocationPositionError.PERMISSION_DENIED). */
  | "denied"
  /** Permission denied INSIDE a detected in-app browser — settings advice
   *  does not apply; the working recovery is "open in a real browser" or
   *  manual selection. */
  | "denied-in-app"
  /** Position unavailable (no GPS/network fix). */
  | "unavailable"
  /** The request timed out — retrying can genuinely succeed. */
  | "timeout";

/** Known constrained in-app browser families (guidance wording only). */
export type InAppBrowserKind =
  | "facebook"
  | "instagram"
  | "tiktok"
  | "other-in-app";

/**
 * Detect a constrained in-app browser from a user-agent string.
 * Conservative: returns null for normal browsers; never used to block a
 * feature, only to pick the recovery guidance that can actually work.
 */
export function detectInAppBrowser(userAgent: string | null | undefined): InAppBrowserKind | null {
  if (!userAgent) return null;
  const ua = userAgent;
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return "facebook";
  if (/Instagram/i.test(ua)) return "instagram";
  if (/TikTok|musical_ly|BytedanceWebview/i.test(ua)) return "tiktok";
  // LINE / Snapchat / Telegram / WhatsApp / WeChat in-app webviews.
  if (/\bLine\/|Snapchat|TelegramBot|WhatsApp|MicroMessenger/i.test(ua)) return "other-in-app";
  // Android WebView marker ("; wv)") — an embedded webview of some app.
  if (/;\s?wv\)/.test(ua)) return "other-in-app";
  return null;
}

/** The environment facts needed to classify a failure (all real signals). */
export type GeoEnvironment = {
  /** `window.isSecureContext` (true when unknown/SSR). */
  secureContext: boolean;
  /** `"geolocation" in navigator`. */
  apiAvailable: boolean;
  /** `detectInAppBrowser(navigator.userAgent)`. */
  inApp: InAppBrowserKind | null;
};

/** GeolocationPositionError codes (numeric to stay test-pure, no DOM types). */
export const GEO_ERROR_PERMISSION_DENIED = 1;
export const GEO_ERROR_POSITION_UNAVAILABLE = 2;
export const GEO_ERROR_TIMEOUT = 3;

/**
 * Classify a geolocation failure from the environment + the error code
 * (`null` code = the API could not even be called).
 */
export function classifyGeoFailure(
  env: GeoEnvironment,
  errorCode: number | null,
): GeoFailure {
  if (!env.secureContext) return "insecure-context";
  if (!env.apiAvailable) return "unsupported";
  if (errorCode === GEO_ERROR_PERMISSION_DENIED) {
    return env.inApp ? "denied-in-app" : "denied";
  }
  if (errorCode === GEO_ERROR_TIMEOUT) return "timeout";
  // POSITION_UNAVAILABLE and anything unrecognised: the device could not
  // produce a fix — honest "unavailable", manual selection is the recovery.
  return "unavailable";
}

/**
 * Whether pressing "try again" can succeed WITHOUT the user first changing
 * something outside the page. Retry is only shown when this is true —
 * a retry that can never work is a dead end dressed as a control.
 */
export function canRetrySucceed(failure: GeoFailure): boolean {
  return failure === "timeout" || failure === "unavailable";
}

/**
 * Whether the failure deserves "open this page in your usual browser"
 * guidance (the only advice that actually unblocks an in-app webview).
 */
export function needsOpenInBrowserGuidance(failure: GeoFailure, env: GeoEnvironment): boolean {
  if (failure === "denied-in-app") return true;
  // API missing/blocked inside a webview → same guidance.
  return env.inApp !== null && (failure === "unsupported" || failure === "insecure-context");
}
