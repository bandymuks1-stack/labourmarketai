/**
 * Landing experience experiment contract.
 *
 * LIVE and FOCUS are two ALTERNATIVE landing experiences behind one canonical
 * acquisition URL — not two presentations of one component tree:
 *
 *   LIVE  — the living European labour-market surface (default).
 *   FOCUS — the previous production landing, restored from git.
 *
 * The persisted value is deliberately bounded and contains no identity or
 * free text. Keeping this module pure lets both landings and the existing
 * funnel tracker share the attribution without a provider or a second
 * analytics pipeline.
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

/**
 * The same bounded choice, readable by the SERVER.
 *
 * FOCUS is the previous production landing — its own component tree, its own
 * chrome, its own client islands. Deciding client-side would mean shipping
 * BOTH landings in every response and flashing one before the other, so the
 * choice has to be known before render. localStorage stays the persistence
 * record (contract unchanged); this cookie is only how the server learns it.
 *
 * It carries a single bounded token — "live" or "focus" — and no identity, so
 * it is not a tracking cookie and needs no consent gate. Lax keeps it off
 * cross-site requests; it is deliberately not HttpOnly because the same value
 * is written by the client control that sets it.
 */
export const LANDING_MODE_COOKIE = "lm_landing_mode";

const LANDING_MODE_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

export function persistLandingMode(mode: LandingMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LANDING_MODE_STORAGE_KEY, mode);
  } catch {
    // A blocked localStorage must never make the landing unusable.
  }
  try {
    document.cookie = `${LANDING_MODE_COOKIE}=${mode}; path=/; max-age=${LANDING_MODE_COOKIE_MAX_AGE}; samesite=lax`;
  } catch {
    // Same contract as above: a blocked cookie jar degrades to LIVE, never to
    // a broken landing.
  }
}

export function landingEventMetadata(
  mode: LandingMode,
  audience: LandingAudience,
): { readonly mode: LandingMode; readonly audience: LandingAudience } {
  return { mode, audience };
}
