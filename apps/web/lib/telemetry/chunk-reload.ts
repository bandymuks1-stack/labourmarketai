/**
 * Stale or unreachable chunk → reload the page ONCE.
 *
 * A chunk can fail to load for two reasons that a reload fixes: the cached HTML
 * names chunk hashes a newer deploy replaced, or one request was dropped on the
 * way (a proxy, a flaky mobile link). One reload fetches the current manifest.
 * A chunk that still fails after it is a real defect, so the second failure
 * shows the retry screen instead of looping.
 *
 * ONE budget for every error boundary (app/[locale]/error.tsx and
 * app/global-error.tsx share the key): a failure that climbs from one boundary
 * to the other must not buy a second reload. The mark expires, so a tab kept
 * open across several deploys recovers again later.
 */

const CHUNK_ERROR =
  /ChunkLoadError|Loading chunk\s+[\w-]+\s+failed|Loading CSS chunk|Failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i;

export const CHUNK_RELOAD_KEY = "lm-chunk-reload";
/** A reload within this window of the previous one is a loop, not a recovery. */
export const CHUNK_RELOAD_WINDOW_MS = 5 * 60 * 1000;

export function isChunkError(error: { name?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.name === "ChunkLoadError" || CHUNK_ERROR.test(error.message ?? "");
}

type MarkStore = Pick<Storage, "getItem" | "setItem">;

/**
 * True when the caller should reload now; it also records that it did. False
 * when a reload already happened inside the window, or when the mark cannot be
 * stored (private mode, blocked storage) — without a mark nothing would stop a
 * loop, so no automatic reload happens there and the retry screen shows.
 */
export function claimChunkReload(store: MarkStore, now: number): boolean {
  try {
    const raw = store.getItem(CHUNK_RELOAD_KEY);
    if (raw) {
      const at = Number(raw);
      // The earlier mark was the literal "1" (no time): treat it as just used.
      if (!Number.isFinite(at) || at <= 1 || now - at < CHUNK_RELOAD_WINDOW_MS) return false;
    }
    store.setItem(CHUNK_RELOAD_KEY, String(now));
    return store.getItem(CHUNK_RELOAD_KEY) === String(now);
  } catch {
    return false;
  }
}

/** Reloads once for a chunk error. Returns true when a reload was started. */
export function reloadOnceForChunkError(error: { name?: string; message?: string } | null | undefined): boolean {
  if (typeof window === "undefined" || !isChunkError(error)) return false;
  let store: Storage;
  try {
    store = window.sessionStorage;
  } catch {
    return false;
  }
  if (!claimChunkReload(store, Date.now())) return false;
  window.location.reload();
  return true;
}
