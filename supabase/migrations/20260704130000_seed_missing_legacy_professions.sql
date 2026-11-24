-- additive: true
-- ════════════════════════════════════════════════════════════════════════
-- 20260704130000_seed_missing_legacy_professions.sql
--
-- Truth-audit repair (runtime/audits/skill-installation-truth-audit-2026-07-04.md).
--
-- FINDING: professions.json has always listed 18 construction professions,
-- but migration 0008 seeded only 15. `builder`, `rebar_worker` and
-- `site_manager` were NEVER seeded by any migration — they existed only in
-- the locale registry, and their profession_skills link tuples in 0011
-- silently inserted ZERO rows (the CTE join on professions.slug found no
-- match). This is the exact "present in JSON ≠ installed in DB" failure
-- class the audit exists to eliminate.
--
-- (If any of the three were later added manually via Supabase Studio, the
-- ON CONFLICT clauses make this a no-op for that row — idempotent either way,
-- and the link block then materialises the links 0011 could not.)
--
-- Safety: strictly additive — INSERT … ON CONFLICT DO NOTHING only.
-- Rollback: supabase/rollbacks/20260704130000_seed_missing_legacy_professions.down.sql
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. The three never-seeded legacy construction professions ─────────────
insert into public.professions (slug, sector) values
  ('builder',      'construction'),
  ('rebar_worker', 'construction'),
  ('site_manager', 'construction')
on conflict (slug) do nothing;

-- ── 2. Their profession_skills links (verbatim from 0011, which silently
--       no-opped for these three because the profession rows were missing) ─
with link(prof_slug, skill_slug, is_core, ord) as (
  values
    -- builder (Statybininkas) — generalist
    ('builder','general-labour',true,1),('builder','bricklaying',false,2),
    ('builder','concrete-works',false,3),('builder','formwork',false,4),
    ('builder','blueprint-reading',false,5),('builder','hand-tools',false,6),
    ('builder','demolition',false,7),('builder','scaffolding',false,8),
    -- rebar_worker (Armatūrininkas)
    ('rebar_worker','steel-fixing',true,1),('rebar_worker','rebar-cutting',true,2),
    ('rebar_worker','rebar-detailing',false,3),('rebar_worker','concrete-works',false,4),
    ('rebar_worker','formwork',false,5),('rebar_worker','blueprint-reading',false,6),
    -- site_manager (Statybų vadovas)
    ('site_manager','site-management',true,1),('site_manager','team-coordination',true,2),
    ('site_manager','work-scheduling',false,3),('site_manager','quality-control',false,4),
    ('site_manager','materials-management',false,5),('site_manager','blueprint-reading',false,6),
    ('site_manager','safety-officer',false,7),('site_manager','site-supervision',false,8)
)
insert into public.profession_skills (profession_id, skill_id, is_core, display_order)
select p.id, s.id, l.is_core, l.ord
  from link l
  join public.professions p on p.slug = l.prof_slug
  join public.skills s       on s.slug = l.skill_slug
on conflict (profession_id, skill_id) do nothing;
