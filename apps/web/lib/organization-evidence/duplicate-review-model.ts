/**
 * POSSIBLE DUPLICATE HISTORY RECORDS — the pure grouping behind the review
 * (owner decision 2026-10-21: "do not change the 45 groups automatically;
 * prepare a review for organizations with a clear comparison and a safe
 * decision mechanism").
 *
 * A group is two or more LIVE records (not withdrawn, not replaced by a
 * correction) of the same person, on the same day, at the same work object.
 * That is only a POSSIBILITY: two shifts or two tasks on one site are real
 * work. Nothing here decides; the organization does, record by record:
 *
 *   · "this one is a duplicate" — the existing append-only `withdrawn` event
 *     (the record and the reason stay readable; nothing is deleted), noting
 *     which record was kept;
 *   · "reinstate" — the existing `reinstated` event, the exact inverse.
 *
 * A record the organization marked as a duplicate stays listed beside the one
 * it kept, so every decision can be seen and undone.
 */

export interface DuplicateCandidateInput {
  readonly id: string;
  readonly organizationId: string;
  readonly personId: string;
  readonly personName: string | null;
  readonly activityDate: string | null;
  readonly workObjectId: string | null;
  readonly hours: number | null;
  readonly text: string;
  readonly sourceFilename: string | null;
  readonly importedAt: string;
  readonly rowOrigin: string | null;
  readonly withdrawn: boolean;
  readonly superseded: boolean;
}

export interface DuplicateCandidate {
  readonly id: string;
  readonly hours: number | null;
  readonly text: string;
  readonly sourceFilename: string | null;
  readonly importedAt: string;
  readonly rowOrigin: string | null;
  /** Marked as a duplicate (withdrawn) — shown for undo, never counted. */
  readonly withdrawn: boolean;
}

export interface DuplicateGroup {
  readonly key: string;
  readonly personName: string | null;
  readonly activityDate: string;
  readonly workObjectId: string;
  /** Live records first (oldest import first), then the ones marked. */
  readonly records: readonly DuplicateCandidate[];
  /** The live records still awaiting the organization's decision. */
  readonly liveCount: number;
  /** Every live record states the same hours — the strongest duplicate sign. */
  readonly sameHours: boolean;
  /** Every live record carries the same text. */
  readonly sameText: boolean;
}

const norm = (s: string) => s.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");

export function groupPossibleDuplicates(
  records: readonly DuplicateCandidateInput[],
  organizationId: string,
): DuplicateGroup[] {
  const byKey = new Map<string, DuplicateCandidateInput[]>();
  for (const r of records) {
    if (r.organizationId !== organizationId) continue;
    if (r.superseded) continue;
    if (!r.activityDate || !r.workObjectId || !r.personId) continue;
    const key = `${r.personId}|${r.activityDate}|${r.workObjectId}`;
    const list = byKey.get(key);
    if (list) list.push(r);
    else byKey.set(key, [r]);
  }
  const groups: DuplicateGroup[] = [];
  for (const [key, list] of byKey) {
    const live = list.filter((r) => !r.withdrawn);
    // A group needs a decision (2+ live) or shows a decision made (a marked
    // record beside the live one it kept).
    if (live.length < 2 && !(live.length >= 1 && list.length > live.length)) continue;
    const ordered = [...list].sort(
      (a, b) =>
        Number(a.withdrawn) - Number(b.withdrawn) ||
        a.importedAt.localeCompare(b.importedAt) ||
        a.id.localeCompare(b.id),
    );
    const hours = new Set(live.map((r) => (r.hours === null ? "null" : String(r.hours))));
    const texts = new Set(live.map((r) => norm(r.text)));
    const first = ordered[0]!;
    groups.push({
      key,
      personName: first.personName,
      activityDate: first.activityDate!,
      workObjectId: first.workObjectId!,
      records: ordered.map((r) => ({
        id: r.id,
        hours: r.hours,
        text: r.text,
        sourceFilename: r.sourceFilename,
        importedAt: r.importedAt,
        rowOrigin: r.rowOrigin,
        withdrawn: r.withdrawn,
      })),
      liveCount: live.length,
      sameHours: live.length > 1 && hours.size === 1,
      sameText: live.length > 1 && texts.size === 1,
    });
  }
  // Groups awaiting a decision first, then by day (newest first).
  return groups.sort(
    (a, b) =>
      Number(b.liveCount > 1) - Number(a.liveCount > 1) ||
      b.activityDate.localeCompare(a.activityDate) ||
      a.key.localeCompare(b.key),
  );
}

/** The note the `withdrawn` event carries: which record was kept. */
export function duplicateNote(keptRecordId: string): string {
  return `duplicate_of:${keptRecordId}`;
}
