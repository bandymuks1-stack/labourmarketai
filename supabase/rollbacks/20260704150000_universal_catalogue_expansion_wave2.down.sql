-- Rollback for 20260704150000_universal_catalogue_expansion_wave2.sql
--
-- Removes ONLY the wave-2 catalogue rows seeded by the forward migration, and
-- ONLY where no worker references them (guarded deletes — a skill/profession a
-- worker has selected or evidenced is user data and is NOT removed). If a row
-- pre-existed via manual Studio insertion, this rollback would remove it only
-- when unreferenced; review before applying if that distinction matters.

-- 1. Links first (both directions: new professions' links and wave-2 skill
--    links added to existing professions).
delete from public.profession_skills ps
 using public.professions p
 where ps.profession_id = p.id
   and p.slug in (
     'receptionist','kitchen_helper','barista','baker','call_centre_agent',
     'merchandiser','auto_mechanic','handyman','hairdresser','barber',
     'nail_technician','recruiter','laundry_worker'
   );

delete from public.profession_skills ps
 using public.skills s
 where ps.skill_id = s.id
   and s.slug in (
     'data-entry','office-software','reception','barcode-scanning',
     'pallet-handling','stock-taking','kitchen-help','dishwashing','baking',
     'barista-work','call-centre','merchandising','auto-repair',
     'appliance-repair','handyman-work','hairdressing','barbering','nail-care',
     'recruitment','personnel-admin','laundry'
   );

-- 2. Professions — only when no worker references them.
delete from public.professions p
 where p.slug in (
     'receptionist','kitchen_helper','barista','baker','call_centre_agent',
     'merchandiser','auto_mechanic','handyman','hairdresser','barber',
     'nail_technician','recruiter','laundry_worker'
   )
   and not exists (
     select 1 from public.worker_professions wp where wp.profession_id = p.id
   );

-- 3. Skills — only when neither worker_skills nor journal evidence references
--    them.
delete from public.skills s
 where s.slug in (
     'data-entry','office-software','reception','barcode-scanning',
     'pallet-handling','stock-taking','kitchen-help','dishwashing','baking',
     'barista-work','call-centre','merchandising','auto-repair',
     'appliance-repair','handyman-work','hairdressing','barbering','nail-care',
     'recruitment','personnel-admin','laundry'
   )
   and not exists (select 1 from public.worker_skills ws where ws.skill_id = s.id)
   and not exists (select 1 from public.journal_entry_skills jes where jes.skill_id = s.id);
