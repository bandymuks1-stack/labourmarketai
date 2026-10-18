-- Prelude for the email-verified-boundary-v1 proof. EXTERNAL bits only:
-- Supabase roles, auth.uid()/auth.jwt() (claims GUC like PostgREST),
-- auth.users / auth.identities, reduced dependency tables, helper predicates,
-- the UNCHANGED live functions the proof must keep working
-- (accept_invitation_v2 token door, accept_invitation_apply_v2,
-- enforce_profile_email_binding — verbatim from production 2026-10-04), and
-- STUBS for the resolver/LMC functions whose only relevant statement is the one
-- the migration patches (their patch counts were verified against the live
-- definitions with a read-only SELECT). The changed claim functions + the
-- verified-email surface come from the REAL migration / rollback files.
create schema if not exists extensions;
create extension if not exists pgcrypto schema extensions;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public, extensions to anon, authenticated, service_role;
create schema if not exists auth;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb; $$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid; $$;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key, email text, email_confirmed_at timestamptz,
  created_at timestamptz not null default now(), raw_app_meta_data jsonb default '{}'::jsonb);
create table auth.identities (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  provider text not null, identity_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now());

create table public.profiles (
  id uuid primary key, email text, full_name text, active_role text,
  created_at timestamptz not null default now());
create table public.workers (id uuid primary key default gen_random_uuid(), profile_id uuid);
create table public.companies (id uuid primary key default gen_random_uuid(), owner_profile_id uuid, display_name text, legal_name text);
create table public.agencies (id uuid primary key default gen_random_uuid(), profile_id uuid, legal_name text);
create table public.organizations (id uuid primary key default gen_random_uuid(), legacy_company_id uuid, display_name text, legal_name text);
create table public.projects (id uuid primary key default gen_random_uuid(), title text);
create table public.engagement_contexts (
  id uuid primary key default gen_random_uuid(), profile_id uuid, organization_id uuid,
  relationship_slug text, status text, is_primary boolean, title text, hash_self text);
create table public.project_worker_assignments (
  id uuid primary key default gen_random_uuid(), project_id uuid, worker_id uuid, status text, ended_at timestamptz);
create table public.company_workers (company_id uuid, worker_id uuid, status text, primary key (company_id, worker_id));
create table public.agency_workers (agency_id uuid, worker_id uuid, status text, primary key (agency_id, worker_id));
create table public.company_memberships (
  id uuid primary key default gen_random_uuid(), organization_id uuid, profile_id uuid,
  role text, status text, invited_by uuid, source text);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(), actor_id uuid, action text, entity text,
  entity_id uuid, payload jsonb, created_at timestamptz not null default now());
create table public.demand_interest_signals (
  id uuid primary key default gen_random_uuid(), request_id uuid, worker_id uuid, status text, match_snapshot jsonb);

create table public.company_worker_invitations (
  id uuid primary key default gen_random_uuid(), company_id uuid, invited_email text, status text,
  accepted_at timestamptz, inviter_profile_id uuid, note text, created_at timestamptz not null default now(),
  unique (company_id, invited_email));
create table public.agency_worker_invitations (
  id uuid primary key default gen_random_uuid(), agency_id uuid, invited_email text, status text,
  accepted_at timestamptz, inviter_profile_id uuid, note text, created_at timestamptz not null default now(),
  unique (agency_id, invited_email));
create table public.agency_client_connections (
  id uuid primary key default gen_random_uuid(), agency_company_id uuid, client_company_id uuid,
  invited_email text, status text, expires_at timestamptz not null default now() + interval '14 days',
  invited_by uuid, accepted_by uuid, accepted_at timestamptz, revoked_by uuid, revoked_at timestamptz);
create table public.invitations (
  id uuid primary key default gen_random_uuid(), token_hash text, invited_email text,
  invitation_type text, organization_id uuid, project_id uuid, target_request_id uuid,
  relationship_slug text, proposed_role text, personal_message text, inviter_profile_id uuid,
  status text not null default 'pending', expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz, accepted_by_profile_id uuid, max_uses int not null default 1,
  use_count int not null default 0, external_source_slug text, declared_context jsonb,
  created_at timestamptz not null default now());
create table public.invitation_acceptances (
  invitation_id uuid, profile_id uuid, decision text, relationship text, relationship_id uuid,
  decided_at timestamptz default now(), primary key (invitation_id, profile_id));

create or replace function public.is_admin() returns boolean language sql stable security definer
  set search_path to 'public' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active_role = 'admin') $$;
