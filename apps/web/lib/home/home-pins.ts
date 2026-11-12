/**
 * PIN TO HOME — the pure model (owner P0 2026-11-12). No React, no IO.
 *
 * A person chooses which of their home's areas sit first, in their order. The
 * choice is DISPLAY STATE, stored as ids only in the existing per-user store
 * `dashboard_preferences` (profile_id, context) — the person workspace and
 * the company workspace keep separate layouts, as that table was designed.
 *
 * PINNING NEVER GRANTS ACCESS. The only things that can be pinned are the
 * areas the SAME home already offers this person in this workspace — the ONE
 * area model (`lib/navigation/work-areas.ts`). A stored id that is not in
 * that list (another workspace's area, a retired area, a forged id) is
 * dropped on read and refused on write, so a pin can reorder what a person
 * already reaches and nothing else. Every destination still re-checks its own
 * rights under RLS.
 */

import {
  HEADER_AREA_LEADS,
  ORGANIZATION_WORK_AREAS,
  PERSONAL_WORK_AREAS,
  type WorkArea,
} from "@/lib/navigation/work-areas";

/** The store's closed context slug (migration 20260714211000). */
export type HomePinContext = "person" | "company";
/** Who the defaults are for. */
export type HomePinRole = "worker" | "company" | "agency";

export const MAX_HOME_PINS = 8;
export const MAX_HOME_RECENT = 4;
/** The key inside `dashboard_preferences.preferences`. */
export const HOME_PINS_KEY = "homePins";

export type HomePins = {
  /** Ordered area ids. */
  readonly pins: readonly string[];
  /** Most recently opened area ids, newest first. */
  readonly recent: readonly string[];
};

/** The areas this home offers — the ONLY things that can be pinned. */
export function pinnableAreas(context: HomePinContext): readonly WorkArea[] {
  return context === "company" ? ORGANIZATION_WORK_AREAS : PERSONAL_WORK_AREAS;
}

const PERSON_DEFAULTS = ["journal", "world", "cv"] as const;

/** Defaults by role, until the person makes the home their own. */
export function defaultHomePins(role: HomePinRole): readonly string[] {
  if (role === "worker") return PERSON_DEFAULTS;
  return HEADER_AREA_LEADS[role];
}

function cleanIds(raw: unknown, allowed: ReadonlySet<string>, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string" || !allowed.has(v) || out.includes(v)) continue;
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Stored value → what may render. `null` when the person has never chosen
 * (the caller then shows the role's defaults). Unknown ids are dropped.
 */
export function readHomePins(stored: unknown, context: HomePinContext): HomePins | null {
  if (!stored || typeof stored !== "object") return null;
  const value = (stored as Record<string, unknown>)[HOME_PINS_KEY];
  if (!value || typeof value !== "object") return null;
  const allowed = new Set(pinnableAreas(context).map((a) => a.id));
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.pins) && !Array.isArray(v.recent)) return null;
  return {
    pins: Array.isArray(v.pins)
      ? cleanIds(v.pins, allowed, MAX_HOME_PINS)
      : [],
    recent: cleanIds(v.recent, allowed, MAX_HOME_RECENT),
  };
}

/** What the home shows: the stored choice, or the role's defaults. */
export function resolveHomePins(
  stored: HomePins | null,
  context: HomePinContext,
  role: HomePinRole,
): HomePins {
  if (stored) return stored;
  const allowed = new Set(pinnableAreas(context).map((a) => a.id));
  return { pins: defaultHomePins(role).filter((id) => allowed.has(id)), recent: [] };
}

/** A write is valid only when every id is one of this home's areas. */
export function validateHomePins(input: unknown, context: HomePinContext): HomePins | null {
  if (!input || typeof input !== "object") return null;
  const v = input as Record<string, unknown>;
  if (!Array.isArray(v.pins) || !Array.isArray(v.recent)) return null;
  const allowed = new Set(pinnableAreas(context).map((a) => a.id));
  const pins = cleanIds(v.pins, allowed, MAX_HOME_PINS);
  const recent = cleanIds(v.recent, allowed, MAX_HOME_RECENT);
  // Refuse, rather than silently trim, a payload naming something else.
  if (pins.length !== v.pins.length || recent.length !== v.recent.length) return null;
  return { pins, recent };
}

export function pinArea(state: HomePins, id: string): HomePins {
  if (state.pins.includes(id) || state.pins.length >= MAX_HOME_PINS) return state;
  return { ...state, pins: [...state.pins, id] };
}

export function unpinArea(state: HomePins, id: string): HomePins {
  return { ...state, pins: state.pins.filter((p) => p !== id) };
}

/** Move a pin one place earlier (-1) or later (+1). */
export function movePin(state: HomePins, id: string, by: -1 | 1): HomePins {
  const from = state.pins.indexOf(id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= state.pins.length) return state;
  const pins = [...state.pins];
  [pins[from], pins[to]] = [pins[to], pins[from]];
  return { ...state, pins };
}

export function touchRecent(state: HomePins, id: string): HomePins {
  return {
    ...state,
    recent: [id, ...state.recent.filter((r) => r !== id)].slice(0, MAX_HOME_RECENT),
  };
}
