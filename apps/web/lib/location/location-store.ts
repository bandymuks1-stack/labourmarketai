/**
 * Persist the user's OWN chosen search location on THIS device (client-only).
 * UI/session continuity, not a data record. No DB, no provider. One key.
 */
import {
  validateSelectedLocation,
  type SelectedLocation,
} from "@/lib/location/location-model";

const KEY = "lm.search-location.v1";

export function readSelectedLocation(): SelectedLocation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return validateSelectedLocation(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeSelectedLocation(loc: SelectedLocation): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(loc));
  } catch {
    /* storage unavailable (private mode / quota) — non-fatal */
  }
}

export function clearSelectedLocation(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* non-fatal */
  }
}