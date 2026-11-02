-- Prelude for the staff-invitation e-mail-binding proof. EXTERNAL bits only
-- (Supabase roles, auth.uid()/auth.jwt() driven by request.jwt.claims,
-- reduced dependency tables) plus the two LIVE production functions that sit
-- in front of the changed ones and are NOT redefined by the migration
-- (accept_invitation_v2, accept_invitation_by_id_v2; pg_get_functiondef,
-- 2026-10-04, read-only). The six functions the migration redefines are
-- installed from the rollback file (= their live bodies) by the .sh.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;
create schema if not exists auth;
-- Same shape as GoTrue's helpers: claims come from request.jwt.claims.
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb; $$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid; $$;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, created_at timestamptz default now());
create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid, provider text, identity_data jsonb, created_at timestamptz default now());
create table public.profiles (id uuid primary key, email text, full_name text, active_role text);
create table public.organizations (id uuid primary key default gen_random_uuid(), display_name text, legal_name text);
create table public.projects (id uuid primary key default gen_random_uuid(), title text);
create table public.customer_requests (id uuid primary key default gen_random_uuid(), role_or_work_type text, country text, organization_id uuid);
create table public.workers (id uuid primary key default gen_random_uuid(), profile_id uuid);
create table public.engagement_contexts (id uuid primary key default gen_random_uuid(), profile_id uuid, organization_id uuid,
  relationship_slug text, status text, is_primary boolean, title text, hash_self text);
create table public.project_worker_assignments (id uuid primary key default gen_random_uuid(), project_id uuid, worker_id uuid,
  status text, ended_at timestamptz);
create table public.demand_interest_signals (id uuid primary key default gen_random_uuid(), request_id uuid, worker_id uuid,
  status text, match_snapshot jsonb);
create table public.audit_logs (id uuid primary key default gen_random_uuid(), actor_id uuid, action text, entity text, entity_id uuid,
  payload jsonb, created_at timestamptz not null default now());

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  invitation_type text not null,
  status text not null default 'pending',
  invited_email text,
  invited_name text,
  proposed_role text,
  personal_message text,
  relationship_slug text,
  organization_id uuid,
  project_id uuid,
  target_request_id uuid,
  inviter_profile_id uuid,
  external_source_slug text,
  campaign_label text,
  declared_context jsonb,
  max_uses int not null default 1,
  use_count int not null default 0,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by_profile_id uuid,
  declined_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.invitation_acceptances (
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  profile_id uuid not null,
  decision text not null,
  relationship text,
  relationship_id uuid,
  context_review jsonb,
  decided_at timestamptz not null default now(),
  primary key (invitation_id, profile_id)
);

-- LIVE accept_invitation_v2 (not redefined by the migration).
CREATE OR REPLACE FUNCTION public.accept_invitation_v2(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

-- LIVE accept_invitation_by_id_v2 (not redefined by the migration).
CREATE OR REPLACE FUNCTION public.accept_invitation_by_id_v2(p_invitation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_invited text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select lower(invited_email) into v_invited from public.invitations
   where id = p_invitation_id;
  if not found or v_invited is null or v_email = '' or v_invited <> v_email then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  return public.accept_invitation_apply_v2(p_invitation_id, uid);
end $function$;