create or replace function public.owns_company(c uuid) returns boolean language sql stable security definer
  set search_path to 'public' as $$
  select exists (select 1 from public.companies x where x.id = c and x.owner_profile_id = auth.uid()); $$;
create or replace function public.owns_agency(a uuid) returns boolean language sql stable security definer
  set search_path to 'public' as $$
  select exists (select 1 from public.agencies x where x.id = a and x.profile_id = auth.uid()); $$;
create or replace function public.invitation_company_authority_v1(c uuid) returns boolean
  language sql stable as $$ select false $$;
create or replace function public.membership_actor_role_v1(p_uid uuid, p_org uuid) returns text
  language sql stable security definer set search_path to 'public' as $$
  select m.role from public.company_memberships m
   where m.profile_id = p_uid and m.organization_id = p_org and m.status = 'active' limit 1 $$;

-- LIVE policies (pre-migration) — the migration ALTERs these.
alter table public.company_worker_invitations enable row level security;
alter table public.agency_worker_invitations enable row level security;
alter table public.agency_client_connections enable row level security;
create policy company_worker_invitations_select on public.company_worker_invitations for select
  using (owns_company(company_id) or (lower(invited_email) = lower(nullif((auth.jwt() ->> 'email'::text), ''::text)))
         or is_admin() or invitation_company_authority_v1(company_id));
create policy agency_worker_invitations_select on public.agency_worker_invitations for select
  using (owns_agency(agency_id) or (lower(invited_email) = lower(nullif((auth.jwt() ->> 'email'::text), ''::text)))
         or is_admin());
create policy agency_client_connections_select on public.agency_client_connections for select
  using (owns_company(agency_company_id) or ((client_company_id is not null) and owns_company(client_company_id))
         or (lower(invited_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text))) or is_admin());
grant select on public.company_worker_invitations, public.agency_worker_invitations,
  public.agency_client_connections, public.profiles, public.invitations to authenticated;
