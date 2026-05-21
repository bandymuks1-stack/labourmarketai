-- ════════════════════════════════════════════════════════════════════════
-- 0011_seed_skills.sql — Construction skills taxonomy + profession links
--
-- NOT RUN by the agent — DI applies it after 0010 (AGENTS.md).
--
-- Reuses the 38 skills already seeded in 0001/0002 and adds ~56 more so each
-- of the 18 professions (seeded in 0008/PR#2) has 6–9 relevant skills. Then
-- links them via profession_skills (is_core = the trade's defining skills;
-- display_order = render order in the picker).
--
-- Idempotent: skills upsert ON CONFLICT (slug); links ON CONFLICT (pk).
-- Skills are matched to professions by slug, so this is order-independent.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Additional skills (LT + EN; is_active defaults true from 0010) ───────
insert into public.skills (slug, category, name_lt, name_en) values
  -- welding
  ('gas-cutting',        'construction.welding',     'Dujinis pjovimas',                  'Gas cutting'),
  ('welding-blueprint',  'construction.welding',     'Suvirinimo brėžinių skaitymas',     'Reading welding blueprints'),
  -- finishing
  ('skim-coating',       'construction.finishing',   'Glaistymas',                        'Skim coating'),
  ('decorative-plaster', 'construction.finishing',   'Dekoratyvinis tinkavimas',          'Decorative plastering'),
  ('facade-plaster',     'construction.finishing',   'Fasadų tinkavimas',                 'Façade plastering'),
  ('spray-painting',     'construction.finishing',   'Purškiamasis dažymas',              'Spray painting'),
  ('wallpapering',       'construction.finishing',   'Tapetavimas',                       'Wallpapering'),
  ('partition-walls',    'construction.finishing',   'Pertvarų montavimas',               'Partition walls'),
  ('ceiling-systems',    'construction.finishing',   'Pakabinamų lubų montavimas',        'Suspended ceilings'),
  ('grouting',           'construction.finishing',   'Plytelių siūlių užpildymas',        'Tile grouting'),
  ('mosaic-tiling',      'construction.finishing',   'Mozaikos klojimas',                 'Mosaic tiling'),
  ('large-format-tiling','construction.finishing',   'Stambiaformačių plytelių klojimas', 'Large-format tiling'),
  ('waterproofing-tiles','construction.finishing',   'Drėgnų patalpų hidroizoliacija',    'Wet-room waterproofing'),
  ('floor-screeding',    'construction.concrete',    'Grindų išlyginamasis sluoksnis',    'Floor screeding'),
  -- concrete / structure
  ('concrete-pouring',   'construction.concrete',    'Betono liejimas',                   'Concrete pouring'),
  ('concrete-vibration', 'construction.concrete',    'Betono tankinimas (vibravimas)',    'Concrete vibration'),
  ('precast-install',    'construction.concrete',    'Surenkamų konstrukcijų montavimas', 'Precast element installation'),
  ('waterproofing',      'construction.insulation',  'Hidroizoliacija',                   'Waterproofing'),
  -- masonry
  ('stone-masonry',      'construction.masonry',     'Akmens mūras',                      'Stone masonry'),
  ('mortar-prep',        'construction.masonry',     'Skiedinio paruošimas',              'Mortar preparation'),
  -- carpentry
  ('formwork-carpentry', 'construction.carpentry',   'Klojinių stalystė',                 'Formwork carpentry'),
  ('timber-framing',     'construction.carpentry',   'Medinių karkasų statyba',           'Timber framing'),
  ('door-window-install','construction.carpentry',   'Durų ir langų montavimas',          'Door & window installation'),
  ('furniture-fitting',  'construction.carpentry',   'Baldų montavimas',                  'Furniture fitting'),
  -- electrical
  ('panel-install',      'construction.electrical',  'Elektros skydų montavimas',         'Distribution board installation'),
  ('lighting-install',   'construction.electrical',  'Apšvietimo sistemų montavimas',     'Lighting installation'),
  ('low-voltage',        'construction.electrical',  'Žemos įtampos sistemos',            'Low-voltage systems'),
  ('cable-pulling',      'construction.electrical',  'Kabelių tiesimas',                  'Cable pulling'),
  ('electrical-testing', 'construction.electrical',  'Elektros instaliacijos bandymai',   'Electrical testing'),
  -- plumbing / hvac
  ('heating-install',    'construction.plumbing',    'Šildymo sistemų montavimas',        'Heating system installation'),
  ('sanitary-install',   'construction.plumbing',    'Santechnikos prietaisų montavimas', 'Sanitary fixture installation'),
  ('drainage',           'construction.plumbing',    'Nuotekų sistemų montavimas',        'Drainage systems'),
  -- roofing
  ('roof-tiling',        'construction.roofing',     'Čerpių stogų dengimas',             'Tile roofing'),
  ('flat-roofing',       'construction.roofing',     'Plokščių stogų dengimas',           'Flat roofing'),
  ('roof-insulation',    'construction.roofing',     'Stogų šiltinimas',                  'Roof insulation'),
  ('gutter-install',     'construction.roofing',     'Lietvamzdžių ir latakų montavimas', 'Gutter installation'),
  -- steel / rebar
  ('rebar-cutting',      'construction.steel',       'Armatūros pjovimas ir lankstymas',  'Rebar cutting & bending'),
  -- machinery
  ('mobile-crane',       'construction.machinery',   'Mobiliojo krano valdymas',          'Mobile crane operation'),
  ('tower-crane',        'construction.machinery',   'Bokštinio krano valdymas',          'Tower crane operation'),
  ('rigging',            'construction.machinery',   'Krovinių stropavimas',              'Rigging'),
  ('load-signaling',     'construction.machinery',   'Krovinių signalizavimas',           'Load signalling'),
  ('bulldozer-operator', 'construction.machinery',   'Buldozerio valdymas',               'Bulldozer operation'),
  ('loader-operator',    'construction.machinery',   'Frontalinio krautuvo valdymas',     'Wheel loader operation'),
  ('grader-operator',    'construction.machinery',   'Greiderio valdymas',                'Grader operation'),
  ('compactor-operator', 'construction.machinery',   'Tankinimo volo valdymas',           'Compactor operation'),
  -- supervision / management
  ('blueprint-reading',  'construction.supervision', 'Brėžinių skaitymas',                'Blueprint reading'),
  ('quality-control',    'construction.supervision', 'Kokybės kontrolė',                  'Quality control'),
  ('team-coordination',  'construction.supervision', 'Komandos koordinavimas',            'Team coordination'),
  ('work-scheduling',    'construction.supervision', 'Darbų planavimas',                  'Work scheduling'),
  ('materials-management','construction.supervision','Medžiagų valdymas',                 'Materials management'),
  ('setting-out',        'construction.supervision', 'Ašių nužymėjimas',                  'Setting out'),
  ('quantity-takeoff',   'construction.supervision', 'Kiekių skaičiavimas',               'Quantity take-off'),
  -- general labour
  ('manual-handling',    'construction.general',     'Krovinių tvarkymas rankomis',       'Manual handling'),
  ('site-cleaning',      'construction.general',     'Statybvietės valymas',              'Site cleaning'),
  ('material-transport', 'construction.general',     'Medžiagų pernešimas',               'Material transport'),
  ('hand-tools',         'construction.general',     'Rankinių įrankių naudojimas',       'Hand tool use')
on conflict (slug) do nothing;

-- ── 2. profession_skills links (is_core, display_order) ─────────────────────
with link(prof_slug, skill_slug, is_core, ord) as (
  values
    -- builder (Statybininkas) — generalist
    ('builder','general-labour',true,1),('builder','bricklaying',false,2),
    ('builder','concrete-works',false,3),('builder','formwork',false,4),
    ('builder','blueprint-reading',false,5),('builder','hand-tools',false,6),
    ('builder','demolition',false,7),('builder','scaffolding',false,8),
    -- carpenter (Stalius)
    ('carpenter','carpentry',true,1),('carpenter','joinery',true,2),
    ('carpenter','formwork-carpentry',false,3),('carpenter','timber-framing',false,4),
    ('carpenter','door-window-install',false,5),('carpenter','furniture-fitting',false,6),
    ('carpenter','flooring',false,7),('carpenter','blueprint-reading',false,8),
    -- concrete_worker (Betonuotojas)
    ('concrete_worker','concrete-works',true,1),('concrete_worker','concrete-pouring',true,2),
    ('concrete_worker','concrete-finishing',false,3),('concrete_worker','concrete-vibration',false,4),
    ('concrete_worker','formwork',false,5),('concrete_worker','floor-screeding',false,6),
    ('concrete_worker','precast-install',false,7),('concrete_worker','waterproofing',false,8),
    -- crane_operator (Kranininkas)
    ('crane_operator','mobile-crane',true,1),('crane_operator','tower-crane',true,2),
    ('crane_operator','rigging',false,3),('crane_operator','load-signaling',false,4),
    ('crane_operator','crane-operator',false,5),('crane_operator','precast-install',false,6),
    ('crane_operator','safety-officer',false,7),
    -- drywaller (Gipso kartono montuotojas)
    ('drywaller','drywall',true,1),('drywaller','partition-walls',true,2),
    ('drywaller','ceiling-systems',false,3),('drywaller','insulation',false,4),
    ('drywaller','skim-coating',false,5),('drywaller','plastering',false,6),
    ('drywaller','blueprint-reading',false,7),
    -- electrician (Elektrikas)
    ('electrician','electrical-install',true,1),('electrician','panel-install',true,2),
    ('electrician','lighting-install',false,3),('electrician','low-voltage',false,4),
    ('electrician','cable-pulling',false,5),('electrician','electrical-testing',false,6),
    ('electrician','industrial-electric',false,7),
    -- foreman (Brigadininkas)
    ('foreman','team-coordination',true,1),('foreman','work-scheduling',true,2),
    ('foreman','quality-control',false,3),('foreman','materials-management',false,4),
    ('foreman','blueprint-reading',false,5),('foreman','site-supervision',false,6),
    ('foreman','safety-officer',false,7),
    -- general_laborer (Bendrasis darbininkas)
    ('general_laborer','general-labour',true,1),('general_laborer','manual-handling',false,2),
    ('general_laborer','site-cleaning',false,3),('general_laborer','material-transport',false,4),
    ('general_laborer','hand-tools',false,5),('general_laborer','demolition',false,6),
    ('general_laborer','scaffolding',false,7),
    -- heavy_equipment_operator (Sunkios technikos operatorius)
    ('heavy_equipment_operator','excavator-operator',true,1),('heavy_equipment_operator','bulldozer-operator',false,2),
    ('heavy_equipment_operator','loader-operator',false,3),('heavy_equipment_operator','grader-operator',false,4),
    ('heavy_equipment_operator','compactor-operator',false,5),('heavy_equipment_operator','earthworks',false,6),
    ('heavy_equipment_operator','forklift-operator',false,7),
    -- mason (Mūrininkas)
    ('mason','bricklaying',true,1),('mason','blockwork',true,2),
    ('mason','stone-masonry',false,3),('mason','mortar-prep',false,4),
    ('mason','plastering',false,5),('mason','concrete-works',false,6),
    -- painter (Dažytojas)
    ('painter','painting',true,1),('painter','spray-painting',false,2),
    ('painter','wallpapering',false,3),('painter','skim-coating',false,4),
    ('painter','decorative-plaster',false,5),('painter','plastering',false,6),
    ('painter','facade-plaster',false,7),
    -- plumber (Santechnikas)
    ('plumber','plumbing',true,1),('plumber','pipefitting',true,2),
    ('plumber','heating-install',false,3),('plumber','sanitary-install',false,4),
    ('plumber','drainage',false,5),('plumber','hvac-install',false,6),
    ('plumber','ventilation',false,7),
    -- rebar_worker (Armatūrininkas)
    ('rebar_worker','steel-fixing',true,1),('rebar_worker','rebar-cutting',true,2),
    ('rebar_worker','rebar-detailing',false,3),('rebar_worker','concrete-works',false,4),
    ('rebar_worker','formwork',false,5),('rebar_worker','blueprint-reading',false,6),
    -- roofer (Stogdengys)
    ('roofer','roofing',true,1),('roofer','roof-tiling',false,2),
    ('roofer','flat-roofing',false,3),('roofer','roof-insulation',false,4),
    ('roofer','gutter-install',false,5),('roofer','waterproofing',false,6),
    ('roofer','insulation',false,7),
    -- site_engineer (Aikštelės inžinierius)
    ('site_engineer','setting-out',true,1),('site_engineer','quantity-takeoff',true,2),
    ('site_engineer','blueprint-reading',false,3),('site_engineer','surveying',false,4),
    ('site_engineer','quality-control',false,5),('site_engineer','work-scheduling',false,6),
    -- site_manager (Statybų vadovas)
    ('site_manager','site-management',true,1),('site_manager','team-coordination',true,2),
    ('site_manager','work-scheduling',false,3),('site_manager','quality-control',false,4),
    ('site_manager','materials-management',false,5),('site_manager','blueprint-reading',false,6),
    ('site_manager','safety-officer',false,7),('site_manager','site-supervision',false,8),
    -- tiler (Plytelių klojėjas)
    ('tiler','tiling',true,1),('tiler','large-format-tiling',false,2),
    ('tiler','mosaic-tiling',false,3),('tiler','grouting',false,4),
    ('tiler','waterproofing-tiles',false,5),('tiler','floor-screeding',false,6),
    ('tiler','flooring',false,7),
    -- welder (Suvirintojas)
    ('welder','mig-mag-welding',true,1),('welder','tig-welding',true,2),
    ('welder','arc-welding',false,3),('welder','gas-cutting',false,4),
    ('welder','structural-steel',false,5),('welder','welding-blueprint',false,6)
)
insert into public.profession_skills (profession_id, skill_id, is_core, display_order)
select p.id, s.id, l.is_core, l.ord
  from link l
  join public.professions p on p.slug = l.prof_slug
  join public.skills s       on s.slug = l.skill_slug
on conflict (profession_id, skill_id) do nothing;
