-- Rollback for 20260712130000_conversation_message_attachments.sql
-- Reverses the additive objects. NOTE: dropping the metadata table removes
-- attachment RECORDS (not the blobs); empty the bucket manually first if a
-- full teardown is intended. The body CHECK is restored to 1..10000 ONLY
-- if no empty-body rows exist (guarded), otherwise it is left at 0..10000.

drop policy if exists "conversation-attachments participant select" on storage.objects;
drop policy if exists "conversation-attachments participant insert" on storage.objects;
drop policy if exists "conversation-attachments uploader delete" on storage.objects;
drop policy if exists "conversation-attachments admin select" on storage.objects;

delete from storage.buckets where id = 'conversation-attachments';

drop function if exists public.is_conversation_participant_path(text);
drop function if exists public.register_conversation_message_attachment(uuid, uuid, text, text, bigint, text);

drop table if exists public.conversation_message_attachments;

do $$
begin
  if not exists (
    select 1 from public.conversation_messages where char_length(body) = 0
  ) then
    alter table public.conversation_messages
      drop constraint if exists conversation_messages_body_check;
    alter table public.conversation_messages
      add constraint conversation_messages_body_check
      check (char_length(body) between 1 and 10000);
  end if;
end $$;
