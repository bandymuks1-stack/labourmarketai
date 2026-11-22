-- Rollback for 20261122160000_open_need_messaging_v1
--
-- Restores the participants / messages SELECT policies (0021) and the
-- attachments storage INSERT policy (20260712130000) to their earlier text,
-- drops the messages view, the attachment guard and every new function,
-- restores conversation_counterpart_identities (20261018160000 body),
-- conversation_source_context (20260706210000 body) and
-- list_open_demand_for_team_offer_v1 (20261028123000 body) byte for byte,
-- drops the two new functions and the disclosure table, and narrows the
-- source CHECK back to the four members.
--
-- REFUSES while any 'open_need' conversation exists: the restored name
-- function would show a hidden client's real name in that thread (a privacy
-- regression), and the narrowed CHECK could not hold. Such threads are
-- business records and are never edited or erased by a rollback.
-- Apply via Supabase MCP apply_migration.

begin;

do $$
begin
  if exists (select 1 from public.conversations where source_type = 'open_need') then
    raise exception 'open_need conversations exist; refusing to roll back (it would reveal hidden clients)';
  end if;
end $$;

-- The narrowed policies back to their 0021 / 20260712130000 text.
drop policy if exists conversation_participants_select on public.conversation_participants;
create policy conversation_participants_select on public.conversation_participants for select
  using (
    profile_id = auth.uid()
    or public.is_conversation_participant(conversation_id)
    or public.is_admin()
  );

drop policy if exists conversation_messages_select on public.conversation_messages;
create policy conversation_messages_select on public.conversation_messages for select
  using (
    public.is_conversation_participant(conversation_id)
    or public.is_admin()
  );

drop policy if exists "conversation-attachments participant insert" on storage.objects;
create policy "conversation-attachments participant insert"
  on storage.objects for insert
  with check (
    bucket_id = 'conversation-attachments'
    and auth.uid() is not null
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.is_conversation_participant_path(name)
  );

drop trigger if exists conversation_attachment_hidden_uploader_guard_v1 on public.conversation_message_attachments;
drop function if exists public.conversation_attachment_hidden_uploader_guard_v1();
drop function if exists public.conversation_id_of_path_v1(text);
drop view if exists public.conversation_messages_visible_v1;
drop function if exists public.conversation_live_recipients_v1(uuid, uuid);
drop function if exists public.disclose_open_need_identity_v1(uuid);
drop function if exists public.open_need_conversation_open_v1(uuid, uuid);
drop function if exists public.open_need_viewer_blinded_v1(uuid);
drop function if exists public.open_need_caller_hidden_v1(uuid);

do $$
begin
  if exists (select 1 from public.open_need_identity_disclosures) then
    raise exception 'open_need_identity_disclosures is not empty; refusing to drop it';
  end if;
end $$;
drop table if exists public.open_need_identity_disclosures;

do $$
begin
  if to_regclass('public.privacy_erasure_registry_v3') is not null then
    delete from public.privacy_erasure_registry_v3
     where schema_name = 'public' and table_name = 'open_need_identity_disclosures' and column_name = 'disclosed_by';
  end if;
end $$;

alter table public.conversations drop constraint if exists conversations_source_type_check;
alter table public.conversations
  add constraint conversations_source_type_check
    check (source_type in
      ('scouting','accepted_service_request','demand_interest','accepted_booking'));

