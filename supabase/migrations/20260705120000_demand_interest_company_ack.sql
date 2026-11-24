-- ============================================================================
-- 20260705120000 — acknowledge_demand_interest: company-side acknowledgement
-- of worker interest signals (PR7, Company Interest Acknowledgement).
-- ADDITIVE — one gated RPC; NO table change, NO existing RLS change.
--
-- WHY: demand_interest_signals (20260704230000, APPLIED) gives the demand
-- owner READ-only visibility by design — the worker owns every write. A
-- company acknowledging a signal ("reviewed" / "contacted") is a company
-- decision on its OWN demand, so it goes through one narrow SECURITY DEFINER
-- function instead of a broad UPDATE policy (an RLS UPDATE policy cannot
-- restrict WHICH columns change; this RPC can — it touches status +
-- updated_at and nothing else).
--
-- RULES ENFORCED IN THE FUNCTION (not trusted to the client):
--   - caller must be authenticated AND own the demand
--     (customer_requests.profile_id = auth.uid());
--   - target status ∈ ('reviewed','contacted') — the company can NEVER set
--     'interested' (that is the worker's own act) or 'withdrawn';
--   - a WITHDRAWN signal is immutable to the company (the worker's
--     withdrawal always wins);
--   - only status + updated_at are written; note / match_snapshot /
--     ownership columns are untouchable through this path.
--
-- 'shortlisted' is deliberately NOT a status here — company shortlisting
-- already exists as demand_shortlist (no duplicate concept, §2).
--
-- NO external side effects: this updates one row. Nothing is sent anywhere.
--
-- @human-gate-approved — TIER: owner-gated. SECURITY DEFINER + GRANT are
-- RED-class by the migration-safety rules, so this PR ships as a
-- needs-human-gate DRAFT with the exact SQL; prod apply stays manual via
-- Supabase MCP after DI approval — never db push. Execute is revoked from
-- public/anon and granted to authenticated only; search_path is pinned.
-- ============================================================================

begin;

create or replace function public.acknowledge_demand_interest(
  p_request_id uuid,
  p_worker_id  uuid,
  p_status     text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  v_owner uuid;
  v_cur   text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_status not in ('reviewed','contacted') then
    raise exception 'Invalid acknowledgement status' using errcode = '22023';
  end if;

  -- The caller must OWN the demand.
  select cr.profile_id into v_owner
    from public.customer_requests cr
   where cr.id = p_request_id;
  if v_owner is null or v_owner <> uid then
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

-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK (manual — see
-- supabase/rollbacks/20260705120000_demand_interest_company_ack.down.sql).
-- Drops the function only; no data is touched by the rollback.
-- ─────────────────────────────────────────────────────────────────────────
