-- ============================================================================
-- FINANCIAL OPS v1 — PROOF HARNESS PRELUDE (finance + document + object half).
--
-- Loaded ON TOP of scripts/db-proof/workflow-engine-v1.prelude.sql (which
-- provides auth.uid()/is_admin() stubs, profiles, organizations,
-- company_memberships, engagement_contexts, membership_actor_role_v1 and
-- belongs_to_organization — all copied verbatim from the real migrations).
--
-- This file adds the minimal faithful shapes the three financial-ops
-- migrations read:
--   * companies / projects        -> 0001_initial_schema.sql (subset)
--   * owns_company                -> 0001 (verbatim body)
--   * manages_organization        -> 20260806180000 (verbatim body)
--   * has_org_demand_access       -> 20260806200000 (verbatim body)
--   * can_manage_project          -> 20260601091000 (verbatim body)
--   * finance_records + its 3 v1 RPCs
--                                 -> 20260711230000_finance_records_v1.sql
--                                    (table verbatim; RPCs reduced to the
--                                    create path the proof actually calls)
--   * finance_company_authority_v1-> 20260817123000 (verbatim body) + the
--                                    fr_select policy it re-issues
--   * work_objects                -> 20260817150000 (subset: id + org)
--   * org_documents               -> 20260817140000 (subset the FK + the
--                                    read predicate need)
--   * can_read_org_document_v1    -> 20260817140000 (reduced to the two
--                                    real audiences the proof exercises:
--                                    org owner/admin membership, or any
--                                    ACTIVE member for an ACTIVE 'standard'
--                                    document)
-- Nothing here re-implements anything under test.
--
-- Throwaway only. Never point this at production or a shared local stack.
-- ============================================================================

create table if not exists public.companies (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  name       text
);