grant update on public.profiles to authenticated;
alter table public.profiles enable row level security;
create policy profiles_select_all on public.profiles for select using (true);
create policy profiles_update_own on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- UNCHANGED live functions (verbatim) ---------------------------------------
CREATE OR REPLACE FUNCTION public.accept_invitation_apply_v2(p_invitation_id uuid, p_actor uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  uid uuid := p_actor;
  v_row public.invitations%rowtype;
  v_worker uuid;
  v_existing uuid;
  v_new uuid;
  v_slug text;
  v_relationship text := 'none';
  v_prior public.invitation_acceptances%rowtype;
  v_uses int;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_row from public.invitations
   where id = p_invitation_id
   for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  select * into v_prior from public.invitation_acceptances
   where invitation_id = v_row.id and profile_id = uid;
  if found and v_prior.decision = 'accepted' then
    return jsonb_build_object('outcome', 'already_accepted',
      'relationship', v_prior.relationship, 'relationship_id', v_prior.relationship_id,
      'invitation_type', v_row.invitation_type,
      'organization_id', v_row.organization_id, 'project_id', v_row.project_id,
      'target_request_id', v_row.target_request_id,
      'external_source_slug', v_row.external_source_slug);
  end if;
  if v_row.status = 'accepted' then
    return jsonb_build_object('outcome',
      case when v_row.max_uses > 1 then 'exhausted' else 'already_accepted' end);
  end if;
  if v_row.status in ('revoked','declined','expired') then
    return jsonb_build_object('outcome', v_row.status);
  end if;
  if v_row.expires_at <= now() then
    update public.invitations set status = 'expired' where id = v_row.id;
    return jsonb_build_object('outcome', 'expired');
  end if;
  if v_row.invitation_type in ('join_organization','join_team','join_as_employee','collaborate_partner') then
    v_slug := coalesce(
      nullif(v_row.relationship_slug, ''),
      case when v_row.invitation_type = 'collaborate_partner'
           then 'collaborator' else 'employee' end);
    select id into v_existing from public.engagement_contexts
     where profile_id = uid and organization_id = v_row.organization_id
       and relationship_slug = v_slug and status = 'active' limit 1;
    if v_existing is null then
      insert into public.engagement_contexts
        (profile_id, organization_id, relationship_slug, status, is_primary,
         title, hash_self)
      values
        (uid, v_row.organization_id, v_slug, 'active', false,
         v_row.proposed_role,
         encode(extensions.digest(uid::text || ':' || v_slug || ':' || v_row.organization_id::text, 'sha256'), 'hex'))
      returning id into v_new;
      v_relationship = 'engagement_created';
    else
      v_new := v_existing;
      v_relationship = 'engagement_existing';
    end if;
  elsif v_row.invitation_type = 'join_project' then
    select id into v_worker from public.workers where profile_id = uid limit 1;
    if v_worker is null then
      return jsonb_build_object('outcome', 'no_worker_profile');
    end if;
    select id into v_existing from public.project_worker_assignments
     where project_id = v_row.project_id and worker_id = v_worker limit 1;
    if v_existing is null then
      insert into public.project_worker_assignments (project_id, worker_id, status)
      values (v_row.project_id, v_worker, 'active')
      returning id into v_new;
      v_relationship = 'assignment_created';
    else
      update public.project_worker_assignments
         set status = 'active', ended_at = null
       where id = v_existing;
      v_new := v_existing;
      v_relationship = 'assignment_reactivated';
    end if;
  elsif v_row.invitation_type = 'invite_to_demand' then
    select id into v_worker from public.workers where profile_id = uid limit 1;
    if v_worker is null then
      return jsonb_build_object('outcome', 'no_worker_profile');
    end if;
    select id into v_existing from public.demand_interest_signals
     where request_id = v_row.target_request_id and worker_id = v_worker limit 1;
    if v_existing is null then
      insert into public.demand_interest_signals
        (request_id, worker_id, status, match_snapshot)
      values
        (v_row.target_request_id, v_worker, 'interested',
         jsonb_build_object('basis', 'employer_invitation',
                            'invitation_id', v_row.id,
                            'invited_at', v_row.created_at,
                            'need_source', 'customer_requests'))
      returning id into v_new;
      v_relationship = 'interest_recorded';
    else
      v_new := v_existing;
      v_relationship = 'interest_existing';
    end if;
  end if;
  insert into public.invitation_acceptances
    (invitation_id, profile_id, decision, relationship, relationship_id)
  values (v_row.id, uid, 'accepted', v_relationship, v_new)
  on conflict (invitation_id, profile_id) do update
    set decision = 'accepted', relationship = excluded.relationship,
        relationship_id = excluded.relationship_id, decided_at = now();
  v_uses := v_row.use_count + 1;
  update public.invitations
     set use_count = v_uses,
         status = case when v_uses >= max_uses then 'accepted' else status end,
         accepted_at = case when v_uses >= max_uses then now() else accepted_at end,
         accepted_by_profile_id = case when max_uses = 1 then uid else accepted_by_profile_id end
   where id = v_row.id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'accept_invitation_v2', 'invitations', v_row.id,
    jsonb_build_object('invitation_type', v_row.invitation_type,
      'relationship', v_relationship, 'relationship_id', v_new,
      'relationship_slug', v_slug, 'use_count', v_uses, 'max_uses', v_row.max_uses,
      'organization_id', v_row.organization_id, 'project_id', v_row.project_id,
      'target_request_id', v_row.target_request_id,
      'external_source_slug', v_row.external_source_slug));
  return jsonb_build_object(
    'outcome', 'accepted',
    'relationship', v_relationship,
    'relationship_id', v_new,
    'relationship_slug', v_slug,
    'invitation_type', v_row.invitation_type,
    'invitation_id', v_row.id,
    'inviter_profile_id', v_row.inviter_profile_id,
    'organization_id', v_row.organization_id,
    'project_id', v_row.project_id,
    'target_request_id', v_row.target_request_id,
    'external_source_slug', v_row.external_source_slug,
    'has_declared_context', v_row.declared_context is not null
  );
end $function$;

