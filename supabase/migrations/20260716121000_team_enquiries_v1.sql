-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY without explicit owner OK.
-- DO NOT APPLY automatically. Apply ONLY via Supabase MCP apply_migration
-- after explicit owner approval. Never `db push`.
-- APPLY ORDER: 20260716120000_team_profile_details_v1.sql FIRST — the
-- employer read model below projects the availability snapshot from
-- team_details at call time.
--
-- 20260716121000 — team enquiries v1 (Trust Connect Teams wagon, gap 3).
--
-- PROBLEM: an employer who finds a team/brigade (organizations row,
-- organization_type='team') has NO structured, auditable way to ask "is this
-- team available for our site" — the only options are nothing or an
-- off-platform channel that leaks contacts and leaves no trail.
--
-- SOLUTION: clone the PROVEN booking_requests state machine
-- (20260613100100 + lifecycle v2 20260711290000) at team granularity:
--   * team_enquiries: employer profile → team org, bounded platform message,
--     optional needed dates, status proposed → accepted|declined|withdrawn|
--     expired — every transition appended to team_enquiry_events.
--   * The proposer can NEVER accept their own enquiry (respond is
--     team-owner/manager-only and additionally refuses the proposing
--     profile) — no self-acceptance, mirroring "the company can never
--     self-accept" from bookings.
--   * expired has a real writer from day one (admin-only sweep, capped) —
--     the "no expiry writer" gap bookings shipped with is not repeated.
--
-- Honesty / privacy invariants:
--   * NO contact leakage: the tables carry NO email/phone columns; the
--     propose RPC REJECTS messages containing an email address or a
--     phone-like digit run — enquiries are platform messages only. The read
--     models return display names only, never contact channels.
--   * Abuse bounds: per proposer 10 open enquiries + 30 created / 24h;
--     one open enquiry per (proposer, team); message <= 2000 chars.
--   * RLS default-closed: an enquiry is visible ONLY to the proposing
--     profile, the team owner, organization managers and admins. Writes are
--     RPC-only; the events table is append-only (no update/delete path).
--   * Every state change appends an audit_logs row.
--   * Grants: authenticated only — never anon.
--
-- ROLLBACK: supabase/rollbacks/20260716121000_team_enquiries_v1.down.sql
--
-- @human-gate-approved — TIER: owner-gated (SECURITY DEFINER + grants +
-- in-function UPDATEs = RED-class; the annotation downgrades the CI finding
-- only — the OWNER still applies manually).
-- ============================================================================

begin;

-- ── 1. Enquiries (employer profile → team org) ─────────────────────────────
create table if not exists public.team_enquiries (
  id                      uuid primary key default gen_random_uuid(),
  owner_id                uuid not null references public.profiles(id) on delete cascade,
  company_organization_id uuid references public.organizations(id) on delete set null,
  team_org_id             uuid not null references public.organizations(id) on delete cascade,
  message                 text not null check (char_length(message) between 1 and 2000),
  start_date              date,
  expected_end_date       date,
  status                  text not null default 'proposed'
                            check (status in
                              ('proposed','accepted','declined','withdrawn','expired')),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  check (expected_end_date is null or start_date is null
         or expected_end_date >= start_date)
);

create index if not exists team_enquiries_owner_idx
  on public.team_enquiries (owner_id, created_at desc);
create index if not exists team_enquiries_team_idx
  on public.team_enquiries (team_org_id, status);
-- One OPEN enquiry per (proposer, team) — re-enquiry after a terminal state
-- is allowed, a second open one is not.
create unique index if not exists team_enquiries_one_open_idx
  on public.team_enquiries (owner_id, team_org_id)
  where status = 'proposed';

-- ── 2. Append-only event log (status lifecycle audit) ─────────────────────
create table if not exists public.team_enquiry_events (
  id          uuid primary key default gen_random_uuid(),
  enquiry_id  uuid not null references public.team_enquiries(id) on delete cascade,
  actor_id    uuid not null references public.profiles(id),
  event_type  text not null check (event_type in
                ('proposed','accepted','declined','withdrawn','expired')),
  from_status text,
  to_status   text not null,
  created_at  timestamptz not null default now()
);
create index if not exists team_enquiry_events_idx
  on public.team_enquiry_events (enquiry_id, created_at);

