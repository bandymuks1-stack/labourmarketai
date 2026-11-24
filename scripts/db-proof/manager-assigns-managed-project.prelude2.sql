-- Prelude 2 for the manager-assigns-on-managed-project proof. Applied AFTER
-- manager-assigns-managed-project.prelude.sql (roles, auth.uid(), helper predicates copied from production).
-- Everything here is external to the migration under test and reduced to the columns the function reads/writes.

alter table public.companies add column if not exists profile_id uuid;
alter table public.organizations add column if not exists legacy_company_id uuid;
alter table public.projects add column if not exists status text not null default 'active';
alter table public.engagement_contexts add column if not exists is_primary boolean not null default false;
alter table public.engagement_contexts add column if not exists hash_self text;
alter table public.engagement_contexts add column if not exists created_at timestamptz not null default now();
alter table public.project_worker_assignments add column if not exists assigned_at timestamptz;
alter table public.project_worker_assignments add column if not exists ended_at timestamptz;
alter table public.project_worker_assignments add constraint pwa_project_worker_uq unique (project_id, worker_id);

create table public.company_workers (
  company_id uuid not null references public.companies(id),
  worker_id  uuid not null references public.workers(id),
  status     text not null default 'active',
  primary key (company_id, worker_id)
);
create table public.agencies (id uuid primary key, owner_profile_id uuid);
create table public.agency_workers (
  agency_id uuid not null references public.agencies(id),
  worker_id uuid not null references public.workers(id),
  status    text not null default 'active'
);
create table public.company_worker_engagements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  worker_id  uuid references public.workers(id),
  status     text not null default 'active'
);
create table public.booking_requests (id uuid primary key default gen_random_uuid(), status text);
create table public.agency_candidate_offers (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid references public.workers(id),
  client_company_id uuid,
  booking_id uuid references public.booking_requests(id),
  status text
);

-- extensions.digest(): Supabase keeps pgcrypto in the `extensions` schema; the function body calls it qualified.
create schema if not exists extensions;
create function extensions.digest(text, text) returns bytea language sql immutable as $$ select public.digest($1, $2) $$;

-- production helpers the function calls (copied from the migrations that define them)
create function public.owns_agency(a uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.agencies x where x.id = a and x.owner_profile_id = auth.uid())
$$;
create function public.caller_manages_worker_by_roster(p_worker_id uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.company_workers cw
     where cw.worker_id = p_worker_id and cw.status = 'active'
       and public.owns_company(cw.company_id)
  ) or exists (
    select 1 from public.agency_workers aw
     where aw.worker_id = p_worker_id and aw.status = 'active'
       and public.owns_agency(aw.agency_id)
  );
$$;
create function public.caller_has_booking_engagement_for_project(p_worker_id uuid, p_project_id uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select auth.uid() is not null and exists (
    select 1
      from public.company_worker_engagements e
      join public.companies     c on c.id = e.company_id
      join public.projects      p on p.id = p_project_id
      join public.organizations o on o.id = p.organization_id
     where e.worker_id is not null
       and e.worker_id = p_worker_id
       and e.status = 'active'
       and c.profile_id is not distinct from auth.uid()
       and o.legacy_company_id is not distinct from e.company_id
  );
$$;

grant select, insert, update on public.project_worker_assignments, public.engagement_contexts to authenticated;

-- test harness: returns 'ok' or the SQLSTATE the function raised (SECURITY INVOKER: runs as the caller)
create function public.zz_try_assign(p text, w text) returns text language plpgsql as $$
declare r uuid;
begin
  r := public.assign_worker_to_project(p, w);
  return case when r is null then 'null' else 'ok' end;
exception when others then return sqlstate;
end $$;
grant execute on function public.zz_try_assign(text, text) to authenticated, anon;
