-- additive: true
-- ════════════════════════════════════════════════════════════════════════
-- 20260704120000_universal_profession_skill_catalogue.sql
--
-- Universal profession/skill catalogue promotion (owner mandate 2026-07-04).
--
-- ROOT CAUSE this corrects: the seed catalogue (0002/0008/0011) was 100%
-- construction — 94/94 skills with construction.* categories, 18/18
-- professions with sector='construction'. Because worker_skills.skill_id and
-- journal_entry_skills.skill_id FK into public.skills, ONLY construction work
-- could ever become first-class skill evidence; every other profession
-- survived only as a free-text profile_skill_claims label. This migration
-- makes the other profession families first-class rows in the SAME canonical
-- tables (doctrine §2 canonical check: extend skills/professions/
-- profession_skills — no parallel structure).
--
-- ⚠️ CORRECTED IN PLACE BEFORE FIRST APPLY (truth audit 2026-07-04,
-- runtime/audits/skill-installation-truth-audit-2026-07-04.md): the original
-- merged version inserted name_lt/name_en (+name_ru) columns copied from the
-- 0008/0011 seed shape — but migration 0012 dropped ALL taxonomy name columns
-- (doctrine §2: names live in messages/{locale}/*.json keyed by slug). The
-- original file would have FAILED at apply time. This migration has NEVER
-- been applied to any environment (blocked on the Supabase MCP connector), so
-- correcting the file in place is safe — the version was never in the prod
-- ledger. Display names for every slug below live in
-- apps/web/messages/{locale}/skill-names.json and professions.json (all 11
-- locales, shipped in PR #583).
--
-- Content: 37 skills across transport/logistics, manufacturing/assembly,
-- cleaning/facilities, office/admin, IT, creative, sales/customer service,
-- hospitality/food, agriculture/gardening, care, education/languages and
-- events + 18 professions + their profession_skills links. Construction rows
-- are untouched — construction remains one profession family among many.
-- (furniture_assembler added 2026-07-04 owner-correction pass, before first
-- apply — same never-in-ledger in-place rule as the column correction above.
-- "bricklayer" is deliberately NOT a new slug: that trade is the canonical,
-- already-applied profession `mason` (LT "Mūrininkas"); a second slug would
-- duplicate the same trade — doctrine §2.)
--
-- Safety: strictly additive — INSERT … ON CONFLICT DO NOTHING only. No DDL,
-- no grants, no RLS change, no updates/deletes of existing rows. Idempotent.
-- Rollback: supabase/rollbacks/20260704120000_universal_profession_skill_catalogue.down.sql
-- (guarded deletes — refuses to remove a skill/profession a worker already
-- references).
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Universal skills (post-0012 shape: slug + category only; display
--       names live in messages/{locale}/skill-names.json) ──────────────────
insert into public.skills (slug, category) values
  -- transport & logistics
  ('driving',             'logistics.driving'),
  ('delivery-driving',    'logistics.driving'),
  ('cargo-transport',     'logistics.driving'),
  ('forklift-operation',  'logistics.warehouse'),
  ('warehouse-operations','logistics.warehouse'),
  ('order-picking',       'logistics.warehouse'),
  -- manufacturing & assembly
  ('assembly-work',       'manufacturing.assembly'),
  ('production-line',     'manufacturing.production'),
  ('packaging',           'manufacturing.production'),
  ('equipment-operation', 'manufacturing.equipment'),
  -- cleaning & facilities
  ('cleaning-services',   'cleaning.general'),
  ('window-cleaning',     'cleaning.general'),
  ('housekeeping',        'cleaning.hospitality'),
  ('winter-service',      'cleaning.outdoor'),
  -- office & administration
  ('administration',      'office.admin'),
  ('document-handling',   'office.admin'),
  ('bookkeeping',         'office.finance'),
  -- IT & software / creative
  ('programming',         'it.software'),
  ('qa-testing',          'it.software'),
  ('it-support',          'it.support'),
  ('web-design',          'it.design'),
  ('graphic-design',      'creative.design'),
  -- customer service & sales
  ('customer-service',    'sales.service'),
  ('cashier',             'sales.retail'),
  ('sales-assistant',     'sales.retail'),
  -- hospitality & food
  ('cooking',             'hospitality.kitchen'),
  ('waiting-tables',      'hospitality.service'),
  ('bartending',          'hospitality.service'),
  -- agriculture & gardening
  ('gardening',           'agriculture.gardening'),
  ('farm-work',           'agriculture.farming'),
  ('animal-care',         'agriculture.animals'),
  -- care & assistance / safety
  ('elderly-care',        'care.support'),
  ('childcare',           'care.support'),
  ('first-aid',           'care.safety'),
  -- education & languages
  ('teaching',            'education.teaching'),
  ('translation',         'education.languages'),
  -- events
  ('event-setup',         'events.setup')
on conflict (slug) do nothing;

-- ── 2. Universal professions (post-0012 shape: slug + sector only) ─────────
insert into public.professions (slug, sector) values
  ('caregiver',                   'care_health'),
  ('cleaner',                     'cleaning_facility'),
  ('cook',                        'hospitality_food'),
  ('customer_service_specialist', 'retail_sales'),
  ('driver',                      'transport_logistics'),
  ('event_organizer',             'other'),
  ('farm_worker',                 'agriculture'),
  ('furniture_assembler',         'manufacturing'),
  ('gardener',                    'agriculture'),
  ('office_administrator',        'office_admin'),
  ('production_worker',           'manufacturing'),
  ('safety_specialist',           'other'),
  ('sales_assistant',             'retail_sales'),
  ('software_developer',          'it_software'),
  ('teacher',                     'education'),
  ('translator',                  'education'),
  ('waiter',                      'hospitality_food'),
  ('warehouse_worker',            'transport_logistics')
on conflict (slug) do nothing;

-- ── 3. profession_skills links (is_core, display_order) ───────────────────
with link(prof_slug, skill_slug, is_core, ord) as (
  values
    ('driver','driving',true,1),('driver','delivery-driving',false,2),
    ('driver','cargo-transport',false,3),('driver','forklift-operation',false,4),
    ('warehouse_worker','warehouse-operations',true,1),('warehouse_worker','order-picking',false,2),
    ('warehouse_worker','forklift-operation',false,3),('warehouse_worker','packaging',false,4),
    ('production_worker','production-line',true,1),('production_worker','assembly-work',false,2),
    ('production_worker','packaging',false,3),('production_worker','equipment-operation',false,4),
    ('furniture_assembler','furniture-fitting',true,1),('furniture_assembler','assembly-work',false,2),
    ('furniture_assembler','hand-tools',false,3),
    ('cleaner','cleaning-services',true,1),('cleaner','window-cleaning',false,2),
    ('cleaner','housekeeping',false,3),('cleaner','winter-service',false,4),
    ('office_administrator','administration',true,1),('office_administrator','document-handling',false,2),
    ('office_administrator','bookkeeping',false,3),('office_administrator','customer-service',false,4),
    ('software_developer','programming',true,1),('software_developer','qa-testing',false,2),
    ('software_developer','it-support',false,3),('software_developer','web-design',false,4),
    ('customer_service_specialist','customer-service',true,1),('customer_service_specialist','cashier',false,2),
    ('customer_service_specialist','sales-assistant',false,3),
    ('cook','cooking',true,1),('cook','waiting-tables',false,2),
    ('waiter','waiting-tables',true,1),('waiter','bartending',false,2),
    ('waiter','customer-service',false,3),('waiter','cashier',false,4),
    ('gardener','gardening',true,1),('gardener','winter-service',false,2),
    ('gardener','farm-work',false,3),
    ('farm_worker','farm-work',true,1),('farm_worker','animal-care',false,2),
    ('farm_worker','gardening',false,3),('farm_worker','equipment-operation',false,4),
    ('caregiver','elderly-care',true,1),('caregiver','childcare',false,2),
    ('caregiver','first-aid',false,3),
    ('teacher','teaching',true,1),('teacher','first-aid',false,2),
    ('translator','translation',true,1),('translator','document-handling',false,2),
    ('translator','teaching',false,3),
    ('event_organizer','event-setup',true,1),('event_organizer','team-coordination',false,2),
    ('event_organizer','customer-service',false,3),
    ('sales_assistant','sales-assistant',true,1),('sales_assistant','cashier',false,2),
    ('sales_assistant','customer-service',false,3),
    ('safety_specialist','safety-officer',true,1),('safety_specialist','first-aid',false,2),
    ('safety_specialist','quality-control',false,3)
)
insert into public.profession_skills (profession_id, skill_id, is_core, display_order)
select p.id, s.id, l.is_core, l.ord
  from link l
  join public.professions p on p.slug = l.prof_slug
  join public.skills s       on s.slug = l.skill_slug
on conflict (profession_id, skill_id) do nothing;