-- ── 3. RLS — default-closed; RPC-only writes; append-only events ──────────
alter table public.team_enquiries enable row level security;
alter table public.team_enquiry_events enable row level security;

drop policy if exists team_enquiries_select on public.team_enquiries;
create policy team_enquiries_select on public.team_enquiries
  for select to authenticated
  using (
    owner_id = auth.uid()
    or exists (select 1 from public.organizations o
                where o.id = team_org_id and o.owner_profile_id = auth.uid())
    or public.manages_organization(team_org_id)
    or public.is_admin()
  );

drop policy if exists team_enquiry_events_select on public.team_enquiry_events;
create policy team_enquiry_events_select on public.team_enquiry_events
  for select to authenticated
  using (
    exists (select 1 from public.team_enquiries e
             where e.id = enquiry_id
               and (e.owner_id = auth.uid()
                    or exists (select 1 from public.organizations o
                                where o.id = e.team_org_id
                                  and o.owner_profile_id = auth.uid())
                    or public.manages_organization(e.team_org_id)))
    or public.is_admin()
  );
-- No insert/update/delete policies: ALL writes go through the RPCs below.
-- Append-only: no update/delete policy on events, ever.

grant select on public.team_enquiries to authenticated;
grant select on public.team_enquiry_events to authenticated;

-- ── 4. propose_team_enquiry_v1 (employer → team) ──────────────────────────
create or replace function public.propose_team_enquiry_v1(
  p_team_org_id             uuid,
  p_message                 text,
  p_start_date              date,
  p_expected_end_date       date,
  p_company_organization_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid          uuid := auth.uid();
  v_msg        text := trim(coalesce(p_message, ''));
  v_type       text;
  v_team_owner uuid;
  v_open       int;
  v_day        int;
  v_new        uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if char_length(v_msg) < 1 then
    return jsonb_build_object('outcome', 'message_required');
  end if;
  if char_length(v_msg) > 2000 then
    return jsonb_build_object('outcome', 'message_too_long');
  end if;
  -- Platform messages only — refuse embedded contact channels: an email
  -- address, or any single token carrying 9+ digits (phone-like; dates such
  -- as 2026-08-01 carry only 8 digits and pass).
  if v_msg ~* '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' then
    return jsonb_build_object('outcome', 'contact_details_in_message');
  end if;
  if exists (
    select 1 from regexp_split_to_table(v_msg, '\s+') tok
     where char_length(regexp_replace(tok, '\D', '', 'g')) >= 9
  ) then
    return jsonb_build_object('outcome', 'contact_details_in_message');
  end if;

  if p_start_date is not null and p_expected_end_date is not null
     and p_expected_end_date < p_start_date then
    return jsonb_build_object('outcome', 'invalid_dates');
  end if;

  select organization_type, owner_profile_id into v_type, v_team_owner
    from public.organizations where id = p_team_org_id;
  if not found then
    return jsonb_build_object('outcome', 'team_not_found');
  end if;
  if v_type <> 'team' then
    return jsonb_build_object('outcome', 'not_a_team');
  end if;
  -- No enquiries about your OWN team (also blocks later self-acceptance).
  if v_team_owner = uid or public.manages_organization(p_team_org_id) then
    return jsonb_build_object('outcome', 'own_team');
  end if;

  -- Optional proposing-company context must really be the caller's org.
  if p_company_organization_id is not null then
    if not exists (
      select 1 from public.organizations c
       where c.id = p_company_organization_id
         and (c.owner_profile_id = uid
              or public.manages_organization(c.id))
    ) then
      return jsonb_build_object('outcome', 'not_authorized');
    end if;
  end if;

  -- Abuse caps (per proposer): 10 open, 30 created in the last 24h.
  select count(*) into v_open from public.team_enquiries
   where owner_id = uid and status = 'proposed';
  if v_open >= 10 then
    return jsonb_build_object('outcome', 'limit_reached');
  end if;
  select count(*) into v_day from public.team_enquiries
   where owner_id = uid and created_at > now() - interval '24 hours';
  if v_day >= 30 then
    return jsonb_build_object('outcome', 'rate_limited');
  end if;

  -- One open enquiry per (proposer, team).
  if exists (
    select 1 from public.team_enquiries
     where owner_id = uid and team_org_id = p_team_org_id
       and status = 'proposed'
  ) then
    return jsonb_build_object('outcome', 'duplicate_open');
  end if;

  insert into public.team_enquiries
      (owner_id, company_organization_id, team_org_id, message,
       start_date, expected_end_date, status)
    values
      (uid, p_company_organization_id, p_team_org_id, v_msg,
       p_start_date, p_expected_end_date, 'proposed')
    returning id into v_new;

  insert into public.team_enquiry_events
      (enquiry_id, actor_id, event_type, from_status, to_status)
    values (v_new, uid, 'proposed', null, 'proposed');

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'propose_team_enquiry_v1', 'team_enquiries', v_new,
    jsonb_build_object('team_org_id', p_team_org_id,
      'company_organization_id', p_company_organization_id));

  return jsonb_build_object('outcome', 'created', 'enquiry_id', v_new);
