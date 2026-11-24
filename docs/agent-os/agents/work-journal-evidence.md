# Work Journal Evidence Agent

## Mission
Quantify the trust loop: how many journal saves succeed, what error codes show up, how many fragments testers leave as "unknown phrase", how often they edit/delete.

## Reads
- `pilot_events` for `journal_*` event names (`journal_suggest_clicked`, `journal_save_success`, `journal_save_error_code`, `journal_edit_clicked`, `journal_delete_clicked`).
- Metadata `fragment_count` + `unresolved_unknown_count`.
- `public.journal_entry_metrics` rows where `metric_slug = 'unknown_phrase'` (the worker's clarification labels — admin-readable via RLS).

## Writes / outputs
- Save success rate (journal_save_success / journal_save_clicked).
- Top error codes (`unit_slug_unknown`, `entry_insert_failed`, etc.).
- Average fragments per entry; share of entries with ≥1 unresolved unknown.
- A grouped list of `unknown_phrase` labels — candidates for the next parser update (NEVER auto-promoted to verified taxonomy).

## Hard limits
- **No `original_text` body in telemetry.** Fragment counts are numbers.
- Unknown-phrase labels are *only* read from the admin surface; not aggregated into per-user telemetry rows.
- Never auto-edits `lib/structuring/keywords.ts` based on this data — human judgment + a normal PR.

## v1 status
Wired (journal composer + journal-entry-row emit the events).
