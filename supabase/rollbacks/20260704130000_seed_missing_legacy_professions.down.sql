-- Rollback for 20260704130000_seed_missing_legacy_professions.sql
--
-- Removes ONLY the three legacy professions seeded by the forward migration,
-- and ONLY where no worker references them (guarded deletes — a profession a
-- worker has selected is user data and is NOT removed). If a row pre-existed
-- via manual Studio insertion, this rollback would remove it only when
-- unreferenced; review before applying if that distinction matters.

delete from public.profession_skills ps
 using public.professions p
 where ps.profession_id = p.id
   and p.slug in ('builder', 'rebar_worker', 'site_manager');

delete from public.professions p
 where p.slug in ('builder', 'rebar_worker', 'site_manager')
   and not exists (
     select 1 from public.worker_professions wp where wp.profession_id = p.id
   );