create table if not exists public.projects (
  id              uuid primary key default gen_random_uuid(),
  title           text,
  company_id      uuid references public.companies(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null
);

-- The organizations→companies bridge finance_company_authority_v1 walks.
alter table public.organizations
  add column if not exists legacy_company_id uuid references public.companies(id);

-- ── Authority helpers, copied verbatim from the real migrations ────────────
create or replace function public.owns_company(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.companies x where x.id = c and x.profile_id = auth.uid()
  )
$$;
revoke all on function public.owns_company(uuid) from public;
grant execute on function public.owns_company(uuid) to authenticated;

create or replace function public.manages_organization(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select org is not null and (
    exists (
      select 1 from public.company_memberships m
       where m.profile_id = auth.uid()
         and m.organization_id = org
         and m.status = 'active'
         and m.role in ('owner','admin','manager','external_manager')
    )
    or exists (
      select 1 from public.engagement_contexts ec
       where ec.profile_id = auth.uid()
         and ec.organization_id = org
         and ec.status = 'active'
         and ec.relationship_slug in ('owner','admin','manager')
    )
  )
$$;
revoke all on function public.manages_organization(uuid) from public;
revoke all on function public.manages_organization(uuid) from anon;
grant execute on function public.manages_organization(uuid) to authenticated;

create or replace function public.has_org_demand_access(org uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select org is not null and exists (
    select 1 from public.company_memberships m
     where m.profile_id = auth.uid()
       and m.organization_id = org
       and m.status = 'active'
       and m.role in ('owner','admin','manager','external_manager')
  )
$$;
revoke all on function public.has_org_demand_access(uuid) from public;
revoke all on function public.has_org_demand_access(uuid) from anon;
grant execute on function public.has_org_demand_access(uuid) to authenticated;

create or replace function public.can_manage_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p
     where p.id = p_project_id
       and (
         public.owns_company(p.company_id)
         or public.manages_organization(p.organization_id)
         or public.is_admin()
       )
  );
$$;
revoke all on function public.can_manage_project(uuid) from public;
grant execute on function public.can_manage_project(uuid) to authenticated;

-- ── work_objects (subset: the org-boundary check the RPC performs) ─────────
create table if not exists public.work_objects (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text
);
grant select on public.work_objects to authenticated;

-- ── org_documents (subset: the FK target + the read predicate) ─────────────
create table if not exists public.org_documents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title           text,
  status          text not null default 'active'
                    check (status in ('active','archived','revoked')),
  classification  text not null default 'standard'
                    check (classification in ('standard','classified'))
);
grant select on public.org_documents to authenticated;

create or replace function public.can_read_org_document_v1(p_org_document_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
      select 1
        from public.org_documents od
        join public.company_memberships m
          on m.organization_id = od.organization_id
       where od.id = p_org_document_id
         and m.profile_id = auth.uid()
         and m.status = 'active'
         and m.role in ('owner','admin')
    )
    or exists (
      select 1
        from public.org_documents od
        join public.company_memberships m
          on m.organization_id = od.organization_id
       where od.id = p_org_document_id
         and od.status = 'active'
         and od.classification = 'standard'
         and m.profile_id = auth.uid()
         and m.status = 'active'
    )
$$;
revoke all on function public.can_read_org_document_v1(uuid) from public;
revoke all on function public.can_read_org_document_v1(uuid) from anon;
grant execute on function public.can_read_org_document_v1(uuid) to authenticated;

-- ── finance_records — table VERBATIM from 20260711230000 ───────────────────
create table if not exists public.finance_records (
  id                uuid primary key default gen_random_uuid(),
  record_type       text not null
                      check (record_type in ('invoice_issued','invoice_received','expense')),
  title             text not null check (
                      char_length(trim(title)) >= 3
                      and char_length(title) <= 160
                    ),
  counterparty_name text not null check (
                      char_length(trim(counterparty_name)) >= 2
                      and char_length(counterparty_name) <= 160
                    ),
  amount_cents      bigint not null
                      check (amount_cents >= 0 and amount_cents <= 100000000000),
  currency          char(3) not null default 'EUR' check (currency in ('EUR')),
  status            text not null default 'draft'
                      check (status in ('draft','issued','partially_paid','paid','cancelled')),
  due_date          date,
  paid_at           timestamptz,
  project_id        uuid references public.projects(id) on delete set null,
  company_id        uuid references public.companies(id) on delete set null,
  note              text check (char_length(note) <= 1000),
  created_by        uuid not null references public.profiles(id) on delete cascade,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint fr_paid_shape check (
    (status = 'paid' and paid_at is not null)
    or
    (status <> 'paid' and paid_at is null)
  )
);
alter table public.finance_records enable row level security;

-- ── finance_company_authority_v1 — VERBATIM from 20260817123000 ────────────
create or replace function public.finance_company_authority_v1(p_company_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select p_company_id is not null and (
    public.owns_company(p_company_id)
    or exists (
      select 1 from public.organizations o
       where o.legacy_company_id = p_company_id
         and public.membership_actor_role_v1(auth.uid(), o.id) in ('owner','admin')
    )
  )
$$;
revoke execute on function public.finance_company_authority_v1(uuid) from public;
revoke execute on function public.finance_company_authority_v1(uuid) from anon;
grant execute on function public.finance_company_authority_v1(uuid) to authenticated;

-- The fr_select policy AS 20260817123000 re-issues it.
drop policy if exists fr_select on public.finance_records;
create policy fr_select on public.finance_records
  for select
  to authenticated
  using (
    created_by = auth.uid()
    or public.is_admin()
    or public.finance_company_authority_v1(company_id)
  );
grant select on public.finance_records to authenticated;
revoke insert, update, delete on public.finance_records from authenticated;

-- The v1 CREATE command, reduced to the path the proof calls (the full body
-- lives in 20260711230000 and is NOT under test here — the proof only needs
-- pre-existing rows created the same gated way the product creates them).
create or replace function public.create_finance_record_v1(
  p_record_type  text,
  p_title        text,
  p_counterparty text,
  p_amount_cents text,
  p_status       text,
  p_due_date     text,
  p_project_id   text,
  p_company_id   text,
  p_note         text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_company uuid := nullif(trim(coalesce(p_company_id, '')), '')::uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_company is not null and not public.finance_company_authority_v1(v_company) then
    return 'not_allowed';
  end if;
  insert into public.finance_records
    (record_type, title, counterparty_name, amount_cents, currency, status,
     company_id, note, created_by)
  values
    (p_record_type, p_title, p_counterparty,
     nullif(trim(coalesce(p_amount_cents,'')),'')::bigint, 'EUR',
     coalesce(nullif(trim(coalesce(p_status,'')),''),'draft'),
     v_company, nullif(trim(coalesce(p_note,'')),''), uid);
  return 'created';
end $$;
revoke all on function public.create_finance_record_v1(text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.create_finance_record_v1(text, text, text, text, text, text, text, text, text) to authenticated;
