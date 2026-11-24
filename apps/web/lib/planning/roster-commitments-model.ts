import type {
  EmployerCommittedWorkResult,
  UndatedProjectCommitment,
  WorkerCommitment,
} from "@/lib/planning/employer-committed-work";
import { rangesOverlapInclusive } from "@/lib/planning/planning-model";

/**
 * WHO IS COMMITTED WHERE — the per-person, dated reading of the roster.
 *
 * The 2026-09-19 Company-OS trace named the last core step a real employer
 * still does in a spreadsheet or a chat group: "where is each of my people,
 * day by day, next month". The data was already there — every dated
 * commitment (project assignment, accepted booking, approved business trip)
 * is read by `getEmployerWorkerCommitments` for the capacity answer and the
 * CAL-9 utilisation ratio — but only ever summed into a number. This model
 * lays the SAME rows out per person and per date. No new read, no new store,
 * nothing inferred: an undated assignment is named as undated, a person with
 * nothing dated is counted as "nothing on record", never as free.
 */

export interface RosterCommitmentItem {
  readonly kind: WorkerCommitment["kind"];
  readonly sourceId: string;
  /** Real title from the source or null — the surface prints an i18n noun. */
  readonly label: string | null;
  readonly startDate: string | null;
  /** Null = open-ended (the source recorded no end). */
  readonly endDate: string | null;
  /**
   * True when this commitment shares at least one calendar day with ANOTHER
   * dated commitment of the same person — the booking accept guard's own
   * inclusive-range rule (`rangesOverlapInclusive`, a missing end collapses
   * to the start day). A commitment is not a prohibition (SEP-2): the flag
   * warns, it never blocks or hides either row.
   */
  readonly conflict: boolean;
}

export interface RosterCommitmentRow {
  readonly workerId: string;
  readonly workerName: string | null;
  /** Dated commitments, earliest first; open-ended ranges sort by start. */
  readonly commitments: readonly RosterCommitmentItem[];
  /** Overlapping PAIRS among this person's dated commitments (0 = none). */
  readonly overlaps: number;
  /** Active project assignments nobody dated — real, window unknown. */
  readonly undatedProjects: readonly Pick<UndatedProjectCommitment, "projectId" | "label">[];
}

export type RosterCommitmentsView =
  | {
      readonly status: "ok";
      /** Only people with at least one commitment (dated or undated). */
      readonly rows: readonly RosterCommitmentRow[];
      /** People on the roster with nothing on record — NOT "free". */
      readonly withoutCommitment: number;
    }
  | { readonly status: "needs-migration" }
  | { readonly status: "unavailable" };

export interface RosterPerson {
  readonly workerId: string;
  readonly name: string | null;
}

function byStart(
  a: Pick<RosterCommitmentItem, "startDate" | "label">,
  b: Pick<RosterCommitmentItem, "startDate" | "label">,
): number {
  if (a.startDate === b.startDate) return (a.label ?? "").localeCompare(b.label ?? "");
  if (a.startDate === null) return 1;
  if (b.startDate === null) return -1;
  return a.startDate < b.startDate ? -1 : 1;
}

/** The effective inclusive end day: a missing or earlier end collapses to
 *  the start day — `coalesce(end, start)`, the accept guard's rule. */
function effectiveEnd(c: Pick<RosterCommitmentItem, "startDate" | "endDate">): string | null {
  if (!c.startDate) return null;
  return c.endDate && c.endDate >= c.startDate ? c.endDate : c.startDate;
}

/**
 * Pairwise overlap among ONE person's dated commitments. Pure, bounded by
 * the already-bounded read. Returns the items with their `conflict` flag
 * and the number of overlapping pairs.
 */
export function markCommitmentOverlaps(
  items: readonly Omit<RosterCommitmentItem, "conflict">[],
): { readonly items: readonly RosterCommitmentItem[]; readonly overlaps: number } {
  const flagged = items.map(() => false);
  let overlaps = 0;
  for (let i = 0; i < items.length; i++) {
    const aStart = items[i].startDate;
    const aEnd = effectiveEnd(items[i]);
    if (!aStart || !aEnd) continue;
    for (let j = i + 1; j < items.length; j++) {
      const bStart = items[j].startDate;
      const bEnd = effectiveEnd(items[j]);
      if (!bStart || !bEnd) continue;
      if (rangesOverlapInclusive(aStart, aEnd, bStart, bEnd)) {
        flagged[i] = true;
        flagged[j] = true;
        overlaps += 1;
      }
    }
  }
  return {
    items: items.map((c, i) => ({ ...c, conflict: flagged[i] })),
    overlaps,
  };
}

export function buildRosterCommitmentsView(
  people: readonly RosterPerson[],
  committed: EmployerCommittedWorkResult,
): RosterCommitmentsView {
  if (committed.status !== "ok") return { status: committed.status };
  const dated = new Map<string, Omit<RosterCommitmentItem, "conflict">[]>();
  for (const c of committed.commitments) {
    const list = dated.get(c.workerId) ?? [];
    list.push({
      kind: c.kind,
      sourceId: c.sourceId,
      label: c.label,
      startDate: c.startDate,
      endDate: c.endDate,
    });
    dated.set(c.workerId, list);
  }
  const undated = new Map<string, { projectId: string; label: string | null }[]>();
  for (const u of committed.undatedProjects) {
    const list = undated.get(u.workerId) ?? [];
    list.push({ projectId: u.projectId, label: u.label });
    undated.set(u.workerId, list);
  }
  const rows: RosterCommitmentRow[] = [];
  let withoutCommitment = 0;
  for (const p of people) {
    const sorted = [...(dated.get(p.workerId) ?? [])].sort(byStart);
    const undatedProjects = undated.get(p.workerId) ?? [];
    if (sorted.length === 0 && undatedProjects.length === 0) {
      withoutCommitment += 1;
      continue;
    }
    const { items: commitments, overlaps } = markCommitmentOverlaps(sorted);
    rows.push({
      workerId: p.workerId,
      workerName: p.name,
      commitments,
      overlaps,
      undatedProjects,
    });
  }
  // Earliest next commitment first; people with only undated work last.
  rows.sort((a, b) => {
    const sa = a.commitments[0]?.startDate ?? null;
    const sb = b.commitments[0]?.startDate ?? null;
    if (sa === sb) return (a.workerName ?? "").localeCompare(b.workerName ?? "");
    if (sa === null) return 1;
    if (sb === null) return -1;
    return sa < sb ? -1 : 1;
  });
  return { status: "ok", rows, withoutCommitment };
}
