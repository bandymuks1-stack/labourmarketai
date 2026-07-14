-- Rollback for 20260714160000_worker_education_achievements_v1.sql — restores
-- the prior state exactly. The feature created FOUR new objects (two slug
-- registries + two owner-only tables) and their policies / indexes / grants;
-- no existing table, RPC or policy was touched, so dropping the four tables
-- removes every feature-created object. Data in them (self-declared education
-- and achievement rows) is destroyed by this rollback — export first if the
-- owner wants to keep it.
begin;

drop table if exists public.worker_achievements;
drop table if exists public.worker_education;
drop table if exists public.achievement_types;
drop table if exists public.education_types;

commit;
