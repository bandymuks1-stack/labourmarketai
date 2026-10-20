-- ============================================================================
-- conversation_last_activity_v1 — a thread's last activity moves when a
-- message is sent (audit 2026-10-20, HIGH).
--
-- Every thread list orders by conversations.updated_at (the inbox: newest 100;
-- the chat: newest 50; MCP conversation.list: newest 20, reporting it as
-- lastActivityAt). The app bumped it from the client after each send, but
-- `authenticated` holds only SELECT and INSERT on conversations
-- (20260612170000) and no UPDATE policy exists, so the bump always failed —
-- silently — and updated_at stayed at the thread's CREATION time. An old
-- thread that got a fresh reply sank, and for anyone with more than 100
-- threads it fell off the list while the badge still counted it unread.
--
-- Change:
--   1. AFTER INSERT trigger on conversation_messages sets the parent
--      conversation's updated_at to the message's created_at (only forward).
--      SECURITY DEFINER because the sender holds no UPDATE on conversations;
--      it writes ONLY updated_at, ONLY of the message's own conversation, and
--      only to a later time. EXECUTE revoked from public / anon / authenticated
--      (a trigger function is not an API surface).
--   2. One-time backfill: each conversation's updated_at becomes its latest
--      message time where that is later. Derived timestamp only — no content,
--      participant or message row is touched.
--
-- Rollback: supabase/rollbacks/20261020171000_conversation_last_activity_v1.down.sql
-- (drops the trigger + function; the backfilled timestamps are left as the
-- true last-activity times — reverting them would re-introduce the defect).
-- ============================================================================

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

drop trigger if exists conversation_messages_touch_conversation_v1 on public.conversation_messages;
create trigger conversation_messages_touch_conversation_v1
  after insert on public.conversation_messages
  for each row execute function public.conversation_touch_on_message_v1();

update public.conversations c
   set updated_at = m.last_at
  from (
    select conversation_id, max(created_at) as last_at
      from public.conversation_messages
     group by conversation_id
  ) m
 where m.conversation_id = c.id
   and (c.updated_at is null or c.updated_at < m.last_at);
