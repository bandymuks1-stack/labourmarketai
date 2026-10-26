-- ============================================================================
-- STUB HARNESS for scripts/db-proof/assign-training-employees-v1.sh
--
-- A throwaway PostgreSQL 16 cluster is not Supabase, so the pieces of the
-- platform that assign_training_v1 touches are recreated here. Everything the
-- FUNCTION decides on is either VERBATIM from production (read 2026-10-26 via
-- pg_get_functiondef on project gorgitwvdzxbnaxhrsrw) or a column-faithful
-- table with production's CHECK constraints. What is STUBBED, and why it does
-- not change the result:
--
--   auth.uid()           reads the GUC app.uid (Supabase reads the JWT `sub`).
--   auth.identities      empty table — the OAuth branch of email_is_verified_v1
--                        is exercised only through email_verifications_v1.
--   roles                anon / authenticated / service_role created NOLOGIN;
--                        probes run under `set local role authenticated|anon`,
--                        so EXECUTE grants genuinely decide access.
--   tables               only the columns the functions read/write, with the
--                        production CHECK / UNIQUE / FK shapes that matter
--                        (engagement status set, membership status set,
--                        training_assignments_once). No audit/hash columns.
--   RLS                  training_assignments / training_programs carry the
--                        production SELECT policies (verbatim predicates) so
--                        the "employee sees it" step is decided by RLS.
--
-- VERBATIM from production: has_org_demand_access, email_is_verified_v1,
-- profile_id_by_verified_email_v1, belongs_to_organization,
-- training_can_view_assignment_v1, complete_training_assignment_v1.
-- assign_training_v1 itself is NOT defined here: the proof loads the real
-- rollback file (= production body) and the real migration file.
-- ============================================================================

create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema auth;
create schema extensions;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;

create function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
grant execute on function auth.uid() to anon, authenticated;

create table auth.identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider text not null,
  identity_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ── tables ─────────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key,
  email text
);

create table public.organizations (
  id uuid primary key,
  display_name text,
  legacy_company_id uuid,
  organization_type text not null default 'company'
);

create table public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null,
  status text not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  constraint company_memberships_role_check check (role = any (array['owner','admin','manager','external_manager','member'])),
  constraint company_memberships_status_check check (status = any (array['invited','active','revoked'])),
  constraint company_memberships_accepted_coherent check ((status <> 'active') or (accepted_at is not null)),
  constraint company_memberships_revoked_coherent check ((status = 'revoked') = (revoked_at is not null))
);

create table public.relationship_types (
  slug text primary key,
  category text not null
);
insert into public.relationship_types (slug, category) values
  ('collaborator','collaboration'), ('consultant','advisory'), ('employee','employment'),
  ('freelancer','employment'), ('intern','education'), ('manager','employment'),
  ('owner','ownership'), ('student','education'), ('unemployed','status'),
  ('viewer','other'), ('volunteer','other');

create table public.engagement_contexts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  relationship_slug text not null references public.relationship_types(slug),
  status text not null,
  started_at date,
  ended_at date,
  title text,
  created_at timestamptz not null default now(),
  constraint engagement_contexts_status_check check (status = any (array['active','paused','ended']))
);

-- The invitation table exists only so the "invited, not accepted" person has
-- a REAL pending invitation, exactly as production stores one.
create table public.company_worker_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  invited_email text not null,
  status text not null default 'pending'
);

create table public.email_verifications_v1 (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  primary key (profile_id, email)
);

create table public.training_programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  is_active boolean not null default true
);

create table public.training_assignments (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.training_programs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  assignee_profile_id uuid not null references public.profiles(id) on delete cascade,
  required_by date,
  status text not null default 'assigned',
  completed_at timestamptz,
  completion_note text,
  assigned_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_assignments_once unique (program_id, assignee_profile_id),
  constraint training_assignments_status_check check (status = any (array['assigned','completed','expired'])),
  constraint training_assignments_completed_shape check (
    ((status = 'assigned') and (completed_at is null)) or ((status = 'completed') and (completed_at is not null)) or (status = 'expired'))
);