create or replace function public.conversation_counterpart_identities(p_conversation_ids uuid[])
returns table (conversation_id uuid, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select cp.conversation_id,
         case
           -- Only CANDIDATE threads hide a name: threads about a demand (scouting / demand interest),
           -- and only the participant who is the CANDIDATE on that demand (an interest or shortlist row
           -- on c.source_id) — whoever opened the thread. The employer side is never hidden, and every
           -- other thread (colleagues, own employer, buyer / provider, support) is unchanged.
           when coalesce(c.source_type, '') not in ('scouting', 'demand_interest') then p.full_name
           when w.id is null then p.full_name
           when not (
             exists (select 1 from public.demand_interest_signals i
                      where i.request_id = c.source_id and i.worker_id = w.id)
             or exists (select 1 from public.demand_shortlist s
                         where s.request_id = c.source_id and s.worker_id = w.id)
           ) then p.full_name
           when public.caller_has_worker_relation_v1(w.id) then p.full_name
           when exists (
             select 1
               from (select distinct on (e.recipient_organization_id, e.context_type, e.context_id)
                            e.action, e.selected_fields, e.consent_text_version, e.recipient_organization_id
                       from public.privacy_consent_events e
                      where e.user_id = cp.profile_id and e.purpose = 'employer_data_disclosure'
                      order by e.recipient_organization_id, e.context_type, e.context_id,
                               e.created_at desc, e.seq desc) l
               join public.privacy_consent_purposes pp on pp.purpose = 'employer_data_disclosure'
              where l.action = 'granted'
                and l.consent_text_version = pp.current_version
                and l.selected_fields ? 'full_name'
                and public.manages_organization(l.recipient_organization_id)
           ) then p.full_name                                     -- the worker's own disclosure grant
           else 'Candidate ' || upper(left(regexp_replace(w.id::text, '[^a-zA-Z0-9]', '', 'g'), 6))
         end
  from public.conversation_participants cp
  join public.conversations c on c.id = cp.conversation_id
  join public.profiles p on p.id = cp.profile_id
  left join public.workers w on w.profile_id = cp.profile_id
  where cp.conversation_id = any(p_conversation_ids)
    and c.kind = 'direct'
    and cp.profile_id <> auth.uid()
    and cp.revoked_at is null
    and public.is_conversation_participant(cp.conversation_id)
    and (
      select count(*)
      from public.conversation_participants cp2
      where cp2.conversation_id = cp.conversation_id
        and cp2.revoked_at is null
    ) = 2;
$$;
revoke all on function public.conversation_counterpart_identities(uuid[]) from public;
revoke all on function public.conversation_counterpart_identities(uuid[]) from anon;
grant execute on function public.conversation_counterpart_identities(uuid[]) to authenticated;

create or replace function public.conversation_source_context(p_conversation_ids uuid[])
returns table (
  conversation_id   uuid,
  source_type       text,
  source_title      text,
  source_route_hint text
)
language sql security definer set search_path = public stable as $$
  select
    c.id,
    c.source_type,
    src.source_title,
    src.source_route_hint
  from public.conversations c
  join lateral (
    -- scouting / demand_interest → the demand row (customer_requests).
    -- The scouting route hint goes ONLY to the demand owner; the worker
    -- participant gets a null hint (label without a link).
    select
      cr.title as source_title,
      case when cr.profile_id = auth.uid() then 'company_scouting' end
        as source_route_hint
    from public.customer_requests cr
    where c.source_type in ('scouting', 'demand_interest')
      and cr.id = c.source_id
    union all
    -- accepted_service_request → the accepted marketplace request's offering
    -- title. Both buyer and provider share the same list route.
    select
      so.title as source_title,
      'service_requests' as source_route_hint
    from public.service_offering_requests sor
    join public.service_offerings so on so.id = sor.offering_id
    where c.source_type = 'accepted_service_request'
      and sor.id = c.source_id
    union all
    -- accepted_booking → the booking row's role_text. Both company and
    -- worker share the same list route.
    select
      br.role_text as source_title,
      'bookings' as source_route_hint
    from public.booking_requests br
    where c.source_type = 'accepted_booking'
      and br.id = c.source_id
  ) src on true
  where c.id = any(p_conversation_ids)
    and c.source_type is not null
    and c.source_id is not null
    and nullif(btrim(coalesce(src.source_title, '')), '') is not null
    and public.is_conversation_participant(c.id);
$$;

revoke all on function public.conversation_source_context(uuid[]) from public;
revoke all on function public.conversation_source_context(uuid[]) from anon;
grant execute on function public.conversation_source_context(uuid[]) to authenticated;

CREATE OR REPLACE FUNCTION public.list_open_demand_for_team_offer_v1(p_team_org_id uuid)
 RETURNS TABLE(request_id uuid, role_text text, country text, team_size integer, start_period text, company_name text, created_at timestamp with time zone, open_offer_id uuid, open_offer_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  v_sees_fixtures boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not coalesce((
       exists (select 1 from public.organizations o
                where o.id = p_team_org_id
                  and o.organization_type in ('team', 'company', 'agency'))
       and (public.manages_organization(p_team_org_id)
            or exists (select 1 from public.organizations o
                        where o.id = p_team_org_id and o.owner_profile_id = uid))
     ), false) then
    return;
  end if;
  -- A synthetic viewer (QA identity, or a team / organization that is itself
  -- a fixture) keeps seeing fixtures; everyone else does not (20261028123000).
  v_sees_fixtures := public.is_synthetic_viewer_v1()
    or exists (select 1 from public.organizations o
                where o.id = p_team_org_id
                  and public.is_synthetic_fixture_label_v1(o.display_name, o.legal_name));

  return query
  select cr.id,
         coalesce(nullif(btrim(cr.role_or_work_type), ''), nullif(btrim(cr.title), '')),
         cr.country,
         cr.team_size,
         cr.start_period,
         coalesce(nullif(trim(c.display_name), ''), nullif(trim(c.legal_name), '')),
         cr.created_at,
         o.id,
         o.status
    from public.customer_requests cr
    join public.companies c
      on c.id = public.demand_company_id_v1(cr.organization_id, cr.profile_id)
     and c.verification_status = 'verified'
    left join public.team_demand_offers o
      on o.request_id = cr.id and o.team_org_id = p_team_org_id
     and o.status in ('offered', 'accepted')
   where cr.status = 'submitted'
     and (cr.kind is null or cr.kind in ('company_request', 'buyer_request'))
     and cr.profile_id <> uid
     and not coalesce(public.has_org_demand_access(cr.organization_id), false)
     and cr.organization_id is distinct from p_team_org_id
     -- SYNTHETIC QA FIXTURES (20261028123000): another organization's fixture
     -- need is not market reality. Kept for the need's own people and for a
     -- synthetic viewer (lib/qa/synthetic-fixture.ts).
     and (v_sees_fixtures
          or not public.demand_is_synthetic_fixture_v1(cr.organization_id, cr.profile_id)
          or cr.profile_id = uid
          or coalesce(public.has_org_demand_access(cr.organization_id), false))
   order by cr.created_at desc
   limit 100;
end;
$function$;

revoke all on function public.list_open_demand_for_team_offer_v1(uuid) from public, anon;
grant execute on function public.list_open_demand_for_team_offer_v1(uuid) to authenticated;


commit;
