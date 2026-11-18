-- @human-gate-approved
-- ============================================================================
-- 20261003151000_email_verified_boundary_v1
--
-- WORKER_REGISTRATION_FRICTION_REMOVAL — the verified-email boundary.
--
-- WHY. The owner wants registration with ZERO email friction: sign up, get a
-- usable session, enter. That needs Supabase "Confirm email" OFF
-- (mailer_autoconfirm), and with it OFF GoTrue stamps
-- auth.users.email_confirmed_at AT SIGNUP and issues a JWT whose `email`
-- claim is whatever the registrant typed. Many database paths treat that JWT
-- email (or profiles.email, which enforce_profile_email_binding lets a session
-- set to its own JWT email) as PROOF OF MAILBOX OWNERSHIP:
--   * claim/accept/decline/enumerate resources addressed to an email
--       accept_invitation_by_id_v1/v2, accept_company_worker_invitation,
--       accept_agency_worker_invitation, accept_agency_client_connection_v1,
--       decline_agency_client_connection_v1, list_invitations_for_me_v1,
--       RLS select on company_worker_invitations / agency_worker_invitations /
--       agency_client_connections
--   * resolve "the person behind this email" on the inviter side
--       membership_invite_v1, assign_training_v1, create_performance_review_v1,
--       delegate_workflow_step_v1, create_management_decision_v1,
--       update_management_decision_v1
--   * money-adjacent: lmc_admin_grant_v1, lmc_grant_promotional_v1 (both keyed
--     on auth.users.email_confirmed_at)
-- Flipping the setting WITHOUT this migration lets anyone register with a
-- victim's address and claim the victim's pending invitations/memberships.
--
-- WHAT. A SEPARATE verified-email state, set ONLY by a real proof of mailbox
-- control, never inferred from auth.users.email_confirmed_at, the JWT email or
-- profiles.email:
--   email_verifications_v1        append-only evidence (profile, email, method)
--   email_verification_requests_v1 one pending proof request per profile
--   email_verification_policy_v1  the CUTOVER instant (singleton)
--   email_is_verified_v1(uid, email)         internal predicate (not callable)
--   session_email_verified_v1()              the session's own verified state
--   profile_id_by_verified_email_v1(email)   inviter-side resolver
--   my_email_verification_v1()               UI read
--   request_email_verification_v1()          step 1 of progressive proof
--   confirm_my_email_v1()                    step 2 (proof = a session minted
--                                            from the mailed one-time token)
--   backfill_verified_emails_v1()            idempotent, owner/service only
-- and every path above is gated on it, FAIL-CLOSED.
--
-- CUTOVER RULE (documented, owner-approved shape): accounts whose
-- email_confirmed_at is <= the cutover and social identities that exist at the
-- cutover count as verified (method legacy_confirmed / legacy_autoconfirmed /
-- social_provider). Anything created after is UNVERIFIED until the proof flow
-- runs. A social identity created later counts only for google / linkedin_oidc
-- with an explicit email_verified=true AND only when it is the user's FIRST
-- identity (a social identity LINKED onto a pre-existing password identity does
-- not prove anything: that is the pre-hijack shape). Facebook asserts no
-- verified flag of its own -> never provider-verified after the cutover.
--
-- TOKEN-PROVED PATHS ARE UNTOUCHED: accept_invitation_v1/v2 and
-- get_invitation_preview_v1/v2 are proved by possession of a mailed secret
-- (sha256 token custody) and consult no email; login, recovery and onboarding
-- never consult this state.
--
-- ORDER (see docs/human-gates/worker-registration-friction-gate.md):
--   1. apply THIS migration (backfill runs inside it)
--   2. deploy app code
--   3. ONLY THEN flip Supabase Auth "Confirm email" OFF.
-- Rollback: supabase/rollbacks/20261003151000_email_verified_boundary_v1.down.sql
-- ============================================================================

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

-- ---------------------------------------------------------------------------
-- 3. Progressive proof (UI-facing)
-- ---------------------------------------------------------------------------
create or replace function public.my_email_verification_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select lower(nullif(trim(u.email), '')) into v_email from auth.users u where u.id = v_uid;
  return jsonb_build_object(
    'email', v_email,
    'verified', coalesce(public.email_is_verified_v1(v_uid, v_email), false));
