-- Rollback for 20261012180000_team_offer_conversation_source_v1.
-- Guarded: refuses while any conversation already carries the new type,
-- because narrowing the CHECK would then fail or invalidate real rows.
begin;

do $$
begin
  if exists (select 1 from public.conversations where source_type = 'team_offer') then
    raise exception 'rollback refused: conversations with source_type team_offer exist';
  end if;
end $$;

alter table public.conversations
  drop constraint if exists conversations_source_type_check;

alter table public.conversations
  add constraint conversations_source_type_check
  check (source_type in ('scouting', 'accepted_service_request', 'demand_interest', 'accepted_booking'));

commit;
