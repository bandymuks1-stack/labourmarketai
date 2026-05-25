-- ════════════════════════════════════════════════════════════════════════
-- 0014_profile_text_column.sql — owner-only home for the text-first
-- composer's raw narrative.
--
-- Privacy-driven rewrite of an earlier draft of 0014 that would have
-- granted INSERT/UPDATE on public.workers to authenticated and reused
-- workers.bio as the destination. The workers_select policy in 0001 reads:
--   using (profile_id = auth.uid() or is_admin() or is_employer())
-- and is_employer() (0003) returns true for ANY profile with active_role
-- in ('company','agency'). Storing CV-style narrative on workers.bio would
-- therefore expose it to every employer account on the platform — broader
-- than the text-first composer's intent ("write in your own words / paste
-- a CV", which may include personal contact details).
--
-- profiles is already owner-only at every layer:
--   - RLS profiles_select: id = auth.uid() or is_admin()  (0001)
--   - GRANT SELECT, INSERT, UPDATE, DELETE on profiles to authenticated  (0004)
-- so adding a `profile_text` column there gives us owner-only persistence
-- with zero policy / grant changes.
--
-- ADDITIVE / non-destructive: a single nullable text column.
-- Forward-only — manual rollback at the bottom.
-- ════════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists profile_text text;

-- Note: a previous revision of this file concatenated three literals with
-- the `||` operator. `COMMENT ON ... IS` requires a string LITERAL, not an
-- expression, and Supabase's preview migration replay rejects the `||`
-- chain. Switched to SQL-standard adjacent-string-literal concatenation
-- (two string constants separated by whitespace including at least one
-- newline are parsed as one literal). Same final comment text; the
-- production catalogue already holds the resolved text.
comment on column public.profiles.profile_text is
  'Owner-only raw self-description / CV paste from the text-first composer. '
  'NOT a verified claim. NOT readable by employers. RLS scopes reads/writes '
  'to id = auth.uid().';

-- ── DOWN (manual rollback) ───────────────────────────────────────────────
-- alter table public.profiles drop column if exists profile_text;
