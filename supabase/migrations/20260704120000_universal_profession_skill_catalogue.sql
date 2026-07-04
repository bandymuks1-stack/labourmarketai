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
-- Content: 37 skills across transport/logistics, manufacturing/assembly,
-- cleaning/facilities, office/admin, IT, creative, sales/customer service,
-- hospitality/food, agriculture/gardening, care, education/languages and
-- events + 17 professions + their profession_skills links. Construction rows
-- are untouched — construction remains one profession family among many.
--
-- Slugs mirror apps/web/messages/{locale}/skill-names.json and
-- professions.json (added in the same PR, all 11 locales) and the promoted
-- recognition lexicon rows in apps/web/lib/structuring/keywords.ts.
--
-- Safety: strictly additive — INSERT … ON CONFLICT DO NOTHING only. No DDL,
-- no grants, no RLS change, no updates/deletes of existing rows. Idempotent.
-- Rollback: supabase/rollbacks/20260704120000_universal_profession_skill_catalogue.down.sql
-- (guarded deletes — refuses to remove a skill/profession a worker already
-- references).
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Universal skills (LT + EN names; other locales via messages JSON) ──
insert into public.skills (slug, category, name_lt, name_en) values
  -- transport & logistics
  ('driving',             'logistics.driving',      'Vairavimas',                          'Driving'),
  ('delivery-driving',    'logistics.driving',      'Pristatymas / kurjerio darbas',       'Delivery & courier driving'),
  ('cargo-transport',     'logistics.driving',      'Krovinių pervežimas',                 'Cargo transport'),
  ('forklift-operation',  'logistics.warehouse',    'Krautuvo vairavimas',                 'Forklift operation'),
  ('warehouse-operations','logistics.warehouse',    'Sandėlio darbai',                     'Warehouse operations'),
  ('order-picking',       'logistics.warehouse',    'Užsakymų rinkimas / komplektavimas',  'Order picking & packing'),
  -- manufacturing & assembly
  ('assembly-work',       'manufacturing.assembly', 'Surinkimo darbai',                    'Assembly work'),
  ('production-line',     'manufacturing.production','Gamybos linijos darbas',             'Production line work'),
  ('packaging',           'manufacturing.production','Pakavimas',                          'Packaging'),
  ('equipment-operation', 'manufacturing.equipment','Įrangos ir mechanizmų valdymas',      'Equipment & machinery operation'),
  -- cleaning & facilities
  ('cleaning-services',   'cleaning.general',       'Patalpų valymas',                     'Premises cleaning'),
  ('window-cleaning',     'cleaning.general',       'Langų valymas',                       'Window cleaning'),
  ('housekeeping',        'cleaning.hospitality',   'Kambarių tvarkymas (viešbutis)',      'Housekeeping'),
  ('winter-service',      'cleaning.outdoor',       'Sniego valymas / žiemos priežiūra',   'Snow & ice service'),
  -- office & administration
  ('administration',      'office.admin',           'Administravimas',                     'Administration'),
  ('document-handling',   'office.admin',           'Dokumentų tvarkymas',                 'Document handling'),
  ('bookkeeping',         'office.finance',         'Apskaita',                            'Bookkeeping'),
  -- IT & software / creative
  ('programming',         'it.software',            'Programavimas',                       'Programming'),
  ('qa-testing',          'it.software',            'Programinės įrangos testavimas',      'Software testing (QA)'),
  ('it-support',          'it.support',             'IT pagalba',                          'IT support'),
  ('web-design',          'it.design',              'Interneto svetainių dizainas',        'Web design'),
  ('graphic-design',      'creative.design',        'Grafinis dizainas',                   'Graphic design'),
  -- customer service & sales
  ('customer-service',    'sales.service',          'Klientų aptarnavimas',                'Customer service'),
  ('cashier',             'sales.retail',           'Kasininko darbas',                    'Cashier work'),
  ('sales-assistant',     'sales.retail',           'Pardavimas ir konsultavimas',         'Sales & customer advising'),
  -- hospitality & food
  ('cooking',             'hospitality.kitchen',    'Maisto gaminimas',                    'Cooking'),
  ('waiting-tables',      'hospitality.service',    'Padavėjo darbas',                     'Waiting tables'),
  ('bartending',          'hospitality.service',    'Barmeno darbas',                      'Bartending'),
  -- agriculture & gardening
  ('gardening',           'agriculture.gardening',  'Sodo ir aplinkos priežiūra',          'Gardening & grounds care'),
  ('farm-work',           'agriculture.farming',    'Žemės ūkio darbai',                   'Farm work'),
  ('animal-care',         'agriculture.animals',    'Gyvūnų priežiūra',                    'Animal care'),
  -- care & assistance / safety
  ('elderly-care',        'care.support',           'Senjorų priežiūra',                   'Elderly care'),
  ('childcare',           'care.support',           'Vaikų priežiūra',                     'Childcare'),
  ('first-aid',           'care.safety',            'Pirmoji pagalba',                     'First aid'),
  -- education & languages
  ('teaching',            'education.teaching',     'Mokymas / paskaitos',                 'Teaching & training'),
  ('translation',         'education.languages',    'Vertimas',                            'Translation'),
  -- events
  ('event-setup',         'events.setup',           'Renginių paruošimas',                 'Event setup & support')
on conflict (slug) do nothing;

-- ── 2. Universal professions (sector = taxonomy SectorKey) ────────────────
insert into public.professions (slug, name_lt, name_en, name_ru, sector) values
  ('caregiver',                   'Priežiūros darbuotojas',            'Caregiver',                   'Работник по уходу',                      'care_health'),
  ('cleaner',                     'Valytojas',                         'Cleaner',                     'Уборщик',                                'cleaning_facility'),
  ('cook',                        'Virėjas',                           'Cook',                        'Повар',                                  'hospitality_food'),
  ('customer_service_specialist', 'Klientų aptarnavimo specialistas',  'Customer service specialist', 'Специалист по обслуживанию клиентов',    'retail_sales'),
  ('driver',                      'Vairuotojas',                       'Driver',                      'Водитель',                               'transport_logistics'),
  ('event_organizer',             'Renginių organizatorius',           'Event organizer',             'Организатор мероприятий',                'other'),
  ('farm_worker',                 'Žemės ūkio darbininkas',            'Farm worker',                 'Сельхозработник',                        'agriculture'),
  ('gardener',                    'Sodininkas',                        'Gardener',                    'Садовник',                               'agriculture'),
  ('office_administrator',        'Biuro administratorius',            'Office administrator',        'Офисный администратор',                  'office_admin'),
  ('production_worker',           'Gamybos darbuotojas',               'Production worker',           'Работник производства',                  'manufacturing'),
  ('safety_specialist',           'Darbų saugos specialistas',         'Safety specialist',           'Специалист по охране труда',             'other'),
  ('sales_assistant',             'Pardavėjas konsultantas',           'Sales assistant',             'Продавец-консультант',                   'retail_sales'),
  ('software_developer',          'Programuotojas',                    'Software developer',          'Программист',                            'it_software'),
  ('teacher',                     'Mokytojas',                         'Teacher',                     'Преподаватель',                          'education'),
  ('translator',                  'Vertėjas',                          'Translator',                  'Переводчик',                             'education'),
  ('waiter',                      'Padavėjas',                         'Waiter',                      'Официант',                               'hospitality_food'),
  ('warehouse_worker',            'Sandėlio darbuotojas',              'Warehouse worker',            'Складской работник',                     'transport_logistics')
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
