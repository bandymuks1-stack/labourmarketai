/**
 * A SHORT, PER-VIEWER MEMORY FOR EXPENSIVE BADGES (2026-10-19 perf).
 *
 * The bell (SpineStream) is mounted on every dashboard page and counted twelve
 * things per page view. Production measurement, owner session: one Work hours
 * view made 46 database requests and about 30 of them were the bell's. Three
 * groups carry most of the cost and change slowly — the "new job matches"
 * badge runs the matching engine, team offers read once per open need, and the
 * agency bridge reads four agency relations. They are remembered here for a
 * short time per viewer AND per active workspace; everything a person acts on
 * by the minute (unread messages, invitations, bookings, tasks, absences)
 * stays live.
 *
 * In-memory, per process: production runs one long-lived Next.js process on
 * the VPS, so this is a real cache there; in a fresh process it simply misses.
 * The key never leaves the server and holds no personal data beyond opaque
 * ids. Bounded: past MAX_ENTRIES the oldest entries are dropped.
 */

type Entry = { readonly at: number; readonly value: unknown };

const MAX_ENTRIES = 5000;
const store = new Map<string, Entry>();

/** Remember `load()` for `ttlMs` under (badge, viewer, workspace). A failed load is never cached. */
export async function rememberBadge<T>(
  badge: string,
  viewerKey: string | null,
  ttlMs: number,
  load: () => Promise<T>,
  now: () => number = Date.now,
): Promise<T> {
  if (!viewerKey) return load();
  const key = `${badge}|${viewerKey}`;
  const hit = store.get(key);
  if (hit && now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  store.set(key, { at: now(), value });
  if (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  return value;
}

/** Test seam: forget everything. */
export function clearBadgeCache(): void {
  store.clear();
}