end;
$$;

revoke all on function public.propose_team_enquiry_v1(uuid, text, date, date, uuid) from public;
grant execute on function public.propose_team_enquiry_v1(uuid, text, date, date, uuid) to authenticated;

-- ── 5. respond_team_enquiry_v1 (team owner/manager accept/decline) ────────
create or replace function public.respond_team_enquiry_v1(
  p_enquiry_id uuid,
  p_decision   text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid          uuid := auth.uid();
  e            public.team_enquiries%rowtype;
  v_team_owner uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_decision not in ('accepted','declined') then
    return 'invalid_decision';
  end if;

  select * into e from public.team_enquiries
   where id = p_enquiry_id for update;
  if not found then return 'not_found'; end if;

  -- The proposer can NEVER respond to their own enquiry — even if they also
  -- manage the team (belt and braces on top of the propose-side own_team
  -- block). Mirrors "the company can never self-accept" from bookings.
  if e.owner_id = uid then return 'not_allowed'; end if;

  select owner_profile_id into v_team_owner
    from public.organizations where id = e.team_org_id;
  if not (v_team_owner = uid or public.manages_organization(e.team_org_id)) then
    return 'not_allowed';
  end if;

  if e.status <> 'proposed' then return 'not_open'; end if;

  update public.team_enquiries
     set status = p_decision, updated_at = now()
   where id = e.id;

  insert into public.team_enquiry_events
      (enquiry_id, actor_id, event_type, from_status, to_status)
    values (e.id, uid, p_decision, 'proposed', p_decision);

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'respond_team_enquiry_v1', 'team_enquiries', e.id,
    jsonb_build_object('decision', p_decision));

  return p_decision;
end;
$$;

revoke all on function public.respond_team_enquiry_v1(uuid, text) from public;
grant execute on function public.respond_team_enquiry_v1(uuid, text) to authenticated;

-- ── 6. withdraw_team_enquiry_v1 (proposer-only, open-only) ────────────────
create or replace function public.withdraw_team_enquiry_v1(
  p_enquiry_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  e   public.team_enquiries%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into e from public.team_enquiries
   where id = p_enquiry_id for update;
  if not found then return 'not_found'; end if;
  if e.owner_id <> uid then return 'not_allowed'; end if;
  if e.status <> 'proposed' then return 'not_open'; end if;

  update public.team_enquiries
     set status = 'withdrawn', updated_at = now()
   where id = e.id;

  insert into public.team_enquiry_events
      (enquiry_id, actor_id, event_type, from_status, to_status)
    values (e.id, uid, 'withdrawn', 'proposed', 'withdrawn');

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'withdraw_team_enquiry_v1', 'team_enquiries', e.id,
    jsonb_build_object('result', 'withdrawn'));

  return 'withdrawn';
end;
$$;

revoke all on function public.withdraw_team_enquiry_v1(uuid) from public;
grant execute on function public.withdraw_team_enquiry_v1(uuid) to authenticated;

