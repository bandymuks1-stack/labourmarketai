-- Rollback for 20260716140000_pilots_cohort_v1.sql — restores the prior
-- state exactly. The forward migration created THREE new tables (pilots,
-- pilot_participants, pilot_outcomes) plus their policies / indexes and
-- FIVE new RPCs; nothing pre-existing was altered, so dropping those
-- objects removes every feature-created object.
--
-- WARNING (destructive reversal): dropping pilot_outcomes discards the
-- owner-recorded outcome ledger and dropping pilot_participants discards
-- cohort membership. audit_logs rows written by the RPCs are kept (the
-- audit trail is append-only by doctrine and is NOT part of this feature's
-- object set).

begin;

drop function if exists public.record_pilot_outcome_v1(uuid, text, uuid, text);
drop function if exists public.remove_pilot_participant_v1(uuid, uuid);
drop function if exists public.add_pilot_participant_v1(uuid, uuid, text);
drop function if exists public.set_pilot_status_v1(uuid, text);
drop function if exists public.create_pilot_v1(text, text, date, date);

drop policy if exists pilot_outcomes_select on public.pilot_outcomes;
drop policy if exists pilot_participants_select on public.pilot_participants;
drop policy if exists pilots_select on public.pilots;

drop index if exists public.pilot_outcomes_pilot_created_idx;
drop index if exists public.pilot_participants_pilot_idx;
drop index if exists public.pilots_status_created_idx;

drop table if exists public.pilot_outcomes;
drop table if exists public.pilot_participants;
drop table if exists public.pilots;

commit;
