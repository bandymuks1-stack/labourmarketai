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

-- Read by main's list_agency_offer_progress_v1 / list_agency_placements_v1, which 20261118100000
-- replaces with one condition changed: only the columns those bodies touch.
alter table public.company_worker_engagements add column ended_at timestamptz;
alter table public.booking_requests add column start_date date, add column expected_end_date date;
create table public.booking_request_events (booking_request_id uuid, event_type text, created_at timestamptz default now());
create table public.demand_shortlist (request_id uuid, worker_id uuid, owner_id uuid, status text);
create table public.conversations (id uuid primary key, source_type text, source_id uuid);
create table public.conversation_participants (conversation_id uuid, profile_id uuid);
create table public.organizations (id uuid primary key, legacy_company_id uuid);
create table public.projects (id uuid primary key, organization_id uuid, company_id uuid);
create table public.project_worker_assignments (project_id uuid, worker_id uuid, status text,
  assigned_at timestamptz default now(), ended_at timestamptz);
alter table public.customer_requests add column profile_id uuid;

-- 20261003151000_email_verified_boundary_v1: the CALLING session's proven e-mail. Stand-in: a
-- session setting, verified unless the proof says otherwise (R2 P2-2 cases set it false).
create function public.session_email_verified_v1() returns boolean language sql stable as $$
  select coalesce(nullif(current_setting('app.email_verified', true), ''), 'true') = 'true';
$$;
grant execute on function public.session_email_verified_v1() to authenticated;

-- 20260901052300 :190-198, the offer read policy as main applies it (unchanged by 20261118100000).
alter table public.agency_candidate_offers enable row level security;
grant select on public.agency_client_connections to authenticated;
create policy agency_candidate_offers_select on public.agency_candidate_offers for select
  using (
    public.owns_company(agency_company_id)
    or (public.owns_company(client_company_id)
        and exists (select 1 from public.agency_client_connections c
                     where c.id = connection_id and c.status = 'active'))
    or public.is_admin()
  );

-- 0001_initial_schema :625-627: the audit trail is read by an admin only.
alter table public.audit_logs enable row level security;
grant select on public.audit_logs to authenticated;
create policy audit_logs_select on public.audit_logs for select using (public.is_admin());
