-- @human-gate-approved
-- Proposed for owner approval; apply only after explicit authorization of these exact bytes.
-- RED / needs-human-gate. Draft for #2946. Explicit owner approval of this exact SQL
-- is required before marking approved, merging for release, or applying.
-- @plan-cache-proof: scripts/db-proof/plan-cache-probe.sql via service-request-proposal-link-v1.plan.sql, auto + force_generic_plan.
-- 10 calls per UUID case, 20000 synthetic proposals on PostgreSQL 16.13.
-- Reference run pg16-plan-reference.log (2026-11-28): worst lookup 1.8 ms, worst full reopen RPC 9.365 ms (local only).
-- A signed-in provider can explicitly create or reopen an offer for their
-- accepted personal service request. The offer belongs to the provider profile.
-- Closed offers remain in history. An explicit retry can create a replacement.
-- Deletion of a request retains its proposal with a NULL source (existing erasure semantics).
-- Rollback refuses to remove a populated link. Apply and rollback are transactional.

begin;

alter table public.proposals
  add column if not exists service_offering_request_id uuid
    references public.service_offering_requests(id) on delete set null;

create index if not exists proposals_service_offering_request_idx
  on public.proposals (service_offering_request_id)
  where service_offering_request_id is not null;

-- One OPEN proposal per request, enforced by the database on every path —
-- including set_proposal_status_v1 (unchanged), which could otherwise reopen a
-- withdrawn/rejected proposal next to its replacement. The column is new, so
-- no existing row is constrained.
create unique index if not exists proposals_one_open_per_service_request
  on public.proposals (service_offering_request_id)
  where service_offering_request_id is not null
    and status in ('draft','sent','accepted');

create or replace function public.create_proposal_from_service_request_v1(
  p_request_id     uuid,
  p_title          text,
  p_amount_cents   bigint default 0,
  p_scope          text default null,
  p_exclusions     text default null,
  p_validity_until date default null
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_status   text;
  v_id       uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_title is null or char_length(trim(p_title)) = 0 then
    raise exception 'title required' using errcode = '22023';
  end if;
  if p_amount_cents is null or p_amount_cents < 0 or p_amount_cents > 100000000000 then
    raise exception 'invalid amount' using errcode = '22023';
  end if;

  select status into v_status
    from public.service_offering_requests
   where id = p_request_id
     and provider_id = v_uid
   for update;
  if not found then
    -- Same answer for "no such request" and "not yours": no existence oracle.
    raise exception 'request not found' using errcode = '42501';
  end if;
  if v_status <> 'accepted' then
    raise exception 'request not accepted' using errcode = '22023';
  end if;

  select id into v_id
    from public.proposals
   where service_offering_request_id = p_request_id
     and owner_id = v_uid
     and status in ('draft','sent','accepted')
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.proposals (owner_id, service_offering_request_id, title, amount_cents,
                                validity_until, scope, exclusions)
  values (v_uid, p_request_id, left(trim(p_title), 200), p_amount_cents, p_validity_until,
          nullif(left(coalesce(p_scope, ''), 2000), ''),
          nullif(left(coalesce(p_exclusions, ''), 2000), ''))
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.create_proposal_from_service_request_v1(uuid, text, bigint, text, text, date)
  from public, anon, service_role;
grant execute on function public.create_proposal_from_service_request_v1(uuid, text, bigint, text, text, date)
  to authenticated;

commit;
