-- ════════════════════════════════════════════════════════════════════════
-- 0012_drop_taxonomy_name_columns.sql — Taxonomy names → JSON tokens (doctrine §2)
--
-- PLATFORM_DOCTRINE §2.2: "No translation columns on platform taxonomy tables.
-- Use slug → JSON file." Brings `professions` (originally PR #2 / 0008) and
-- `skills` (0001 + PR #6 / 0011) into compliance.
--
-- The name values were exported to (PR #6):
--   apps/web/messages/lt/professions.json  + en/professions.json
--   apps/web/messages/lt/skill-names.json  + en/skill-names.json
-- keyed by slug, and ALL readers now translate by slug (no code reads
-- name_lt/name_en anymore).
--
-- ⚠️ ORDER OF OPERATIONS (expand/contract): apply this ONLY AFTER the
-- slug-reading code is DEPLOYED. Until then, deployed code that still selects
-- professions.name_* (e.g. the dashboard worker badge) will fail that read.
-- See PR #6 description.
--
-- professions keeps slug + sector + is_active; skills keeps slug + category +
-- is_active. We drop every translation column, including the empty reserved-
-- locale profession columns (name_nl/de/pl/ru had no data — reserved locales
-- are not active), for full §2 compliance.
--
-- Idempotent: DROP COLUMN IF EXISTS.
-- ════════════════════════════════════════════════════════════════════════

alter table public.professions
  drop column if exists name_lt,
  drop column if exists name_en,
  drop column if exists name_nl,
  drop column if exists name_de,
  drop column if exists name_pl,
  drop column if exists name_ru;

alter table public.skills
  drop column if exists name_lt,
  drop column if exists name_en;
