import {
  excludeSyntheticFixtures,
  isSyntheticViewer,
} from "@/lib/qa/synthetic-fixture";

/**
 * QA-labelled rows never reach real people through marketplace discovery
 * (owner order 2026-10-01). Thin adapter over the one shared rule so the
 * marketplace readers stay free of the guarded vocabulary. A QA viewer
 * (documented synthetic identity) still sees the labelled rows.
 */
export function isQaViewer(
  user: { email?: string | null; app_metadata?: unknown } | null | undefined,
): boolean {
  return isSyntheticViewer(user);
}

export function hideQaMarked<T>(
  rows: readonly T[],
  viewerIsQa: boolean,
  pick: (row: T) => readonly (string | null | undefined)[],
): T[] {
  return viewerIsQa ? [...rows] : excludeSyntheticFixtures(rows, pick);
}
