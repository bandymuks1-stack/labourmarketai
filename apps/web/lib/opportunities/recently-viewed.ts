/**
 * Recently-viewed opportunities — DEVICE-LOCAL ONLY (P2-PR5).
 *
 * Records when a worker opens a card's detail disclosure on the board. The
 * list lives EXCLUSIVELY in this browser's localStorage: it is never sent to
 * the server, never joined to the account, and stores NOTHING beyond
 * (request id, ISO timestamp) pairs — no titles, no pay, no company names
 * (the strip re-joins ids against live board rows, so it can never show
 * stale facts). Capped at {@link RECENTLY_VIEWED_MAX} entries, newest first.
 *
 * Pure module + storage helpers: the pure functions have no IO (guard-tested);
 * the storage wrappers are try/catch no-ops outside a browser.
 */

export const RECENTLY_VIEWED_STORAGE_KEY = "lm.opportunities.recentlyViewed.v1";
export const RECENTLY_VIEWED_MAX = 10;

export interface RecentlyViewedEntry {
  /** The demand's request id — the ONLY identifier stored. */
  readonly id: string;
  /** When the detail disclosure was opened on THIS device. */
  readonly viewedAtIso: string;
}

/** Rebuild an entry from unknown input keeping ONLY id + timestamp —
 *  anything else (smuggled fields, wrong types) is dropped. */
function sanitizeEntry(value: unknown): RecentlyViewedEntry | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  if (typeof o.id !== "string" || o.id === "") return null;
  if (typeof o.viewedAtIso !== "string" || Number.isNaN(Date.parse(o.viewedAtIso))) {
    return null;
  }
  return { id: o.id, viewedAtIso: o.viewedAtIso };
}

/** Tolerant parse of a stored JSON string: garbage → empty list, valid
 *  entries survive element-by-element, cap enforced. Never throws. */
export function parseRecentlyViewed(raw: unknown): RecentlyViewedEntry[] {
  if (typeof raw !== "string" || raw === "") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: RecentlyViewedEntry[] = [];
  const seen = new Set<string>();
  for (const el of parsed) {
    const entry = sanitizeEntry(el);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
    if (out.length >= RECENTLY_VIEWED_MAX) break;
  }
  return out;
}

/**
 * Pure recorder: move/insert `id` at the front with the given timestamp,
 * dedupe, and cap at {@link RECENTLY_VIEWED_MAX}. Every returned entry is a
 * freshly-built (id, viewedAtIso) pair — nothing else can survive.
 */
export function recordRecentlyViewed(
  list: readonly unknown[],
  id: string,
  nowIso: string,
): RecentlyViewedEntry[] {
  const head: RecentlyViewedEntry = { id, viewedAtIso: nowIso };
  const out: RecentlyViewedEntry[] = [head];
  for (const el of list) {
    const entry = sanitizeEntry(el);
    if (!entry || entry.id === id) continue;
    out.push({ id: entry.id, viewedAtIso: entry.viewedAtIso });
    if (out.length >= RECENTLY_VIEWED_MAX) break;
  }
  return out;
}

// ── Browser storage wrappers (no-ops outside a browser; never throw) ─────────

export function readRecentlyViewedFromStorage(): RecentlyViewedEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return parseRecentlyViewed(window.localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function recordRecentlyViewedInStorage(id: string): void {
  if (typeof window === "undefined" || !id) return;
  try {
    const next = recordRecentlyViewed(
      parseRecentlyViewed(window.localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY)),
      id,
      new Date().toISOString(),
    );
    window.localStorage.setItem(RECENTLY_VIEWED_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (private mode, quota) — the strip just stays empty.
  }
}

export function clearRecentlyViewedInStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(RECENTLY_VIEWED_STORAGE_KEY);
  } catch {
    // Ignore — device-local convenience only.
  }
}
