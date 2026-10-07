-- EXTRACT of 20261003151000_email_verified_boundary_v1 (PR #2152): sections 1-2 (state + predicates) and the two by-id acceptance functions, verbatim. Used ONLY to prove composition.
-- ---------------------------------------------------------------------------
-- 1. State
-- ---------------------------------------------------------------------------
create table if not exists public.email_verification_policy_v1 (
  singleton  boolean primary key default true check (singleton),
  cutover_at timestamptz not null,
  note       text
);
alter table public.email_verification_policy_v1 enable row level security;
revoke all on public.email_verification_policy_v1 from public, anon, authenticated;

insert into public.email_verification_policy_v1 (singleton, cutover_at, note)
values (true, now(), 'accounts confirmed/created at or before this instant are backfilled; later ones prove their mailbox')
on conflict (singleton) do nothing;

create table if not exists public.email_verifications_v1 (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  email       text not null check (email = lower(email) and email <> ''),
  method      text not null check (method in
                ('legacy_confirmed', 'legacy_autoconfirmed', 'social_provider', 'mailbox_proof')),
  verified_at timestamptz not null default now(),
  unique (profile_id, email)
);
create index if not exists email_verifications_v1_email_idx
  on public.email_verifications_v1 (email);
alter table public.email_verifications_v1 enable row level security;
revoke all on public.email_verifications_v1 from public, anon, authenticated;

create table if not exists public.email_verification_requests_v1 (
  profile_id   uuid primary key references public.profiles(id) on delete cascade,
  email        text not null check (email = lower(email) and email <> ''),
  requested_at timestamptz not null default now()
);
alter table public.email_verification_requests_v1 enable row level security;
revoke all on public.email_verification_requests_v1 from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Predicates
-- ---------------------------------------------------------------------------
-- INTERNAL. True iff `p_email` is a verified address of `p_profile_id`.
-- NULL-safe: any null/blank input -> false.
create or replace function public.email_is_verified_v1(p_profile_id uuid, p_email text)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
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
$$;
revoke all on function public.email_is_verified_v1(uuid, text) from public, anon, authenticated;

-- The CALLING session's own verified state: its uid AND its JWT email.
create or replace function public.session_email_verified_v1()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select public.email_is_verified_v1(auth.uid(), auth.jwt() ->> 'email');
$$;
revoke all on function public.session_email_verified_v1() from public, anon;
grant execute on function public.session_email_verified_v1() to authenticated;

-- Inviter-side resolver: the ONE profile that owns and has VERIFIED `p_email`,
-- or NULL (unknown, unverified, or ambiguous -> fail-closed, never "pick one").
create or replace function public.profile_id_by_verified_email_v1(p_email text)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
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
end $$;
revoke all on function public.profile_id_by_verified_email_v1(text) from public, anon, authenticated;

create or replace function public.accept_invitation_by_id_v2(p_invitation_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_invited text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  -- By-id acceptance is the EMAIL-asserted door (the token door is
  -- accept_invitation_v2): only a VERIFIED mailbox may use it.
  if not public.session_email_verified_v1() then
    return jsonb_build_object('outcome', 'email_unverified');
  end if;
  select lower(invited_email) into v_invited from public.invitations
   where id = p_invitation_id;
  if not found or v_invited is null or v_email = '' or v_invited <> v_email then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  return public.accept_invitation_apply_v2(p_invitation_id, uid);
end $function$;

create or replace function public.accept_invitation_by_id_v1(p_invitation_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_token_row public.invitations%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not public.session_email_verified_v1() then
    return jsonb_build_object('outcome', 'email_unverified');
  end if;
  select * into v_token_row from public.invitations
   where id = p_invitation_id for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  -- The in-app path exists ONLY for invitations addressed to the caller's
  -- own VERIFIED email — never a way to probe or consume someone else's.
  if v_email = '' or lower(v_token_row.invited_email) <> v_email then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if v_token_row.status = 'accepted' then
    return jsonb_build_object('outcome', 'already_accepted');
  end if;
  if v_token_row.status in ('revoked','declined') then
    return jsonb_build_object('outcome', v_token_row.status);
  end if;
  if v_token_row.expires_at <= now() then
    update public.invitations set status = 'expired' where id = v_token_row.id;
    return jsonb_build_object('outcome', 'expired');
  end if;

  declare
    v_worker uuid;
    v_existing uuid;
    v_new uuid;
    v_slug text;
    v_relationship text := 'none';
  begin
    if v_token_row.invitation_type in ('join_organization','join_team','join_as_employee','collaborate_partner') then
      v_slug := coalesce(
        nullif(v_token_row.relationship_slug, ''),
        case when v_token_row.invitation_type = 'collaborate_partner'
             then 'collaborator' else 'employee' end);
      select id into v_existing from public.engagement_contexts
       where profile_id = uid and organization_id = v_token_row.organization_id
         and relationship_slug = v_slug and status = 'active' limit 1;
      if v_existing is null then
        insert into public.engagement_contexts
          (profile_id, organization_id, relationship_slug, status, is_primary,
           title, hash_self)
        values
          (uid, v_token_row.organization_id, v_slug, 'active', false,
           v_token_row.proposed_role,
           encode(extensions.digest(uid::text || ':' || v_slug || ':' || v_token_row.organization_id::text, 'sha256'), 'hex'))
        returning id into v_new;
        v_relationship = 'engagement_created';
      else
        v_new := v_existing;
        v_relationship = 'engagement_existing';
      end if;
    elsif v_token_row.invitation_type = 'join_project' then
      select id into v_worker from public.workers where profile_id = uid limit 1;
      if v_worker is null then
        return jsonb_build_object('outcome', 'no_worker_profile');
      end if;
      select id into v_existing from public.project_worker_assignments
       where project_id = v_token_row.project_id and worker_id = v_worker limit 1;
      if v_existing is null then
        insert into public.project_worker_assignments (project_id, worker_id, status)
        values (v_token_row.project_id, v_worker, 'active')
        returning id into v_new;
        v_relationship = 'assignment_created';
      else
        update public.project_worker_assignments
           set status = 'active', ended_at = null
         where id = v_existing;
        v_new := v_existing;
        v_relationship = 'assignment_reactivated';
      end if;
    end if;

    update public.invitations
       set status = 'accepted',
           accepted_at = now(),
           accepted_by_profile_id = uid
     where id = v_token_row.id;

    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (uid, 'accept_invitation_by_id_v1', 'invitations', v_token_row.id,
      jsonb_build_object('invitation_type', v_token_row.invitation_type,
        'relationship', v_relationship, 'relationship_id', v_new,
        'relationship_slug', v_slug));

    return jsonb_build_object(
      'outcome', 'accepted',
      'relationship', v_relationship,
      'relationship_slug', v_slug,
      'invitation_type', v_token_row.invitation_type,
      'organization_id', v_token_row.organization_id,
      'project_id', v_token_row.project_id
    );
  end;
end $function$;
