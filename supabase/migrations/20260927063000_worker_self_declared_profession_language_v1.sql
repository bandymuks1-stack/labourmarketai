-- ============================================================================
-- APPLIED 2026-09-27 via Supabase MCP apply_migration, ledger 20260927062927,
-- after the owner's explicit approval of this exact diff. Never `db push`.
-- Readback and the rolled-back behavioural probe are in docs/APPLIED_LEDGER.md.
--
-- 20260927063000 — the source language of the person's own words.
--
-- WHY, AND WHY NOW. `worker_professions.label` (ledger 20260927060325) holds a
-- profession in the person's own words. Doctrine §2.1 lists "custom position
-- labels" as USER-AUTHORED content, stored as the original text plus
-- `original_language`. Codex raised it on #1879; the owner ruled on
-- 2026-09-27: record the language, for THIS column only.
--
-- The timing is the point. Nothing writes `label` yet — the column is live and
-- empty — so the language lands BEFORE the first row exists and no row ever
-- has to be reconstructed or backfilled. That window closes the moment the
-- onboarding writer ships, which is why this comes first.
--
-- SCOPE, exactly as the owner set it:
--   · ONLY `worker_professions`. No other table is touched, and this is NOT a
--     §2.1 audit or harmonisation — the five other person-authored label
--     columns (profile_skill_claims.label, skill_candidate_clarifications.label,
--     engagement_contexts.title, booking_requests.role_text, worker_education /
--     worker_achievements) keep their current shape and are not this change's
--     business.
--   · NO automatic translation, and no translation columns (§2.2). This
--     records what language the person wrote in; nothing reads it to translate.
--   · `original_language` NEVER changes `label`. The words stay exactly as
--     typed; this is metadata beside them, not a transformation of them.
--   · The value comes from the REAL input locale the product already carries
--     (the wizard's own `useLocale()`, already submitted as the form's
--     `locale` field and validated against `lib/i18n/config.ts` `locales`).
--     It is NEVER guessed from the text — no language detection, here or in
--     the writer.
--   · NULLABLE, because an unknown language must stay unknown. A writer that
--     has no trustworthy locale records the words and leaves this null rather
--     than defaulting to anything (SEP-7: UNKNOWN ≠ a value).
--
-- EXISTING DATA: untouched. No update, no delete, no backfill. All 26 rows
-- carry a registry profession and no label, so by the second constraint below
-- their language is correctly null.
--
-- SHAPE: `text` + a NULL-permitting CHECK over the canonical set — mirroring
-- `conversation_messages_original_language_chk` exactly, the newest and
-- closest precedent. The 13 codes are the platform's widened set (the 11 of
-- doctrine §2.4 plus uk + ka, added forward-only by 20260917112002); the app
-- writes only from its own `locales`, so the wider DB set can never invent a
-- language — it only avoids a second widening migration later.
--
-- ROLLBACK: paired supabase/rollbacks/20260927063000_worker_self_declared_profession_language_v1.down.sql
-- It REFUSES while any row records a language, for the same reason as the
-- first migration's: that value came from a real person's session.
--
-- TRANSACTION: none declared here — `apply_migration` owns it, as with every
-- recently applied migration in this repository.
--
-- POST-APPLY VERIFICATION:
--   select count(*) from public.worker_professions;                          -- 26
--   select count(*) from public.worker_professions where original_language is not null;  -- 0
--   -- as a signed-in worker, their own worker_id:
--   insert into public.worker_professions (worker_id, label, original_language)
--     values (<own>, 'LLM programuotojas', 'lt');                            -- ok
--   insert into public.worker_professions (worker_id, label, original_language)
--     values (<own>, 'Pastolininkas', 'xx');                                 -- refused
--   insert into public.worker_professions (worker_id, profession_id, original_language)
--     values (<own>, <registry id>, 'lt');                                   -- refused (no words)
--   + APPLIED_LEDGER.md row.
--
-- CLASSIFICATION, measured rather than assumed: `.github/scripts/migration-safety.mjs`
-- reports this file `ok` — ZERO risk findings. It is purely additive (one
-- nullable column, two CHECK constraints, no data statement), so unlike
-- 20260927053000 it trips no rule and carries NO `@human-gate-approved`
-- annotation: there is nothing to acknowledge, and marking an unrisky file as
-- acknowledged-risky would be a false signal in the one place people look for
-- a true one.
--
-- It is still owner-gated by PROCEDURE, at the owner's instruction: draft PR +
-- `needs-human-gate` + explicit approval before apply, and the apply is manual
-- via Supabase MCP. The gate here is the human decision, not a comment.
-- ============================================================================

-- ── 1. The language the person wrote in ─────────────────────────────────────
alter table public.worker_professions
  add column if not exists original_language text;

-- ── 2. A real locale, or nothing ────────────────────────────────────────────
-- Mirrors conversation_messages_original_language_chk. NULL is explicitly
-- allowed: "not known" is a legitimate, honest state.
alter table public.worker_professions
  add constraint worker_professions_original_language_chk
  check (
    original_language is null
    or original_language = any (
      array['en','lt','lv','et','nl','de','da','no','sv','pl','ru','uk','ka']
    )
  );

-- ── 3. A language belongs to words ──────────────────────────────────────────
-- A registry row carries no person-authored text, so it can carry no source
-- language either — recording one there would describe nothing.
alter table public.worker_professions
  add constraint worker_professions_language_needs_label
  check (label is not null or original_language is null);

comment on column public.worker_professions.original_language is
  'ISO 639-1 language the person wrote `label` in, taken from the real input locale of their session — NEVER detected from the text. NULL when the language is not known; it is never defaulted or guessed. Metadata beside the words: it does not change `label`, and nothing translates from it (doctrine §2.2 — no translation columns).';
