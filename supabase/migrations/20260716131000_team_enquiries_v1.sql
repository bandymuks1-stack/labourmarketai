-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY without explicit owner OK.
-- DO NOT APPLY automatically. Apply ONLY via Supabase MCP apply_migration
-- after explicit owner approval. Never `db push`.
-- APPLY ORDER: 20260716130000_team_profile_details_v1.sql FIRST — the
-- employer read model below projects the availability snapshot from
-- team_details at call time.
-- INDEPENDENCE: applies cleanly against current main alone — FKs reference
-- ONLY the applied organizations + profiles tables; no wagon-1/4/5 tables.
--
-- 20260716131000 — team enquiries v1 (Trust Connect Teams wagon, gap 3;
-- SHARED CONTACT/CONSENT CONTRACT per the integration addendum — the same
-- policy shape as the worker-side contact requests, never a second
-- incompatible system).
--
-- PROBLEM: an employer who finds a team/brigade (organizations row,
-- organization_type='team') has NO structured, auditable way to ask "is this
-- team available for our site" — the only options are nothing or an
-- off-platform channel that leaks contacts and leaves no trail.
--
-- SOLUTION: the audited request state machine at team granularity:
--   * STATUS vocabulary (shared contract): created → accepted | declined |
--     withdrawn | expired. 'delivered' and 'viewed' are NOT statuses — they
--     are append-only team_enquiry_events rows, so the full 7-step lifecycle
--     (created, delivered, viewed, accepted, declined, withdrawn, expired)
--     is auditable. NOTE: 'delivered' currently has NO writer — no delivery
--     channel exists for enquiries; the vocabulary reserves it honestly.
--     'viewed' is written (once) when the team-side inbox read model first
--     returns the enquiry to an authorised team manager.
--   * IDEMPOTENCY: one open enquiry per (requester, team) enforced by a
--     partial unique index WHERE status='created'; a duplicate create
--     RETURNS THE EXISTING enquiry id — never a second row.
--   * EXPIRY: expires_at = created_at + 14 days; reads treat a past-expiry
--     'created' row honestly as expired; respond/withdraw finalise it as
--     'expired' on touch; an admin-only sweep RPC (capped, NO scheduler —
--     wiring one is a separate owner decision) writes the terminal state.
--   * The requester can NEVER accept their own enquiry (respond is
--     team-owner/manager-only and additionally refuses the requesting
--     profile) — no self-acceptance.
--
-- Honesty / privacy invariants (PII boundary):
--   * Enquiry rows carry NO contact fields; the message is bounded at 500
--     chars and the create RPC REJECTS messages containing an email address
--     or a phone-like digit run — enquiries are platform messages only.
--   * Accepting an enquiry NEVER discloses any member's contact details —
--     contact disclosure stays the separate per-member auditable grant flow
--     (worker-side); there is NO team-level blanket disclosure here.
--   * Abuse bounds: per requester 10 open enquiries + 30 created / 24h.
--   * RLS default-closed: an enquiry is visible ONLY to the requesting
--     profile, the team owner, organization managers and admins. Writes are
--     RPC-only; the events table is append-only (no update/delete path).
--   * Every state change appends an audit_logs row; events carry
--     actor_profile_id / event_type / from_status / to_status / created_at.
--   * Grants: authenticated only — never anon.
--
-- ROLLBACK: supabase/rollbacks/20260716131000_team_enquiries_v1.down.sql
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
  message                 text not null check (char_length(message) between 1 and 500),
  start_date              date,
  expected_end_date       date,
  status                  text not null default 'created'
                            check (status in
                              ('created','accepted','declined','withdrawn','expired')),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  expires_at              timestamptz not null default now() + interval '14 days',
  check (expected_end_date is null or start_date is null
         or expected_end_date >= start_date)
);

create index if not exists team_enquiries_owner_idx
  on public.team_enquiries (owner_id, created_at desc);
create index if not exists team_enquiries_team_idx
  on public.team_enquiries (team_org_id, status);
-- Idempotency (shared contract): one OPEN enquiry per (requester, team) —
-- re-enquiry after a terminal state is allowed, a second open one is not.
create unique index if not exists team_enquiries_one_open_idx
  on public.team_enquiries (owner_id, team_org_id)
  where status = 'created';

