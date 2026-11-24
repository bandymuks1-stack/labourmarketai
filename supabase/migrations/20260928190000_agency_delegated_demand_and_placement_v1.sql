-- ============================================================================
-- 20260928190000 — the agency's DELEGATED part of the commercial chain.
--
-- RED by rule (new SECURITY DEFINER functions, one additive SELECT policy,
-- two additive columns). OWNER-APPROVED 2026-09-28 ("A — AGENCY DRAFTS
-- CLIENT DEMAND", "B — SHARED NEED → CANDIDATE DISCOVERY", "D — AFTER
-- PLACEMENT VISIBILITY: APPROVED WITH THIS EXACT BOUNDARY").
-- Apply only via Supabase MCP apply_migration. Never `db push`.
-- @human-gate-approved
--
-- The relationship stays the existing one: agency_client_connections
-- (active) → agency_client_request_shares → agency_candidate_offers →
-- booking_requests → company_worker_engagements / project assignments.
-- No agency_need model, no second scouting, no copied client data.
--
-- A — AGENCY DRAFTS, CLIENT CONFIRMS.
--   * customer_requests gains provenance: drafted_by (the agency person) and
--     drafted_via_connection_id (the active connection it was drafted under).
--   * draft_client_need_v1: the agency (owns_company + company_acts_as_agency)
--     writes an ordinary customer_requests row INTO THE CLIENT'S organization
--     with status 'draft', owned by the client person who accepted the
--     connection. A draft is not a confirmed requirement: it is not shared,
--     not scoutable by the agency, not in the client's open demand.
--   * confirm_agency_drafted_need_v1: ONLY a client governing member
--     (owns_company of the client company) turns it into their own submitted
--     requirement (profile_id := the confirming person) AND shares it on the
--     same connection — the existing share row, the existing chain.
--   * list_agency_drafted_needs_v1: the agency sees the drafts IT made and
--     whether the client confirmed them. Nothing else of the client.
--
-- B — A SHARED NEED IS READABLE BY THAT AGENCY, WHILE SHARED.
--   * agency_can_read_shared_request(request_id): an ACTIVE share on an
--     ACTIVE connection whose agency company the caller governs
--     (owns_company). SECURITY DEFINER so the policy below does not recurse
--     through the share/connection policies.
--   * customer_requests_select_agency_share: one additive SELECT policy
--     using it. Revoking the share or the connection ends the access.
--     No other client row becomes readable; worker data is untouched.
--
-- D — THE AGENCY KEEPS SIGHT OF ITS OWN PLACEMENTS, BOUNDED.
--   * list_agency_placements_v1: for the caller's agency's ACCEPTED offers
--     only — offer / client decision / booking status and dates / the
--     worker's decision time / engagement status / whether and when the
--     worker was assigned and ended. No project id or title, no journal, no
--     hours, no other workers.
--
-- ROLLBACK: supabase/rollbacks/20260928190000_agency_delegated_demand_and_placement_v1.down.sql
-- ============================================================================

alter table public.customer_requests
  add column if not exists drafted_by uuid references public.profiles(id) on delete set null,
  add column if not exists drafted_via_connection_id uuid references public.agency_client_connections(id) on delete set null;

comment on column public.customer_requests.drafted_by is
  'Provenance: the agency person who DRAFTED this need for the client (draft_client_need_v1). Null for a need the client wrote.';
comment on column public.customer_requests.drafted_via_connection_id is
  'Provenance: the agency↔client connection the draft was prepared under. The client confirms through confirm_agency_drafted_need_v1.';

-- ── A ──────────────────────────────────────────────────────────────────────

create or replace function public.draft_client_need_v1(
  p_connection_id uuid,
  p_title text,
  p_role text,
  p_country text,
  p_location text,
  p_summary text,
  p_team_size integer
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid     uuid := auth.uid();
  v_conn    public.agency_client_connections%rowtype;
  v_org     uuid;
  v_title   text := nullif(btrim(coalesce(p_title, '')), '');
  v_id      uuid;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select * into v_conn from public.agency_client_connections where id = p_connection_id;
  if v_conn.id is null or v_conn.status <> 'active' or v_conn.client_company_id is null then
    raise exception 'connection_not_active' using errcode = '42501';
  end if;
  if not public.owns_company(v_conn.agency_company_id) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  if not public.company_acts_as_agency(v_conn.agency_company_id) then
    raise exception 'not_agency' using errcode = '42501';
  end if;
  if v_title is null or char_length(v_title) > 200 then
    raise exception 'invalid_title' using errcode = '22023';
  end if;
  if p_team_size is not null and p_team_size < 1 then
    raise exception 'invalid_team_size' using errcode = '22023';
  end if;
  select o.id into v_org from public.organizations o
   where o.legacy_company_id = v_conn.client_company_id
   order by o.created_at limit 1;
  if v_org is null or v_conn.accepted_by is null then
    raise exception 'client_not_resolved' using errcode = 'P0002';
  end if;

  insert into public.customer_requests
      (profile_id, organization_id, title, role_or_work_type, country, location,
       need_summary, team_size, status, kind, drafted_by, drafted_via_connection_id)
    values (v_conn.accepted_by, v_org, v_title,
            nullif(btrim(coalesce(p_role, '')), ''),
            nullif(btrim(coalesce(p_country, '')), ''),
            nullif(btrim(coalesce(p_location, '')), ''),
            nullif(btrim(coalesce(p_summary, '')), ''),
            p_team_size, 'draft', 'company_request', v_uid, v_conn.id)
  returning id into v_id;
  return v_id;
end;
$function$;

revoke all on function public.draft_client_need_v1(uuid, text, text, text, text, text, integer) from public, anon;
grant execute on function public.draft_client_need_v1(uuid, text, text, text, text, text, integer) to authenticated;

create or replace function public.confirm_agency_drafted_need_v1(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_req   public.customer_requests%rowtype;
  v_conn  public.agency_client_connections%rowtype;
  v_share uuid;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select * into v_req from public.customer_requests where id = p_request_id for update;
  if v_req.id is null or v_req.drafted_via_connection_id is null then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  select * into v_conn from public.agency_client_connections where id = v_req.drafted_via_connection_id;
  if v_conn.id is null or v_conn.status <> 'active' then
    raise exception 'connection_not_active' using errcode = '42501';
  end if;
  -- The CLIENT decides — a governing member of the client company.
  if not public.owns_company(v_conn.client_company_id) then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  if v_req.status = 'draft' then
    update public.customer_requests
       set status = 'submitted', profile_id = v_uid, updated_at = now()
     where id = v_req.id;
  end if;

  select id into v_share from public.agency_client_request_shares
   where connection_id = v_conn.id and request_id = v_req.id and status = 'active';
  if v_share is null then
    insert into public.agency_client_request_shares (connection_id, request_id, shared_by)
    values (v_conn.id, v_req.id, v_uid)
    returning id into v_share;
  end if;
  return v_share;
end;
$function$;

revoke all on function public.confirm_agency_drafted_need_v1(uuid) from public, anon;
grant execute on function public.confirm_agency_drafted_need_v1(uuid) to authenticated;

create or replace function public.list_agency_drafted_needs_v1()
returns table(request_id uuid, connection_id uuid, title text, role_or_work_type text, status text, shared boolean, created_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select r.id, r.drafted_via_connection_id, r.title, r.role_or_work_type,
         r.status,
         exists (select 1 from public.agency_client_request_shares s
                  where s.request_id = r.id and s.connection_id = r.drafted_via_connection_id
                    and s.status = 'active'),
         r.created_at
    from public.customer_requests r
    join public.agency_client_connections c on c.id = r.drafted_via_connection_id
   where public.owns_company(c.agency_company_id)
   order by r.created_at desc
   limit 100;
$function$;

revoke all on function public.list_agency_drafted_needs_v1() from public, anon;
grant execute on function public.list_agency_drafted_needs_v1() to authenticated;

-- ── B ──────────────────────────────────────────────────────────────────────

create or replace function public.agency_can_read_shared_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
      from public.agency_client_request_shares s
      join public.agency_client_connections c on c.id = s.connection_id
     where s.request_id = p_request_id
       and s.status = 'active'
       and c.status = 'active'
       and public.owns_company(c.agency_company_id));
$function$;

revoke all on function public.agency_can_read_shared_request(uuid) from public, anon;
grant execute on function public.agency_can_read_shared_request(uuid) to authenticated;

drop policy if exists customer_requests_select_agency_share on public.customer_requests;
create policy customer_requests_select_agency_share on public.customer_requests
  for select to authenticated
  using (public.agency_can_read_shared_request(id));

-- ── D ──────────────────────────────────────────────────────────────────────

create or replace function public.list_agency_placements_v1()
returns table(
  offer_id uuid,
  request_id uuid,
  worker_id uuid,
  offered_at timestamptz,
  client_decided_at timestamptz,
  booking_status text,
  start_date date,
  expected_end_date date,
  worker_decided_at timestamptz,
  engagement_status text,
  engagement_started_at timestamptz,
  engagement_ended_at timestamptz,
  assignment_status text,
  assigned_at timestamptz,
  assignment_ended_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select o.id, o.request_id, o.worker_id, o.created_at, o.decided_at,
         b.status, b.start_date, b.expected_end_date,
         (select max(e.created_at) from public.booking_request_events e
           where e.booking_request_id = b.id and e.event_type in ('accepted', 'declined')),
         g.status, g.started_at, g.ended_at,
         a.status, a.assigned_at, a.ended_at
    from public.agency_candidate_offers o
    left join public.booking_requests b on b.id = o.booking_id
    left join lateral (
      select ce.status, ce.started_at, ce.ended_at
        from public.company_worker_engagements ce
       where ce.source_booking_id = b.id
       order by ce.created_at desc limit 1) g on true
    left join lateral (
      select pa.status, pa.assigned_at, pa.ended_at
        from public.project_worker_assignments pa
        join public.projects p on p.id = pa.project_id
        left join public.organizations org on org.id = p.organization_id
       where pa.worker_id = o.worker_id
         and (org.legacy_company_id = o.client_company_id
              or (p.organization_id is null and p.company_id = o.client_company_id))
         and pa.assigned_at >= coalesce(o.decided_at, o.created_at)
       order by pa.assigned_at desc limit 1) a on true
   where public.owns_company(o.agency_company_id)
     and o.status = 'accepted'
   order by o.decided_at desc nulls last
   limit 100;
$function$;

revoke all on function public.list_agency_placements_v1() from public, anon;
grant execute on function public.list_agency_placements_v1() to authenticated;
