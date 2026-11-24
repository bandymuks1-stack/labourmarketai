-- additive: true
-- ════════════════════════════════════════════════════════════════════════
-- 20260704150000_universal_catalogue_expansion_wave2.sql
--
-- Universal catalogue expansion, wave 2 (owner mandate 2026-07-04 — "broader
-- real labour-market skill coverage"). Fills the class-E gaps measured by
-- runtime/audits/skill-recognition-language-coverage-audit-2026-07-04.md §4E:
-- office/data-entry (the Excel phrase recognised NOTHING in any language),
-- warehouse scanning/pallets/stock-taking, hospitality kitchen-help/
-- dishwashing/baking/barista, retail reception/call-centre/merchandising,
-- repair/auto-mechanic (major LT market segment), beauty basics, HR basics,
-- laundry. Same canonical tables — no parallel structure (doctrine §2).
-- Regulated/sensitive families (security guard, nurse assistant, legal,
-- certified accounting) are deliberately NOT here — class F, owner decision.
--
-- Display names for every slug ship in apps/web/messages/{locale}/
-- skill-names.json and professions.json (all 11 locales, same PR) —
-- post-0012 shape: no name_* columns (the truth-audit apply-bug lesson).
--
-- Safety: strictly additive — INSERT … ON CONFLICT DO NOTHING only. No DDL,
-- no grants, no RLS change, no updates/deletes of existing rows. Idempotent.
-- Rollback: supabase/rollbacks/20260704150000_universal_catalogue_expansion_wave2.down.sql
-- (guarded deletes — refuses to remove a skill/profession a worker already
-- references).
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Wave-2 skills (slug + category only) ────────────────────────────────
insert into public.skills (slug, category) values
  -- office & administration
  ('data-entry',        'office.admin'),
  ('office-software',   'office.admin'),
  ('reception',         'office.admin'),
  -- warehouse & logistics
  ('barcode-scanning',  'logistics.warehouse'),
  ('pallet-handling',   'logistics.warehouse'),
  ('stock-taking',      'logistics.warehouse'),
  -- hospitality & food
  ('kitchen-help',      'hospitality.kitchen'),
  ('dishwashing',       'hospitality.kitchen'),
  ('baking',            'hospitality.kitchen'),
  ('barista-work',      'hospitality.service'),
  -- customer service & retail
  ('call-centre',       'sales.service'),
  ('merchandising',     'sales.retail'),
  -- repair & maintenance
  ('auto-repair',       'repair.vehicles'),
  ('appliance-repair',  'repair.equipment'),
  ('handyman-work',     'repair.general'),
  -- beauty & personal services
  ('hairdressing',      'beauty.hair'),
  ('barbering',         'beauty.hair'),
  ('nail-care',         'beauty.nails'),
  -- HR & recruitment
  ('recruitment',       'hr.recruitment'),
  ('personnel-admin',   'hr.admin'),
  -- cleaning & facilities
  ('laundry',           'cleaning.textile')
on conflict (slug) do nothing;

-- ── 2. Wave-2 professions (slug + sector only) ─────────────────────────────
insert into public.professions (slug, sector) values
  ('receptionist',      'office_admin'),
  ('kitchen_helper',    'hospitality_food'),
  ('barista',           'hospitality_food'),
  ('baker',             'hospitality_food'),
  ('call_centre_agent', 'retail_sales'),
  ('merchandiser',      'retail_sales'),
  ('auto_mechanic',     'repair_maintenance'),
  ('handyman',          'repair_maintenance'),
  ('hairdresser',       'beauty_services'),
  ('barber',            'beauty_services'),
  ('nail_technician',   'beauty_services'),
  ('recruiter',         'hr_recruitment'),
  ('laundry_worker',    'cleaning_facility')
on conflict (slug) do nothing;

-- ── 3. profession_skills links (is_core, display_order) ───────────────────
-- New professions get their core + related skills; existing professions gain
-- wave-2 skills with display_order continuing after their current links.
with link(prof_slug, skill_slug, is_core, ord) as (
  values
    ('receptionist','reception',true,1),('receptionist','document-handling',false,2),
    ('receptionist','customer-service',false,3),('receptionist','call-centre',false,4),
    ('kitchen_helper','kitchen-help',true,1),('kitchen_helper','dishwashing',false,2),
    ('kitchen_helper','cleaning-services',false,3),
    ('barista','barista-work',true,1),('barista','customer-service',false,2),
    ('barista','cashier',false,3),
    ('baker','baking',true,1),('baker','cooking',false,2),('baker','kitchen-help',false,3),
    ('call_centre_agent','call-centre',true,1),('call_centre_agent','customer-service',false,2),
    ('merchandiser','merchandising',true,1),('merchandiser','stock-taking',false,2),
    ('merchandiser','order-picking',false,3),
    ('auto_mechanic','auto-repair',true,1),('auto_mechanic','equipment-operation',false,2),
    ('auto_mechanic','hand-tools',false,3),
    ('handyman','handyman-work',true,1),('handyman','hand-tools',false,2),
    ('handyman','appliance-repair',false,3),('handyman','painting',false,4),
    ('hairdresser','hairdressing',true,1),('hairdresser','customer-service',false,2),
    ('barber','barbering',true,1),('barber','hairdressing',false,2),
    ('barber','customer-service',false,3),
    ('nail_technician','nail-care',true,1),('nail_technician','customer-service',false,2),
    ('recruiter','recruitment',true,1),('recruiter','personnel-admin',false,2),
    ('recruiter','document-handling',false,3),
    ('laundry_worker','laundry',true,1),('laundry_worker','housekeeping',false,2),
    ('laundry_worker','cleaning-services',false,3),
    -- enrich existing professions with wave-2 skills
    ('office_administrator','data-entry',false,5),('office_administrator','office-software',false,6),
    ('office_administrator','reception',false,7),
    ('warehouse_worker','barcode-scanning',false,5),('warehouse_worker','pallet-handling',false,6),
    ('warehouse_worker','stock-taking',false,7),
    ('customer_service_specialist','call-centre',false,4),
    ('cleaner','laundry',false,5)
)
insert into public.profession_skills (profession_id, skill_id, is_core, display_order)
select p.id, s.id, l.is_core, l.ord
  from link l
  join public.professions p on p.slug = l.prof_slug
  join public.skills s       on s.slug = l.skill_slug
on conflict (profession_id, skill_id) do nothing;
