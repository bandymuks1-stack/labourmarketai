-- ============================================================================
-- 20260922150000_public_vacancy_translations_v1
-- GREEN — additive: ONE jsonb column on the existing public_vacancies table.
--
-- Finding (owner production walk, 2026-09-22): a Lithuanian-interface worker
-- reads Swedish. Production holds 101,885 published Arbetsförmedlingen ads
-- and every one of them carries translation_status = 'unavailable' (the
-- importer's translation stage runs with NO_PROVIDER_CONFIGURED, into ONE
-- target language, at import time). The single-target columns
-- (translation_target_language / _status / _title_text / _description_text /
-- _provider) cannot hold a rendering per served locale (lt/en/ru/nl/de/pl),
-- and translating 101,885 ads × 6 locales up front is not a cost anyone
-- approved.
--
-- MINIMUM CHANGE: the per-locale renderings live BESIDE the original on the
-- same row, as one jsonb map keyed by target locale. Each entry is the
-- canonical translation record the owner asked for:
--
--   translations = {
--     "lt": {
--       "status":        "available" | "needs_review" | "failed",
--       "title":         text | null,       -- DERIVED, never the original echoed
--       "description":   text | null,       -- DERIVED, null until asked for
--       "sourceLanguage": "sv",
--       "sourceHash":    <public_vacancies.content_hash at generation time>,
--       "provider":      "gemini" | ...,
--       "model":         "<model id>",
--       "generatedAt":   <ISO timestamp>
--     }, ...
--   }
--
-- The ORIGINAL (title_raw / description_raw / source_language) is untouched:
-- it is the FACT with provenance; an entry is a DERIVED rendering, valid only
-- while its sourceHash equals the row's content_hash (a re-imported revision
-- makes the entry stale, and the reader treats stale as absent). Entries are
-- written on read, by the platform's ONE AI runtime, for the bounded set of
-- ads a signed-in person is actually looking at — never per page view again
-- once written, never for a crawler.
--
-- WHY A COLUMN AND NOT A TABLE. pg_default_acl is empty on this project, so a
-- new table would need GRANTs (RED, human-gated) to be readable at all. The
-- existing table already has exactly the right privileges: authenticated
-- SELECT under the `is_active` policy, service_role ALL for the writer. A
-- column inherits both. No policy, grant, or row change.
--
-- Reversible: DOWN drops the column (see supabase/rollbacks/…down.sql). The
-- column is derived data; dropping it loses only cached renderings that can
-- be regenerated.
-- ============================================================================

begin;

alter table public.public_vacancies
  add column if not exists translations jsonb not null default '{}'::jsonb;

alter table public.public_vacancies
  drop constraint if exists public_vacancies_translations_is_object;
alter table public.public_vacancies
  add constraint public_vacancies_translations_is_object
  check (jsonb_typeof(translations) = 'object');

comment on column public.public_vacancies.translations is
  'DERIVED per-locale renderings of title_raw/description_raw, keyed by target locale; each entry carries status, title, description, sourceLanguage, sourceHash (= content_hash when generated), provider, model, generatedAt. The original columns stay the FACT; an entry whose sourceHash differs from content_hash is stale.';

commit;

-- ROLLBACK
-- See supabase/rollbacks/20260922150000_public_vacancy_translations_v1.down.sql:
--   alter table public.public_vacancies drop constraint if exists public_vacancies_translations_is_object;
--   alter table public.public_vacancies drop column if exists translations;
