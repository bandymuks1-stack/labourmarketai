-- @human-gate-approved
-- ============================================================================
-- RISK ACKNOWLEDGEMENT, NOT AN APPROVAL. RED by construction (ALTER POLICY on a
-- live authorization surface). Route: draft PR + needs-human-gate, owner-channel
-- apply via Supabase MCP apply_migration. NO OWNER APPROVAL EXISTS YET. Must not
-- be applied to production; CI must not auto-merge it.
--
-- 20261006100100 - CONVERSATION PARTICIPANTS: only the server adds OTHER people
--
-- THE DEFECT (audit 2026-10-06, finding F-1; reproduced on the repo's replayed
-- schema). conversation_participants_insert admits any row whose conversation
-- the caller created (or any row when the caller is admin):
--     exists (select 1 from conversations c
--              where c.id = conversation_id
--                and (c.created_by = auth.uid() or is_admin()))
-- so ANY signed-in account can create a conversation and add ANY profile uuid to
-- it, and then message them - the section 8.1 contact-consent gate (§8.1, the
-- product's "who may open a thread with whom" rule) is enforced only in
-- TypeScript, in getOrCreateDirectConversation, while the exported server action
-- createConversation and a direct PostgREST insert both bypass it.
-- communication-core.ts documents the policy as "creator-adds are RLS-permitted
-- by design" and relies on a participant cap + a rate cap; neither is consent.
--
-- INTENT RECOVERED. The permission model (evaluateContactPermission: existing
-- thread, engagement, accepted booking, agency connection, scouting shortlist,
-- team, admin, managed project) is a SERVER-SIDE evaluation over many facts; it
-- is not, and must not become, a second authorization system in SQL. The
-- canonical shape is therefore "the server decides, the database refuses
-- everyone else": the database must not let an end-user session add ANOTHER
-- profile to a conversation; only the server (service role, after the gate) may.
--
-- WHAT CHANGES
--   * ALTER POLICY conversation_participants_insert: an end-user session may
--     insert only ITS OWN participant row, and only into a conversation it
--     created. The admin branch is unchanged. Rows for other profiles can be
--     written only by the service role (RLS-exempt), i.e. by
--     createConversationCore after the gate, and by SECURITY DEFINER pipelines
--     (agency bridge, instructions) exactly as before.
--
-- WHAT DOES NOT CHANGE
--   * support threads (creator self-row), admin "join as participant" (self-row
--     / admin branch), existing threads, reading, messaging, revocation;
--   * every SECURITY DEFINER pipeline that already inserts participants.
--
-- DEPLOY ORDER (important): ship the application change FIRST. The new
-- createConversationCore adds other participants with the service client, which
-- works under the old and the new policy. Applying this migration BEFORE the
-- application change would stop the old code from adding the other participant
-- to a new direct thread.
--
-- HONEST LIMITS
--   * A user can still create a conversation containing only themselves (a note
--     to self). Nobody else can be added without the server.
--   * It does not narrow what the §8.1 gate itself admits (that is product
--     policy, unchanged).
--
-- ROLLBACK: supabase/rollbacks/20261006100100_conversation_participants_server_authority_v1.down.sql
-- ============================================================================

begin;

alter policy conversation_participants_insert
  on public.conversation_participants
  with check (
    exists (
      select 1
        from public.conversations c
       where c.id = conversation_participants.conversation_id
         and (
           public.is_admin()
           or (
             c.created_by = auth.uid()
             and conversation_participants.profile_id = auth.uid()
           )
         )
    )
  );

-- THE SERVER-SIDE ADD NEEDS A GRANT IN PRODUCTION. The communication core adds
-- every OTHER participant with the service client (after ContactAuthority).
-- 0021_communication granted this table to `authenticated` only, and tables
-- created through the migration API give service_role no privileges in this
-- project (read-only production check 2026-10-06:
-- has_table_privilege('service_role', 'public.conversation_participants',
-- 'INSERT') = false). Without this line every new direct thread fails for the
-- NEW app even before the policy above is applied. INSERT only: the server
-- writes nothing else here (reads and deletes stay on the end-user session).
grant insert on public.conversation_participants to service_role;

commit;
