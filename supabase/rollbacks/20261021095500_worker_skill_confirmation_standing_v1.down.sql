-- Rollback for 20261021095500_worker_skill_confirmation_standing_v1.sql
--
-- A pure function drop. The migration wrote no row and changed no policy,
-- grant or table, so nothing else needs restoring. The app readers that call
-- the function (readCrossPartyStandingStates, apps/web/lib/evidence/
-- skill-confirmation-standing-read.ts) treat a missing function (PostgREST
-- PGRST202 / 42883) as "door not installed" and fall back to the stored
-- worker_skills.verified flag - the reading before this migration - so the
-- rollback needs no app revert. Any OTHER error stays UNKNOWN (never read as
-- confirmed, never as "nothing").

begin;

drop function if exists public.worker_skill_confirmations_standing_v1(uuid[]);

commit;
