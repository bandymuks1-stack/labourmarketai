/**
 * Persist the signed-in user's OWN chosen market-map location (client-only).
 *
 * This is UI/session continuity, NOT a data record: it keeps the worker's own
 * map marker after a refresh/navigation, on this device, so the map is a real
 * working feature instead of resetting every visit. It is the user's own
 * consented point only — never another person, never a fabricated coordinate.
 * No DB write, no migration (precise-location tables stay owner-gated, doctrine
 * §6 / scope boundary). Stored under one versioned localStorage key.
 */

export type MyLocationMode = "auto" | "manual";

export interface MyMapLocation {
  readonly lat: number | null;
  readonly lng: number | null;
  /** Readable place label (city/region/country) or the user's typed text. */
  readonly label: string;
  readonly mode: MyLocationMode;
  readonly savedAt: number;
}

const KEY = "lm.market-map.my-location.v1";

function isValid(v: unknown): v is MyMapLocation {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const coordsOk =
    (o.lat === null && o.lng === null) ||
    (typeof o.lat === "number" &&
      Number.isFinite(o.lat) &&
      typeof o.lng === "number" &&
      Number.isFinite(o.lng));
  return (
    coordsOk &&
    typeof o.label === "string" &&
    o.label.trim().length > 0 &&
    (o.mode === "auto" || o.mode === "manual")
  );
}

/** Narrow to a location that carries real coordinates (placeable on the map). */
export function hasCoords(
  loc: MyMapLocation,
): loc is MyMapLocation & { lat: number; lng: number } {
  return typeof loc.lat === "number" && typeof loc.lng === "number";
}

export function readMyLocation(): MyMapLocation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeMyLocation(loc: MyMapLocation): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(loc));
  } catch {
    /* storage unavailable (private mode / quota) — non-fatal, map still works */
  }
}

export function clearMyLocation(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* non-fatal */
  }
}