-- ════════════════════════════════════════════════════════════════════════
-- 0002_reference_data.sql — reference configuration, in the migration
-- pipeline so `supabase db push` loads it automatically (brief §10.2:
-- "applied as part of migration pipeline", "always applied").
--
-- This is an idempotent MIRROR of supabase/reference-data.sql, which remains
-- the human-readable canonical copy. Keep the two in sync; both are
-- ON CONFLICT-guarded so re-running is safe on every deploy.
-- ════════════════════════════════════════════════════════════════════════

insert into public.countries (code, name_lt, name_en) values
  ('LT', 'Lietuva',     'Lithuania'),
  ('LV', 'Latvija',     'Latvia'),
  ('EE', 'Estija',      'Estonia'),
  ('PL', 'Lenkija',     'Poland'),
  ('NL', 'Nyderlandai', 'Netherlands'),
  ('DK', 'Danija',      'Denmark'),
  ('DE', 'Vokietija',   'Germany'),
  ('SE', 'Švedija',     'Sweden'),
  ('NO', 'Norvegija',   'Norway')
on conflict (code) do update
  set name_lt = excluded.name_lt,
      name_en = excluded.name_en,
      updated_at = now();

insert into public.skills (slug, category, name_lt, name_en) values
  ('steel-fixing',        'construction.steel',      'Armatūros rišimas',            'Steel fixing'),
  ('rebar-detailing',     'construction.steel',      'Armatūros brėžiniai',          'Rebar detailing'),
  ('structural-steel',    'construction.steel',      'Metalo konstrukcijų montavimas','Structural steel erection'),
  ('formwork',            'construction.formwork',   'Klojinių montavimas',          'Formwork'),
  ('concrete-works',      'construction.concrete',   'Betonavimo darbai',            'Concrete works'),
  ('concrete-finishing',  'construction.concrete',   'Betono paviršių apdaila',      'Concrete finishing'),
  ('scaffolding',         'construction.scaffolding','Pastolių montavimas',          'Scaffolding'),
  ('mig-mag-welding',     'construction.welding',    'MIG/MAG suvirinimas',          'MIG/MAG welding'),
  ('tig-welding',         'construction.welding',    'TIG suvirinimas',              'TIG welding'),
  ('arc-welding',         'construction.welding',    'Lankinis suvirinimas',         'Arc welding'),
  ('electrical-install',  'construction.electrical', 'Elektros instaliacija',        'Electrical installation'),
  ('industrial-electric', 'construction.electrical', 'Pramoninė elektrotechnika',    'Industrial electrical'),
  ('plumbing',            'construction.plumbing',   'Santechnikos darbai',          'Plumbing'),
  ('pipefitting',         'construction.plumbing',   'Vamzdynų montavimas',          'Pipefitting'),
  ('hvac-install',        'construction.hvac',       'ŠVOK sistemų montavimas',      'HVAC installation'),
  ('ventilation',         'construction.hvac',       'Vėdinimo sistemos',            'Ventilation systems'),
  ('bricklaying',         'construction.masonry',    'Mūrijimas',                    'Bricklaying'),
  ('blockwork',           'construction.masonry',    'Blokelių mūras',               'Blockwork'),
  ('plastering',          'construction.finishing',  'Tinkavimas',                   'Plastering'),
  ('drywall',             'construction.finishing',  'Gipso kartono montavimas',     'Drywall / plasterboard'),
  ('painting',            'construction.finishing',  'Dažymo darbai',                'Painting and decorating'),
  ('tiling',              'construction.finishing',  'Plytelių klojimas',            'Tiling'),
  ('flooring',            'construction.finishing',  'Grindų dangos',                'Flooring'),
  ('carpentry',           'construction.carpentry',  'Staliaus darbai',              'Carpentry'),
  ('joinery',             'construction.carpentry',  'Dailidės darbai',              'Joinery'),
  ('roofing',             'construction.roofing',    'Stogų dengimas',               'Roofing'),
  ('insulation',          'construction.insulation', 'Šiltinimo darbai',             'Thermal insulation'),
  ('glazing',             'construction.glazing',    'Stiklinimo darbai',            'Glazing'),
  ('demolition',          'construction.demolition', 'Griovimo darbai',              'Demolition'),
  ('earthworks',          'construction.earthworks', 'Žemės darbai',                 'Earthworks'),
  ('excavator-operator',  'construction.machinery',  'Ekskavatoriaus operatorius',   'Excavator operator'),
  ('crane-operator',      'construction.machinery',  'Krano operatorius',            'Crane operator'),
  ('forklift-operator',   'construction.machinery',  'Krautuvo operatorius',         'Forklift operator'),
  ('general-labour',      'construction.general',    'Bendrieji statybos darbai',    'General construction labour'),
  ('site-supervision',    'construction.supervision','Statybvietės priežiūra',       'Site supervision'),
  ('site-management',     'construction.supervision','Statybos vadovavimas',         'Site management'),
  ('safety-officer',      'construction.safety',     'Darbų saugos specialistas',    'Health & safety officer'),
  ('surveying',           'construction.supervision','Geodeziniai matavimai',        'Site surveying')
on conflict (slug) do update
  set category = excluded.category,
      name_lt  = excluded.name_lt,
      name_en  = excluded.name_en,
      updated_at = now();

insert into public.plans (slug, name_lt, name_en, price_eur_monthly, features, active) values
  ('free',       'Nemokamas',  'Free',       null,
     '{"projects":1,"job_demands":1,"worker_search":false,"support":"community"}'::jsonb, true),
  ('business',   'Verslo',     'Business',   null,
     '{"projects":10,"job_demands":25,"worker_search":true,"support":"email"}'::jsonb, true),
  ('agency',     'Agentūros',  'Agency',     null,
     '{"managed_workers":"unlimited","broker_tools":true,"worker_search":true,"support":"priority"}'::jsonb, true),
  ('enterprise', 'Įmonių',     'Enterprise', null,
     '{"projects":"unlimited","sso":true,"sla":true,"support":"dedicated"}'::jsonb, true)
on conflict (slug) do update
  set name_lt   = excluded.name_lt,
      name_en   = excluded.name_en,
      features  = excluded.features,
      active    = excluded.active,
      updated_at = now();
