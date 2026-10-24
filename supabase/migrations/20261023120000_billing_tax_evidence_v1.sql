-- ============================================================================
-- 20261023120000 — billing_tax_evidence v1 (Stripe Tax evidence + review
-- routing for organization paid plans; owner order 2026-10-23).
--
-- SAFETY CLASS: RED (billing + GRANT/REVOKE). Draft PR + `needs-human-gate`;
-- apply ONLY via Supabase MCP `apply_migration` after explicit owner approval
-- of THIS SQL (the owner approved the Stripe Tax DIRECTION, not this exact
-- statement, so no `@human-gate-approved` marker is added — the static gate is
-- meant to stay red until a human has read it). Never `supabase db push`.
--
-- OWNER ORDER (2026-10-23): seller = Lithuanian UAB, Lithuanian VAT law; LT B2B
-- customers pay standard 21% VAT when it applies; foreign B2B gets Stripe Tax's
-- treatment incl. reverse charge WHEN its conditions are confirmed. Collect and
-- store company details, the VAT code, its verification result, the invoice
-- and the tax calculation basis. When automatic taxation cannot be determined
-- reliably: no ad-hoc exemption — route the transaction to review.
--
-- WHY A NEW TABLE (canonical check): billing_subscriptions is the ONE plan
-- state machine (one row per subscription, mutable status); payment_webhook_
-- events is the idempotency log (one row per event, lean payload). Neither is
-- a per-payment tax record: a subscription has many invoices, each with its
-- own tax basis, VAT id verification and review state. Putting that onto the
-- subscription row would overwrite last month's evidence with this month's;
-- putting it into the event log would mix review state into an append-only
-- audit row. So: ONE evidence row per Stripe object (checkout session /
-- invoice), next to the existing billing tables, with exactly their posture.
--
-- WHAT
--   billing_tax_evidence — keyed by (provider, provider_object_id). Written ONLY
--   by the signed Stripe webhook (service role, like every billing table) while
--   BILLING_STRIPE_TAX_ENABLED=true; a `customer.tax_id.updated` event records
--   the VIES/HMRC verification result on the rows of that customer + VAT id;
--   a platform admin may mark a row reviewed (reviewed_at / reviewed_by) —
--   amounts are never changed by anyone here: they are Stripe's.
--
-- RLS (no loosening; the same posture as billing_subscriptions /
--   billing_checkout_operations):
--   SELECT: `owner_id = auth.uid() or public.is_admin()` — the exact
--     billing_subscriptions read predicate (the paying profile + admins).
--   NO insert/update/delete policy: the service role is the only write path.
--   Grants: explicit — revoke the bootstrap default from public/anon/
--     authenticated AND service_role (where default privileges grant ALL to
--     service_role, as on the local Supabase stack, it would otherwise keep
--     DELETE/TRUNCATE — found on the local TEST stack 2026-10-23), then SELECT
--     to authenticated (RLS-scoped) and SELECT/INSERT/UPDATE to service_role
--     (no DELETE for anyone).
--
-- ERASURE (v3 registry): owner_id = sever_sentinel (accounting record retained,
-- the person re-pointed to the sentinel, legal review pending — the same
-- decision as billing_subscriptions); reviewed_by = set_null (an admin's
-- identity on an accounting record).
--
-- COMPATIBILITY / BACKFILL: none — new table, ships empty. Until applied the
-- webhook treats 42P01 as "evidence not available" and never fails a payment
-- for it; the switch must stay OFF until this migration is applied.
-- ROLLBACK: paired supabase/rollbacks/20261023120000_billing_tax_evidence_v1.down.sql
--   (refuses while the table holds rows — evidence is archived first).
--
-- POST-APPLY VERIFICATION (read-only):
--   select count(*) from public.billing_tax_evidence;                      -- 0
--   select polname, polcmd from pg_policy
--    where polrelid = 'public.billing_tax_evidence'::regclass;             -- 1 row, r
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_name = 'billing_tax_evidence' order by 1, 2;
--   -- authenticated: SELECT; service_role: INSERT, SELECT, UPDATE
-- ============================================================================

begin;

