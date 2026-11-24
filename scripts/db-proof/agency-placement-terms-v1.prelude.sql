-- ============================================================================
-- agency-placement-terms-v1 PRELUDE — stand-ins for the live schema the real
-- migration needs. Throwaway PostgreSQL 16 only; synthetic data only.
--
-- What the proof MEASURES is loaded verbatim from the repository by the
-- script: the migration under proof, its rollback, and the live
-- respond_agency_candidate_offer_v1 (cut from
-- 20261008090000_chain_proof_unshare_withdraws_offers_v1.sql). What is here is
-- only the surrounding schema: tables with the columns those functions touch,
-- and the authority helpers reduced to their meaning.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='anon')          then create role anon;          end if;
end $$;
grant usage on schema public to authenticated, anon;

create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('app.uid', true), '')::uuid;
$$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;

create table public.profiles (id uuid primary key, full_name text, is_admin boolean default false);
create table public.workers (id uuid primary key, profile_id uuid unique references public.profiles(id));
-- 0001_initial_schema.sql:104-116 (display_name / legal_name) + 20260612090000 company_type
create table public.companies (
  id uuid primary key, profile_id uuid references public.profiles(id), legal_name text, display_name text,
  company_type text not null default 'employer');
-- 0027_company_workers.sql:44-51
create table public.company_workers (
  company_id uuid not null references public.companies(id) on delete cascade,
  worker_id  uuid not null references public.workers(id) on delete cascade,
  status text check (status in ('active','paused','removed')),
  created_at timestamptz default now(), updated_at timestamptz default now(),
  primary key (company_id, worker_id));
create table public.audit_logs (
  id bigserial primary key, actor_id uuid, action text not null, entity text, entity_id uuid,
  payload jsonb, created_at timestamptz default now());
create table public.customer_requests (
  id uuid primary key, payload jsonb default '{}'::jsonb, role_or_work_type text, title text);
create table public.agency_client_request_shares (id uuid primary key, status text not null);
create table public.booking_requests (
  id uuid primary key default gen_random_uuid(), request_id uuid, worker_id uuid, role text,
  status text default 'proposed');
-- 20260723180000 :131-146 + 20260903101000 :40-57
create table public.agency_candidate_offers (
  id uuid primary key default gen_random_uuid(),
  request_share_id uuid references public.agency_client_request_shares(id),
  agency_company_id uuid not null references public.companies(id),
  client_company_id uuid not null references public.companies(id),
  request_id uuid not null references public.customer_requests(id),
  worker_id uuid not null references public.workers(id),
  status text not null default 'offered' check (status in ('offered','withdrawn','accepted','declined')),
  note text, decided_at timestamptz, decided_by uuid, decision_note text,
  booking_id uuid references public.booking_requests(id),
  created_at timestamptz default now(), updated_at timestamptz default now());

-- Authority helpers, reduced to their meaning.
create function public.owns_company(p uuid) returns boolean language sql stable security definer
  set search_path = public as $$
  select exists (select 1 from public.companies c where c.id = p and c.profile_id = auth.uid());
$$;
create function public.company_acts_as_agency(p uuid) returns boolean language sql stable security definer
  set search_path = public as $$
  select exists (select 1 from public.companies c where c.id = p and c.company_type = 'staffing_agency');
$$;
create function public.is_admin() returns boolean language sql stable security definer
  set search_path = public as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;
-- The booking proposal itself is not under proof: a stand-in that records it.
create function public.propose_booking_request_v3(
  p_request uuid, p_worker uuid, a uuid, b date, c date, p_role text, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  insert into public.booking_requests (request_id, worker_id, role) values (p_request, p_worker, p_role)
  returning id into v;
  return v;
end $$;

grant execute on function public.owns_company(uuid), public.company_acts_as_agency(uuid), public.is_admin()
  to authenticated;
grant select on public.companies, public.company_workers, public.agency_candidate_offers to authenticated;
