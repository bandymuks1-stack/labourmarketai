-- ROLLBACK for 20261012180000_conversation_message_team_offer_v1.
-- While NO message carries a label: everything goes (column, trigger, helper,
-- index) and the app sends unlabelled messages exactly as before.
-- Once labels exist they are part of the conversation history and are never
-- silently destroyed - and the column must never stay WITHOUT its guard (a
-- participant could then label any offer). So with labels present the
-- rollback changes nothing and says so; removing labelled history is a
-- separate, explicit owner decision.
begin;

do $$
declare
  v_labelled bigint;
begin
  select count(*) into v_labelled from public.conversation_messages where team_offer_id is not null;
  if v_labelled > 0 then
    raise exception 'rollback refused: % labelled messages exist (history); column and its guard kept', v_labelled;
  end if;
  drop trigger if exists conversation_messages_team_offer_guard on public.conversation_messages;
  drop function if exists public.conversation_message_team_offer_guard_v1();
  drop function if exists public.team_offer_side_of_profile_v1(uuid, uuid);
  drop index if exists public.conversation_messages_team_offer_idx;
  alter table public.conversation_messages drop column if exists team_offer_id;
end $$;

commit;
