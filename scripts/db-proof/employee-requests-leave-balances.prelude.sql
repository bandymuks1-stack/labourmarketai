-- ============================================================================
-- EMPLOYEE REQUESTS + LEAVE BALANCE POLICIES — PROOF HARNESS PRELUDE (extra).
--
-- Loaded AFTER scripts/db-proof/workflow-engine-v1.prelude.sql (+ its seed),
-- which already builds auth.uid()/is_admin() GUC stubs, profiles,
-- organizations, company_memberships, engagement_contexts,
-- membership_actor_role_v1 and belongs_to_organization — this file adds ONLY
-- what 20260817180000/20260817181000 additionally assert or read:
--
--   * public.has_org_demand_access — copied VERBATIM from
--     20260806200000_org_demand_spine_v2.sql (the register RLS predicate);
--   * a minimal public.worker_absences — the balances migration asserts the
--     canonical leave table exists (it never modifies it; the derived
--     balance arithmetic is TS-side and proven by vitest, not here).
--
-- Throwaway only. Never point this at production or a shared local stack.
-- ============================================================================

create or replace function public.has_org_demand_access(org uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select org is not null and exists (
    select 1 from public.company_memberships m
     where m.profile_id = auth.uid()
       and m.organization_id = org
       and m.status = 'active'
       and m.role in ('owner','admin','manager','external_manager')
  )
$$;
revoke all on function public.has_org_demand_access(uuid) from public;
revoke all on function public.has_org_demand_access(uuid) from anon;
grant execute on function public.has_org_demand_access(uuid) to authenticated;

-- Minimal canonical-leave shape (existence assertion target only).
create table if not exists public.worker_absences (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null,
  absence_type text not null,
  start_date date not null,
  end_date date not null,
  half_day boolean not null default false,
  status text not null default 'requested'
);
