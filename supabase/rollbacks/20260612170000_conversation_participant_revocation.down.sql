-- DOWN / rollback for 20260612170000_conversation_participant_revocation.sql
--
-- RED-tier migration (RLS-semantics change): applied by the OWNER channel
-- after human approval, never self-applied. This paired down script satisfies
-- the rollback-file rule and restores the exact pre-audit state.
--
-- WARNINGS (both by design):
--   • Restoring the SECURITY INVOKER function REINTRODUCES the F0 recursion
--     bug (authenticated SELECT on conversations → stack depth limit exceeded).
--     Prefer keeping the SECURITY DEFINER definition even if the revocation
--     columns are dropped; this block restores the literal pre-audit state for
--     completeness only.
--   • Dropping revoked_at/revoked_by discards revocation history, which is
--     legal evidence (§3 / §4.3).
-- Apply via Supabase MCP apply_migration, never `db push`.

begin;

-- restore the pre-audit broad grants (Supabase default) on all three tables
grant all on public.conversations              to anon, authenticated;
grant all on public.conversation_participants  to anon, authenticated;
grant all on public.conversation_messages      to anon, authenticated;

drop function if exists public.revoke_conversation_participant(uuid, uuid);

create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean language sql security invoker stable as $body$
  select exists (
    select 1 from public.conversation_participants cp
     where cp.conversation_id = p_conversation_id
       and cp.profile_id = auth.uid()
  );
$body$;

alter table public.conversation_participants drop column if exists revoked_by;
alter table public.conversation_participants drop column if exists revoked_at;

commit;
