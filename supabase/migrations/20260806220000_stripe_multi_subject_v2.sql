-- 20260806220000 — Stripe TEST multi-subject schema v2 (supersedes PR #844's
-- 20260721150000, which is CLOSED unapplied — its schema content was reviewed
-- twice and is carried here unchanged; its app-side org authority was rebuilt
-- on company_memberships + the manage-billing capability).
--
-- SAFETY CLASS: RED. Constraint drop + trigger + index remodel on a billing
-- table. Ships with NO `-- @human-gate-approved` marker: target state is
-- STRIPE_TEST_MULTI_SUBJECT_V2_CODE_COMPLETE_PENDING_HUMAN_GATE — a separate
-- owner decision gates any production apply.
--
-- ── WHAT (the M-P0-7 canonical subject model's storage) ───────────────────
--   1. `billing_subscriptions.organization_id` (uuid → organizations,
--      ON DELETE SET NULL) — the LIVE organization subject binding;
--   2. `billing_subscriptions.origin_organization_id` (uuid, NO FK) — the
--      IMMUTABLE born-bound-to snapshot (captured by trigger, never nulled),
--      so an orphaned org subscription never collapses into the personal
--      uniqueness scope;
--   3. uniqueness remodel: `unique (owner_id, plan_key, provider)` (which
--      REJECTS one payer holding the same plan for a second organization)
--      is replaced by two partial unique indexes —
--        personal:      (owner_id, plan_key, provider)
--                       WHERE origin_organization_id IS NULL
--        organization:  (organization_id, plan_key, provider)
--                       WHERE organization_id IS NOT NULL
--      One payer can hold Personal + A + B with the SAME plan key; an A
--      cancellation/resubscribe collides only inside A's scope; orphaned
--      org rows (org deleted) sit under NEITHER index.
--
-- Verified webhook metadata is the ONLY state authority (owner_id +
-- organization_id ride signature-verified Stripe metadata); the redirect
-- never grants entitlement; no money amount, card data or secret is stored;
-- RLS unchanged (SELECT owner-or-admin; writes stay service-role only).
--
-- ROLLBACK: supabase/rollbacks/20260806220000_stripe_multi_subject_v2.down.sql
-- — archives every organization binding before dropping the columns and
-- restores the original constraint; it REFUSES while live multi-subject rows
-- would collide under the restored constraint.
-- ════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.billing_subscriptions') is null then
    raise exception 'billing_subscriptions missing — 20260613200000 expected before this migration';
  end if;
end $$;

alter table public.billing_subscriptions
  add column if not exists organization_id uuid
    references public.organizations(id) on delete set null;

-- Immutable origin snapshot (no FK — survives organization deletion). Kept
-- out of the FK graph on purpose: it must NOT be nulled by ON DELETE SET NULL.
alter table public.billing_subscriptions
  add column if not exists origin_organization_id uuid;

create index if not exists billing_subscriptions_org_idx
  on public.billing_subscriptions (organization_id)
  where organization_id is not null;

-- Capture origin_organization_id whenever an organization is set and it is
-- not already recorded. INVOKER rights, empty search_path, touches only NEW.
create or replace function public.billing_subscriptions_capture_origin_org()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is not null and new.origin_organization_id is null then
    new.origin_organization_id := new.organization_id;
  end if;
  return new;
end;
$$;
revoke all on function public.billing_subscriptions_capture_origin_org() from public;
revoke all on function public.billing_subscriptions_capture_origin_org() from anon;
revoke all on function public.billing_subscriptions_capture_origin_org() from authenticated;

drop trigger if exists trg_billing_subscriptions_capture_origin_org
  on public.billing_subscriptions;
create trigger trg_billing_subscriptions_capture_origin_org
  before insert or update of organization_id on public.billing_subscriptions
  for each row execute function public.billing_subscriptions_capture_origin_org();

-- Uniqueness remodel (safe on the verified-empty table).
alter table public.billing_subscriptions
  drop constraint if exists billing_subscriptions_owner_id_plan_key_provider_key;

create unique index if not exists billing_subscriptions_personal_plan_uniq
  on public.billing_subscriptions (owner_id, plan_key, provider)
  where origin_organization_id is null;

create unique index if not exists billing_subscriptions_org_plan_uniq
  on public.billing_subscriptions (organization_id, plan_key, provider)
  where organization_id is not null;

comment on column public.billing_subscriptions.organization_id is
  'Canonical organizations.id an organization-subject subscription is bound '
  'to (M-P0-7 billing subject model). Set server-side from signature-verified '
  'Stripe TEST metadata; the binding is proposed by the validated active '
  'workspace and authorized by the manage-billing capability '
  '(company_memberships owner/admin) at checkout — never trusted from the '
  'client. NULL = personal subject; nulled when the organization is deleted.';

comment on column public.billing_subscriptions.origin_organization_id is
  'Immutable snapshot of the organization this subscription was BORN bound '
  'to (captured by trigger, no FK, never nulled). Discriminates the personal '
  'uniqueness scope (IS NULL) from organization subscriptions forever, even '
  'after the organization row is deleted.';
