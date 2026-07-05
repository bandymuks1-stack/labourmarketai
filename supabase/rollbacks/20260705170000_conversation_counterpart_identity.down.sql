-- Rollback for 20260705170000_conversation_counterpart_identity.sql
--
-- Drops ONLY the SECURITY DEFINER read function. No table, no column, no
-- policy, no grant on any table was created by the up migration, so nothing
-- else needs to be restored. The app degrades gracefully back to the honest
-- restricted counterpart chip when the function is absent.

begin;

drop function if exists public.conversation_counterpart_identities(uuid[]);

commit;
