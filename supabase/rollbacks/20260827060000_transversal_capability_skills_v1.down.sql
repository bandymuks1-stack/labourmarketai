-- ============================================================================
-- ROLLBACK for 20260827060000_transversal_capability_skills_v1.sql
--
-- The forward migration only INSERTed eight catalogue rows, so reverting means
-- removing them. It is guarded, because by the time anyone runs this a real
-- person may have earned one of these capabilities from a real journal entry.
--
-- WHY DEACTIVATE RATHER THAN DELETE. `journal_entry_skills.skill_id` and
-- `worker_skills.skill_id` are FKs to `skills`. Deleting a row that a worker
-- has earned would either fail on the constraint or, worse, cascade away
-- evidence a person actually produced — and journal evidence is immutable
-- history (PLATFORM_DOCTRINE §3). So:
--
--   * a capability NOBODY has earned is deleted outright;
--   * a capability someone HAS earned is deactivated (`is_active = false`),
--     which is the taxonomy's own supported way to retire a slug: the
--     recogniser stops offering it, existing rows stay readable, and nobody
--     loses evidence they created.
--
-- The recogniser half (lib/structuring/keywords.ts) is reverted by reverting
-- the code, not by this file.
-- ============================================================================

do $$
declare
  v_slugs text[] := array[
    'presenting','stakeholder-engagement','partnership-development',
    'negotiation','project-coordination','report-writing','teamwork','research'
  ];
  v_earned int;
begin
  -- Retire (never remove) any capability a worker or a journal entry references.
  update public.skills s
     set is_active = false, updated_at = now()
   where s.slug = any(v_slugs)
     and (
       exists (select 1 from public.worker_skills ws where ws.skill_id = s.id)
       or exists (select 1 from public.journal_entry_skills jes where jes.skill_id = s.id)
     );
  get diagnostics v_earned = row_count;

  -- Remove only the ones nothing points at.
  delete from public.skills s
   where s.slug = any(v_slugs)
     and not exists (select 1 from public.worker_skills ws where ws.skill_id = s.id)
     and not exists (select 1 from public.journal_entry_skills jes where jes.skill_id = s.id)
     and not exists (select 1 from public.profession_skills ps where ps.skill_id = s.id);

  raise notice 'transversal capabilities: % retained as inactive (earned by real evidence), the rest removed', v_earned;
end $$;
