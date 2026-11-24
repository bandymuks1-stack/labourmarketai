-- additive: true
-- ════════════════════════════════════════════════════════════════════════
-- 20260719150000_vehicle_cleaning_skill.sql
--
-- P1 recall repair (journal recognition incident 2026-07-19): the entry
-- "Ploviau mašiną - 1 h. …" carries a direct car-washing skill signal, but
-- the taxonomy had NO vehicle-cleaning slug — the deterministic recognizer
-- (lib/structuring/keywords.ts) had nowhere to land the match, so the signal
-- was silently dropped (loss stage: TAXONOMY coverage).
--
-- Content: ONE new skill row, `vehicle-cleaning`, in the existing cleaning
-- family (same canonical `public.skills` table — doctrine §2, no parallel
-- structure). Display names ship in the same PR in
-- apps/web/messages/{locale}/skill-names.json for all 12 taxonomy locales
-- (installation-chain guard enforces the full chain).
--
-- Safety: strictly additive — INSERT … ON CONFLICT DO NOTHING only. No DDL,
-- no grants, no RLS change, no updates/deletes. Idempotent.
-- rollback: delete from public.skills where slug='vehicle-cleaning' and no
--   worker_skills / journal_entry_skills / profession_skills rows reference
--   it (guarded delete — see
--   supabase/rollbacks/20260719150000_vehicle_cleaning_skill.down.sql).
-- ════════════════════════════════════════════════════════════════════════

insert into public.skills (slug, category, is_active) values
  ('vehicle-cleaning', 'cleaning.general', true)
on conflict (slug) do nothing;