end $$;
revoke all on function public.my_email_verification_v1() from public, anon;
grant execute on function public.my_email_verification_v1() to authenticated;

-- Step 1. Records WHICH address the person is about to prove (the LIVE address
-- on auth.users, never a client-supplied one). The caller then asks GoTrue to
-- mail a one-time link to that address.
create or replace function public.request_email_verification_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select lower(nullif(trim(u.email), '')) into v_email from auth.users u where u.id = v_uid;
  if v_email is null then
    return jsonb_build_object('outcome', 'no_email');
  end if;
  if public.email_is_verified_v1(v_uid, v_email) then
    return jsonb_build_object('outcome', 'already_verified', 'email', v_email);
  end if;
  insert into public.email_verification_requests_v1 (profile_id, email, requested_at)
  values (v_uid, v_email, now())
  on conflict (profile_id) do update
    set email = excluded.email, requested_at = excluded.requested_at;
  return jsonb_build_object('outcome', 'requested', 'email', v_email);
end $$;
revoke all on function public.request_email_verification_v1() from public, anon;
grant execute on function public.request_email_verification_v1() to authenticated;

-- Step 2. THE PROOF. The session must have been MINTED from a mailed one-time
-- token (GoTrue records that as an `otp`/`magiclink` entry in the JWT `amr`
-- claim, signed by GoTrue — a client cannot forge it) AFTER the request in
-- step 1, and the address the token was mailed to must still be the live
-- address (so "prove address A, then change the account to victim address V"
-- cannot transfer the proof). A password session, an autoconfirmed signup and
-- a social session all FAIL here by construction.
create or replace function public.confirm_my_email_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_jwt_email text := lower(nullif(trim(coalesce(auth.jwt() ->> 'email', '')), ''));
  v_live text;
  v_req public.email_verification_requests_v1%rowtype;
  v_amr jsonb := auth.jwt() -> 'amr';
  v_proof_at timestamptz;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select lower(nullif(trim(u.email), '')) into v_live from auth.users u where u.id = v_uid;
  if v_live is null or v_jwt_email is null or v_live <> v_jwt_email then
    return jsonb_build_object('outcome', 'email_changed');
  end if;
  if public.email_is_verified_v1(v_uid, v_live) then
    return jsonb_build_object('outcome', 'already_verified');
  end if;
  select * into v_req from public.email_verification_requests_v1 where profile_id = v_uid;
  if not found or v_req.requested_at < now() - interval '1 hour' then
    return jsonb_build_object('outcome', 'no_request');
  end if;
  if v_req.email <> v_live then
    return jsonb_build_object('outcome', 'email_changed');
  end if;
  if v_amr is null or jsonb_typeof(v_amr) <> 'array' then
    return jsonb_build_object('outcome', 'no_proof');
  end if;
  select max(to_timestamp((e ->> 'timestamp')::double precision)) into v_proof_at
    from jsonb_array_elements(v_amr) e
   where jsonb_typeof(e) = 'object'
     and (e ->> 'method') in ('otp', 'magiclink')
     and (e ->> 'timestamp') ~ '^[0-9]+$';
  if v_proof_at is null
     or v_proof_at < date_trunc('second', v_req.requested_at)
     or v_proof_at < now() - interval '1 hour' then
    return jsonb_build_object('outcome', 'no_proof');
  end if;
  insert into public.email_verifications_v1 (profile_id, email, method)
  values (v_uid, v_live, 'mailbox_proof')
  on conflict (profile_id, email) do nothing;
  delete from public.email_verification_requests_v1 where profile_id = v_uid;
  insert into public.audit_logs (actor_id, action, entity, payload)
  values (v_uid, 'email_verified', 'email_verifications_v1',
          jsonb_build_object('method', 'mailbox_proof'));
  return jsonb_build_object('outcome', 'verified', 'email', v_live);
end $$;
revoke all on function public.confirm_my_email_v1() from public, anon;
grant execute on function public.confirm_my_email_v1() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Backfill (idempotent; owner / service_role only)
-- ---------------------------------------------------------------------------
create or replace function public.backfill_verified_emails_v1()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cut timestamptz;
  v_n integer := 0;
  v_m integer;