-- ── 2. Append-only event log (full 7-step lifecycle audit) ────────────────
create table if not exists public.team_enquiry_events (
  id               uuid primary key default gen_random_uuid(),
  enquiry_id       uuid not null references public.team_enquiries(id) on delete cascade,
  actor_profile_id uuid not null references public.profiles(id),
  event_type       text not null check (event_type in
                     ('created','delivered','viewed','accepted','declined',
                      'withdrawn','expired')),
  from_status      text,
  to_status        text not null,
  created_at       timestamptz not null default now()
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

-- ── 4. propose_team_enquiry_v1 (employer → team; idempotent create) ───────
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
  v_existing   uuid;
  v_new        uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if char_length(v_msg) < 1 then
    return jsonb_build_object('outcome', 'message_required');
  end if;
  if char_length(v_msg) > 500 then
    return jsonb_build_object('outcome', 'message_too_long');
  end if;
  -- PII boundary — platform messages only: refuse embedded contact
  -- channels — an email address, or any single token carrying 9+ digits
  -- (phone-like; dates such as 2026-08-01 carry only 8 digits and pass).
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

  -- Optional requesting-company context must really be the caller's org.
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

  -- IDEMPOTENCY (shared contract): a duplicate create returns the EXISTING
  -- open enquiry — never a second row.
  select id into v_existing from public.team_enquiries
   where owner_id = uid and team_org_id = p_team_org_id
     and status = 'created' and expires_at > now()
   limit 1;
  if v_existing is not null then
    return jsonb_build_object('outcome', 'existing_open', 'enquiry_id', v_existing);
  end if;

  -- Abuse caps (per requester): 10 open, 30 created in the last 24h.
  select count(*) into v_open from public.team_enquiries
   where owner_id = uid and status = 'created' and expires_at > now();
  if v_open >= 10 then
    return jsonb_build_object('outcome', 'limit_reached');
  end if;
  select count(*) into v_day from public.team_enquiries
   where owner_id = uid and created_at > now() - interval '24 hours';
  if v_day >= 30 then
    return jsonb_build_object('outcome', 'rate_limited');
  end if;

  insert into public.team_enquiries
      (owner_id, company_organization_id, team_org_id, message,
       start_date, expected_end_date, status)
    values
      (uid, p_company_organization_id, p_team_org_id, v_msg,
       p_start_date, p_expected_end_date, 'created')
    returning id into v_new;

  insert into public.team_enquiry_events
      (enquiry_id, actor_profile_id, event_type, from_status, to_status)
    values (v_new, uid, 'created', null, 'created');

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

  -- The requester can NEVER respond to their own enquiry — even if they
  -- also manage the team (belt and braces on top of the create-side
  -- own_team block). No self-acceptance, ever.
  if e.owner_id = uid then return 'not_allowed'; end if;

  select owner_profile_id into v_team_owner
    from public.organizations where id = e.team_org_id;
  if not (v_team_owner = uid or public.manages_organization(e.team_org_id)) then
    return 'not_allowed';
  end if;

  if e.status <> 'created' then return 'not_open'; end if;

  -- Past-expiry rows finalise honestly as expired on touch.
  if e.expires_at <= now() then
    update public.team_enquiries
       set status = 'expired', updated_at = now()
     where id = e.id;
    insert into public.team_enquiry_events
        (enquiry_id, actor_profile_id, event_type, from_status, to_status)
      values (e.id, uid, 'expired', 'created', 'expired');
    return 'not_open';
  end if;

  update public.team_enquiries
     set status = p_decision, updated_at = now()
   where id = e.id;

  insert into public.team_enquiry_events
      (enquiry_id, actor_profile_id, event_type, from_status, to_status)
    values (e.id, uid, p_decision, 'created', p_decision);

  -- PII boundary: acceptance changes ONLY the enquiry state. It discloses
  -- no member contact details — disclosure stays the separate per-member
  -- auditable grant flow.
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'respond_team_enquiry_v1', 'team_enquiries', e.id,
    jsonb_build_object('decision', p_decision));

  return p_decision;
end;
$$;

revoke all on function public.respond_team_enquiry_v1(uuid, text) from public;
grant execute on function public.respond_team_enquiry_v1(uuid, text) to authenticated;

