/**
 * RECENT PLACES — the areas a person opened lately, offered back on the home
 * beside their pins (owner P0 No. 1, 2026-11-12).
 *
 * A CONVENIENCE OF THIS BROWSER, never a fact about the person: the list lives
 * in `localStorage`, per signed-in user, and is not synced between devices
 * (pins are — they are rows in `workspace_pins`). It holds AREA paths only: a
 * path is cut at the first segment that looks like an id, so no project,
 * conversation or person identifier is ever kept. The home resolves a path
 * against the destinations the person is admitted to; a path with no admitted
 * destination is simply not drawn.
 *
 * PURE. The storage reads and writes live with the callers and swallow
 * failures (a browser without storage just has no recents).
 */

export const RECENT_PLACES_CAP = 12;
export const RECENT_PLACES_SHOWN = 3;
export const RECENT_PLACES_KEY_PREFIX = "lm.recentPlaces.v1";

export type RecentPlace = { readonly path: string; readonly at: number };

export function recentPlacesKey(userId: string): string {
  return `${RECENT_PLACES_KEY_PREFIX}:${userId}`;
}

const ID_LIKE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+|[0-9a-f]{16,})$/i;
const SEGMENT = /^[a-z][a-z0-9-]*$/;

/**
 * The AREA a pathname stands in, or `null` when it is not a dashboard area
 * (the home itself, a route outside the dashboard, or a malformed path).
 * `/dashboard/projects/<uuid>/hours` → `/dashboard/projects`.
 */
export function areaPathOf(pathname: string): string | null {
  const segments = pathname.split(/[?#]/)[0].split("/").filter(Boolean);
  if (segments[0] !== "dashboard" || segments.length < 2) return null;
  const kept: string[] = ["dashboard"];
  for (const segment of segments.slice(1, 4)) {
    if (ID_LIKE.test(segment) || !SEGMENT.test(segment)) break;
    kept.push(segment);
  }
  return kept.length < 2 ? null : `/${kept.join("/")}`;
}

/** The list with `pathname`'s area moved to the front (most recent first). */
export function recordRecentPlace(
  list: readonly RecentPlace[],
  pathname: string,
  nowMs: number,
): RecentPlace[] {
  const path = areaPathOf(pathname);
  if (!path) return [...list];
  return [{ path, at: nowMs }, ...list.filter((p) => p.path !== path)].slice(0, RECENT_PLACES_CAP);
}

/** A stored value read back defensively: anything malformed is dropped. */
export function parseRecentPlaces(raw: string | null): RecentPlace[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (p): p is RecentPlace =>
          !!p &&
          typeof (p as RecentPlace).path === "string" &&
          typeof (p as RecentPlace).at === "number" &&
          areaPathOf((p as RecentPlace).path) === (p as RecentPlace).path,
      )
      .slice(0, RECENT_PLACES_CAP);
  } catch {
    return [];
  }
}

/**
 * The recents the home draws: the most recent places that resolve to a
 * destination the person is admitted to (`destinations`), are not already
 * pinned and are not already offered on the home (`skip`). The deepest
 * destination that holds the path wins, so `/dashboard/company/people`
 * resolves to "My people", not to the company space above it.
 */
export function resolveRecentPlaces<D extends { readonly href: string }>(
  list: readonly RecentPlace[],
  destinations: readonly D[],
  skip: ReadonlySet<string>,
  max: number = RECENT_PLACES_SHOWN,
): D[] {
  const out: D[] = [];
  const seen = new Set<string>();
  for (const place of [...list].sort((a, b) => b.at - a.at)) {
    let best: D | null = null;
    for (const d of destinations) {
      const base = d.href.split(/[?#]/)[0];
      if (place.path !== base && !place.path.startsWith(`${base}/`)) continue;
      if (!best || base.length > best.href.split(/[?#]/)[0].length) best = d;
    }
    if (!best || seen.has(best.href) || skip.has(best.href)) continue;
    seen.add(best.href);
    out.push(best);
    if (out.length >= max) break;
  }
  return out;
}
