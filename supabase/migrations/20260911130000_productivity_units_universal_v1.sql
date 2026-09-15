-- 20260911130000 — the universal journal records WHAT WAS PRODUCED in the
-- unit the work actually comes in: kilometres, pallets, covers, cases.
--
-- SAFETY CLASS: GREEN. Four INSERT rows into the §10 slug registry
-- `productivity_units`, `on conflict (slug) do nothing`. No table, column,
-- policy, grant or function is created, altered or dropped; no existing row
-- is touched. Paired rollback: supabase/rollbacks/<same-name>.down.sql.
--
-- ── WHY (issue #1689, docs/product/WORK_JOURNAL_UNIVERSAL_MODEL_V1.md §7.2) ──
--
-- The Work Journal is one journal for ALL work. Its archetype matrix models
-- distance (driving_mobile → `distance`), units handled (logistics_warehouse
-- → pallets, hospitality → covers) and cases (legal_professional_services →
-- matters), yet the registry those quantities must be recorded in only knows
-- the 10 slugs of 0013 + 0017: time, m², m, pieces, kg, packages. A driver
-- who writes "nuvažiavau 320 km" today keeps the hours (PR #1690) and LOSES
-- the 320 km — the write core pre-validates `unit_slug` against this registry
-- and refuses an unknown one by name (`unit_slug_unknown`), so the code path
-- is correct and the DATA is what is missing. Work intelligence already shows
-- "what was produced" per recorded unit, never converted, never mixed
-- (`lib/journal/work-intelligence.ts` outputOf) — these rows let it show a
-- driver's kilometres and a warehouse worker's pallets the same way it shows
-- a tiler's m².
--
-- ── THE ROWS ───────────────────────────────────────────────────────────────
--
--   kilometers  length  parent meters ×1000  — the registry's own parent /
--                                              conversion convention (0013:
--                                              box_per_day → m²/day ×1.4;
--                                              0017: days → hours ×24)
--   pallets     count                       — logistics / warehouse
--   covers      count                       — hospitality service period
--   cases       count                       — legal / social / clinical
--                                              matters, visits, learners
--
-- Every row is `scope = 'platform'` (shared, `organization_id is null`) —
-- exactly like the 10 rows already there, so the least-privilege SELECT
-- policy of 20260817120000 (platform rows readable by every authenticated
-- user) covers them without change. `category` is free text in the table
-- and these reuse the existing values `length` / `count`.
--
-- ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
--
-- Not a conversion: a kilometre never becomes an hour, and outputs in
-- different units are never summed (work-intelligence keeps one line per
-- unit). Not a productivity score. Not a template: an org-scoped unit still
-- goes through the registry's own `scope = 'org'` rows. `orders`, `contacts`,
-- `tonnes` and the like stay extension points until an archetype surface
-- actually records them — nothing is seeded that no surface can write.

insert into public.productivity_units (slug, category, scope, parent_unit_slug, conversion_factor) values
  ('kilometers', 'length', 'platform', 'meters', 1000),
  ('pallets',    'count',  'platform', null,     null),
  ('covers',     'count',  'platform', null,     null),
  ('cases',      'count',  'platform', null,     null)
on conflict (slug) do nothing;

-- ROLLBACK
-- Remove ONLY these four rows, and only while no journal metric references
-- them (a referencing row is a person's recorded output — never deleted to
-- make a rollback pass). See
-- supabase/rollbacks/20260911130000_productivity_units_universal_v1.down.sql
