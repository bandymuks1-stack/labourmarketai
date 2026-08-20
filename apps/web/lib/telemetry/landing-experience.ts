/**
 * Landing experience experiment contract.
 *
 * LIVE and FOCUS are presentation modes of the same canonical acquisition
 * surface. The persisted value is deliberately bounded and contains no
 * identity or free text. Keeping this module pure lets both the landing and
 * the existing funnel tracker share the attribution without a provider or a
 * second analytics pipeline.
 */
export const LANDING_MODE_STORAGE_KEY = "lm.landing.mode";

export const LANDING_EVENTS = {
  modeSeen: "landing_mode_seen",
  modeChanged: "landing_mode_changed",
  primaryCtaClicked: "landing_primary_cta_clicked",
  jobsOpened: "landing_jobs_opened",
  signupStarted: "landing_signup_started",
} as const;

export type LandingEventName =
  (typeof LANDING_EVENTS)[keyof typeof LANDING_EVENTS];
export type LandingMode = "live" | "focus";
export type LandingAudience = "worker" | "employer" | "unknown";

export function isLandingMode(value: unknown): value is LandingMode {
  return value === "live" || value === "focus";
}

export function readLandingMode(): LandingMode | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(LANDING_MODE_STORAGE_KEY);
    return isLandingMode(value) ? value : null;
  } catch {
    return null;
  }
}

export function persistLandingMode(mode: LandingMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LANDING_MODE_STORAGE_KEY, mode);
  } catch {
    // A blocked localStorage must never make the landing unusable.
  }
}

export function landingEventMetadata(
  mode: LandingMode,
  audience: LandingAudience,
): { readonly mode: LandingMode; readonly audience: LandingAudience } {
  return { mode, audience };
}
