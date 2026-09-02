-- ============================================================================
-- 20260827060000 — transversal professional capability skills v1.
--
-- ── THE MEASUREMENT ────────────────────────────────────────────────────────
-- On 2026-08-27 `public.skills` held 153 rows and exactly ONE of them was a
-- professional capability rather than an occupation. Everything else was a
-- trade: tiling, welding, forklift operation, cooking.
--
-- Run the owner's own example sentence through the recogniser against that
-- catalogue and it produced nothing at all:
--
--   "Susitikau su svietimo ir politikos atstovais, pristaciau projekta ir
--    aptariau bendradarbiavimo galimybes"
--     → recognized []  candidates []  claims []  3 of 3 fragments unresolved
--
--   "Klojau plyteles ir daziau sienas"
--     → recognized [painting, tiling]   (clean, 100% coverage)
--
-- The recognition ENGINE was never at fault. The vocabulary was: it could see
-- trades and nothing else.
--
-- ── WHY IT BLOCKS THE EDUCATION PILOT ──────────────────────────────────────
-- A student's evidence is projects, presentations, teamwork, volunteering and
-- competitions — not tiling. Without these rows the flywheel
-- (journal → evidence → skills → Living CV → matching) runs for a construction
-- worker and hands a student an EMPTY CV, which is precisely the "person with
-- no experience" verdict the product exists to refuse.
--
-- The recogniser half of this ships in the same PR
-- (lib/structuring/keywords.ts, sector "other" — the type doc already reserves
-- that sector for cross-sector transferable abilities). These rows are the DB
-- half: `journal_entry_skills.skill_id` is a FK to `skills`, so a recognised
-- capability cannot be persisted until its slug exists here.
--
-- ── SAFETY CLASS: GREEN ────────────────────────────────────────────────────
-- INSERT only, idempotent (`on conflict do nothing`). No table is created, no
-- column altered, no policy touched, no grant, no SECURITY DEFINER, and no
-- existing row is updated or deleted. Same shape as the catalogue seed
-- 20260704120000, which is the precedent for this file.
--
-- Every slug is mirrored in messages/{locale}/skill-names.json for ALL 12
-- locales in this same PR (guard: journal-no-raw-slug), so no surface can ever
-- render a raw English slug.
--
-- ROLLBACK: supabase/rollbacks/20260827060000_transversal_capability_skills_v1.down.sql
-- ============================================================================

insert into public.skills (slug, category) values
  ('presenting',              'transversal.communication'),
  ('stakeholder-engagement',  'transversal.communication'),
  ('partnership-development', 'transversal.business'),
  ('negotiation',             'transversal.business'),
  ('project-coordination',    'transversal.organisation'),
  ('report-writing',          'transversal.communication'),
  ('teamwork',                'transversal.collaboration'),
  ('research',                'transversal.analysis')
on conflict (slug) do nothing;

-- POST-APPLY VERIFICATION:
--   select slug, category, is_active from public.skills
--    where category like 'transversal.%' order by slug;   -- expect 8 rows, active
--   select count(*) from public.skills;                   -- expect 153 -> 161
