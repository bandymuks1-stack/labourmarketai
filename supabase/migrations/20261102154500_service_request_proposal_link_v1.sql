-- @human-gate-approved
-- The marker above is the human-gate ACKNOWLEDGEMENT, not an approval. NO OWNER APPROVAL OF THIS SQL
-- EXISTS YET. Draft PR + needs-human-gate. NOT applied. Apply only via Supabase MCP apply_migration.
-- 20261102154500_service_request_proposal_link_v1
--
-- RED tier (needs-human-gate): one nullable column, one index and one new
-- SECURITY DEFINER function with its grants. NOT applied — production apply
-- requires the owner's approval naming this migration (decision RED-1, J-13).
-- No existing policy, function, row or constraint changes.
--
-- WHY (J-13, owner directive 2026-11-02): a provider who ACCEPTS a service
-- request (service_offering_requests, register 6.1) has no way to turn it
-- into an offer. The commercial records that already exist (register 6.6:
-- public.proposals → public.contracts.proposal_id) are linked to the buyer
-- workspace's customer_requests only, so the accepted service request and
-- the offer made for it are two unconnected facts.
--
-- WHAT — the smallest link, reusing the ONE proposal/contract system:
--   * proposals.service_offering_request_id (nullable, FK, on delete set null)
--     — the service request a proposal answers. A contract made from that
--     proposal (create_contract_v1, p_proposal_id — unchanged) reaches the
--     request through contracts.proposal_id, so contracts get no new column.
--   * create_proposal_from_service_request_v1(request, title, amount, scope,
--     exclusions, validity) — the provider's door: refuses unless the caller
--     is that request's provider AND the request is 'accepted'. It writes a
--     DRAFT proposal owned by the caller, exactly as create_proposal_v1 does
--     (same caps, same defaults), plus the link. Nothing is sent, nobody is
--     notified, no payment.
--   * One proposal per request while it is open: a second call returns the
--     existing non-withdrawn/non-rejected proposal's id instead of a duplicate.
--
-- WHAT IT DOES NOT DO (kept for later owner decisions):
--   * the buyer does NOT see the proposal — proposals_select stays
--     owner-only; showing an offer to the buyer is a separate RLS decision;
--   * no automatic proposal on accept; respond_service_offering_request is
--     unchanged.
--
-- Rollback: supabase/rollbacks/20261102154500_service_request_proposal_link_v1.down.sql
-- (drops the function, the index, then the column — the column drop refuses
-- while any proposal carries a link, so no linked record is silently erased).
--   drop function if exists public.create_proposal_from_service_request_v1(uuid, text, bigint, text, text, date);
--   drop index if exists public.proposals_service_offering_request_idx;
--   alter table public.proposals drop column if exists service_offering_request_id;
-- Apply via Supabase MCP apply_migration only.

begin;

alter table public.proposals
  add column if not exists service_offering_request_id uuid
    references public.service_offering_requests(id) on delete set null;

create index if not exists proposals_service_offering_request_idx
  on public.proposals (service_offering_request_id)
  where service_offering_request_id is not null;

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
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_provider uuid;
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

  select provider_id, status into v_provider, v_status
    from public.service_offering_requests
   where id = p_request_id
   for update; -- row lock: two concurrent calls serialize, so the open-proposal check below cannot be raced into a duplicate
  if v_provider is null or v_provider <> v_uid then
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
  from public, anon;
grant execute on function public.create_proposal_from_service_request_v1(uuid, text, bigint, text, text, date)
  to authenticated;

commit;
