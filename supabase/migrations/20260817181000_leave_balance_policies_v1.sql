-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after the lead session's
-- verification. Never `db push`. No ordering dependency on the workflow
-- engine — this module touches ONLY leave-policy configuration.
-- Rollback: supabase/rollbacks/20260817181000_leave_balance_policies_v1.down.sql
--
-- @human-gate-approved — TIER: owner-gated (SECURITY DEFINER function +
-- GRANTs + a new RLS-bearing table are RED-class). Annotation pre-approved by
-- owner mandate 2026-08-17 (autonomous functional completion train V2, §4
-- migration authority). SAFETY CLASS: RED — 1 new table, 1 new SECURITY
-- DEFINER function, EXECUTE grants. ZERO existing table, policy, grant,
-- trigger or function is modified or recreated. ZERO DML at apply time —
-- deliberately NO seeded rows (see below). Prod apply stays manual by the
-- LEAD session via Supabase MCP.
--
-- 20260817181000 — configurable leave balance policies, v1.
--
-- PROBLEM: leave/absence is FULL (request→approve/reject→cancel on
-- worker_absences) but there are NO balances anywhere (full-reality audit
-- 2026-08-17: "leave/absence FULL (no balances); balances/accrual ABSENT").
-- A manager approving leave cannot see how much leave the person has.
--
-- SOLUTION (smallest honest slice):
--   * ONE configuration table `leave_balance_policies` — per organization,
--     per absence_type (the EXISTING worker_absences vocabulary), an
--     org-configured annual entitlement + flat carryover, calendar-year
--     period basis;
--   * NO stored balances anywhere: the balance is a DERIVED read-model —
--     entitlement + carryover − approved absence days (half-day aware) in
--     the period — computed at read time in the app layer from rows the
--     caller can already read under existing RLS;
--   * balance checks on absence requests are ADVISORY ONLY in the UI —
--     never a hard block, managers decide. This module contains NO approval
--     logic and touches NO absence flow.
--
-- NO STATUTORY HARDCODING, STATED EXPLICITLY: this migration seeds ZERO
-- rows and knows ZERO country defaults. An organization configures its own
-- numbers; UI copy must never claim legal compliance and this schema gives
-- it nothing to claim one with (no country column, no law reference).
--
-- WHAT IS DELIBERATELY NOT ADDED (binding):
--   - NO accrual engine, NO monthly proration, NO balance ledger table;
--   - NO change to worker_absences or any absence RPC/policy (the canonical
--     leave flow stays untouched);
--   - NO country defaults, NO seeded rows, NO legal simulation;
--   - NO per-worker overrides (v1 is org×type; a v2 may add them).
--
-- RLS DECISION, STATED EXPLICITLY:
--   anon:           NOTHING. No grant, no policy.
--   authenticated:  SELECT only, fail-closed — active members of the
--     organization over BOTH membership truths
--     (public.belongs_to_organization) or platform admin. A worker must be
--     able to READ the policy that their own balance is derived from; a
--     policy holds org-level configuration, not personal data.
--   Writes: NO insert/update/delete policy and an explicit REVOKE — the
--     gated command below (org governance owner/admin only) is the only
--     write path.
--   service_role:   untouched default.
--
-- ROLLBACK: supabase/rollbacks/20260817181000_leave_balance_policies_v1.down.sql
-- drops ONLY the new function and the new table (feature-created rows live
-- only there). No existing object was touched.
-- ============================================================================

begin;

-- ── 0. Safety assertions ───────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.worker_absences') is null then
    raise exception 'worker_absences missing — apply 20260718150000_leave_absence before this migration';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'belongs_to_organization'
  ) then
    raise exception 'belongs_to_organization missing — apply 20260806120000 before this migration';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'membership_actor_role_v1'
  ) then
    raise exception 'membership_actor_role_v1 missing — apply 20260806120000 before this migration';
  end if;
end $$;

