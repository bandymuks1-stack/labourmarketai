-- ROLLBACK of 20261006100100_conversation_participants_server_authority_v1.
-- Restores the creator-adds-anyone policy from 0021_communication.
begin;

alter policy conversation_participants_insert
  on public.conversation_participants
  with check (
    exists (
      select 1
        from public.conversations c
       where c.id = conversation_participants.conversation_id
         and (c.created_by = auth.uid() or public.is_admin())
    )
  );

revoke insert on public.conversation_participants from service_role;

commit;
