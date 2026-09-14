-- Rollback for 20260914210000_external_profiles_v1 (PER-11 split).
--
-- Drops exactly what that migration creates and nothing else. The parent
-- migration 20260713210000_multi_source_talent_v1 declares the same table and
-- two of the same functions; if BOTH were ever applied (they must not be —
-- see the split file's lineage note) this rollback would remove objects the
-- parent also owns.
--
-- DATA LOSS: dropping the table destroys every external profile link a worker
-- has connected, including soft-disconnected rows kept as provenance. Export
-- first if any exist. At the time the split was written the table was absent
-- from production, so a rollback immediately after a first apply loses nothing.

drop function if exists public.disconnect_external_profile_v1(uuid);
drop function if exists public.save_worker_external_profile_v1(text, text, uuid, jsonb);

drop policy if exists worker_external_profiles_select on public.worker_external_profiles;
drop index if exists public.worker_external_profiles_worker_idx;
drop table if exists public.worker_external_profiles;
