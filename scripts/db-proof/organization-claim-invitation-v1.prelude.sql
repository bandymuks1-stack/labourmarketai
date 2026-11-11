-- Stand-ins for the production objects 20261110190000_organization_claim_invitation_v1 builds on.
-- Shapes copied from production (constraints as read 2026-11-10); bodies only as deep as the proof needs.
create schema if not exists extensions;
create extension if not exists pgcrypto schema extensions;
create schema if not exists auth;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public, extensions, auth to anon, authenticated;

create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(current_setting('request.jwt.claims', true)::jsonb, '{}'::jsonb) $$;

create table public.profiles (id uuid primary key, email text, is_admin boolean not null default false, active_role text);
create table public.profile_roles (profile_id uuid, role text);
create table public.countries (code text primary key);
insert into public.countries values ('LT'), ('IT');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  country text,
  organization_type text not null default 'company',
  owner_profile_id uuid references public.profiles(id),
  claim_state text not null default 'claimed'
    check (claim_state in ('discovered','invited','claim_requested','representative_verified','claimed')),
  archived_at timestamptz, archived_reason text,
  updated_at timestamptz not null default now(),
  constraint organizations_unclaimed_has_no_owner check (claim_state = 'claimed' or owner_profile_id is null)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (char_length(token_hash) = 64),
  invitation_type text not null,
  organization_id uuid references public.organizations(id),
  project_id uuid, target_request_id uuid,
  invited_email text, invited_name text, proposed_role text, personal_message text, locale character(2),
  inviter_profile_id uuid,
  status text not null default 'pending' check (status in ('pending','accepted','declined','expired','revoked')),
  delivery_status text not null default 'not_sent',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz, declined_at timestamptz, revoked_at timestamptz, accepted_by_profile_id uuid,
  max_uses integer not null default 1, use_count integer not null default 0,
  constraint invitations_uses_chk check (max_uses between 1 and 500 and use_count between 0 and max_uses),
  constraint invitations_invitation_type_check check (invitation_type in (
    'join_platform','join_organization','join_team','join_as_employee','collaborate_partner',
    'join_project','invite_company','invite_to_demand')),
  constraint invitations_context_chk check (
       (invitation_type in ('join_organization','join_team','join_as_employee','collaborate_partner') and organization_id is not null)
    or (invitation_type = 'join_project' and project_id is not null)
    or (invitation_type = 'invite_to_demand' and target_request_id is not null)
    or (invitation_type in ('join_platform','invite_company')))
);

create table public.organization_claims (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  claimant_profile_id uuid not null references public.profiles(id) on delete cascade,
  state text not null default 'requested'
    check (state in ('invited','requested','representative_verified','linked','rejected','withdrawn')),
  verification_method text check (verification_method in (
    'official_domain_email','existing_org_admin_invitation','operator_manual_review','official_register_representation')),
  verification_evidence_ref text check (verification_evidence_ref is null or char_length(verification_evidence_ref) <= 500),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 500),
  created_at timestamptz not null default now(),
  constraint organization_claims_not_self_decided check (decided_by is null or decided_by <> claimant_profile_id),
  constraint organization_claims_decision_complete check (
    state not in ('representative_verified','linked')
    or (decided_by is not null and decided_at is not null and verification_method is not null and verification_evidence_ref is not null))
);
create unique index organization_claims_one_open_uq on public.organization_claims (organization_id, claimant_profile_id)
  where state in ('invited','requested','representative_verified');

create table public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, profile_id uuid not null,
  role text not null check (role in ('owner','admin','manager','external_manager','member')),
  status text not null check (status in ('invited','active','revoked')),
  accepted_at timestamptz, revoked_at timestamptz, source text,
  constraint company_memberships_accepted_coherent check (status <> 'active' or accepted_at is not null)
);
create unique index company_memberships_live_key on public.company_memberships (organization_id, profile_id)
  where status in ('invited','active');

create table public.engagement_contexts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null, organization_id uuid not null, relationship_slug text not null,
  is_primary boolean not null default false, status text not null, country_code text, hash_self text
);

create table public.audit_logs (
  id bigserial primary key, actor_id uuid, action text, entity text, entity_id uuid, payload jsonb,
  occurred_at timestamptz
);

create table public.platform_capability_grants (profile_id uuid, capability text, revoked_at timestamptz);
create table public.proven_emails (profile_id uuid, email text);

create function public.is_admin() returns boolean language sql stable security definer set search_path = public as
  $$ select coalesce((select is_admin from public.profiles where id = auth.uid()), false) $$;
create function public.has_platform_capability(p_capability text) returns boolean language sql stable security definer set search_path = public as
  $$ select exists (select 1 from public.platform_capability_grants g where g.profile_id = auth.uid() and g.capability = p_capability and g.revoked_at is null) $$;
-- Production: the mailbox-proof ledger (20261003151000). Here: a row in proven_emails for the session's address.
create function public.session_email_verified_v1() returns boolean language sql stable security definer set search_path = public as
  $$ select exists (select 1 from public.proven_emails p where p.profile_id = auth.uid()
                     and lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))) $$;
create function public.invitation_session_email_matches_v1(p_invited text) returns boolean language sql stable security definer set search_path = public as
  $$ select p_invited is null or lower(btrim(p_invited)) = lower(btrim(coalesce(auth.jwt() ->> 'email', ''))) $$;

-- The two production functions this migration closes, as callable stubs.
create function public.request_organization_claim_v1(p_organization_id uuid, p_method text, p_evidence_ref text)
  returns uuid language sql security definer as $$ select null::uuid $$;
create function public.decide_organization_claim_v1(p_claim_id uuid, p_decision text, p_evidence_ref text, p_note text)
  returns text language sql security definer as $$ select 'stub'::text $$;
-- Production ACL (read 2026-11-10): postgres and authenticated only, no PUBLIC entry.
revoke all on function public.request_organization_claim_v1(uuid, text, text) from public;
revoke all on function public.decide_organization_claim_v1(uuid, text, text, text) from public;
grant execute on function public.request_organization_claim_v1(uuid, text, text) to authenticated;
grant execute on function public.decide_organization_claim_v1(uuid, text, text, text) to authenticated;

-- No table grants to client roles: every write in the proof goes through the functions.
