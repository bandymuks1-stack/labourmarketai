/**
 * A second call for the same key while the first still runs does nothing. The check
 * sits before the first await, so two clicks in one tick send one request: a disabled
 * button only applies after React rendered it.
 *
 * This is manners, not integrity. Another tab or device has its own guard; the
 * database's unique index is what keeps one row.
 */
export function oneAtATime() {
  const running = new Set<string>();
  return async function guard<T>(key: string, call: () => Promise<T>): Promise<T | undefined> {
    if (running.has(key)) return undefined;
    running.add(key);
    try {
      return await call();
    } finally {
      running.delete(key);
    }
  };
}

/**
 * One refresh after the last of many saves has settled, and none when nothing was saved.
 * A refresh renders the whole page: one per row is what filled the connection pool.
 */
export function refreshWhenSettled(refresh: () => void, waitMs = 1_200) {
  let open = 0;
  let changed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    began() {
      open++;
      clearTimeout(timer);
    },
    ended(saved: boolean) {
      open--;
      changed ||= saved;
      if (open > 0 || !changed) return;
      timer = setTimeout(() => {
        changed = false;
        refresh();
      }, waitMs);
    },
  };
}
