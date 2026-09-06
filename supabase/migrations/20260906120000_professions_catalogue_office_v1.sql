-- @human-gate-approved
-- additive: true
-- ════════════════════════════════════════════════════════════════════════
-- 20260906120000_professions_catalogue_office_v1.sql
--
-- WHY. Real-user walks on production (window 5/6, build ca96605b, 2026-09-06)
-- proved the platform reads as a manual-labour product to professionals:
-- "Reikia buhalterio." / "reikia teisininko" / "reikia inžinieriaus" /
-- "reikia dizainerio" / "reikia konsultanto" / "Reikia projektų vadovo." /
-- "ieškome pardavimų specialisto" / "reikia finansų analitiko" and the
-- person-side "esu buhalteris, ieškau darbo" all reached the doors with an
-- EMPTY role, because the canonical catalogue `public.professions` (49 rows,
-- all manual/service trades + software_developer/teacher/translator) has no
-- accountant, lawyer, engineer, designer, consultant, project manager, sales
-- specialist, finance specialist or marketing specialist. The profile screen
-- cannot SET them, `worker_professions` cannot hold them, and matching by
-- profession (`profession_skills` expansion) cannot see them.
--
-- WHAT. Same canonical tables — no parallel structure (doctrine §2):
--   1. 15 skills the new professions need that the 161-row catalogue lacks
--      (finance, legal, engineering/design, consulting, project management,
--      B2B sales, marketing). The transversal capabilities that already exist
--      (#1297: negotiation, presenting, research, report-writing,
--      project-coordination, stakeholder-engagement, partnership-development,
--      graphic-design) are REUSED as links, not re-seeded.
--   2. 9 professions in three NEW sectors + one existing sector:
--        finance_legal        accountant, finance_specialist, lawyer
--        engineering_design   engineer, designer
--        business_management  consultant, project_manager, marketing_specialist
--        retail_sales         sales_specialist
--      ONE `engineer` row (owner choice: no civil/mechanical split yet; the
--      existing `site_engineer` stays the construction-site row).
--   3. 50 profession_skills links (is_core, display_order), 4–6 per profession.
--
-- Display names for every slug ship in apps/web/messages/{locale}/
-- professions.json + skill-names.json (all 12 taxonomy locales, real
-- translations, same PR) — post-0012 shape: no name_* columns. The static
-- matching mirror apps/web/lib/taxonomy/profession-skills.ts carries the same
-- 50 links (guard: lib/guards/matching-canonical.test.ts §7). The
-- profession lexicon PROFESSION_HINTS_LT gains the needles so
-- "buhalteris/buhalterio/buhalterė", "teisininkas", "inžinierius", … resolve
-- to these slugs (guard: lib/guards/professions-catalogue-office-v1.test.ts).
--
-- SAFETY. Strictly additive — INSERT … ON CONFLICT DO NOTHING only. No DDL,
-- no grants, no RLS change, no updates/deletes of existing rows. Idempotent.
-- Data DML into catalogue tables is human-gated by policy (RED route, owner
-- applies via Supabase MCP apply_migration — never db push).
--
-- SEQUENCING (binding): APPLY BEFORE MERGE. The code side (onboarding select,
-- education program target, journal profession) validates the slug against
-- the static list and then resolves it against the LIVE table
-- (`lib/auth/actions.ts` → `.from("professions").eq("slug", …)`;
-- `education_programs.target_profession_slug` is an FK to professions(slug)).
-- If the PR merged first, a person picking "Buhalteris" would have the pick
-- silently dropped (null) until apply. Apply first; the seed has no code
-- dependency and is inert until the labels/lexicon ship.
--
-- Rollback: supabase/rollbacks/20260906120000_professions_catalogue_office_v1.down.sql
-- (guarded deletes — refuses to remove a profession/skill any worker, journal
-- entry, template or education program already references).
--
-- POST-APPLY VERIFICATION (read-only):
--   select count(*) from public.professions;                       -- 58
--   select count(*) from public.skills;                            -- 176
--   select count(*) from public.profession_skills;                 -- 282
--   select p.slug, count(ps.*) from public.professions p
--     left join public.profession_skills ps on ps.profession_id = p.id
--    where p.sector in ('finance_legal','engineering_design','business_management')
--       or p.slug = 'sales_specialist'
--    group by p.slug order by p.slug;                              -- 9 rows, 4–6 each
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Skills (slug + category only; is_active defaults true) ─────────────
insert into public.skills (slug, category) values
  -- finance & accounting
  ('financial-reporting', 'office.finance'),
  ('payroll',             'office.finance'),
  ('financial-analysis',  'office.finance'),
  ('budgeting',           'office.finance'),
  ('tax-accounting',      'office.finance'),
  -- legal
  ('legal-advice',        'legal.general'),
  ('contract-drafting',   'legal.contracts'),
  -- engineering & design
  ('technical-design',    'engineering.design'),
  ('cad-drafting',        'engineering.design'),
  ('interior-design',     'creative.design'),
  -- consulting & management
  ('business-consulting', 'business.consulting'),
  ('project-management',  'management.projects'),
  -- sales & marketing
  ('b2b-sales',           'sales.b2b'),
  ('digital-marketing',   'marketing.digital'),
  ('content-writing',     'marketing.content')