begin
  select cutover_at into v_cut from public.email_verification_policy_v1 where singleton;
  if v_cut is null then raise exception 'email_verification_policy_v1 has no cutover'; end if;

  -- 1. Confirmed accounts as of the cutover. The label records HOW the
  --    confirmation likely happened, so the owner can tighten later:
  --    confirmed within 10 s of creation with no social identity = autoconfirm
  --    era (Confirm email was OFF before 2026-09-02).
  insert into public.email_verifications_v1 (profile_id, email, method, verified_at)
  select u.id, lower(trim(u.email)),
         case
           when exists (select 1 from auth.identities i
                         where i.user_id = u.id and i.provider <> 'email') then 'legacy_confirmed'
           when u.email_confirmed_at - u.created_at < interval '10 seconds' then 'legacy_autoconfirmed'
           else 'legacy_confirmed'
         end,
         u.email_confirmed_at
    from auth.users u
    join public.profiles p on p.id = u.id
   where nullif(trim(coalesce(u.email, '')), '') is not null
     and u.email_confirmed_at is not null
     and u.email_confirmed_at <= v_cut
  on conflict (profile_id, email) do nothing;
  get diagnostics v_m = row_count; v_n := v_n + v_m;

  -- 2. Provider-asserted identities that exist at the cutover.
  insert into public.email_verifications_v1 (profile_id, email, method, verified_at)
  select i.user_id, lower(trim(i.identity_data ->> 'email')), 'social_provider', i.created_at
    from auth.identities i
    join public.profiles p on p.id = i.user_id
   where i.provider in ('google', 'linkedin_oidc')
     and (i.identity_data ->> 'email_verified') = 'true'
     and nullif(trim(coalesce(i.identity_data ->> 'email', '')), '') is not null
     and i.created_at <= v_cut
  on conflict (profile_id, email) do nothing;
  get diagnostics v_m = row_count; v_n := v_n + v_m;

  return v_n;
end $$;
revoke all on function public.backfill_verified_emails_v1() from public, anon, authenticated;

select public.backfill_verified_emails_v1();

