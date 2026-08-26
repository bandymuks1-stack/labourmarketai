/**
 * Work history — PURE model (W5 Slice 1).
 *
 * The Live Profile Card's one genuine data gap: the card already knew the
 * worker's skills, evidence and confirmations, but nothing about WHERE that
 * work happened. This is that history, derived from the canonical membership
 * spine (`engagement_contexts`, doctrine §5.5) — the same rows the workspace
 * resolver reads. No new table, no second membership truth.
 *
 * PURE and null-safe: it transforms already-fetched rows. No DB, no RLS, no
 * RPC — the server half owns the read, this owns the meaning.
 *
 * HONESTY RULES BAKED IN:
 *  - a missing organization name is `null`, never "Unknown company";
 *  - a missing start date is `null`, never today;
 *  - `current` is derived from the REAL `ended_at` / `status`, never guessed;
 *  - nothing is scored, ranked or weighted. This is a record of what happened,
 *    not an assessment of the person (§19).
 */

import { orgDisplayName } from "@/lib/company/org-display";

/** The relationship slugs that count as WORK history — the ONE list every
 *  history surface filters by (W4: the card timeline used to skip this filter
 *  and showed manager/student/volunteer rows the CV and profile omit). */
export const WORKER_RELATIONSHIPS = [
  "employee",
  "freelancer",
  "consultant",
  "owner",
  "collaborator",
] as const;

/** One real engagement in the person's history. */
export interface WorkHistoryEntry {
  readonly id: string;
  /** The engagement's own title (e.g. a role), or null when never set. */
  readonly title: string | null;
  /** Display name of the organization, or null when not readable/absent. */
  readonly organizationName: string | null;
  /** Canonical relationship slug (employee / manager / owner …). */
  readonly relationshipSlug: string;
  /** ISO date the engagement started, or null when never recorded. */
  readonly startedAt: string | null;
  /** ISO date it ended; null while it is still running. */
  readonly endedAt: string | null;
  /** True only when the row says active AND has no end date. */
  readonly current: boolean;
  readonly countryCode: string | null;
}

/** The shape the server read hands over — one engagement row plus its org. */
export interface WorkHistorySourceRow {
  readonly id: string;
  readonly title: string | null;
  readonly relationship_slug: string;
  readonly started_at: string | null;
  readonly ended_at: string | null;
  readonly status: string;
  readonly country_code: string | null;
  readonly organizations: {
    readonly display_name: string | null;
    readonly legal_name: string | null;
  } | null;
}

/** Engagement statuses that mean "this is running right now". */
const ACTIVE_STATUS = "active";

/**
 * Does this engagement row say ANYTHING about the person's work?
 *
 * ── THE DEFECT THIS EXISTS TO FIX ──────────────────────────────────────────
 * `ensure_worker_personal_engagement` (20260702140000) gives every worker a
 * personal engagement the moment their `workers` row is created, because the
 * journal composer requires a context to write against. That row is pure
 * scaffolding: no organization, no title, no start date, no end date — just
 * `relationship_slug = 'employee'`, `is_primary`, `active`.
 *
 * It is also, by that same shape, indistinguishable from a real employment
 * row to every history reader. So the CV printed it: a work-history entry
 * whose employer fell back to the word "Employee" and which carried no dates.
 * The profile card counted it as a current engagement.
 *
 * Measured in production on 2026-08-26: 35 of 36 profiles carry exactly this
 * row (organization NULL, title NULL, started_at NULL, active, primary). Every
 * one of those people had a phantom job on their CV.
 *
 * ── WHY THIS PREDICATE IS SAFE ─────────────────────────────────────────────
 * It drops a row ONLY when the row asserts nothing at all — no organization,
 * no title, and neither date. Every path that records something real fails
 * that test and survives:
 *
 *   - self-declared history → `save_self_declared_work_history_v1` requires a
 *     title of at least 3 characters;
 *   - invitation acceptance → carries `organization_id`;
 *   - org membership / ownership → carries `organization_id`.
 *
 * A single recorded date is enough to keep a row: someone who typed only "I
 * started in 2019" stated a fact, and facts are not tidied away.
 *
 * ── WHAT THIS DOES NOT TOUCH ───────────────────────────────────────────────
 * The scaffold row stays exactly where it is and keeps doing its job. The
 * work-log context picker still offers it — case D in
 * `engagement-context-selection.ts` is the personal, org-less context, and a
 * person logging their own work needs it. This is a rule about what counts as
 * HISTORY, not a rule about what counts as a context.
 */
export function isRecordedEngagement(
  row: Pick<WorkHistorySourceRow, "title" | "started_at" | "ended_at"> & {
    readonly organizations?: WorkHistorySourceRow["organizations"];
    readonly organizationName?: string | null;
  },
): boolean {
  const org =
    row.organizationName ??
    row.organizations?.display_name ??
    row.organizations?.legal_name ??
    null;
  return (
    nonEmpty(org) !== null ||
    nonEmpty(row.title) !== null ||
    nonEmpty(row.started_at) !== null ||
    nonEmpty(row.ended_at) !== null
  );
}

/**
 * Derive the history, newest first.
 *
 * Ordering is by real dates only: a row with no start date sorts last rather
 * than being given an invented position. Two rows with the same date keep
 * their input order, so the result is deterministic.
 */
export function deriveWorkHistory(
  rows: readonly WorkHistorySourceRow[],
): WorkHistoryEntry[] {
  const entries = rows.filter(isRecordedEngagement).map((r) => ({
    id: r.id,
    title: nonEmpty(r.title),
    // The org's own display name, then its legal name — never a fabricated
    // label, and never the id.
    organizationName:
      orgDisplayName(r.organizations?.display_name, r.organizations?.legal_name),
    relationshipSlug: r.relationship_slug,
    startedAt: nonEmpty(r.started_at),
    endedAt: nonEmpty(r.ended_at),
    current: r.status === ACTIVE_STATUS && !nonEmpty(r.ended_at),
    countryCode: nonEmpty(r.country_code),
  }));

  return entries.sort((a, b) => {
    if (a.startedAt === b.startedAt) return 0;
    if (a.startedAt === null) return 1; // undated last — never guessed into place
    if (b.startedAt === null) return -1;
    return a.startedAt < b.startedAt ? 1 : -1;
  });
}

/** How many of these engagements are running right now. A count of real rows. */
export function countCurrentEngagements(entries: readonly WorkHistoryEntry[]): number {
  return entries.filter((e) => e.current).length;
}

function nonEmpty(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
}