CREATE OR REPLACE FUNCTION public.accept_invitation_v2(p_token text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  v_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select id into v_id from public.invitations
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  return public.accept_invitation_apply_v2(v_id, uid);
end $function$;

CREATE OR REPLACE FUNCTION public.enforce_profile_email_binding()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
declare
  v_jwt_email text := lower(nullif(trim(coalesce(auth.jwt() ->> 'email', '')), ''));
begin
  if auth.uid() is null then
    return new;
  end if;
  if public.is_admin() then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and lower(coalesce(new.email, '')) = lower(coalesce(old.email, '')) then
    return new;
  end if;
  if v_jwt_email is null or lower(coalesce(new.email, '')) <> v_jwt_email then
    raise exception
      'profiles.email is bound to the authenticated identity and cannot be set to another address'
      using errcode = '42501';
  end if;
  return new;
end $function$;
create trigger trg_profiles_email_binding before insert or update of email on public.profiles
  for each row execute function public.enforce_profile_email_binding();

-- STUBS: resolver statement shapes exactly as live (patched by the migration) -
create or replace function public.assign_training_v1(p_program_id text, p_assignee_email text, p_required_by text default null)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v_target uuid;
begin
  select p.id into v_target from public.profiles p where lower(p.email) = lower(trim(p_assignee_email)) limit 1;
  if v_target is null then return 'invalid_assignee'; end if;
  return v_target::text;
end $$;
create or replace function public.create_management_decision_v1(p_organization_id text, p_title text, p_agenda text, p_responsible_email text default null, p_deadline text default null)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v_resp uuid;
begin
  select p.id into v_resp from public.profiles p where lower(p.email) = lower(trim(p_responsible_email)) limit 1;
  return coalesce(v_resp::text, 'invalid_responsible');
end $$;
create or replace function public.update_management_decision_v1(p_decision_id text, p_title text default null, p_agenda text default null, p_responsible_email text default null, p_deadline text default null)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v_resp uuid;
begin
  select p.id into v_resp from public.profiles p where lower(p.email) = lower(trim(p_responsible_email)) limit 1;
  return coalesce(v_resp::text, 'invalid_responsible');
end $$;
create or replace function public.create_performance_review_v1(p_cycle_id text, p_subject_email text, p_reviewer_email text default null)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v_subject uuid; v_reviewer uuid;
begin
  select p.id into v_subject from public.profiles p where lower(p.email) = lower(trim(p_subject_email)) limit 1;
  select p.id into v_reviewer from public.profiles p where lower(p.email) = lower(trim(p_reviewer_email)) limit 1;
  return coalesce(v_subject::text, 'invalid_subject') || '/' || coalesce(v_reviewer::text, 'none');
end $$;
create or replace function public.delegate_workflow_step_v1(p_instance_id text, p_to_email text, p_reason text default null)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v_target uuid;
begin
  select p.id into v_target from public.profiles p where lower(p.email) = lower(trim(p_to_email)) limit 1;
  return coalesce(v_target::text, 'invalid_delegate');
end $$;
create or replace function public.lmc_admin_grant_v1(p_recipient_email text, p_amount_cents bigint, p_reason text, p_campaign text, p_expires_at timestamptz, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_recipient uuid; v_email text;
begin
  select u.id, u.email into v_recipient, v_email from auth.users u
   where lower(u.email) = lower(trim(p_recipient_email)) and u.email_confirmed_at is not null;
  if v_recipient is null then raise exception 'lmc_recipient_not_found_or_unverified' using errcode = '22023'; end if;
  return jsonb_build_object('recipient', v_recipient);
end $$;
create or replace function public.lmc_grant_promotional_v1(p_kind text, p_profile_id uuid, p_campaign text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  if not exists (
    select 1 from auth.users u where u.id = p_profile_id and u.email_confirmed_at is not null) then
    raise exception 'lmc_recipient_not_verified' using errcode = '42501';
  end if;
  return jsonb_build_object('granted', p_profile_id);
end $$;
-- membership_invite_v1: LIVE body (verbatim shape; actor authority via the stub above)
create or replace function public.membership_invite_v1(p_organization_id uuid, p_email text, p_role text)
returns text language plpgsql security definer set search_path to 'public' as $$
declare uid uuid := auth.uid(); actor_role text; target uuid; live_status text; new_id uuid;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_role is null or p_role not in ('owner','admin','manager','external_manager','member') then return 'invalid_role'; end if;
  actor_role := public.membership_actor_role_v1(uid, p_organization_id);
  if actor_role is null or actor_role not in ('owner','admin') then return 'not_authorized'; end if;
  if p_role = 'owner' and actor_role <> 'owner' then return 'not_authorized'; end if;
  select id into target from public.profiles where lower(email) = lower(trim(coalesce(p_email, ''))) limit 1;
  if target is null then return 'no_such_user'; end if;
  if target = uid then return 'cannot_invite_self'; end if;
  select status into live_status from public.company_memberships where organization_id = p_organization_id and profile_id = target and status in ('invited','active') limit 1;
  if live_status = 'active' then return 'already_member'; end if;
  if live_status = 'invited' then return 'already_invited'; end if;
  insert into public.company_memberships (organization_id, profile_id, role, status, invited_by, source) values (p_organization_id, target, p_role, 'invited', uid, 'invite') returning id into new_id;
  return 'invited';
end $$;