-- ── 7. expire_stale_team_enquiries_v1 — admin-only sweep, capped ──────────
-- Gives 'expired' a real writer from day one. Wiring it to any scheduler is
-- a SEPARATE owner decision (nothing here installs a scheduler).
create or replace function public.expire_stale_team_enquiries_v1(
  p_stale_days integer default 30
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n   integer := 0;
  r   record;
begin
  if uid is null or not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  if p_stale_days is null or p_stale_days < 1 or p_stale_days > 365 then
    raise exception 'Invalid staleness window' using errcode = '22023';
  end if;

  for r in
    select id from public.team_enquiries
     where status = 'proposed'
       and created_at < now() - make_interval(days => p_stale_days)
     limit 500
  loop
    update public.team_enquiries
       set status = 'expired', updated_at = now()
     where id = r.id and status = 'proposed';
    if found then
      insert into public.team_enquiry_events
          (enquiry_id, actor_id, event_type, from_status, to_status)
        values (r.id, uid, 'expired', 'proposed', 'expired');
      n := n + 1;
    end if;
  end loop;

  if n > 0 then
    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (uid, 'expire_stale_team_enquiries_v1', 'team_enquiries', null,
      jsonb_build_object('expired_count', n, 'stale_days', p_stale_days));
  end if;

  return n;
end;
$$;

revoke all on function public.expire_stale_team_enquiries_v1(integer) from public;
grant execute on function public.expire_stale_team_enquiries_v1(integer) to authenticated;

-- ── 8. list_my_team_enquiries_v1 — the EMPLOYER read model ────────────────
-- The ONLY employer-visible projection of team_details: a bounded
-- availability snapshot (status/from/accommodation/transport/trip days),
-- and only for teams the caller has a real enquiry with. The manager note is
-- NEVER projected. Display names only — no emails, no phones.
create or replace function public.list_my_team_enquiries_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  uid     uuid := auth.uid();
  v_items jsonb;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(item order by item ->> 'created_at' desc), '[]'::jsonb)
    into v_items
    from (
      select jsonb_build_object(
        'id', e.id,
        'team_org_id', e.team_org_id,
        'team_name', (select coalesce(o.display_name, o.legal_name)
                        from public.organizations o where o.id = e.team_org_id),
        'status', e.status,
        'message', e.message,
        'start_date', e.start_date,
        'expected_end_date', e.expected_end_date,
        'created_at', e.created_at,
        'updated_at', e.updated_at,
        'team_availability', (
          select jsonb_build_object(
            'availability_status', td.availability_status,
            'available_from', td.available_from,
            'accommodation_needed', td.accommodation_needed,
            'transport_own', td.transport_own,
            'max_trip_days', td.max_trip_days
          )
          from public.team_details td
          where td.org_id = e.team_org_id
        )
      ) as item
      from public.team_enquiries e
      where e.owner_id = uid
      order by e.created_at desc
      limit 100
    ) sub;
  return jsonb_build_object('items', v_items);
end;
$$;

revoke all on function public.list_my_team_enquiries_v1() from public;
grant execute on function public.list_my_team_enquiries_v1() to authenticated;

-- ── 9. list_team_enquiries_for_my_teams_v1 — the TEAM-side inbox ──────────
create or replace function public.list_team_enquiries_for_my_teams_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  uid     uuid := auth.uid();
  v_items jsonb;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(item order by item ->> 'created_at' desc), '[]'::jsonb)
    into v_items
    from (
      select jsonb_build_object(
        'id', e.id,
        'team_org_id', e.team_org_id,
        'team_name', coalesce(t.display_name, t.legal_name),
        'status', e.status,
        'message', e.message,
        'start_date', e.start_date,
        'expected_end_date', e.expected_end_date,
        'created_at', e.created_at,
        'proposer_name', (select pr.full_name from public.profiles pr
                           where pr.id = e.owner_id),
        'proposer_company_name', (select coalesce(c.display_name, c.legal_name)
                                    from public.organizations c
                                   where c.id = e.company_organization_id)
      ) as item
      from public.team_enquiries e
      join public.organizations t on t.id = e.team_org_id
      where t.organization_type = 'team'
        and (t.owner_profile_id = uid
             or public.manages_organization(e.team_org_id))
      order by e.created_at desc
      limit 100
    ) sub;
  return jsonb_build_object('items', v_items);
end;
$$;

revoke all on function public.list_team_enquiries_for_my_teams_v1() from public;
grant execute on function public.list_team_enquiries_for_my_teams_v1() to authenticated;

commit;

-- ROLLBACK: supabase/rollbacks/20260716121000_team_enquiries_v1.down.sql
