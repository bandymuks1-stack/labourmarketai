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
 * Derive the history, newest first.
 *
 * Ordering is by real dates only: a row with no start date sorts last rather
 * than being given an invented position. Two rows with the same date keep
 * their input order, so the result is deterministic.
 */
export function deriveWorkHistory(
  rows: readonly WorkHistorySourceRow[],
): WorkHistoryEntry[] {
  const entries = rows.map((r) => ({
    id: r.id,
    title: nonEmpty(r.title),
    // The org's own display name, then its legal name — never a fabricated
    // label, and never the id.
    organizationName:
      nonEmpty(r.organizations?.display_name) ?? nonEmpty(r.organizations?.legal_name),
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
