-- Rollback for 20260930133500_worker_avatar_path_for_relations_v1.sql
-- Removes the one read-only function; no data, table, grant or policy was
-- changed by the forward migration, so nothing else needs restoring. After
-- this, getAvatarForVisibleWorker() receives no path and every viewer other
-- than the worker sees the initials monogram again (the pre-D1 state).
drop function if exists public.worker_avatar_path_v1(uuid);