on conflict (slug) do nothing;

-- ── 2. Professions (slug + sector only) ───────────────────────────────────
insert into public.professions (slug, sector) values
  ('accountant',           'finance_legal'),
  ('finance_specialist',   'finance_legal'),
  ('lawyer',               'finance_legal'),
  ('engineer',             'engineering_design'),
  ('designer',             'engineering_design'),
  ('consultant',           'business_management'),
  ('project_manager',      'business_management'),
  ('marketing_specialist', 'business_management'),
  ('sales_specialist',     'retail_sales')
on conflict (slug) do nothing;

-- ── 3. profession_skills links (is_core, display_order) ───────────────────
with link(prof_slug, skill_slug, is_core, ord) as (
  values
    ('accountant','bookkeeping',true,1),('accountant','financial-reporting',false,2),
    ('accountant','payroll',false,3),('accountant','tax-accounting',false,4),
    ('accountant','office-software',false,5),('accountant','document-handling',false,6),

    ('finance_specialist','financial-analysis',true,1),('finance_specialist','budgeting',false,2),
    ('finance_specialist','financial-reporting',false,3),('finance_specialist','bookkeeping',false,4),
    ('finance_specialist','report-writing',false,5),('finance_specialist','office-software',false,6),

    ('lawyer','legal-advice',true,1),('lawyer','contract-drafting',false,2),
    ('lawyer','document-handling',false,3),('lawyer','research',false,4),
    ('lawyer','negotiation',false,5),

    ('engineer','technical-design',true,1),('engineer','cad-drafting',false,2),
    ('engineer','blueprint-reading',false,3),('engineer','quality-control',false,4),
    ('engineer','work-scheduling',false,5),('engineer','project-coordination',false,6),

    ('designer','graphic-design',true,1),('designer','web-design',false,2),
    ('designer','interior-design',false,3),('designer','presenting',false,4),

    ('consultant','business-consulting',true,1),('consultant','financial-analysis',false,2),
    ('consultant','research',false,3),('consultant','presenting',false,4),
    ('consultant','stakeholder-engagement',false,5),('consultant','report-writing',false,6),

    ('project_manager','project-management',true,1),('project_manager','project-coordination',false,2),
    ('project_manager','work-scheduling',false,3),('project_manager','team-coordination',false,4),
    ('project_manager','budgeting',false,5),('project_manager','stakeholder-engagement',false,6),

    ('sales_specialist','b2b-sales',true,1),('sales_specialist','negotiation',false,2),
    ('sales_specialist','sales-assistant',false,3),('sales_specialist','customer-service',false,4),
    ('sales_specialist','partnership-development',false,5),('sales_specialist','presenting',false,6),

    ('marketing_specialist','digital-marketing',true,1),('marketing_specialist','content-writing',false,2),
    ('marketing_specialist','graphic-design',false,3),('marketing_specialist','research',false,4),
    ('marketing_specialist','presenting',false,5)
)
insert into public.profession_skills (profession_id, skill_id, is_core, display_order)
select p.id, s.id, l.is_core, l.ord
  from link l
  join public.professions p on p.slug = l.prof_slug
  join public.skills s       on s.slug = l.skill_slug
on conflict (profession_id, skill_id) do nothing;
