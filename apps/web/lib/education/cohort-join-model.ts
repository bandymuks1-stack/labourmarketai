/**
 * J-12 — a learner asks to join a learning group (owner decision 2026-11-02).
 *
 * Pure model for the learner's side of `list_open_education_cohorts_v1`
 * (migration 20261102160000): the groups an institution has opened for
 * requests, plus the caller's own pending or declined requests (which stay
 * listed after the institution closes the group, so the learner always sees
 * where their request stands). A group the learner already belongs to is not
 * listed: the learning compass shows it.
 */

export type CohortJoinStatus = "none" | "requested" | "declined" | "withdrawn" | "left";

export interface JoinableCohort {
  readonly cohortId: string;
  readonly cohortName: string;
  readonly programName: string;
  readonly institutionName: string | null;
  readonly targetProfessionSlug: string | null;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  /** The institution still accepts new requests for this group. */
  readonly open: boolean;
  readonly myStatus: CohortJoinStatus;
}

const STATUSES: ReadonlySet<string> = new Set(["requested", "declined", "withdrawn", "left"]);

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Map RPC rows; a row in an unexpected state (e.g. `active`) is dropped, never guessed. */
export function toJoinableCohorts(rows: ReadonlyArray<Record<string, unknown>>): JoinableCohort[] {
  const out: JoinableCohort[] = [];
  for (const r of rows) {
    const raw = r.my_status == null ? "none" : String(r.my_status);
    if (raw !== "none" && !STATUSES.has(raw)) continue;
    const cohortId = text(r.cohort_id);
    const cohortName = text(r.cohort_name);
    const programName = text(r.program_name);
    if (!cohortId || !cohortName || !programName) continue;
    out.push({
      cohortId,
      cohortName,
      programName,
      institutionName: text(r.institution_name),
      targetProfessionSlug: text(r.target_profession_slug),
      startsOn: text(r.starts_on),
      endsOn: text(r.ends_on),
      open: r.join_requests_open === true,
      myStatus: raw as CohortJoinStatus,
    });
  }
  return out;
}

/** The learner may send (or send again) a request only while the group is open and nothing is pending. */
export function canRequest(c: JoinableCohort): boolean {
  return c.open && c.myStatus !== "requested";
}
