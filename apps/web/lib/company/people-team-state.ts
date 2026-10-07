import type { CapacityChatResult } from "@/lib/conversation/capacity-contract";

/**
 * THE PEOPLE DOOR'S TEAM STATE — a projection of the ONE capacity read.
 *
 * `whoIsAvailableCore` (the read the chat, the home and the planning page all
 * use) already says per person: free, working (committed) or away. This module
 * only reshapes it for the People door; it computes nothing of its own and
 * writes nothing.
 *
 * UNKNOWN IS NOT ZERO (SEP-7). A person is called `free` only when BOTH inputs
 * answered (leave and committed work) — otherwise "free" would only mean
 * "nothing said otherwise". `working` needs the commitments read, `away` the
 * leave read. Team counts are returned only when both answered; a failed read
 * is `null`, never a row of calm zeros.
 */
export type PeopleStateKind = "free" | "working" | "away";

export interface PeopleStateRow {
  readonly state: PeopleStateKind;
  /** Last day of the commitment / leave when it is dated; otherwise null. */
  readonly until: string | null;
  /** The title of the work when the source row carries one; never invented. */
  readonly project: string | null;
}

export interface PeopleTeamState {
  readonly byWorker: Readonly<Record<string, PeopleStateRow>>;
  readonly counts: {
    readonly free: number;
    readonly working: number;
    readonly away: number;
  } | null;
}

export function derivePeopleTeamState(capacity: CapacityChatResult): PeopleTeamState {
  if (capacity.kind !== "ok") return { byWorker: {}, counts: null };
  const both = capacity.absencesKnown && capacity.commitmentsKnown;
  const byWorker: Record<string, PeopleStateRow> = {};
  for (const r of capacity.rows) {
    if (r.state === "unavailable") {
      if (!capacity.absencesKnown) continue;
      byWorker[r.workerId] = { state: "away", until: r.unavailableUntil, project: null };
    } else if (r.state === "committed") {
      if (!capacity.commitmentsKnown) continue;
      byWorker[r.workerId] = { state: "working", until: r.unavailableUntil, project: r.committedTo };
    } else if (both) {
      byWorker[r.workerId] = { state: "free", until: null, project: null };
    }
  }
  const c = capacity.counts;
  return {
    byWorker,
    counts: both && c ? { free: c.free, working: c.committed, away: c.unavailable } : null,
  };
}
