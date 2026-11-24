import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  durationKey,
  inclusiveDaySpan,
  learnDurations,
  type DurationObservation,
  type LearnedDuration,
} from "@/lib/workforce/learned-duration";

/**
 * WHAT COMPARABLE STAGES HAVE REALLY TAKEN — the read behind CAL-10.
 *
 * NO NEW STORE. Every finished `project_stages` row already carries both
 * halves of the comparison (`planned_start`/`planned_end` against
 * `actual_start`/`actual_end`); this reads them back. Nothing is written and
 * nothing is cached — a learned duration is DERIVED on every render, so it
 * can never outlive the evidence it came from (SEP-1).
 *
 * AUTHORIZATION IS THE DATABASE'S. `project_stages_select` (migration
 * 20260718140000) admits the project's managers (canonical
 * `can_manage_project`) and its actively assigned workers, and nothing else.
 * This module adds no filter of its own and no service-role client: a caller
 * learns from the stages they can already open, one by one, on the operations
 * board. Narrowing to a managed-project list computed in this process would
 * be a weaker guarantee than the database's own policy, not a stronger one.
 *
 * HONEST DEGRADATION. Three outcomes, never two. A missing relation is
 * `not-applied` (the owner-gated stages migration); a real read failure is
 * `unavailable`. Neither is rendered as "we have learned nothing" — an empty
 * body of evidence and an unread one are different facts.
 */

const RELATION_NOT_FOUND = "42P01";
const UNDEFINED_COLUMN = "42703";
const POSTGREST_RELATION_NOT_FOUND = "PGRST205";

/** Bounded like every other planning read. Newest stages first, so a very
 *  long history is trimmed at the OLD end, which is the end worth losing. */
const STAGE_READ_LIMIT = 1000;

export type LearnedStageDurations =
  | { readonly status: "ok"; readonly readings: readonly LearnedDuration[] }
  /** The stages migration is not applied here. Not "nothing was learned". */
  | { readonly status: "not-applied" }
  /** A real read failure. Never rendered as an empty history. */
  | { readonly status: "unavailable" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export async function getLearnedStageDurations(
  /** OPTIONAL explicit caller (G4 bridge) — absent = the cookie session. */
  caller?: { readonly supabase: SupabaseClient },
): Promise<LearnedStageDurations> {
  const supabase = caller?.supabase ?? (await createClient());

  const res = await asAny(supabase)
    .from("project_stages")
    .select("id, name, planned_start, planned_end, actual_start, actual_end, status")
    .eq("status", "done")
    .order("actual_end", { ascending: false, nullsFirst: false })
    .limit(STAGE_READ_LIMIT);
  if (res.error) {
    const code = res.error.code ?? "";
    return code === RELATION_NOT_FOUND ||
      code === UNDEFINED_COLUMN ||
      code === POSTGREST_RELATION_NOT_FOUND
      ? { status: "not-applied" }
      : { status: "unavailable" };
  }

  type Row = {
    id: string;
    name: string | null;
    planned_start: string | null;
    planned_end: string | null;
    actual_start: string | null;
    actual_end: string | null;
  };

  const observations: DurationObservation[] = [];
  const displayNameByKey = new Map<string, string>();
  for (const row of (res.data ?? []) as Row[]) {
    const key = durationKey(row.name);
    if (!key) continue;
    // A stage marked done with no recorded actual dates is not a measurement.
    // Assuming its planned band was met would manufacture exactly the
    // agreement this loop exists to test.
    const actualDays = inclusiveDaySpan(row.actual_start, row.actual_end);
    if (actualDays === null) continue;
    observations.push({
      key,
      sourceId: row.id,
      plannedDays: inclusiveDaySpan(row.planned_start, row.planned_end),
      actualDays,
      completedOn: row.actual_end,
    });
    // Rows arrive newest-first, so the FIRST spelling seen for a key is the
    // most recently written one. The human's own words, never a canonical
    // form invented here.
    if (!displayNameByKey.has(key) && row.name) displayNameByKey.set(key, row.name.trim());
  }

  return { status: "ok", readings: learnDurations(observations, displayNameByKey) };
}
