-- Supplement to journal-counterparty-authority.prelude.sql (+ the REAL counterparty migration applied
-- before this file). Adds ONLY what the finance migrations and the invoice-lifecycle migration touch:
-- reduced dependency tables + helper bodies copied from the repo. Throwaway only.
create table public.companies (id uuid primary key default gen_random_uuid(), profile_id uuid references public.profiles(id));
alter table public.organizations add column legacy_company_id uuid references public.companies(id);
alter table public.projects add column title text;
create or replace function public.owns_company(c uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.companies x where x.id = c and x.profile_id = auth.uid()) $$;
-- verbatim from 20260601091000
create or replace function public.can_manage_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects p where p.id = p_project_id
       and (public.owns_company(p.company_id) or public.manages_organization(p.organization_id) or public.is_admin()));
$$;
-- verbatim from 20260806120000
create or replace function public.membership_actor_role_v1(p_actor uuid, p_organization_id uuid) returns text
language sql security definer set search_path = public stable as $$
  select role from public.company_memberships where organization_id = p_organization_id
     and profile_id = p_actor and status = 'active' limit 1 $$;
-- document layer + workflow engine reduced to what finance_invoice_upgrades asserts
create table public.org_documents (id uuid primary key default gen_random_uuid(), organization_id uuid);
create or replace function public.can_read_org_document_v1(p uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.org_documents d where d.id = p and public.membership_actor_role_v1(auth.uid(), d.organization_id) in ('owner','admin')) $$;
create table public.workflow_instances (id uuid primary key default gen_random_uuid(), context_entity_type text, context_entity_id uuid,
  status text, created_at timestamptz default now());
-- journal tables used by the evidence derivation (shapes from 0013 / 20260612091000)
create table public.productivity_units (slug text primary key);
insert into public.productivity_units values ('hours'),('minutes'),('days'),('square_meters'),('pieces');
create table public.journal_entry_metrics (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  metric_slug text not null, value_numeric numeric, value_text text,
  unit_slug text references public.productivity_units(slug),
  source text not null default 'worker_input', created_at timestamptz not null default now());
create table public.journal_entry_photos (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  file_name text not null default 'p.jpg', mime_type text not null default 'image/jpeg',
  file_size_bytes bigint not null default 1, storage_path text not null unique default gen_random_uuid()::text,
  upload_status text not null default 'uploaded', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
grant select on public.companies, public.projects, public.journal_entry_metrics, public.journal_entry_photos to authenticated;
