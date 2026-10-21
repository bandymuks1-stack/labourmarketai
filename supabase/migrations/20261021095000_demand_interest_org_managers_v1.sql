-- ============================================================================
-- demand_interest_org_managers_v1 — the demand managers of a need's own
-- organization see and answer the workers who raised a hand on it
-- (owner-approved fix programme 2026-10-21, item "interest: co-managers").
--
-- RED by rule: a policy is dropped and re-created (j), a SECURITY DEFINER
-- function is replaced (g) and grants are restated (h). Draft PR +
-- needs-human-gate; apply only via Supabase MCP apply_migration after the
-- owner approves this exact SQL. Never `db push`.
--
-- DEFECT. A need (customer_requests) belongs to its organization, and its
-- demand managers already act on it everywhere else: they read the need
-- (customer_requests SELECT, R-15), close / reopen it (close_demand_v1),
-- shortlist on it, and receive team offers on it
-- (team_offer_receiver_v1: cr.profile_id = auth.uid() OR
-- has_org_demand_access(cr.organization_id)). Worker interest was the one
-- link of that chain that still admitted only the need's CREATOR:
--   * demand_interest_signals_demand_owner_select (20260704230000) —
--     cr.profile_id = auth.uid();
--   * acknowledge_demand_interest (20260705120000) — v_owner = uid.
-- A colleague who manages the need saw "nobody is interested" and could not
-- mark a worker reviewed / contacted.
--
-- CHANGE (two statements of the SAME rule — the team-offer rule):
--   1. The read policy also admits has_org_demand_access(cr.organization_id).
--   2. acknowledge_demand_interest also admits it. Everything else in the
--      function is unchanged: status whitelist, withdrawn immutability, and
--      only status + updated_at are written. The guard is fail-closed
--      (`if not coalesce((...), false)`); a missing need is refused exactly
--      like a foreign one.
--
-- THIS WIDENS A READ — stated explicitly. After this migration the interest
-- rows of a need are readable by the members of THE NEED'S OWN organization
-- whose ACTIVE membership role is owner / admin / manager / external_manager
-- (has_org_demand_access, 20260806200000). Nobody else gains anything: not a
-- plain `member`, not another organization, not a need with no organization
-- (has_org_demand_access(null) is false). The row carries worker_id, status,
-- the worker's note and the match snapshot — the same columns the creator
-- already reads, and worker_id is rendered anonymised by the scouting view.
--
-- No table, column or data change. No new function.
--
-- ROLLBACK: supabase/rollbacks/20261021095000_demand_interest_org_managers_v1.down.sql
--   (restores the 20260704230000 policy and the 20260705120000 function body
--   verbatim, grants as before).
-- ============================================================================

begin;

-- ── 1. The read: creator OR the need's organization's demand managers ──────
drop policy if exists demand_interest_signals_demand_owner_select
  on public.demand_interest_signals;
create policy demand_interest_signals_demand_owner_select
  on public.demand_interest_signals for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.customer_requests cr
       where cr.id = request_id
         and (cr.profile_id = auth.uid()
              or coalesce(public.has_org_demand_access(cr.organization_id), false))
    )
  );

-- ── 2. The answer: the same two parties ─────────────────────────────────────
create or replace function public.acknowledge_demand_interest(
  p_request_id uuid,
  p_worker_id  uuid,
  p_status     text
)
returns boolean
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  uid     uuid := auth.uid();
  v_owner uuid;
  v_org   uuid;
  v_found boolean := false;
  v_cur   text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('reviewed','contacted') then
    raise exception 'Invalid acknowledgement status' using errcode = '22023';
  end if;

  -- The caller must be the need's creator, or a demand manager of the need's
  -- own organization (the team-offer rule). Fail-closed: NULL never admits.
  select cr.profile_id, cr.organization_id, true
    into v_owner, v_org, v_found
    from public.customer_requests cr
   where cr.id = p_request_id;
  if not coalesce((v_found and (v_owner = uid
                                or public.has_org_demand_access(v_org))), false) then
    raise exception 'Not the demand owner' using errcode = '42501';
  end if;

  select dis.status into v_cur
    from public.demand_interest_signals dis
   where dis.request_id = p_request_id
     and dis.worker_id = p_worker_id;
  if v_cur is null then
    return false; -- no signal → nothing to acknowledge (honest no-op)
  end if;
  if v_cur = 'withdrawn' then
    return false; -- the worker's withdrawal is immutable to the company
  end if;

  update public.demand_interest_signals
     set status = p_status,
         updated_at = now()
   where request_id = p_request_id
     and worker_id = p_worker_id
     and status <> 'withdrawn';
  return true;
end $$;

revoke all on function
  public.acknowledge_demand_interest(uuid, uuid, text) from public;
revoke all on function
  public.acknowledge_demand_interest(uuid, uuid, text) from anon;
grant execute on function
  public.acknowledge_demand_interest(uuid, uuid, text) to authenticated;

commit;

-- ROLLBACK
--   supabase/rollbacks/20261021095000_demand_interest_org_managers_v1.down.sql
