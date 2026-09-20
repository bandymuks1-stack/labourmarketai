import type {
  EmployerCommittedWorkResult,
  UndatedProjectCommitment,
  WorkerCommitment,
} from "@/lib/planning/employer-committed-work";

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
}

export interface RosterCommitmentRow {
  readonly workerId: string;
  readonly workerName: string | null;
  /** Dated commitments, earliest first; open-ended ranges sort by start. */
  readonly commitments: readonly RosterCommitmentItem[];
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

function byStart(a: RosterCommitmentItem, b: RosterCommitmentItem): number {
  if (a.startDate === b.startDate) return (a.label ?? "").localeCompare(b.label ?? "");
  if (a.startDate === null) return 1;
  if (b.startDate === null) return -1;
  return a.startDate < b.startDate ? -1 : 1;
}

export function buildRosterCommitmentsView(
  people: readonly RosterPerson[],
  committed: EmployerCommittedWorkResult,
): RosterCommitmentsView {
  if (committed.status !== "ok") return { status: committed.status };
  const dated = new Map<string, RosterCommitmentItem[]>();
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
    const commitments = [...(dated.get(p.workerId) ?? [])].sort(byStart);
    const undatedProjects = undated.get(p.workerId) ?? [];
    if (commitments.length === 0 && undatedProjects.length === 0) {
      withoutCommitment += 1;
      continue;
    }
    rows.push({ workerId: p.workerId, workerName: p.name, commitments, undatedProjects });
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
