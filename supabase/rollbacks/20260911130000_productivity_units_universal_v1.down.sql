-- Rollback for 20260911130000_productivity_units_universal_v1.sql
--
-- Removes ONLY the four platform unit rows the forward migration inserted
-- (kilometers / pallets / covers / cases). A faithful inverse: the forward
-- file inserted four rows and nothing else, so this file deletes those four
-- rows and nothing else.
--
-- ── WHAT ROLLING BACK COSTS ───────────────────────────────────────────────
-- THIS IS NOT SAFE TO RUN BLIND. Three tables reference
-- `productivity_units(slug)`: `journal_entry_metrics.unit_slug`,
-- `worker_skills.current_pace_unit_slug` and the registry's own
-- `parent_unit_slug` / `base_unit_slug`. If any row has been written in one
-- of these units since the forward migration, the DELETE FAILS (23503) —
-- Postgres refuses to orphan the reference.
--
-- That failure is the correct behaviour and must not be worked around by
-- cascading or by rewriting the referencing rows. A `kilometers` metric row
-- exists because a real person recorded a real day's driving; reclassifying
-- it as `meters` or dropping it to make a rollback succeed would rewrite that
-- person's evidence, which is exactly what the journal exists to prevent.
--
-- The DELETE below is therefore guarded: it removes a slug only while nothing
-- references it. Check first:
--
--   select unit_slug, count(*) from public.journal_entry_metrics
--    where unit_slug in ('kilometers','pallets','covers','cases') group by 1;
--   select current_pace_unit_slug, count(*) from public.worker_skills
--    where current_pace_unit_slug in ('kilometers','pallets','covers','cases') group by 1;
--
-- If a referenced slug must go anyway, that is an owner decision about the
-- referencing evidence, taken explicitly — not something this file does.

delete from public.productivity_units u
 where u.slug in ('kilometers', 'pallets', 'covers', 'cases')
   and u.scope = 'platform'
   and not exists (select 1 from public.journal_entry_metrics m where m.unit_slug = u.slug)
   and not exists (select 1 from public.worker_skills w where w.current_pace_unit_slug = u.slug)
   and not exists (select 1 from public.productivity_units c
                    where c.parent_unit_slug = u.slug or c.base_unit_slug = u.slug);
