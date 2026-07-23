-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260723053000 — contact_demand_owner_v1 (worker → employer contact,
-- REQUIRES_OWNER_DECISION).
--
-- PROBLEM (found by the 2026-07-23 worker-application E2E walk, the first
-- functional break after PR #852): "Parašyti darbdaviui" fails in production
-- with a generic error for EVERY worker. contactEmployerAction resolved the
-- demand owner through the service-role client, but production deliberately
-- allowlists service_role table grants (billing / esco / lmc / intel only) —
-- service_role has NO grant on customer_requests or companies, so the owner
-- read dies with 42501 and the worker journey dead-ends after "express
-- interest". The flow has never worked under this grants posture.
--
-- SOLUTION (smallest honest slice, same pattern as the existing gated
-- acknowledge_demand_interest RPC): ONE SECURITY DEFINER read RPC that
-- encodes exactly the server-side owner resolution the action needs:
--   - caller must be authenticated and have their OWN worker row;
--   - the demand-open and company-verified facts are returned as booleans
--     so the app keeps its pure evaluateWorkerContactRequest decision
--     (honest no_interest / demand_closed / company_unverified reasons);
--   - owner_profile_id and demand_title are revealed ONLY when EVERY gate
--     holds (own active signal + demand submitted + company verified +
--     owner is not the caller) — a worker can never use this to probe the
--     owner of a demand they have no standing relationship with;
--   - the id goes straight into the server-side participant insert and is
--     never returned to the browser (pinned by
--     lib/guards/worker-contact-employer.test.ts).
--
-- ABUSE BOUNDS: STABLE, single-row, own-signal-scoped; EXECUTE granted to
-- authenticated only; no table grants change; no service_role widening.
-- COMPATIBILITY / BACKFILL: none — new function only. Until applied, the
-- app feature-detects 42883/PGRST202 and returns the honest
-- "needs_migration" reason (no dead redirect, no fake state).
-- ROLLBACK: paired supabase/rollbacks/20260723053000_contact_demand_owner_v1.down.sql.
--
-- POST-APPLY VERIFICATION:
--   As a worker WITH an active interest signal on an open verified demand:
--     select * from contact_demand_owner_v1('<request uuid>');
--       -- 1 row, owner_profile_id NOT null, demand_open=true, company_verified=true
--   As the same worker after withdrawing the signal:
--     select * from contact_demand_owner_v1('<request uuid>');
--       -- 1 row, owner_profile_id NULL (flags still honest)
--   As a worker with NO signal on that demand: owner_profile_id NULL.
--   As anon: ERROR 42501.
--   + APPLIED_LEDGER.md row.
-- ============================================================================

begin;

create or replace function public.contact_demand_owner_v1(
  p_request_id uuid
) returns table(
  owner_profile_id uuid,
  demand_title     text,
  has_own_signal   boolean,
  demand_open      boolean,
  company_verified boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_worker uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select w.id into v_worker from public.workers w where w.profile_id = uid;
  if v_worker is null then
    return; -- not a worker → no row, never an error surface
  end if;

  return query
  select
    -- The owner id (and title) are revealed to the SERVER ACTION only when
    -- every gate holds; otherwise NULL while the flags stay honest.
    case
      when s.ok and cr.status = 'submitted'
           and c.verification_status = 'verified'
           and cr.profile_id <> uid
        then cr.profile_id
      else null
    end as owner_profile_id,
    case
      when s.ok and cr.status = 'submitted'
           and c.verification_status = 'verified'
           and cr.profile_id <> uid
        then left(coalesce(cr.title, ''), 120)
      else null
    end as demand_title,
    s.ok as has_own_signal,
    (cr.status = 'submitted') as demand_open,
    (c.verification_status = 'verified') as company_verified
  from public.customer_requests cr
  left join public.companies c on c.profile_id = cr.profile_id
  cross join lateral (
    select exists (
      select 1
        from public.demand_interest_signals dis
       where dis.request_id = cr.id
         and dis.worker_id = v_worker
         and dis.status <> 'withdrawn'
    ) as ok
  ) s
  where cr.id = p_request_id;
end $$;

revoke all on function public.contact_demand_owner_v1(uuid) from public;
grant execute on function public.contact_demand_owner_v1(uuid) to authenticated;

commit;

-- DOWN (paired rollback file — supabase/rollbacks/
-- 20260723053000_contact_demand_owner_v1.down.sql):
--   drop function if exists public.contact_demand_owner_v1(uuid);
