-- ============================================================================
-- conversation_activity_server_clock_v1 — a thread's last activity follows the
-- SERVER clock, never a client-supplied time (review of #2590, 2026-10-20).
--
-- 20261020171000 copied conversation_messages.created_at into
-- conversations.updated_at. `authenticated` may supply created_at on a direct
-- PostgREST insert (the insert policy checks authorship and participation
-- only), so a participant could post with a far-future created_at, pin the
-- thread above every other for all participants, and stop real messages from
-- advancing it. (Checked 2026-10-20: production holds no future-dated message
-- or thread — nothing to repair.)
--
-- Change:
--   1. conversation_touch_on_message_v1 sets updated_at to now() — the
--      inserting transaction's server time — forward only. Same scope as
--      before: only the message's own conversation, only updated_at.
--   2. A BEFORE INSERT trigger stamps created_at := now() for inserts made by
--      the API roles (authenticated / anon): a person's message carries the
--      server's time, not one they chose (doctrine: server-side timestamps).
--      Service-role / migration writers are unchanged.
-- Neither function is callable through the API (EXECUTE revoked).
--
-- Rollback: supabase/rollbacks/20261020173000_conversation_activity_server_clock_v1.down.sql
-- ============================================================================

create or replace function public.conversation_touch_on_message_v1()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  update public.conversations c
     set updated_at = now()
   where c.id = new.conversation_id
     and (c.updated_at is null or c.updated_at < now());
  return null;
end;
$function$;

revoke all on function public.conversation_touch_on_message_v1() from public, anon, authenticated;

create or replace function public.conversation_message_server_time_v1()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if current_user in ('authenticated', 'anon') then
    new.created_at := now();
  end if;
  return new;
end;
$function$;

revoke all on function public.conversation_message_server_time_v1() from public, anon, authenticated;

drop trigger if exists conversation_messages_0_server_time_v1 on public.conversation_messages;
create trigger conversation_messages_0_server_time_v1
  before insert on public.conversation_messages
  for each row execute function public.conversation_message_server_time_v1();
