-- DOWN / rollback for 20260612180000_pin_function_search_path.sql
--
-- Restores the prior state: the four functions had NO search_path setting
-- (mutable) before the forward migration. `RESET search_path` removes the
-- pinned setting, returning each function to its pre-migration configuration.
-- Behavior-preserving, no data impact. Apply via Supabase MCP apply_migration,
-- never `db push`.

begin;

alter function public.set_updated_at()
  reset search_path;

alter function public.pilot_drafts_set_updated_at()
  reset search_path;

alter function public.profile_skill_claims_set_updated_at()
  reset search_path;

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
) reset search_path;

commit;
