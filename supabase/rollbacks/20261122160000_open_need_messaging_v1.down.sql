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
drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert on public.conversations for insert
  with check (created_by = auth.uid());

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



-- The doors section 11 narrowed, back to their earlier bodies.
CREATE OR REPLACE FUNCTION public.revoke_conversation_participant(p_conversation_id uuid, p_profile_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  v_creator uuid;
  v_revoked timestamptz;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  select created_by into v_creator
    from public.conversations where id = p_conversation_id;
  if v_creator is null then
    raise exception 'conversation_not_found';
  end if;
  if v_creator <> uid and not public.is_admin() then
    raise exception 'not_authorized';
  end if;
  -- The creator's own grant is not revocable through this path — a thread
  -- without its owner is a different product decision, not a side effect.
  if p_profile_id = v_creator then
    raise exception 'cannot_revoke_creator';
  end if;
  select revoked_at into v_revoked
    from public.conversation_participants
   where conversation_id = p_conversation_id
     and profile_id = p_profile_id;
  if not found then
    raise exception 'participant_not_found';
  end if;
  if v_revoked is not null then
    return 'already_revoked';
  end if;

  update public.conversation_participants
     set revoked_at = now(),
         revoked_by = uid
   where conversation_id = p_conversation_id
     and profile_id = p_profile_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (
    uid,
    'conversation_participant_revoked',
    'conversations',
    p_conversation_id,
    jsonb_build_object('profile_id', p_profile_id)
  );

  return 'ok';
end $function$;
revoke all on function public.revoke_conversation_participant(uuid, uuid) from public, anon;
grant execute on function public.revoke_conversation_participant(uuid, uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.my_direct_conversations_with_workers_v1(p_worker_ids uuid[])
 RETURNS TABLE(worker_id uuid, conversation_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if cardinality(p_worker_ids) > 500 then
    raise exception 'Too many workers requested' using errcode = '22023';   -- never a silent empty answer
  end if;
  return query
  select w.id, mine.conversation_id
    from public.workers w
    join public.conversation_participants theirs on theirs.profile_id = w.profile_id and theirs.revoked_at is null
    join public.conversation_participants mine on mine.conversation_id = theirs.conversation_id
                                              and mine.profile_id = auth.uid() and mine.revoked_at is null
    join public.conversations c on c.id = mine.conversation_id and c.kind = 'direct'
   where auth.uid() is not null
     and w.id = any (p_worker_ids);
end;
$function$;
revoke all on function public.my_direct_conversations_with_workers_v1(uuid[]) from public, anon;
grant execute on function public.my_direct_conversations_with_workers_v1(uuid[]) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.team_offer_thread_party_v1(p_offer_id uuid)
 RETURNS TABLE(side text, offer_status text, counterpart_profile_id uuid, subject text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_side text;
  o      record;
begin
  if auth.uid() is null or p_offer_id is null then
    return;
  end if;
  v_side := public.team_offer_party_side_v1(p_offer_id);
  if v_side is null then
    return;
  end if;
  select t.status, t.offered_by, t.request_id, t.team_org_id into o
    from public.team_demand_offers t where t.id = p_offer_id;
  if not found then
    return;
  end if;
  return query
  select v_side,
         o.status,
         case when v_side = 'supplier'
              then (select cr.profile_id from public.customer_requests cr where cr.id = o.request_id)
              else o.offered_by
         end,
         (select nullif(btrim(g.display_name), '') from public.organizations g where g.id = o.team_org_id);
end;
$function$;
revoke all on function public.team_offer_thread_party_v1(uuid) from public, anon;
grant execute on function public.team_offer_thread_party_v1(uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_team_demand_offers_for_team_v1(p_team_org_id uuid)
 RETURNS TABLE(offer_id uuid, request_id uuid, role_text text, country text, company_name text, status text, offered_at timestamp with time zone, responded_at timestamp with time zone, assignment_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not coalesce(
       public.manages_organization(p_team_org_id)
       or exists (select 1 from public.organizations g
                   where g.id = p_team_org_id and g.owner_profile_id = uid),
       false) then
    return;
  end if;
  return query
  select o.id, o.request_id,
         coalesce(nullif(btrim(cr.role_or_work_type), ''), nullif(btrim(cr.title), '')),
         cr.country,
         coalesce(nullif(trim(c.display_name), ''), nullif(trim(c.legal_name), '')),
         o.status, o.offered_at, o.responded_at, o.assignment_id
    from public.team_demand_offers o
    join public.customer_requests cr on cr.id = o.request_id
    left join public.companies c on c.id = public.demand_company_id_v1(cr.organization_id, cr.profile_id)
   where o.team_org_id = p_team_org_id
   order by o.offered_at desc
   limit 100;
end;
$function$;
revoke all on function public.list_team_demand_offers_for_team_v1(uuid) from public, anon;
grant execute on function public.list_team_demand_offers_for_team_v1(uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.send_work_instruction(p_worker_profile_id text, p_body text, p_original_language text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid       uuid := auth.uid();
  worker_pid uuid := nullif(p_worker_profile_id, '')::uuid;
  w_id      uuid;
  conv_id   uuid;
  msg_id    uuid;
  cleaned   text := nullif(trim(coalesce(p_body, '')), '');
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if worker_pid is null then
    raise exception 'Worker is required' using errcode = '22023';
  end if;
  if cleaned is null then
    raise exception 'Instruction text is required' using errcode = '22023';
  end if;

  select id into w_id from public.workers where profile_id = worker_pid;
  if w_id is null then
    raise exception 'No such worker' using errcode = 'P0002';
  end if;

  -- Relationship gate: the caller must MANAGE this worker (active roster link to
  -- a company/agency the caller owns), or be an admin. Prevents instructing an
  -- unrelated worker.
  if not (
    exists (
      select 1 from public.company_workers cw
       where cw.worker_id = w_id and cw.status = 'active'
         and public.owns_company(cw.company_id)
    )
    or exists (
      select 1 from public.agency_workers aw
       where aw.worker_id = w_id and aw.status = 'active'
         and public.owns_agency(aw.agency_id)
    )
    or public.is_admin()
  ) then
    raise exception 'Not authorized to instruct this worker' using errcode = '42501';
  end if;

  -- Find an existing direct conversation that already has BOTH the caller and
  -- the worker as participants; otherwise create one and add both.
  select c.id into conv_id
    from public.conversations c
    join public.conversation_participants p1
      on p1.conversation_id = c.id and p1.profile_id = uid
    join public.conversation_participants p2
      on p2.conversation_id = c.id and p2.profile_id = worker_pid
   where c.kind = 'direct'
   order by c.created_at asc
   limit 1;

  if conv_id is null then
    insert into public.conversations (subject, kind, created_by)
      values (null, 'direct', uid)
      returning id into conv_id;
    insert into public.conversation_participants (conversation_id, profile_id, added_by)
      values (conv_id, uid, uid), (conv_id, worker_pid, uid);
  end if;

  insert into public.conversation_messages
    (conversation_id, author_id, body, is_instruction, original_language, translation_status)
    values (conv_id, uid, left(cleaned, 10000), true,
            nullif(trim(coalesce(p_original_language, '')), ''), 'unavailable')
    returning id into msg_id;

  update public.conversations set updated_at = now() where id = conv_id;
  return msg_id;
end;
$function$;
revoke all on function public.send_work_instruction(text, text, text) from public, anon;
grant execute on function public.send_work_instruction(text, text, text) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.send_work_instruction_to_project(p_worker_profile_id text, p_body text, p_original_language text DEFAULT NULL::text, p_project_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid        uuid := auth.uid();
  worker_pid uuid := nullif(p_worker_profile_id, '')::uuid;
  pid        uuid := nullif(p_project_id, '')::uuid;
  w_id       uuid;
  conv_id    uuid;
  msg_id     uuid;
  cleaned    text := nullif(trim(coalesce(p_body, '')), '');
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if worker_pid is null then
    raise exception 'Worker is required' using errcode = '22023';
  end if;
  if pid is null then
    raise exception 'Project is required' using errcode = '22023';
  end if;
  if cleaned is null then
    raise exception 'Instruction text is required' using errcode = '22023';
  end if;

  select id into w_id from public.workers where profile_id = worker_pid;
  if w_id is null then
    raise exception 'No such worker' using errcode = 'P0002';
  end if;

  if not (
    (
      (
        exists (
          select 1 from public.project_worker_assignments pwa
           where pwa.project_id = pid and pwa.worker_id = w_id and pwa.status = 'active'
        )
        or coalesce(public.team_work_context_v1(worker_pid, pid), false)
      )
      and public.can_manage_project(pid)
    )
    or public.is_admin()
  ) then
    raise exception 'Not authorized to instruct this worker on this project'
      using errcode = '42501';
  end if;

  select c.id into conv_id
    from public.conversations c
    join public.conversation_participants p1
      on p1.conversation_id = c.id and p1.profile_id = uid
    join public.conversation_participants p2
      on p2.conversation_id = c.id and p2.profile_id = worker_pid
   where c.kind = 'direct'
   order by c.created_at asc
   limit 1;

  if conv_id is null then
    insert into public.conversations (subject, kind, created_by)
      values (null, 'direct', uid)
      returning id into conv_id;
    insert into public.conversation_participants (conversation_id, profile_id, added_by)
      values (conv_id, uid, uid), (conv_id, worker_pid, uid);
  end if;

  insert into public.conversation_messages
    (conversation_id, author_id, body, is_instruction, original_language, translation_status, project_id)
    values (conv_id, uid, left(cleaned, 10000), true,
            nullif(trim(coalesce(p_original_language, '')), ''), 'unavailable', pid)
    returning id into msg_id;

  update public.conversations set updated_at = now() where id = conv_id;
  return msg_id;
end;
$function$;
revoke all on function public.send_work_instruction_to_project(text, text, text, text) from public, anon;
grant execute on function public.send_work_instruction_to_project(text, text, text, text) to authenticated, service_role;

commit;
