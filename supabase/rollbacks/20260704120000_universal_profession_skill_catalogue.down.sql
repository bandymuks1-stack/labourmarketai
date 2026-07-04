-- Rollback for 20260704120000_universal_profession_skill_catalogue.sql
--
-- Removes ONLY the universal catalogue rows seeded by the forward migration,
-- and ONLY where no worker data references them (guarded deletes — a skill a
-- worker has declared, or a profession a worker has selected, is user data
-- and is NOT removed; doctrine: rollbacks never destroy author/worker data).
-- Construction rows (0002/0008/0011) are untouched.

-- 1. Drop the seeded profession↔skill links (pure reference data, safe).
delete from public.profession_skills ps
 using public.professions p
 where ps.profession_id = p.id
   and p.slug in (
     'caregiver','cleaner','cook','customer_service_specialist','driver',
     'event_organizer','farm_worker','furniture_assembler','gardener',
     'office_administrator','production_worker','safety_specialist',
     'sales_assistant','software_developer','teacher','translator','waiter',
     'warehouse_worker'
   );

-- 2. Drop the seeded professions — only if no worker references them.
delete from public.professions p
 where p.slug in (
     'caregiver','cleaner','cook','customer_service_specialist','driver',
     'event_organizer','farm_worker','gardener','office_administrator',
     'production_worker','safety_specialist','sales_assistant',
     'software_developer','teacher','translator','waiter','warehouse_worker'
   )
   and not exists (
     select 1 from public.worker_professions wp where wp.profession_id = p.id
   );

-- 3. Drop the seeded skills — only if unreferenced by worker data or links.
delete from public.skills s
 where s.slug in (
     'driving','delivery-driving','cargo-transport','forklift-operation',
     'warehouse-operations','order-picking','assembly-work','production-line',
     'packaging','equipment-operation','cleaning-services','window-cleaning',
     'housekeeping','winter-service','administration','document-handling',
     'bookkeeping','programming','qa-testing','it-support','web-design',
     'graphic-design','customer-service','cashier','sales-assistant',
     'cooking','waiting-tables','bartending','gardening','farm-work',
     'animal-care','elderly-care','childcare','first-aid','teaching',
     'translation','event-setup'
   )
   and not exists (select 1 from public.worker_skills ws where ws.skill_id = s.id)
   and not exists (select 1 from public.journal_entry_skills jes where jes.skill_id = s.id)
   and not exists (select 1 from public.profession_skills ps where ps.skill_id = s.id);
