-- ============================================================================
-- agency-partnerships-v1 PRELUDE — runs AFTER agency-placement-terms-v1.prelude.sql and the real
-- 20261114235900 migration. Adds the remaining stand-ins the partnership migration touches.
-- Throwaway PostgreSQL 16 only; synthetic data only. What is measured (both migrations, the
-- rollback and the live respond_agency_candidate_offer_v1) is loaded verbatim by the script.
-- ============================================================================

-- auth.jwt(): the caller's e-mail claim, from a session setting.
create function auth.jwt() returns jsonb language sql stable as $$
  select jsonb_build_object('email', nullif(current_setting('app.email', true), ''));
$$;
grant execute on function auth.jwt() to authenticated, anon;

-- 20260723180000 :48-64 (the columns the functions read)
create table public.agency_client_connections (
  id uuid primary key, agency_company_id uuid not null references public.companies(id),
  client_company_id uuid references public.companies(id), status text not null);
alter table public.agency_client_request_shares
  add column connection_id uuid references public.agency_client_connections(id),
  add column request_id uuid references public.customer_requests(id);
-- 20260723180000 :131-155 (connection, withdrawal) and its unique open-offer rule
alter table public.agency_candidate_offers
  add column connection_id uuid references public.agency_client_connections(id),
  add column created_by uuid, add column withdrawn_by uuid, add column withdrawn_at timestamptz;
create unique index uq_offer_active on public.agency_candidate_offers (agency_company_id, request_id, worker_id)
  where status = 'offered';
alter table public.customer_requests add column country text, add column status text default 'submitted';
-- 20260723120000 :160-175
create table public.company_worker_engagements (
  id uuid primary key default gen_random_uuid(), source_booking_id uuid references public.booking_requests(id),
  status text not null default 'active', started_at timestamptz not null default now(),
  created_at timestamptz default now());
