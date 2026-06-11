-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after owner + Chat Claude
-- review (ESCO all-languages expansion). Never `db push`.
--
-- Widen esco_labels.locale to ALL 28 OFFICIAL ESCO v1.2.1 languages
-- (owner decision 2026-06-10: import every official classification language,
-- not only the 10 launch locales, so worker-entered skills in many European
-- languages can be recognized earlier).
--
-- Strictly a WIDENING (pure superset of the existing 10-value set): existing
-- rows are untouched, no schema/RLS/grant change, the column stays char(2)
-- (every official code is 2 chars). The source of these values is the
-- official ESCO download portal language list — NOT a home-made set. Russian
-- is deliberately ABSENT: ru is not an official ESCO language; RU practical
-- aliases are a separate curated layer
-- (docs/product/ru-construction-aliases-followup.md), never esco_labels.
-- ============================================================================

begin;

alter table public.esco_labels
  drop constraint if exists esco_labels_locale_check;

alter table public.esco_labels
  add constraint esco_labels_locale_check
  check (locale in (
    'ar','bg','cs','da','de','el','en','es','et','fi','fr','ga','hr','hu',
    'is','it','lt','lv','mt','nl','no','pl','pt','ro','sk','sl','sv','uk'
  ));

commit;

-- ROLLBACK (reverse SQL — restores the 10-locale platform set. NOTE: only
-- valid while esco_labels contains no rows outside the 10; after a full
-- 28-language import, narrowing first requires deleting the non-platform
-- locale rows):
-- alter table public.esco_labels drop constraint if exists esco_labels_locale_check;
-- alter table public.esco_labels add constraint esco_labels_locale_check
--   check (locale in ('en','lt','lv','et','nl','de','da','no','sv','pl'));
