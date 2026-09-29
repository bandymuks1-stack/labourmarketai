/**
 * WORK AREAS — the people of one project, organized around the work
 * (premium project field, owner command 2026-09-29 §13).
 *
 * Pure. Groups the project's assigned people by each person's PRIMARY
 * profession — the fact `getProjectStadium` already reads from
 * `worker_professions` (is_primary). An assignment row carries no trade, so
 * the grouping is only ever presented as "by primary profession"; a person
 * without one sits in an explicit unknown area, never guessed into another.
 *
 * Order: largest area first, ties by label, the unknown area always last —
 * deterministic, so two loads of the same team draw the same formation.
 */

export const UNKNOWN_WORK_AREA = "__unknown";

export interface WorkArea<W> {
  /** Primary-profession slug, or UNKNOWN_WORK_AREA. */
  readonly key: string;
  readonly label: string;
  readonly workers: readonly W[];
}

export function groupWorkAreas<W extends { readonly workerId: string }>({
  workers,
  positions,
  labelOf,
  unknownLabel,
}: {
  readonly workers: readonly W[];
  /** workerId → primary-profession slug (absent = unknown). */
  readonly positions: ReadonlyMap<string, string | null>;
  /** Display label for a profession slug. */
  readonly labelOf: (slug: string) => string;
  readonly unknownLabel: string;
}): WorkArea<W>[] {
  const bySlug = new Map<string, W[]>();
  for (const w of workers) {
    const key = positions.get(w.workerId) ?? UNKNOWN_WORK_AREA;
    const list = bySlug.get(key);
    if (list) list.push(w);
    else bySlug.set(key, [w]);
  }
  return [...bySlug.entries()]
    .map(([key, list]) => ({
      key,
      label: key === UNKNOWN_WORK_AREA ? unknownLabel : labelOf(key),
      workers: list,
    }))
    .sort((a, b) =>
      a.key === UNKNOWN_WORK_AREA
        ? 1
        : b.key === UNKNOWN_WORK_AREA
          ? -1
          : b.workers.length - a.workers.length || a.label.localeCompare(b.label),
    );
}