-- ── 6. withdraw_team_enquiry_v1 (requester-only, open-only) ───────────────
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
  if e.status <> 'created' then return 'not_open'; end if;

  if e.expires_at <= now() then
    update public.team_enquiries
       set status = 'expired', updated_at = now()
     where id = e.id;
    insert into public.team_enquiry_events
        (enquiry_id, actor_profile_id, event_type, from_status, to_status)
      values (e.id, uid, 'expired', 'created', 'expired');
    return 'not_open';
  end if;

  update public.team_enquiries
     set status = 'withdrawn', updated_at = now()
   where id = e.id;

  insert into public.team_enquiry_events
      (enquiry_id, actor_profile_id, event_type, from_status, to_status)
    values (e.id, uid, 'withdrawn', 'created', 'withdrawn');

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'withdraw_team_enquiry_v1', 'team_enquiries', e.id,
    jsonb_build_object('result', 'withdrawn'));

  return 'withdrawn';
end;
$$;

revoke all on function public.withdraw_team_enquiry_v1(uuid) from public;
grant execute on function public.withdraw_team_enquiry_v1(uuid) to authenticated;

-- ── 7. expire_stale_team_enquiries_v1 — admin-only sweep, capped ──────────
-- Writes the terminal 'expired' state for past-expiry open rows. Wiring it
-- to any scheduler is a SEPARATE owner decision (nothing here installs one).
create or replace function public.expire_stale_team_enquiries_v1()
returns integer
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

  for r in
    select id from public.team_enquiries
     where status = 'created' and expires_at <= now()
     limit 500
  loop
    update public.team_enquiries
       set status = 'expired', updated_at = now()
     where id = r.id and status = 'created';
    if found then
      insert into public.team_enquiry_events
          (enquiry_id, actor_profile_id, event_type, from_status, to_status)
        values (r.id, uid, 'expired', 'created', 'expired');
      n := n + 1;
    end if;
  end loop;

  if n > 0 then
    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (uid, 'expire_stale_team_enquiries_v1', 'team_enquiries', null,
      jsonb_build_object('expired_count', n));
  end if;

  return n;
end;
$$;

revoke all on function public.expire_stale_team_enquiries_v1() from public;
grant execute on function public.expire_stale_team_enquiries_v1() to authenticated;

-- ── 8. list_my_team_enquiries_v1 — the EMPLOYER read model ────────────────
-- The ONLY employer-visible projection of team_details: a bounded
-- availability snapshot (status/from/accommodation/transport/trip days),
-- and only for teams the caller has a real enquiry with. The manager note
-- is NEVER projected. Display names only — no contact channels. Past-expiry
-- open rows read honestly as expired.
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
        'status', case when e.status = 'created' and e.expires_at <= now()
                       then 'expired' else e.status end,
        'message', e.message,
        'start_date', e.start_date,
        'expected_end_date', e.expected_end_date,
        'created_at', e.created_at,
        'updated_at', e.updated_at,
        'expires_at', e.expires_at,
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
-- VOLATILE on purpose: the first authorised team-side read of an open
-- enquiry appends its one-time 'viewed' lifecycle event (append-only,
-- deduplicated) — the 7-step audit trail records that the team actually saw
-- the request. Display names only — no contact channels.
create or replace function public.list_team_enquiries_for_my_teams_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  v_items jsonb;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- One-time 'viewed' event per enquiry now visible to this team manager.
  insert into public.team_enquiry_events
      (enquiry_id, actor_profile_id, event_type, from_status, to_status)
  select e.id, uid, 'viewed', e.status, e.status
    from public.team_enquiries e
    join public.organizations t on t.id = e.team_org_id
   where t.organization_type = 'team'
     and (t.owner_profile_id = uid
          or public.manages_organization(e.team_org_id))
     and e.status = 'created'
     and not exists (select 1 from public.team_enquiry_events ev
                      where ev.enquiry_id = e.id and ev.event_type = 'viewed');

  select coalesce(jsonb_agg(item order by item ->> 'created_at' desc), '[]'::jsonb)
    into v_items
    from (
      select jsonb_build_object(
        'id', e.id,
        'team_org_id', e.team_org_id,
        'team_name', coalesce(t.display_name, t.legal_name),
        'status', case when e.status = 'created' and e.expires_at <= now()
                       then 'expired' else e.status end,
        'message', e.message,
        'start_date', e.start_date,
        'expected_end_date', e.expected_end_date,
        'created_at', e.created_at,
        'expires_at', e.expires_at,
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

-- ROLLBACK: supabase/rollbacks/20260716131000_team_enquiries_v1.down.sql
