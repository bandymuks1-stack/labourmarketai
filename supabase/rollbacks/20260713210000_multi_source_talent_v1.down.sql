-- Rollback for 20260713210000_multi_source_talent_v1.sql (multi-source
-- talent provenance + worker external profiles + identity-resolution audit).
-- Reverses everything the up migration added — six functions, the
-- append-only trigger and the three new tables. No pre-existing object was
-- modified by the up migration, so nothing else is touched.
--
-- NOTE: dropping identity_resolution_events discards the merge/unmerge audit
-- trail — hard-failure rollback only, never a routine cleanup.

begin;

drop function if exists public.record_identity_resolution_event_v1(text, uuid, uuid, text, text, text);
drop function if exists public.record_talent_source_v1(text, text, text, text, jsonb, text, uuid);
drop function if exists public.review_external_profile_snapshot_v1(uuid, text);
drop function if exists public.disconnect_external_profile_v1(uuid);
drop function if exists public.set_external_profile_visibility_v1(uuid, text);
drop function if exists public.save_worker_external_profile_v1(text, text, uuid, jsonb);

drop trigger if exists trg_identity_resolution_events_immutable
  on public.identity_resolution_events;
drop function if exists public.identity_resolution_events_block_mutation();

drop policy if exists identity_resolution_events_select on public.identity_resolution_events;
drop index if exists public.identity_resolution_events_primary_idx;
drop table if exists public.identity_resolution_events;

drop policy if exists talent_source_records_select on public.talent_source_records;
drop index if exists public.talent_source_records_subject_idx;
drop table if exists public.talent_source_records;

drop policy if exists worker_external_profiles_select on public.worker_external_profiles;
drop index if exists public.worker_external_profiles_worker_idx;
drop table if exists public.worker_external_profiles;

commit;
