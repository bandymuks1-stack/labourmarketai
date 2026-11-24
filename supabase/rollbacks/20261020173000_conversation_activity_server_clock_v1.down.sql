-- Rollback of 20261020173000_conversation_activity_server_clock_v1:
-- the server-time stamp trigger goes; the touch trigger returns to the
-- 20261020171000 body (copies the message's created_at).
drop trigger if exists conversation_messages_0_server_time_v1 on public.conversation_messages;
drop function if exists public.conversation_message_server_time_v1();

create or replace function public.conversation_touch_on_message_v1()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  update public.conversations c
     set updated_at = new.created_at
   where c.id = new.conversation_id
     and (c.updated_at is null or c.updated_at < new.created_at);
  return null;
end;
$function$;

revoke all on function public.conversation_touch_on_message_v1() from public, anon, authenticated;
