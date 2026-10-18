-- Rollback for 20261012100000_assistant_transcript_v1.sql.
-- REFUSES while any conversation exists: a person's chat history is theirs,
-- and dropping it is not a rollback but a deletion. Export first
-- (export_assistant_transcript) or forward-fix instead.

begin;

do $$
begin
  if to_regclass('public.assistant_conversations') is not null
     and exists (select 1 from public.assistant_conversations) then
    raise exception 'assistant transcripts exist — export or forward-fix instead of rolling back';
  end if;
end $$;

drop function if exists public.erase_assistant_transcript(uuid);
drop function if exists public.export_assistant_transcript();
drop function if exists public.append_assistant_message(uuid, text, text, text, char, text, text, jsonb, text);

drop table if exists public.assistant_message_attachments;
drop table if exists public.assistant_messages;
drop table if exists public.assistant_conversations;

commit;
