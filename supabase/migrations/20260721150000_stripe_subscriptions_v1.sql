-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after owner review. Never `db push`.
--
-- Stripe TEST subscriptions v1 — organization linkage for company/agency plan
-- subscriptions, over the applied 20260613200000 billing tables:
--
--   1. billing_subscriptions.organization_id (nullable uuid → organizations.id,
--      ON DELETE SET NULL) — the LIVE org a company/agency subscription is
--      bound to; nulled when that organization is deleted.
--   2. billing_subscriptions.origin_organization_id (nullable uuid, NO fk) —
--      an IMMUTABLE snapshot of the organization a subscription was born bound
--      to. Captured from organization_id by a BEFORE trigger and NEVER nulled,
--      so an orphaned (org-deleted) subscription is still recognisable as an
--      org subscription and never collapses into the personal uniqueness scope.
--   3. uniqueness remodel: the applied `unique (owner_id, plan_key, provider)`
--      would REJECT the same owner buying the same company/agency plan for a
--      SECOND organization (the webhook upsert would hit the constraint and
--      leave the second, real Stripe subscription untracked). It is replaced
--      by two partial unique indexes:
--        - personal scope (origin_organization_id IS NULL):
--            one subscription per (owner_id, plan_key, provider) — genuine
--            personal plans (worker) and manual pilot grants only;
--        - organization scope (organization_id IS NOT NULL):
--            one subscription per (organization_id, plan_key, provider).
--      An orphaned org subscription (organization_id NULL after the org was
--      deleted, but origin_organization_id retained) is under NEITHER partial
--      index, so ON DELETE SET NULL can never drive two former-org rows into a
--      personal-uniqueness collision that would block the organization delete
--      (Codex round 2 P2).
--
-- Why: a company/agency plan checkout is bound server-side to a CANONICAL
-- organization (organizations + engagement_contexts membership, verified at
-- checkout). The webhook carries organization_id in signature-verified Stripe
-- metadata; this column persists that linkage so entitlements and admin
-- surfaces can project a subscription onto the organization — not only onto
-- the purchasing profile.
--
-- Manual pilot grants (lib/admin/billing-actions.ts) write org-less rows
-- (organization_id NULL). They are covered by the personal partial unique
-- index for data integrity, but the write path no longer relies on ON CONFLICT
-- over a partial index (PostgreSQL cannot infer a partial index as a conflict
-- arbiter without its predicate, which supabase-js cannot supply). The grant
-- action uses an explicit find-then-write instead (Codex round 2 P1).
--
-- Honesty / safety invariants:
--   * additive + widening — every existing row (0 today, verified in prod)
--     stays valid; the partial indexes are strictly wider than the dropped
--     constraint for null-org rows and correctly scoped for org rows;
--   * no RLS change: existing SELECT policies (owner or admin) keep applying;
--     writes stay SERVER-only (service_role; no authenticated write path);
--   * the trigger runs with INVOKER rights (never a definer function) and only
--     fills a discriminator column — it never reads another table and never
--     bypasses RLS; search_path is pinned empty;
--   * no money amount, no card data, no secret is stored;
--   * org-scoped checkout FAILS CLOSED in app code until this is applied
--     (lib/billing/subscription-store.ts + the checkout route), so nothing is
--     ever persisted with its verified organization binding discarded;
--   * reversible: supabase/rollbacks/20260721150000_stripe_subscriptions_v1.down.sql
-- ============================================================================

-- @human-gate-approved
begin;

alter table public.billing_subscriptions
  add column if not exists organization_id uuid
    references public.organizations(id) on delete set null;

-- Immutable origin snapshot (no FK — survives organization deletion). Kept out
-- of the FK graph on purpose: it must NOT be nulled by ON DELETE SET NULL.
alter table public.billing_subscriptions
  add column if not exists origin_organization_id uuid;

create index if not exists billing_subscriptions_org_idx
  on public.billing_subscriptions (organization_id)
  where organization_id is not null;

-- Capture origin_organization_id from organization_id whenever an org is set
-- (insert or a later update that assigns one) and it is not already recorded.
-- INVOKER rights, empty search_path, touches only NEW — no table access.
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

drop trigger if exists trg_billing_subscriptions_capture_origin_org
  on public.billing_subscriptions;
create trigger trg_billing_subscriptions_capture_origin_org
  before insert or update of organization_id on public.billing_subscriptions
  for each row execute function public.billing_subscriptions_capture_origin_org();

-- Uniqueness remodel (safe on the verified-empty table; @human-gate-approved):
-- the auto-named constraint from 20260613200000 is replaced by scoped partial
-- unique indexes so one owner can hold the same plan for several orgs while
-- personal plans stay one-per-owner and orphaned org rows collide with nothing.
alter table public.billing_subscriptions
  drop constraint if exists billing_subscriptions_owner_id_plan_key_provider_key;

create unique index if not exists billing_subscriptions_personal_plan_uniq
  on public.billing_subscriptions (owner_id, plan_key, provider)
  where origin_organization_id is null;

create unique index if not exists billing_subscriptions_org_plan_uniq
  on public.billing_subscriptions (organization_id, plan_key, provider)
  where organization_id is not null;

comment on column public.billing_subscriptions.organization_id is
  'Canonical organizations.id a company/agency plan subscription is bound to. '
  'Set server-side from signature-verified Stripe TEST metadata; null for '
  'personal plans and nulled when the organization is deleted. Membership '
  '(owner/manager engagement) is verified at checkout — never trusted from '
  'the client.';

comment on column public.billing_subscriptions.origin_organization_id is
  'Immutable snapshot of the organization a subscription was born bound to. '
  'Captured from organization_id by trg_billing_subscriptions_capture_origin_org '
  'and never nulled, so an orphaned (org-deleted) subscription stays out of the '
  'personal uniqueness scope and never blocks the organization delete. NULL '
  'only for genuinely personal subscriptions (worker plans, manual pilot grants).';

commit;

-- ROLLBACK: see supabase/rollbacks/20260721150000_stripe_subscriptions_v1.down.sql