-- ── 1. Table — org-configured entitlements per absence type ────────────────
create table if not exists public.leave_balance_policies (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations(id) on delete cascade,
  absence_type            text not null check (absence_type in (
                            'annual_leave','sickness','unpaid','training','other')),
  annual_entitlement_days numeric(5,1) not null
                            check (annual_entitlement_days >= 0 and annual_entitlement_days <= 366),
  period_basis            text not null default 'calendar_year'
                            check (period_basis in ('calendar_year')),
  carryover_days          numeric(5,1) not null default 0
                            check (carryover_days >= 0 and carryover_days <= 366),
  is_active               boolean not null default true,
  created_by              uuid not null references public.profiles(id) on delete cascade,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint leave_balance_policies_org_type_uq unique (organization_id, absence_type)
);
create index if not exists leave_balance_policies_org_idx
  on public.leave_balance_policies (organization_id);

comment on table public.leave_balance_policies is
  'Org-configured leave entitlements per worker_absences type. NO statutory defaults, NO seeded rows, NO country logic - an organization sets its own numbers and the UI must never claim legal compliance. Balances are DERIVED at read time (entitlement + carryover - approved absence days in the calendar year); nothing stores a balance.';

-- ── 2. RLS — SELECT-only, fail-closed; writes stay RPC-only ────────────────
alter table public.leave_balance_policies enable row level security;

revoke all on public.leave_balance_policies from public;
revoke all on public.leave_balance_policies from anon;
revoke all on public.leave_balance_policies from authenticated;
grant select on public.leave_balance_policies to authenticated;

drop policy if exists leave_balance_policies_select on public.leave_balance_policies;
create policy leave_balance_policies_select on public.leave_balance_policies
  for select to authenticated
  using (public.belongs_to_organization(organization_id) or public.is_admin());

-- No insert/update/delete policy anywhere: with the explicit REVOKE above,
-- the command below is the ONLY write path.

-- ── 3. set_leave_balance_policy_v1 — org owner/admin configures numbers ────
-- Upsert on (organization_id, absence_type). Governance truth for WRITE
-- authority is ACTIVE company_memberships owner/admin (the engine-authoring
-- precedent) — a manager reads balances, an owner/admin sets the policy.
create or replace function public.set_leave_balance_policy_v1(
  p_organization_id         text,
  p_absence_type            text,
  p_annual_entitlement_days numeric,
  p_carryover_days          numeric default 0,
  p_is_active               boolean default true
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_org      uuid;
  v_type     text := nullif(trim(coalesce(p_absence_type, '')), '');
  actor_role text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_org := nullif(trim(coalesce(p_organization_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_org is null then return 'invalid'; end if;

  -- Merged outcome for "org missing" and "no authority" — no oracle.
  actor_role := public.membership_actor_role_v1(uid, v_org);
  if actor_role is null or actor_role not in ('owner','admin') then
    return 'not_authorized';
  end if;

  if v_type is null or v_type not in
     ('annual_leave','sickness','unpaid','training','other') then
    return 'invalid';
  end if;
  if p_annual_entitlement_days is null
     or p_annual_entitlement_days < 0 or p_annual_entitlement_days > 366 then
    return 'invalid';
  end if;
  if p_carryover_days is null or p_carryover_days < 0 or p_carryover_days > 366 then
    return 'invalid';
  end if;

  insert into public.leave_balance_policies
    (organization_id, absence_type, annual_entitlement_days, carryover_days,
     is_active, created_by)
  values
    (v_org, v_type, round(p_annual_entitlement_days, 1),
     round(coalesce(p_carryover_days, 0), 1), coalesce(p_is_active, true), uid)
  on conflict (organization_id, absence_type) do update
    set annual_entitlement_days = excluded.annual_entitlement_days,
        carryover_days          = excluded.carryover_days,
        is_active               = excluded.is_active,
        updated_at              = now();

  return 'saved';
end;
$$;
revoke all on function public.set_leave_balance_policy_v1(text, text, numeric, numeric, boolean) from public;
revoke all on function public.set_leave_balance_policy_v1(text, text, numeric, numeric, boolean) from anon;
grant execute on function public.set_leave_balance_policy_v1(text, text, numeric, numeric, boolean) to authenticated;

commit;

-- ROLLBACK (down): supabase/rollbacks/20260817181000_leave_balance_policies_v1.down.sql
-- drops ONLY the new function and the leave_balance_policies table.
