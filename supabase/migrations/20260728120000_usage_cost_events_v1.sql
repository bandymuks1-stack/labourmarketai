-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after owner review. Never `db push`.
--
-- 20260728120000 — usage_cost_events v1: the first real storage layer for the
-- canonical Usage & Cost Event Model (docs/architecture/usage-cost-event-model-v1.md,
-- contract: apps/web/lib/telemetry/usage-cost-event-model.ts).
--
-- RED class because it carries GRANT/REVOKE (privilege surface). Everything in
-- it is ADDITIVE: one new table, one new trigger function, five indexes. No
-- existing object is touched, renamed, dropped or re-granted.
--
-- Honesty / safety invariants encoded here (not just in application code):
--   * APPEND-ONLY. update/delete are revoked from every role AND a
--     BEFORE UPDATE OR DELETE trigger raises unconditionally, so even a
--     table-owner path cannot mutate a committed event.
--   * IDEMPOTENT. event_id is the primary key; a retry is `on conflict do
--     nothing`, so a duplicate delivery can never create a second row and can
--     never change the first one.
--   * IDENTITY IS SERVER-RESOLVED. There is no INSERT policy, so an
--     authenticated client cannot write at all — the write path is the
--     service-role store, which derives profile/organization from the session.
--   * COST HONESTY, enforced in the DATABASE:
--       - EUR is the only currency;
--       - any stated amount requires a pricingVersion;
--       - an `actual` amount requires a billingSource;
--       - a `usage` event may NOT claim 0 with no billingSource
--         (the fabricated-zero rule — an unmeasured cost must never become a
--          measured zero, or every margin above it is wrong).
--   * provider/service/resource are DATA (bounded text, no enum CHECK), so a
--     new supplier never needs a migration. Only event_type and status —
--     which decide interpretation — are closed vocabularies.
--
-- ROLLBACK: supabase/rollbacks/20260728120000_usage_cost_events_v1.down.sql
--           (zero-row guarded; refuses to drop a populated ledger).
-- ============================================================================

-- @human-gate-approved
begin;

-- ── 1. The table ────────────────────────────────────────────────────────────
create table if not exists public.usage_cost_events (
  -- Client- or server-minted UUID; ALSO the idempotency key.
  event_id        uuid primary key,
  -- When the action happened (not when it was stored).
  occurred_at     timestamptz not null,
  -- When we stored it — the two differ for a late/queued emit.
  recorded_at     timestamptz not null default now(),

  -- The only closed vocabularies: they decide how the row is interpreted.
  event_type      text not null check (event_type in ('usage', 'cost', 'revenue', 'activity')),
  status          text not null check (status in ('success', 'error', 'partial', 'rejected')),

  -- DATA, not constraints: a new vendor/service must never need a migration.
  provider        text not null check (char_length(provider) between 1 and 64),
  service         text not null check (char_length(service) between 1 and 64),
  resource        text check (resource is null or char_length(resource) <= 128),

  -- Attribution. workspace_id is DERIVED ('personal:<uuid>' / 'org:<uuid>') —
  -- there is no workspaces table and this is deliberately not a foreign key.
  workspace_id    text check (workspace_id is null or char_length(workspace_id) <= 128),
  profile_id      uuid references public.profiles(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  session_id      text check (session_id is null or char_length(session_id) <= 64),
  feature_code    text check (feature_code is null or char_length(feature_code) <= 64),
  plan_key        text check (plan_key is null or char_length(plan_key) <= 64),
  payer           text check (payer is null or payer in ('worker', 'company', 'agency', 'platform')),

  -- Sparse bags: a new measure or cost field needs no DDL.
  measures        jsonb not null default '{}'::jsonb
                    check (jsonb_typeof(measures) = 'object' and char_length(measures::text) <= 2048),
  cost            jsonb not null default '{}'::jsonb
                    check (jsonb_typeof(cost) = 'object' and char_length(cost::text) <= 2048),
  -- A POINTER to a fact in its own store — never a restated amount.
  revenue_link    jsonb check (revenue_link is null or jsonb_typeof(revenue_link) = 'object'),
  metadata        jsonb not null default '{}'::jsonb
                    check (jsonb_typeof(metadata) = 'object' and char_length(metadata::text) <= 2048),

  schema_version  int not null default 1 check (schema_version >= 1),

  -- ── Cost honesty, enforced by the database ───────────────────────────────
  -- EUR is the only canonical currency.
  constraint usage_cost_events_currency_eur check (
    cost->>'currency' is null or cost->>'currency' = 'EUR'
  ),
  -- Amounts must be numbers when present.
  constraint usage_cost_events_amount_types check (
    jsonb_typeof(cost->'estimatedCents') in ('number', 'null') is not false
    and jsonb_typeof(cost->'actualCents') in ('number', 'null') is not false
  ),
  -- No negative money.
  constraint usage_cost_events_amount_sign check (
    case
      when jsonb_typeof(cost->'estimatedCents') = 'number'
        and (cost->>'estimatedCents')::numeric < 0 then false
      when jsonb_typeof(cost->'actualCents') = 'number'
        and (cost->>'actualCents')::numeric < 0 then false
      else true
    end
  ),
  -- Any stated amount requires the rate card it came from.
  constraint usage_cost_events_pricing_version_required check (
    case
      when (jsonb_typeof(cost->'estimatedCents') = 'number'
            or jsonb_typeof(cost->'actualCents') = 'number')
        and coalesce(cost->>'pricingVersion', '') = '' then false
      else true
    end
  ),
  -- A reconciled amount must say where it came from.
  constraint usage_cost_events_billing_source_for_actual check (
    case
      when jsonb_typeof(cost->'actualCents') = 'number'
        and coalesce(cost->>'billingSource', '') = '' then false
      else true
    end
  ),
  -- THE FABRICATED-ZERO RULE: a usage event may not claim 0 without saying why.
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

-- ── 2. Append-only enforcement (belt AND braces) ────────────────────────────
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

-- ── 3. Indexes (query shapes the Business Health read model uses) ───────────
-- event_id is already the primary key (idempotency + point lookup).
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

-- ── 4. RLS — admin read only; NO write policy for any client role ──────────
alter table public.usage_cost_events enable row level security;

-- Business Health is an admin surface; nothing else needs to read this ledger.
create policy usage_cost_events_select on public.usage_cost_events
  for select to authenticated
  using (public.is_admin());

-- No insert/update/delete policy exists, by design: writes are SERVER-only via
-- the service role, and updates/deletes are impossible for everyone.

-- ── 5. Grants — INSERT only for the server; SELECT (RLS-scoped) for admins ──
revoke all on public.usage_cost_events from authenticated;
grant select on public.usage_cost_events to authenticated;

revoke all on public.usage_cost_events from service_role;
grant select, insert on public.usage_cost_events to service_role;
-- update/delete are deliberately NOT granted to any role.

commit;

-- ============================================================================
-- ROLLBACK (see supabase/rollbacks/20260728120000_usage_cost_events_v1.down.sql):
--   drop trigger usage_cost_events_no_mutation on public.usage_cost_events;
--   drop function public.usage_cost_events_forbid_mutation();
--   drop table public.usage_cost_events;   -- guarded: refuses if rows exist
-- ============================================================================
