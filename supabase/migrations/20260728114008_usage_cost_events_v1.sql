-- ============================================================================
-- MIGRATION ALREADY APPLIED IN PRODUCTION — NEVER MANUALLY RE-APPLY.
--
-- Production ledger version : 20260728114008
-- Production ledger name    : usage_cost_events_v1
-- Applied to production     : 2026-07-28 11:40:08 UTC, via Supabase MCP apply_migration
--                             (project gorgitwvdzxbnaxhrsrw), BEFORE this file
--                             existed in the repository.
-- Restored to repo          : 2026-08-03, for migration-history parity only
--                             (Option A of docs/audits/
--                             usage-cost-migration-drift-inventory-2026-08-03.md;
--                             reconciliation PR: fix/reconcile-usage-cost-
--                             production-migration-history).
-- Parity proof              : everything below the marker line is BYTE-EXACT to
--                             production's stored statements. md5 = c05d4a1308582e9eaeda3404d4d52fe4.
--                             Verify: strip the banner up to and including the
--                             marker line, then md5sum the remainder.
-- ROLLBACK                  : supabase/rollbacks/20260728114008_usage_cost_events_v1.down.sql —
--                             RECONSTRUCTED after the production apply. The
--                             production ledger stored NO rollback for this
--                             migration; the documented incident path is
--                             forward-fix. The down file exists for local
--                             development resets and repo governance only and
--                             is NOT part of the original production history.
-- Do NOT edit below the marker. Do NOT apply to production — it is already there.
-- ============================================================================
-- @human-gate-approved
-- HUMAN GATE SCOPE (owner approval 2026-08-03, PR #995 ONLY): the owner
-- approved exactly the 12 migration-safety findings across these four files
-- (grant-or-revoke x3, create-trigger x4, truncate-token x3,
-- alter-drop-policy x1, drop-without-zero-row-guard x1) AS THE RESTORATION OF
-- HISTORICAL, ALREADY-PRODUCTION-APPLIED SQL. This SQL was applied to
-- production on 2026-07-28, BEFORE this PR existed; the PR only restores the
-- production history to the repository. This approval grants NO right to
-- apply any migration to production, approves NO production data mutation,
-- and the reconstructed rollback files are NOT part of the original
-- production history. Findings stay visible as human-gated notices.
-- PRODUCTION-EXACT-SQL-BELOW
create table if not exists public.usage_cost_events (
  event_id        uuid primary key,
  occurred_at     timestamptz not null,
  recorded_at     timestamptz not null default now(),
  event_type      text not null check (event_type in ('usage', 'cost', 'revenue', 'activity')),
  status          text not null check (status in ('success', 'error', 'partial', 'rejected')),
  provider        text not null check (char_length(provider) between 1 and 64),
  service         text not null check (char_length(service) between 1 and 64),
  resource        text check (resource is null or char_length(resource) <= 128),
  workspace_id    text check (workspace_id is null or char_length(workspace_id) <= 128),
  profile_id      uuid references public.profiles(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  session_id      text check (session_id is null or char_length(session_id) <= 64),
  feature_code    text check (feature_code is null or char_length(feature_code) <= 64),
  plan_key        text check (plan_key is null or char_length(plan_key) <= 64),
  payer           text check (payer is null or payer in ('worker', 'company', 'agency', 'platform')),
  measures        jsonb not null default '{}'::jsonb
                    check (jsonb_typeof(measures) = 'object' and char_length(measures::text) <= 2048),
  cost            jsonb not null default '{}'::jsonb
                    check (jsonb_typeof(cost) = 'object' and char_length(cost::text) <= 2048),
  revenue_link    jsonb check (revenue_link is null or jsonb_typeof(revenue_link) = 'object'),
  metadata        jsonb not null default '{}'::jsonb
                    check (jsonb_typeof(metadata) = 'object' and char_length(metadata::text) <= 2048),
  schema_version  int not null default 1 check (schema_version >= 1),
  constraint usage_cost_events_currency_eur check (
    cost->>'currency' is null or cost->>'currency' = 'EUR'
  ),
  constraint usage_cost_events_amount_types check (
    jsonb_typeof(cost->'estimatedCents') in ('number', 'null') is not false
    and jsonb_typeof(cost->'actualCents') in ('number', 'null') is not false
  ),
  constraint usage_cost_events_amount_sign check (
    case
      when jsonb_typeof(cost->'estimatedCents') = 'number'
        and (cost->>'estimatedCents')::numeric < 0 then false
      when jsonb_typeof(cost->'actualCents') = 'number'
        and (cost->>'actualCents')::numeric < 0 then false
      else true
    end
  ),
  constraint usage_cost_events_pricing_version_required check (
    case
      when (jsonb_typeof(cost->'estimatedCents') = 'number'
            or jsonb_typeof(cost->'actualCents') = 'number')
        and coalesce(cost->>'pricingVersion', '') = '' then false
      else true
    end
  ),
  constraint usage_cost_events_billing_source_for_actual check (
    case
      when jsonb_typeof(cost->'actualCents') = 'number'
        and coalesce(cost->>'billingSource', '') = '' then false
      else true
    end
  ),
  constraint usage_cost_events_no_fabricated_zero check (
    case
      when event_type = 'usage'
        and jsonb_typeof(cost->'estimatedCents') = 'number'
        and (cost->>'estimatedCents')::numeric = 0
        and jsonb_typeof(cost->'actualCents') is distinct from 'number'
        and coalesce(cost->>'billingSource', '') = '' then false
      else true
    end
  )
);

comment on table public.usage_cost_events is
  'Canonical append-only usage & cost event ledger. Contract: docs/architecture/usage-cost-event-model-v1.md. INSERT-only: update/delete are revoked and trigger-blocked. Identity is server-resolved; there is no INSERT policy for authenticated callers.';

create or replace function public.usage_cost_events_forbid_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'usage_cost_events is append-only: % is not permitted', tg_op
    using errcode = '42501';
end;
$$;

drop trigger if exists usage_cost_events_no_mutation on public.usage_cost_events;
create trigger usage_cost_events_no_mutation
  before update or delete on public.usage_cost_events
  for each row execute function public.usage_cost_events_forbid_mutation();

create index if not exists usage_cost_events_occurred_at_idx
  on public.usage_cost_events (occurred_at desc);
create index if not exists usage_cost_events_provider_idx
  on public.usage_cost_events (provider, occurred_at desc);
create index if not exists usage_cost_events_organization_idx
  on public.usage_cost_events (organization_id, occurred_at desc)
  where organization_id is not null;
create index if not exists usage_cost_events_profile_idx
  on public.usage_cost_events (profile_id, occurred_at desc)
  where profile_id is not null;
create index if not exists usage_cost_events_service_idx
  on public.usage_cost_events (service, occurred_at desc);

alter table public.usage_cost_events enable row level security;

create policy usage_cost_events_select on public.usage_cost_events
  for select to authenticated
  using (public.is_admin());

revoke all on public.usage_cost_events from authenticated;
grant select on public.usage_cost_events to authenticated;

revoke all on public.usage_cost_events from service_role;
grant select, insert on public.usage_cost_events to service_role;