-- ---------------------------------------------------------------------------
-- 5. Email-ASSERTED claim paths: unverified session -> 'email_unverified'
--    BEFORE any lookup (no oracle on whether an invitation exists).
-- ---------------------------------------------------------------------------
create or replace function public.accept_agency_client_connection_v1(p_connection_id uuid, p_client_company_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid    uuid := auth.uid();
  v_email  text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_agency uuid;
  v_status text;
  v_exp    timestamptz;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  -- The caller must OWN the client company they are joining as.
  if not public.owns_company(p_client_company_id) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  -- The invite is addressed to an EMAIL: only a VERIFIED mailbox may claim it.
  if not public.session_email_verified_v1() then return 'email_unverified'; end if;

  select agency_company_id, status, expires_at
    into v_agency, v_status, v_exp
    from public.agency_client_connections
   where id = p_connection_id
     and lower(invited_email) = v_email
   for update;
  if not found then return 'not_found'; end if;
  if v_agency = p_client_company_id then raise exception 'same_company' using errcode = '22023'; end if;
  if v_status = 'active' then return 'already_active'; end if;
  if v_status <> 'pending' then return 'not_pending'; end if;
  if v_exp < now() then
    update public.agency_client_connections set status = 'declined' where id = p_connection_id;
    return 'expired';
  end if;

  update public.agency_client_connections
     set status = 'active', client_company_id = p_client_company_id,
         accepted_by = v_uid, accepted_at = now()
   where id = p_connection_id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (v_uid, 'agency_client_connection_accepted', 'agency_client_connections',
          p_connection_id, jsonb_build_object('client_company_id', p_client_company_id));
  return 'accepted';
end;
$function$;

create or replace function public.decline_agency_client_connection_v1(p_connection_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_upd   int;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if not public.session_email_verified_v1() then return 'email_unverified'; end if;
  update public.agency_client_connections
     set status = 'declined', revoked_by = v_uid, revoked_at = now()
   where id = p_connection_id
     and lower(invited_email) = v_email
     and status = 'pending';
  get diagnostics v_upd = row_count;
  return case when v_upd > 0 then 'declined' else 'not_found' end;
end;
$function$;

create or replace function public.accept_agency_worker_invitation(p_agency_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  uid      uuid := auth.uid();
  v_email  text := lower(nullif(trim(coalesce(auth.jwt() ->> 'email', '')), ''));
  v_worker uuid;
  v_inv    uuid;
  v_linked boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select w.id into v_worker
  from public.workers w
  where w.profile_id = uid;
  if v_worker is null then
    return 'no_worker_profile';
  end if;

  -- Addressed to an EMAIL: verified mailbox only (before any lookup).
  if not public.session_email_verified_v1() then
    return 'email_unverified';
  end if;
  if v_email is null then
    return 'no_invitation';
  end if;
  select i.id into v_inv
  from public.agency_worker_invitations i
  where i.agency_id = p_agency_id
    and lower(i.invited_email) = v_email
    and i.status = 'pending'
  limit 1;
  if v_inv is null then
    return 'no_invitation';
  end if;

  select exists (
    select 1 from public.agency_workers aw
    where aw.agency_id = p_agency_id and aw.worker_id = v_worker
  ) into v_linked;
  if v_linked then
    update public.agency_worker_invitations
       set status = 'accepted', accepted_at = now()
     where id = v_inv;
    return 'already_linked';
  end if;

  insert into public.agency_workers (agency_id, worker_id, status)
  values (p_agency_id, v_worker, 'active')
  on conflict (agency_id, worker_id) do nothing;

  update public.agency_worker_invitations
     set status = 'accepted', accepted_at = now()
   where id = v_inv;

  insert into public.audit_logs (actor_id, action, entity, payload)
  values (uid, 'accept_agency_worker_invitation', 'agency_workers',
    jsonb_build_object(
      'agency_id', p_agency_id, 'worker_id', v_worker,
      'invitation_id', v_inv, 'result', 'linked'));

  return 'linked';
end $function$;

create or replace function public.accept_company_worker_invitation(p_company_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  uid      uuid := auth.uid();
  v_email  text := lower(nullif(trim(coalesce(auth.jwt() ->> 'email', '')), ''));
  v_worker uuid;
  v_inv    uuid;
  v_linked boolean;
  v_org    uuid;
  v_ctx    uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select w.id into v_worker
  from public.workers w
  where w.profile_id = uid;
  if v_worker is null then
    return 'no_worker_profile';
  end if;

  -- A PENDING invitation addressed to the SESSION's VERIFIED email must exist.
  -- profiles.email is never consulted: it is user-writable history, not identity.
  if not public.session_email_verified_v1() then
    return 'email_unverified';
  end if;
  if v_email is null then
    return 'no_invitation';
  end if;
  select i.id into v_inv
  from public.company_worker_invitations i
  where i.company_id = p_company_id
    and lower(i.invited_email) = v_email
    and i.status = 'pending'
  limit 1;
  if v_inv is null then
    return 'no_invitation';
  end if;

  select exists (
    select 1 from public.company_workers cw
    where cw.company_id = p_company_id and cw.worker_id = v_worker
  ) into v_linked;

  if not v_linked then
    insert into public.company_workers (company_id, worker_id, status)
    values (p_company_id, v_worker, 'active')
    on conflict (company_id, worker_id) do nothing;
  end if;

  update public.company_worker_invitations
     set status = 'accepted', accepted_at = now()
   where id = v_inv;

  -- Bind the accepted worker into the canonical organization graph so
  -- `belongs_to_organization` can see them (a relationship, never a governance
  -- seat: company_memberships is not touched).
  select o.id into v_org
  from public.organizations o
  where o.legacy_company_id = p_company_id
  limit 1;

  if v_org is not null then
    select ec.id into v_ctx
    from public.engagement_contexts ec
    where ec.profile_id = uid
      and ec.organization_id = v_org
      and ec.relationship_slug = 'employee'
      and ec.status = 'active'
    limit 1;

    if v_ctx is null then
      insert into public.engagement_contexts
        (profile_id, organization_id, relationship_slug, status, is_primary, hash_self)
      values
        (uid, v_org, 'employee', 'active', false,
         encode(extensions.digest(uid::text || ':employee:' || v_org::text, 'sha256'), 'hex'))
      returning id into v_ctx;

      insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
      values (uid, 'accept_company_worker_invitation', 'engagement_contexts', v_ctx,
        jsonb_build_object('organization_id', v_org, 'worker_id', v_worker,
          'company_id', p_company_id, 'relationship_slug', 'employee',
          'result', 'org_bound'));
    end if;
  end if;

  if v_linked then
    return 'already_linked';
  end if;

  insert into public.audit_logs (actor_id, action, entity, payload)
  values (uid, 'accept_company_worker_invitation', 'company_workers',
    jsonb_build_object(
      'company_id', p_company_id, 'worker_id', v_worker,
      'invitation_id', v_inv, 'result', 'linked'));

  return 'linked';
end $function$;

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

create or replace function public.list_invitations_for_me_v1()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_items jsonb;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_email = '' then
    return jsonb_build_object('items', '[]'::jsonb);
  end if;
  -- ENUMERATING what is addressed to an email is a claim on that mailbox too:
  -- an unverified session sees nothing (no organisation name, no inviter, no
  -- personal message) and is told WHY so the UI can offer the proof.
  if not public.session_email_verified_v1() then
    return jsonb_build_object('items', '[]'::jsonb, 'email_unverified', true);
  end if;
  select coalesce(jsonb_agg(item order by item ->> 'created_at' desc), '[]'::jsonb)
    into v_items
    from (
      select jsonb_build_object(
        'id', i.id,
        'invitation_type', i.invitation_type,
        'personal_message', i.personal_message,
        'proposed_role', i.proposed_role,
        'created_at', i.created_at,
        'expires_at', i.expires_at,
        'relationship_slug', i.relationship_slug,
        'organization_name', (select coalesce(o.display_name, o.legal_name)
                                from public.organizations o
                               where o.id = i.organization_id),
        'project_title', (select p.title from public.projects p
                           where p.id = i.project_id),
        'inviter_name', (select pr.full_name from public.profiles pr
                          where pr.id = i.inviter_profile_id)
      ) as item
      from public.invitations i
      where lower(i.invited_email) = v_email
        and i.status = 'pending'
        and i.expires_at > now()
      order by i.created_at desc
      limit 50
    ) sub;
  return jsonb_build_object('items', v_items);
end $function$;

-- ACLs re-stated (CREATE OR REPLACE keeps them; stating them keeps the secdef
-- reproducibility guard and a fresh `supabase db reset` honest): authenticated
-- only, never anon / PUBLIC.
revoke all on function public.accept_agency_client_connection_v1(uuid, uuid) from public, anon;
revoke all on function public.decline_agency_client_connection_v1(uuid) from public, anon;
revoke all on function public.accept_agency_worker_invitation(uuid) from public, anon;
revoke all on function public.accept_company_worker_invitation(uuid) from public, anon;
revoke all on function public.accept_invitation_by_id_v2(uuid) from public, anon;
revoke all on function public.accept_invitation_by_id_v1(uuid) from public, anon;
revoke all on function public.list_invitations_for_me_v1() from public, anon;
grant execute on function public.accept_agency_client_connection_v1(uuid, uuid) to authenticated;
grant execute on function public.decline_agency_client_connection_v1(uuid) to authenticated;
grant execute on function public.accept_agency_worker_invitation(uuid) to authenticated;
grant execute on function public.accept_company_worker_invitation(uuid) to authenticated;
grant execute on function public.accept_invitation_by_id_v2(uuid) to authenticated;
grant execute on function public.accept_invitation_by_id_v1(uuid) to authenticated;
grant execute on function public.list_invitations_for_me_v1() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. RLS select policies on the legacy invitation tables: the email branch
--    now additionally requires a VERIFIED mailbox. Owner / admin / authority
--    branches are unchanged.
-- ---------------------------------------------------------------------------
alter policy agency_client_connections_select on public.agency_client_connections
  using (
    owns_company(agency_company_id)
    or ((client_company_id is not null) and owns_company(client_company_id))
    or (lower(invited_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text))
        and public.session_email_verified_v1())
    or is_admin()
  );

alter policy agency_worker_invitations_select on public.agency_worker_invitations
  using (
    owns_agency(agency_id)
    or (lower(invited_email) = lower(nullif((auth.jwt() ->> 'email'::text), ''::text))
        and public.session_email_verified_v1())
    or is_admin()
  );

alter policy company_worker_invitations_select on public.company_worker_invitations
  using (
    owns_company(company_id)
    or (lower(invited_email) = lower(nullif((auth.jwt() ->> 'email'::text), ''::text))
        and public.session_email_verified_v1())
    or is_admin()
    or invitation_company_authority_v1(company_id)
  );

-- ---------------------------------------------------------------------------
-- 7. Inviter-side resolution of "the person behind this email" and the two
--    LMC paths: patched IN PLACE from the live definition, fail-closed (the
--    patch raises unless it matches exactly the expected number of times, and
--    is a no-op when already applied).
-- ---------------------------------------------------------------------------
create or replace function pg_temp.patch_fn(
  p_sig regprocedure, p_pattern text, p_repl text, p_expected int, p_marker text)
returns void language plpgsql as $$
declare d text; n int;
begin
  d := pg_get_functiondef(p_sig);
  if position(p_marker in d) > 0 then return; end if;
  n := (select count(*) from regexp_matches(d, p_pattern, 'g'));
  if n <> p_expected then
    raise exception 'patch_fn %: expected % match(es), found % — refusing to guess', p_sig, p_expected, n;
  end if;
  execute regexp_replace(d, p_pattern, p_repl, 'g');
end $$;

select pg_temp.patch_fn('public.assign_training_v1(text,text,text)'::regprocedure,
  'from\s+public\.profiles\s+p\s+where\s+lower\(p\.email\)\s*=\s*lower\(trim\((\w+)\)\)\s+limit\s+1',
  'from public.profiles p where p.id = public.profile_id_by_verified_email_v1(\1) limit 1',
  1, 'profile_id_by_verified_email_v1');
select pg_temp.patch_fn('public.create_management_decision_v1(text,text,text,text,text)'::regprocedure,
  'from\s+public\.profiles\s+p\s+where\s+lower\(p\.email\)\s*=\s*lower\(trim\((\w+)\)\)\s+limit\s+1',
  'from public.profiles p where p.id = public.profile_id_by_verified_email_v1(\1) limit 1',
  1, 'profile_id_by_verified_email_v1');
select pg_temp.patch_fn('public.update_management_decision_v1(text,text,text,text,text)'::regprocedure,
  'from\s+public\.profiles\s+p\s+where\s+lower\(p\.email\)\s*=\s*lower\(trim\((\w+)\)\)\s+limit\s+1',
  'from public.profiles p where p.id = public.profile_id_by_verified_email_v1(\1) limit 1',
  1, 'profile_id_by_verified_email_v1');
select pg_temp.patch_fn('public.create_performance_review_v1(text,text,text)'::regprocedure,
  'from\s+public\.profiles\s+p\s+where\s+lower\(p\.email\)\s*=\s*lower\(trim\((\w+)\)\)\s+limit\s+1',
  'from public.profiles p where p.id = public.profile_id_by_verified_email_v1(\1) limit 1',
  2, 'profile_id_by_verified_email_v1');
select pg_temp.patch_fn('public.delegate_workflow_step_v1(text,text,text)'::regprocedure,
  'from\s+public\.profiles\s+p\s+where\s+lower\(p\.email\)\s*=\s*lower\(trim\((\w+)\)\)\s+limit\s+1',
  'from public.profiles p where p.id = public.profile_id_by_verified_email_v1(\1) limit 1',
  1, 'profile_id_by_verified_email_v1');
select pg_temp.patch_fn('public.membership_invite_v1(uuid,text,text)'::regprocedure,
  'from\s+public\.profiles\s+where\s+lower\(email\)\s*=\s*lower\(trim\(coalesce\(p_email,\s*''''\)\)\)\s+limit\s+1',
  'from public.profiles where id = public.profile_id_by_verified_email_v1(p_email) limit 1',
  1, 'profile_id_by_verified_email_v1');
select pg_temp.patch_fn(
  'public.lmc_admin_grant_v1(text,bigint,text,text,timestamp with time zone,text)'::regprocedure,
  'u\.email_confirmed_at is not null',
  'public.email_is_verified_v1(u.id, u.email)',
  1, 'email_is_verified_v1');
select pg_temp.patch_fn(
  'public.lmc_grant_promotional_v1(text,uuid,text,text)'::regprocedure,
  'u\.email_confirmed_at is not null',
  'public.email_is_verified_v1(u.id, u.email)',
  1, 'email_is_verified_v1');
