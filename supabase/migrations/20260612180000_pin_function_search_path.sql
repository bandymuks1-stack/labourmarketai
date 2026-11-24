-- ============================================================================
-- 20260612180000 — Phase A security hygiene: pin search_path on 4 functions.
--
-- WHY: the 2026-06-12 advisor snapshot
-- (docs/audits/SECURITY_ADVISOR_SNAPSHOT_2026-06-12.md) flagged
-- `function_search_path_mutable` (WARN) on four functions. Pinning an explicit
-- `search_path = public` is the Supabase-recommended hygiene fix: it removes
-- the mutable-search_path warning so the function always resolves objects in
-- the intended schema regardless of the caller's session search_path.
--
-- SCOPE: behavior-preserving. These 4 functions are all SECURITY INVOKER
-- (verified on prod 2026-06-12), so there is no privilege-escalation vector —
-- this is plain hygiene, GREEN tier. No RLS, no policy, no grant, no trigger,
-- no auth, no data change. ALTER FUNCTION ... SET only.
--
-- Functions (exact identity signatures from pg_proc):
--   public.set_updated_at()
--   public.pilot_drafts_set_updated_at()
--   public.profile_skill_claims_set_updated_at()
--   public.create_journal_entry_full(uuid, uuid, text, uuid, text, char,
--                                     text, text, text, jsonb)
-- ============================================================================

begin;

alter function public.set_updated_at()
  set search_path = public;

alter function public.pilot_drafts_set_updated_at()
  set search_path = public;

alter function public.profile_skill_claims_set_updated_at()
  set search_path = public;

alter function public.create_journal_entry_full(
  p_worker_id uuid,
  p_engagement_context_id uuid,
  p_entry_type_slug text,
  p_profession_id uuid,
  p_original_text text,
  p_original_language character,
  p_hash_prev text,
  p_hash_self text,
  p_visibility_scope text,
  p_metrics jsonb
) set search_path = public;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK (manual — see supabase/rollbacks/20260612180000_pin_function_search_path.down.sql).
-- Restores the prior (unset / mutable) search_path on all four functions via
-- ALTER FUNCTION ... RESET search_path. Reversible, no data impact.
-- ─────────────────────────────────────────────────────────────────────────
