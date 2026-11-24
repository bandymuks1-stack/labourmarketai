-- Rollback for 20260719150000_vehicle_cleaning_skill.sql
--
-- Guarded delete: removes the seeded `vehicle-cleaning` skill ONLY when no
-- worker data or taxonomy link references it (a skill a worker has declared,
-- or journal evidence points at, is user data and is NOT removed — doctrine:
-- rollbacks never destroy author/worker data).

delete from public.skills s
 where s.slug = 'vehicle-cleaning'
   and not exists (select 1 from public.worker_skills ws where ws.skill_id = s.id)
   and not exists (select 1 from public.journal_entry_skills jes where jes.skill_id = s.id)
   and not exists (select 1 from public.profession_skills ps where ps.skill_id = s.id);
