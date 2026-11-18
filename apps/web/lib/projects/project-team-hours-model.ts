import type { JournalConfirmationRow, JournalMetricRow } from "@/lib/journal/journal-list-core";
import type { JournalWindowEntryRow } from "@/lib/journal/journal-window-report";

/**
 * One row of `project_team_journal_hour_rows_v1` (20261019210000): an entry a
 * brigade member recorded on the caller's project through a team assignment,
 * reduced to what the ONE work-time rule needs. Opaque keys, time metrics,
 * review rows with "was it the worker's own decision" instead of who.
 */
export type TeamHourRow = {
  entry_key: string;
  correction_of_key: string | null;
  created_at: string;
  context_key: string;
  metrics: JournalMetricRow[] | null;
  confirmations: (Omit<JournalConfirmationRow, "confirmer_id"> & { by_subject?: boolean })[] | null;
};

/** The marker standing in for the worker's profile id: the rule only asks
 *  whether a review was the subject's own (self-confirmation never counts). */
const SUBJECT = "subject";

/** Map the opaque rows onto the shape `countedOnce` + `deriveWindowWorkTime`
 *  read, so brigade hours go through the SAME rule as every other hour. */
export function teamHourRowsToWindowRows(rows: readonly TeamHourRow[]): JournalWindowEntryRow[] {
  return rows.map((r) => ({
    id: r.entry_key,
    worker_id: null,
    created_at: r.created_at,
    correction_of: r.correction_of_key,
    engagement_context_id: r.context_key,
    workers: null,
    subject: { profile_id: SUBJECT },
    journal_entry_confirmations: (r.confirmations ?? []).map((c) => ({
      confirmation_scope: c.confirmation_scope,
      created_at: c.created_at ?? null,
      confirmer_role: c.confirmer_role ?? null,
      confirmer_id: c.by_subject ? SUBJECT : "reviewer",
    })),
    journal_entry_metrics: r.metrics ?? [],
  }));
}
