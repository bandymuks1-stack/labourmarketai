-- 20261122160000_open_need_messaging_v1
--
-- RED tier (needs-human-gate). NOT applied to any shared database. Production
-- apply only via Supabase MCP apply_migration after the owner approves THIS
-- migration by name.
--
-- WHY (owner decision A, 2026-11-22 — messaging about an open need, decision
-- 0033 direct counterparty): an agency, subcontractor or brigade may write to
-- the client about an OPEN NEED without the client's identity being revealed.
-- The client answers in the same in-app conversation; its identity stays
-- hidden from the provider until the client itself chooses to show it.
--
-- WHAT — the existing conversation system, no second channel:
--   1. conversations.source_type gains ONE member, 'open_need' (the thread is
--      about customer_requests.id = source_id). The CHECK is recreated with the
--      four existing members unchanged.
--   2. open_need_identity_disclosures — one row per thread when the client has
--      chosen to show its name. Participants may read it; nobody may write it
--      except through disclose_open_need_identity_v1.
--   3. open_need_message_party_v1(request, org) — the provider's door. Answers
--      only when the caller manages (or owns) that team / company / agency AND
--      the need is one that organization may already see on its board
--      (list_open_demand_for_team_offer_v1, the SAME gate, called — not
--      copied). Returns the need owner's profile id (for the server's
--      participant insert) and a neutral subject (the need's role). No name,
--      no company.
--   4. disclose_open_need_identity_v1(conversation) — only the need's owner,
--      as a participant of an 'open_need' thread about their own need.
--   5. conversation_counterpart_identities — in an 'open_need' thread the
--      need owner is named 'Client ' + six characters of the need id until a
--      disclosure row exists. Every other branch is byte-for-byte the
--      20261018160000 body.
--   6. conversation_source_context — one more lateral branch: 'open_need' →
--      the need's role/title; route hint 'company_needs' for the need owner
--      only, null for the provider. Every other branch unchanged.
--   7. list_open_demand_for_team_offer_v1 — company_name is returned as NULL
--      (same signature): the board no longer names the client. Every other
--      column and every gate is unchanged.
--
-- NOT CHANGED: every RLS policy on conversations / participants / messages /
-- profiles / customer_requests; team_demand_offers; offer_team_to_demand_v1;
-- team_offer_thread_party_v1 (a thread opened from a LIVE offer still names
-- both sides — the client engaged by receiving the offer; separate decision).
--
-- Rollback: supabase/rollbacks/20261122160000_open_need_messaging_v1.down.sql
-- Apply via Supabase MCP apply_migration only.

begin;

-- 1) The closed source set gains 'open_need'.
alter table public.conversations drop constraint if exists conversations_source_type_check;
alter table public.conversations
  add constraint conversations_source_type_check
    check (source_type in
      ('scouting','accepted_service_request','demand_interest','accepted_booking','open_need'));

-- 2) The client's own choice to be named in one open-need thread.
create table if not exists public.open_need_identity_disclosures (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  disclosed_by    uuid not null references public.profiles(id) on delete cascade,
  disclosed_at    timestamptz not null default now()
);
alter table public.open_need_identity_disclosures enable row level security;
revoke all on table public.open_need_identity_disclosures from public, anon, authenticated;
grant select on table public.open_need_identity_disclosures to authenticated;
drop policy if exists open_need_identity_disclosures_select on public.open_need_identity_disclosures;
create policy open_need_identity_disclosures_select on public.open_need_identity_disclosures
  for select to authenticated
  using (public.is_conversation_participant(conversation_id));
-- No insert / update / delete policy: written only by the function below.

-- GDPR erasure v3 registry: the person's own choice; deleted with the account
-- (the client is then unnamed again — the safe direction).
do $$
begin
  if to_regclass('public.privacy_erasure_registry_v3') is null then
    return;
  end if;
  insert into public.privacy_erasure_registry_v3
    (schema_name, table_name, column_name, parent, fk_rule_expected, treatment, decided_by, legal_review, legal_basis, note) values
  ('public', 'open_need_identity_disclosures', 'disclosed_by', 'profiles', 'cascade', 'allow_cascade', 'engineering', false,
   'Art. 17(1)(a)/(b): the person''s own choice to show their name in one thread; deleted with the account',
   'no domain state; deleting it hides the name again')
  on conflict (schema_name, table_name, column_name) do nothing;