create table if not exists public.billing_tax_evidence (
  id                           uuid primary key default gen_random_uuid(),
  provider                     text not null default 'stripe' check (provider in ('stripe')),
  object_kind                  text not null check (object_kind in ('checkout_session', 'invoice')),
  provider_object_id           text not null check (char_length(provider_object_id) between 1 and 255),
  provider_customer_id         text,
  organization_id              uuid references public.organizations(id) on delete set null,
  owner_id                     uuid references public.profiles(id) on delete set null,
  test_mode                    boolean not null default true,
  customer_business_name       text check (customer_business_name is null or char_length(customer_business_name) <= 300),
  billing_country              text check (billing_country is null or billing_country ~ '^[A-Z]{2}$'),
  tax_id_type                  text,
  tax_id_value                 text check (tax_id_value is null or char_length(tax_id_value) <= 64),
  tax_id_verification_status   text check (tax_id_verification_status is null or tax_id_verification_status in ('pending', 'verified', 'unverified', 'unavailable', 'unknown')),
  tax_id_verified_name         text,
  tax_id_verification_event_at timestamptz,
  automatic_tax_requested      boolean not null default false,
  automatic_tax_status         text,
  amount_subtotal              bigint,
  amount_tax                   bigint,
  amount_total                 bigint,
  currency                     text,
  reverse_charge               boolean not null default false,
  taxes                        jsonb,
  invoice_id                   text,
  invoice_url                  text,
  review_required              boolean not null default false,
  review_reason                text,
  reviewed_at                  timestamptz,
  reviewed_by                  uuid references public.profiles(id) on delete set null,
  last_event_id                text,
  last_event_created_at        timestamptz,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

create unique index if not exists billing_tax_evidence_object_uidx
  on public.billing_tax_evidence (provider, provider_object_id);
create index if not exists billing_tax_evidence_review_idx
  on public.billing_tax_evidence (created_at desc) where review_required;
create index if not exists billing_tax_evidence_org_idx
  on public.billing_tax_evidence (organization_id, created_at desc);
create index if not exists billing_tax_evidence_customer_idx
  on public.billing_tax_evidence (provider_customer_id, tax_id_value);

comment on table public.billing_tax_evidence is
  'Stripe Tax evidence per Stripe object (checkout session / invoice): customer business name, '
  'billing country, VAT id + its verification result, automatic tax status, amounts, the tax '
  'breakdown (rate, jurisdiction, taxability reason, amount), the invoice, and the review flag '
  '(owner order 2026-10-23: no ad-hoc exemptions, unclear taxation goes to review). Written only '
  'by the signed webhook (service role); amounts are Stripe''s and never edited here.';

alter table public.billing_tax_evidence enable row level security;

create policy billing_tax_evidence_select on public.billing_tax_evidence
  for select to authenticated
  using (owner_id = auth.uid() or public.is_admin());
-- No insert/update/delete policies: writes are SERVER-only via the service role.

revoke all on table public.billing_tax_evidence from public, anon, authenticated, service_role;
grant select on public.billing_tax_evidence to authenticated;
grant select, insert, update on public.billing_tax_evidence to service_role;

-- GDPR erasure v3 (20261019140000) refuses while a person-referencing FK has no
-- registry decision.
do $$
begin
  if to_regclass('public.privacy_erasure_registry_v3') is null then
    return;
  end if;
  insert into public.privacy_erasure_registry_v3
    (schema_name, table_name, column_name, parent, fk_rule_expected, treatment, decided_by, legal_review, legal_basis, requires_external, retention, note) values
  ('public', 'billing_tax_evidence', 'owner_id', 'profiles', 'set null', 'sever_sentinel', 'engineering', true,
   'Art. 17(3)(b): accounting / VAT records (10 y LT) - LEGAL TO CONFIRM', 'stripe',
   '10 years (LT accounting and VAT records) - LEGAL TO CONFIRM',
   'tax evidence of a payment; the row stays, the person is re-pointed to the sentinel (same decision as billing_subscriptions)'),
  ('public', 'billing_tax_evidence', 'reviewed_by', 'profiles', 'set null', 'set_null', 'engineering', false,
   'accountability field; the reviewing admin identity is nulled when that admin is erased', null, null,
   'platform admin who marked the tax review done')
  on conflict (schema_name, table_name, column_name) do nothing;
end $$;

commit;

-- ROLLBACK (paired file supabase/rollbacks/20261023120000_billing_tax_evidence_v1.down.sql):
--   -- refuses while billing_tax_evidence holds rows (archive the evidence first)
--   delete from public.privacy_erasure_registry_v3 where table_name = 'billing_tax_evidence';
--   drop policy if exists billing_tax_evidence_select on public.billing_tax_evidence;
--   drop table if exists public.billing_tax_evidence;