create table public.training_assignment_events (
  id uuid primary key default gen_random_uuid(),
  training_assignment_id uuid not null references public.training_assignments(id) on delete cascade,
  actor_id uuid not null,
  event_type text not null,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

-- is_admin(): nobody is a platform admin in this harness.
create function public.is_admin() returns boolean language sql stable as $$ select false $$;

-- ── helpers, VERBATIM from production ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_org_demand_access(org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select org is not null and exists (
    select 1 from public.company_memberships m
     where m.profile_id = auth.uid()
       and m.organization_id = org
       and m.status = 'active'
       and m.role in ('owner','admin','manager','external_manager')
  )
$function$;

CREATE OR REPLACE FUNCTION public.email_is_verified_v1(p_profile_id uuid, p_email text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
    p_profile_id is not null
    and nullif(trim(coalesce(p_email, '')), '') is not null
    and (
      exists (
        select 1 from public.email_verifications_v1 v
         where v.profile_id = p_profile_id
           and v.email = lower(trim(p_email))
      )
      or exists (
        select 1 from auth.identities i
         where i.user_id = p_profile_id
           and i.provider in ('google', 'linkedin_oidc')
           and lower(coalesce(i.identity_data ->> 'email', '')) = lower(trim(p_email))
           and (i.identity_data ->> 'email_verified') = 'true'
           and not exists (
             select 1 from auth.identities j
              where j.user_id = i.user_id and j.id <> i.id
                and j.created_at < i.created_at
           )
      )
    ),
    false);
$function$;

CREATE OR REPLACE FUNCTION public.profile_id_by_verified_email_v1(p_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_ids uuid[];
begin
  if v_email = '' then return null; end if;
  select array_agg(p.id) into v_ids
    from public.profiles p
   where lower(p.email) = v_email
     and public.email_is_verified_v1(p.id, p.email);
  if v_ids is null or cardinality(v_ids) <> 1 then return null; end if;
  return v_ids[1];
end $function$;

CREATE OR REPLACE FUNCTION public.belongs_to_organization(org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.engagement_contexts ec
     where ec.profile_id = auth.uid()
       and ec.organization_id = org
       and ec.status = 'active'
  )
  or exists (
    select 1 from public.company_memberships m
     where m.profile_id = auth.uid()
       and m.organization_id = org
       and m.status = 'active'
  )
$function$;

CREATE OR REPLACE FUNCTION public.training_can_view_assignment_v1(p_assignment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.training_assignments a
     where a.id = p_assignment_id
       and (
         a.assignee_profile_id = auth.uid()
         or a.assigned_by = auth.uid()
         or public.has_org_demand_access(a.organization_id)
         or public.is_admin()
       )
  )
$function$;

CREATE OR REPLACE FUNCTION public.complete_training_assignment_v1(p_assignment_id text, p_note text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid    uuid := auth.uid();
  v_id   uuid;
  v_note text := nullif(left(trim(coalesce(p_note, '')), 1000), '');
  a      public.training_assignments%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id := nullif(trim(coalesce(p_assignment_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null then return 'invalid'; end if;

  select * into a from public.training_assignments t where t.id = v_id for update;
  if a.id is null or a.assignee_profile_id <> uid then return 'not_found'; end if;
  if a.completed_at is not null then return 'already_completed'; end if;
  if a.status = 'expired' then return 'invalid_state'; end if;

  update public.training_assignments
     set status = 'completed',
         completed_at = now(),
         completion_note = v_note,
         updated_at = now()
   where id = a.id and completed_at is null;

  insert into public.training_assignment_events
    (training_assignment_id, actor_id, event_type, before_state, after_state)
  values (a.id, uid, 'completed',
          jsonb_build_object('status', a.status),
          jsonb_build_object('status', 'completed'));

  return 'completed';
end $function$;

-- Production ACLs of the helpers.
revoke all on function public.has_org_demand_access(uuid) from public;
grant execute on function public.has_org_demand_access(uuid) to authenticated;
revoke all on function public.profile_id_by_verified_email_v1(text) from public;
revoke all on function public.belongs_to_organization(uuid) from public;
grant execute on function public.belongs_to_organization(uuid) to authenticated;
revoke all on function public.training_can_view_assignment_v1(uuid) from public;
grant execute on function public.training_can_view_assignment_v1(uuid) to authenticated;
revoke all on function public.complete_training_assignment_v1(text, text) from public;
revoke all on function public.complete_training_assignment_v1(text, text) from anon;
grant execute on function public.complete_training_assignment_v1(text, text) to authenticated;

-- ── read path: production SELECT policies (verbatim predicates) ───────────
alter table public.training_programs enable row level security;
alter table public.training_assignments enable row level security;
create policy training_programs_select on public.training_programs
  for select to authenticated using (public.belongs_to_organization(organization_id) or public.is_admin());
create policy training_assignments_select on public.training_assignments
  for select to authenticated using (public.training_can_view_assignment_v1(id));
grant select on public.training_programs, public.training_assignments to authenticated;
