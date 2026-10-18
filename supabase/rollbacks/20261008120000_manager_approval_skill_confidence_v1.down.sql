-- Rollback for 20261008120000_manager_approval_skill_confidence_v1.
-- Pure function drop. Confidence scores already written stay as history
-- (they are derived values; the web app falls back to the pre-R-5 no-op).
begin;
drop function if exists public.recompute_worker_skill_confidence_from_manager_approval_v1(uuid);
commit;
