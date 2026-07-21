-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after owner review. Never `db push`.
--
-- Stripe TEST subscriptions v1 — organization linkage for company/agency plan
-- subscriptions. ONE additive, idempotent change to the applied
-- 20260613200000 billing tables:
--
--   billing_subscriptions.organization_id (nullable uuid → organizations.id)
--
-- Why: a company/agency plan checkout is bound server-side to a CANONICAL
-- organization (organizations + engagement_contexts membership, verified at
-- checkout). The webhook carries organization_id in signature-verified Stripe
-- metadata; this column persists that linkage so entitlements and admin
-- surfaces can project a subscription onto the organization — not only onto
-- the purchasing profile.
--
-- Honesty / safety invariants:
--   * additive + nullable — every existing row (0 today) stays valid;
--   * no RLS change: existing SELECT policies (owner or admin) keep applying;
--     writes stay SERVER-only (service_role; no authenticated write path);
--   * no money amount, no card data, no secret is stored;
--   * app code degrades honestly (42703 → retry without the column) until
--     this is applied, so nothing breaks either way;
--   * reversible: supabase/rollbacks/20260721150000_stripe_subscriptions_v1.down.sql
-- ============================================================================

-- @human-gate-approved
begin;

alter table public.billing_subscriptions
  add column if not exists organization_id uuid
    references public.organizations(id) on delete set null;

create index if not exists billing_subscriptions_org_idx
  on public.billing_subscriptions (organization_id)
  where organization_id is not null;

comment on column public.billing_subscriptions.organization_id is
  'Canonical organizations.id a company/agency plan subscription is bound to. '
  'Set server-side from signature-verified Stripe TEST metadata; null for '
  'personal plans. Membership (owner/manager engagement) is verified at '
  'checkout — never trusted from the client.';

commit;

-- ROLLBACK: see supabase/rollbacks/20260721150000_stripe_subscriptions_v1.down.sql
