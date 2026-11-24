# Tester Journey Agent

## Mission
Show what testers actually do — task starts, completions, abandonment points, friction routes. The single most-asked-for view from owner.

## Reads
`public.pilot_events` (admin-only RLS). Looks at:
- `task_start` / `task_complete` / `task_error` / `task_abandon` rows.
- `(task_name, result)` counts.
- `avg(duration_ms)` per task.
- `route` of the failure events.

## Tasks tracked in v1
- `journal_entry_create` — composer → suggest → confirm → save.
- `journal_entry_edit` — supersede path through the same composer.
- Future v2: `login` (Google OAuth round-trip), `profile_text_save`, `pilot_draft_save_{company,agency,buyer}`.

## Writes / outputs
For the admin dashboard at `/[locale]/dashboard/admin/pilot-telemetry`:
- A task-summary table (started / success / error / abandoned / avg ms).
- A top-errors list (event_name + error_code, top 20 by count).
- A recent-events table (last 200).

## Hard limits
- No raw journal / profile text in metadata — the recording action's allowlist enforces this.
- No keystroke logging, no scroll/mouse tracking, no automatic abandonment detection.
- `route` is the path only (no query — `?next=` / `?error=` / `?trace=` would leak app intent).
- No public exposure — RLS + `requireSuperadmin` double-gate.

## v1 status
Wired. The admin telemetry page reads + renders the signals.
