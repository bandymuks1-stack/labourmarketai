-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after owner approval.
-- Never `db push`.
--
-- W8 — Services real model (Phase 1 foundation): provider-owned service
-- offerings. This is the SUPPLY mirror of the existing demand model
-- (customer_requests) and booking model (booking_requests). A provider
-- (worker / company / agency — any profile, no role hardcode) lists the real
-- services they offer and manages them: create / edit / activate / pause /
-- delete their OWN rows.
--
-- Honesty invariants:
--   * Purely ADDITIVE — one NEW table. No existing table is altered, and no
--     existing row is read, written, or migrated. Existing production data is
--     structurally untouched.
--   * Default-closed RLS. Phase 1 visibility is OWNER + admin only — there is
--     NO cross-user discovery here (that is a separate Phase-2 visibility
--     decision). Writes are owner-scoped; `with check (provider_id = auth.uid())`
--     means a row can never be created for, or moved to, another owner.
--   * NO payment. `rate_text` is free text the provider types (e.g. an
--     indicative rate) — there is no amount/currency column, no transaction,
--     no checkout, no escrow. Billing stays a separate, out-of-scope concern.
--   * No SECURITY DEFINER RPC — simple owner-owned CRUD is enforced entirely by
--     owner-scoped RLS (same pattern as preferred_locations capture).
--
-- ROLLBACK: supabase/rollbacks/20260627121713_service_offerings.down.sql
-- (guarded drop — refuses if service_offerings holds rows).
-- ============================================================================

-- @human-gate-approved
begin;

-- 1. Service offerings (provider supply listings) ───────────────────────────
create table if not exists public.service_offerings (
  id               uuid primary key default gen_random_uuid(),
  provider_id      uuid not null references public.profiles(id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 120),
  description      text check (description is null or char_length(description) <= 2000),
  category_slug    text check (category_slug is null or char_length(category_slug) <= 80),
  location_country char(2),
  remote           boolean not null default false,
  -- Free text only (e.g. "approx. 25 EUR/h, negotiable"). NOT a price column:
  -- no amount, no currency, no transaction. Billing is out of scope.
  rate_text        text check (rate_text is null or char_length(rate_text) <= 120),
  status           text not null default 'draft'
                     check (status in ('draft', 'active', 'paused')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists service_offerings_provider_idx
  on public.service_offerings (provider_id, status);

-- 2. RLS — default-closed, owner-scoped (§4) ────────────────────────────────
alter table public.service_offerings enable row level security;

-- SELECT: the provider sees/manages their OWN offerings; admin sees all. There
-- is intentionally NO cross-user discovery policy in Phase 1.
drop policy if exists service_offerings_select on public.service_offerings;
create policy service_offerings_select on public.service_offerings
  for select to authenticated
  using (provider_id = auth.uid() or public.is_admin());

-- INSERT: owner-scoped. `with check` pins provider_id to the caller so a row can
-- never be created on behalf of another profile.
drop policy if exists service_offerings_insert on public.service_offerings;
create policy service_offerings_insert on public.service_offerings
  for insert to authenticated
  with check (provider_id = auth.uid());

-- UPDATE: owner-scoped on both the existing row and the new values (can't move a
-- row to another owner).
drop policy if exists service_offerings_update on public.service_offerings;
create policy service_offerings_update on public.service_offerings
  for update to authenticated
  using (provider_id = auth.uid())
  with check (provider_id = auth.uid());

-- DELETE: owner-scoped.
drop policy if exists service_offerings_delete on public.service_offerings;
create policy service_offerings_delete on public.service_offerings
  for delete to authenticated
  using (provider_id = auth.uid());

-- 3. Grants — to `authenticated` only (never anon / public). RLS still gates
--    every row; the grant just permits the verb at the role level.
grant select, insert, update, delete on public.service_offerings to authenticated;

commit;