end $$;

-- 3) The provider's door.
create or replace function public.open_need_message_party_v1(p_request_id uuid, p_org_id uuid)
returns table (owner_profile_id uuid, subject text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  -- The board gate, called: zero rows unless the caller manages p_org_id and
  -- the need is open, verified, not its own and offerable to that org.
  if not exists (
    select 1 from public.list_open_demand_for_team_offer_v1(p_org_id) b
     where b.request_id = p_request_id
  ) then
    return;
  end if;
  return query
  select cr.profile_id,
         left(coalesce(nullif(btrim(cr.role_or_work_type), ''), nullif(btrim(cr.title), '')), 120)
    from public.customer_requests cr
   where cr.id = p_request_id
     and cr.profile_id is not null
     and cr.profile_id <> uid;
end $$;
revoke all on function public.open_need_message_party_v1(uuid, uuid) from public, anon;
grant execute on function public.open_need_message_party_v1(uuid, uuid) to authenticated;

-- 4) The client shows its name in one thread.
create or replace function public.disclose_open_need_identity_v1(p_conversation_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  v_new integer;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not exists (
    select 1
      from public.conversations c
      join public.customer_requests cr on cr.id = c.source_id
      join public.conversation_participants cp
        on cp.conversation_id = c.id and cp.profile_id = uid and cp.revoked_at is null
     where c.id = p_conversation_id
       and c.source_type = 'open_need'
       and cr.profile_id = uid
  ) then
    -- Same answer for "no such thread" and "not yours".
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.open_need_identity_disclosures (conversation_id, disclosed_by)
  values (p_conversation_id, uid)
  on conflict (conversation_id) do nothing;
  get diagnostics v_new = row_count;
  if v_new > 0 then
    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (uid, 'open_need_identity_disclosed_v1', 'conversations', p_conversation_id, '{}'::jsonb);
  end if;
  return true;
end $$;
revoke all on function public.disclose_open_need_identity_v1(uuid) from public, anon;
grant execute on function public.disclose_open_need_identity_v1(uuid) to authenticated;

-- 5) Conversation names: the client is hidden in an open-need thread until it
--    discloses. Every other branch is the 20261018160000 body unchanged.
create or replace function public.conversation_counterpart_identities(p_conversation_ids uuid[])
returns table (conversation_id uuid, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select cp.conversation_id,
         case
           -- OPEN NEED (20261122160000): the need's owner is not named to the
           -- provider until the owner discloses in THIS thread.
           when c.source_type = 'open_need'
                and exists (select 1 from public.customer_requests cr
                             where cr.id = c.source_id and cr.profile_id = cp.profile_id)
                and not exists (select 1 from public.open_need_identity_disclosures d
                                 where d.conversation_id = c.id)
             then 'Client ' || upper(left(regexp_replace(c.source_id::text, '[^a-zA-Z0-9]', '', 'g'), 6))
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

-- 6) Source context: one more branch for 'open_need' (placed right after the
--    other customer_requests branch; every other branch unchanged).
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
    select
      cr.title as source_title,
      case when cr.profile_id = auth.uid() then 'company_scouting' end
        as source_route_hint
    from public.customer_requests cr
    where c.source_type in ('scouting', 'demand_interest')
      and cr.id = c.source_id
    union all
    -- open_need (20261122160000) → the need's role or title; the need owner
    -- gets the route to its needs, the provider gets no route.
    select
      coalesce(nullif(btrim(cr.role_or_work_type), ''), cr.title) as source_title,
      case when cr.profile_id = auth.uid() then 'company_needs' end
        as source_route_hint
    from public.customer_requests cr
    where c.source_type = 'open_need'
      and cr.id = c.source_id
    union all
    select
      so.title as source_title,
      'service_requests' as source_route_hint
    from public.service_offering_requests sor
    join public.service_offerings so on so.id = sor.offering_id
    where c.source_type = 'accepted_service_request'
      and sor.id = c.source_id
    union all
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

-- 7) The board no longer names the client (same signature; company_name NULL).
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
         -- OPEN NEED (20261122160000): the client is not named on the board.
         null::text,
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
