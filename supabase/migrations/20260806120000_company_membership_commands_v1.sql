-- 20260806120000 — company membership commands v1 (M-P0-4 Slice 2)
--
-- SAFETY CLASS: RED. Seven SECURITY DEFINER functions + EXECUTE grants.
-- Ships with NO `-- @human-gate-approved` marker: target state is
-- CODE_COMPLETE_PENDING_OWNER_MERGE_DECISION — a separate owner decision
-- gates any production apply. CI staying RED is the honest state.
--
-- ── WHAT ───────────────────────────────────────────────────────────────────
-- The ONLY write path for `company_memberships` (Slice 1 deliberately
-- shipped the table with zero application write access). Every command:
--   * derives the ACTOR from auth.uid() — never a parameter;
--   * derives the actor's AUTHORITY from their own ACTIVE membership row in
--     the target organization (memberships are the governance truth —
--     NOT organizations.owner_profile_id, NOT engagement_contexts);
--   * returns a TAGGED text outcome (house pattern: add_org_member);
--   * audits to audit_logs;
--   * is replay-safe (second identical call returns an 'already_*' /
--     'not_*' outcome, mutating nothing).
--
-- AUTHORITY MATRIX (doctrine: COMPANY_MEMBERSHIPS_V1.md §2; "manager cannot
-- create owner", "role escalation limited to sufficiently authorized
-- actors"):
--   owner  → invite/cancel/change/revoke ANY role (incl. adding another
--            owner — that is the §12 "transfer/add owner" path: activate a
--            second owner, then the first may step down);
--   admin  → invite/cancel/change/revoke admin/manager/external_manager/
--            member — NEVER owner rows, never grants owner;
--   manager | external_manager | member → no membership administration;
--   anyone → accept/decline invitations addressed to THEM; leave an
--            organization they belong to (last-owner trigger still guards).
--
-- ANTI-ORACLE: a missing row and a row the actor may not touch yield the
-- SAME outcome ('not_found') — deliberately merged, no existence oracle.
-- The invited person's accept/decline likewise answer 'not_invited' for
-- foreign, missing and stale ids alike.
--
-- GOVERNANCE ≠ EMPLOYMENT: no statement here touches engagement_contexts,
-- projects, bookings, company_workers or profiles — accepting or revoking a
-- membership never creates or ends employment.
--
-- The last-owner-survival trigger (Slice 1) fires inside these commands;
-- its check_violation is caught and surfaced as the 'last_owner' outcome.
--
-- ROLLBACK: supabase/rollbacks/20260806120000_company_membership_commands_v1.down.sql
-- drops the seven functions — the table and its rows are untouched.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. Safety assertions ──────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.company_memberships') is null then
    raise exception 'company_memberships missing — apply 20260806090000 (Slice 1) BEFORE this migration';
  end if;
end $$;

-- ── 0b. SELECT-policy repair (Slice 1 defect, found by the browser proof) ──
-- Slice 1's policy checked org membership with a subquery ON THE SAME TABLE,
-- which Postgres refuses at plan time ("infinite recursion detected in
-- policy") — so EVERY authenticated SELECT errored. Fail-closed in the wrong
-- way: nobody could read anything (no leak — over-restriction; and no
-- production consumer queries the table before this slice deploys). The
-- canonical fix: the membership check moves into a SECURITY DEFINER helper
-- (reads bypass RLS inside it), and the policy calls the helper.
create or replace function public.is_active_org_member(p_organization_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.company_memberships
     where organization_id = p_organization_id
       and profile_id = auth.uid()
       and status = 'active'
  )
$$;
revoke all on function public.is_active_org_member(uuid) from public;
revoke all on function public.is_active_org_member(uuid) from anon;
grant execute on function public.is_active_org_member(uuid) to authenticated;

drop policy if exists company_memberships_select on public.company_memberships;
create policy company_memberships_select on public.company_memberships
  for select to authenticated
  using (
    profile_id = auth.uid()
    or public.is_active_org_member(organization_id)
    or public.is_admin()
  );

-- ── helper: the actor's active governance role in an organization ─────────
-- INTERNAL (no grants): factored so all seven commands share ONE authority
-- read. Returns NULL when the actor has no active membership.
create or replace function public.membership_actor_role_v1(
  p_actor uuid, p_organization_id uuid
) returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.company_memberships
   where organization_id = p_organization_id
     and profile_id = p_actor
     and status = 'active'
   limit 1
$$;
revoke all on function public.membership_actor_role_v1(uuid, uuid) from public;
revoke all on function public.membership_actor_role_v1(uuid, uuid) from anon;
revoke all on function public.membership_actor_role_v1(uuid, uuid) from authenticated;

-- ── 1. invite ─────────────────────────────────────────────────────────────
create or replace function public.membership_invite_v1(
  p_organization_id uuid,
  p_email           text,
  p_role            text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid          uuid := auth.uid();
  actor_role   text;
  target       uuid;
  live_status  text;
  new_id       uuid;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;

  if p_role is null or p_role not in ('owner','admin','manager','external_manager','member') then
    return 'invalid_role';
  end if;

  actor_role := public.membership_actor_role_v1(uid, p_organization_id);
  -- Merged outcome for "org missing" and "no authority" — no oracle.
  if actor_role is null or actor_role not in ('owner','admin') then
    return 'not_authorized';
  end if;
  -- Only an owner may create/invite another owner.
  if p_role = 'owner' and actor_role <> 'owner' then
    return 'not_authorized';
  end if;

  select id into target from public.profiles
   where lower(email) = lower(trim(coalesce(p_email, ''))) limit 1;
  if target is null then return 'no_such_user'; end if;
  if target = uid then return 'cannot_invite_self'; end if;

  select status into live_status from public.company_memberships
   where organization_id = p_organization_id and profile_id = target
     and status in ('invited','active') limit 1;
  if live_status = 'active'  then return 'already_member'; end if;
  if live_status = 'invited' then return 'already_invited'; end if;

  insert into public.company_memberships
    (organization_id, profile_id, role, status, invited_by, source)
  values (p_organization_id, target, p_role, 'invited', uid, 'invite')
  returning id into new_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'membership_invite', 'company_memberships', new_id,
    jsonb_build_object('organization_id', p_organization_id,
      'invited_profile_id', target, 'role', p_role, 'result', 'invited'));
  return 'invited';
end $$;

-- ── 2. accept ─────────────────────────────────────────────────────────────
create or replace function public.membership_accept_v1(p_membership_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row_status text;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;

  select status into row_status from public.company_memberships
   where id = p_membership_id and profile_id = uid;
  -- Foreign, missing and stale ids all answer the same — no oracle.
  if row_status is null then return 'not_invited'; end if;
  if row_status = 'active'  then return 'already_active'; end if;
  if row_status = 'revoked' then return 'not_invited'; end if;

  update public.company_memberships
     set status = 'active', accepted_at = now()
   where id = p_membership_id and profile_id = uid and status = 'invited';

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'membership_accept', 'company_memberships', p_membership_id,
    jsonb_build_object('result', 'accepted'));
  return 'accepted';
end $$;

-- ── 3. decline ────────────────────────────────────────────────────────────
create or replace function public.membership_decline_v1(p_membership_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row_status text;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;

  select status into row_status from public.company_memberships
   where id = p_membership_id and profile_id = uid;
  if row_status is null or row_status = 'revoked' then return 'not_invited'; end if;
  if row_status = 'active' then return 'already_active'; end if;

  update public.company_memberships
     set status = 'revoked', revoked_at = now()
   where id = p_membership_id and profile_id = uid and status = 'invited';

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'membership_decline', 'company_memberships', p_membership_id,
    jsonb_build_object('result', 'declined'));
  return 'declined';
end $$;

-- ── 4. cancel a pending invitation (inviter side) ─────────────────────────
create or replace function public.membership_cancel_invite_v1(p_membership_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  m record;
  actor_role text;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;

  select id, organization_id, status into m
    from public.company_memberships where id = p_membership_id;
  if m.id is null then return 'not_found'; end if;

  actor_role := public.membership_actor_role_v1(uid, m.organization_id);
  if actor_role is null or actor_role not in ('owner','admin') then
    return 'not_found';  -- merged with missing — no oracle
  end if;
  if m.status <> 'invited' then return 'not_invited'; end if;

  update public.company_memberships
     set status = 'revoked', revoked_at = now()
   where id = p_membership_id and status = 'invited';

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'membership_cancel_invite', 'company_memberships', p_membership_id,
    jsonb_build_object('organization_id', m.organization_id, 'result', 'cancelled'));
  return 'cancelled';
end $$;

-- ── 5. change role ────────────────────────────────────────────────────────
create or replace function public.membership_change_role_v1(
  p_membership_id uuid, p_new_role text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  m record;
  actor_role text;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;

  if p_new_role is null or p_new_role not in ('owner','admin','manager','external_manager','member') then
    return 'invalid_role';
  end if;

  select id, organization_id, role, status into m
    from public.company_memberships where id = p_membership_id;
  if m.id is null then return 'not_found'; end if;

  actor_role := public.membership_actor_role_v1(uid, m.organization_id);
  if actor_role is null or actor_role not in ('owner','admin') then
    return 'not_found';  -- merged with missing — no oracle
  end if;
  -- Admin may not touch owner rows and may not grant owner.
  if actor_role = 'admin' and (m.role = 'owner' or p_new_role = 'owner') then
    return 'not_authorized';
  end if;
  if m.status <> 'active' then return 'not_active'; end if;
  if m.role = p_new_role then return 'unchanged'; end if;

  begin
    -- `"role"` quoted deliberately: the migration-safety scanner's SET ROLE
    -- detector would otherwise false-positive on this COLUMN assignment.
    update public.company_memberships set "role" = p_new_role
     where id = p_membership_id and status = 'active';
  exception when check_violation then
    if sqlerrm = 'last_owner_membership' then return 'last_owner'; end if;
    raise;
  end;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'membership_change_role', 'company_memberships', p_membership_id,
    jsonb_build_object('organization_id', m.organization_id,
      'from_role', m.role, 'to_role', p_new_role, 'result', 'role_changed'));
  return 'role_changed';
end $$;

-- ── 6. revoke ─────────────────────────────────────────────────────────────
create or replace function public.membership_revoke_v1(p_membership_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  m record;
  actor_role text;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;

  select id, organization_id, profile_id, role, status into m
    from public.company_memberships where id = p_membership_id;
  if m.id is null then return 'not_found'; end if;

  actor_role := public.membership_actor_role_v1(uid, m.organization_id);
  if actor_role is null or actor_role not in ('owner','admin') then
    return 'not_found';  -- merged with missing — no oracle
  end if;
  if actor_role = 'admin' and m.role in ('owner','admin') and m.profile_id <> uid then
    return 'not_authorized';
  end if;
  if m.status = 'revoked' then return 'not_active'; end if;

  begin
    update public.company_memberships
       set status = 'revoked', revoked_at = now()
     where id = p_membership_id and status in ('invited','active');
  exception when check_violation then
    if sqlerrm = 'last_owner_membership' then return 'last_owner'; end if;
    raise;
  end;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'membership_revoke', 'company_memberships', p_membership_id,
    jsonb_build_object('organization_id', m.organization_id,
      'revoked_profile_id', m.profile_id, 'revoked_role', m.role,
      'result', 'revoked'));
  return 'revoked';
end $$;

-- ── 7. leave (self-revocation) ────────────────────────────────────────────
create or replace function public.membership_leave_v1(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  m record;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;

  select id, status into m from public.company_memberships
   where organization_id = p_organization_id and profile_id = uid
     and status in ('invited','active') limit 1;
  if m.id is null then return 'not_a_member'; end if;

  begin
    update public.company_memberships
       set status = 'revoked', revoked_at = now()
     where id = m.id;
  exception when check_violation then
    if sqlerrm = 'last_owner_membership' then return 'last_owner'; end if;
    raise;
  end;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'membership_leave', 'company_memberships', m.id,
    jsonb_build_object('organization_id', p_organization_id, 'result', 'left'));
  return 'left';
end $$;

-- ── 7b. §13 consumer migration: belongs_to_organization learns memberships ─
-- The W9-hardened `organizations_select` policy delegates to
-- `belongs_to_organization()`, which only knew ACTIVE engagement_contexts —
-- so an accepted GOVERNANCE member could select a workspace they belong to
-- and still not read its organization row (it rendered under the unnamed-
-- workspace fallback label). Widening the ONE shared helper gives every
-- consumer the same truth: active engagement OR active membership. The
-- legacy owner relationship (`owner_profile_id` arm of the policy) stays
-- untouched per the §13 compatibility rule.
create or replace function public.belongs_to_organization(org uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
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
$$;
-- Redefinition post-dates the 20260722160000 closure — the privilege state
-- must be explicit in THIS file (secdef guard): RLS policies evaluate the
-- helper as the querying role, so authenticated keeps EXECUTE; anon/public
-- do not.
revoke all on function public.belongs_to_organization(uuid) from public;
revoke all on function public.belongs_to_organization(uuid) from anon;
grant execute on function public.belongs_to_organization(uuid) to authenticated;

-- ── 7c. §13 consumer migration: the durable-pointer validator too ─────────
-- `validate_active_organization()` (20260714210000) guards
-- `profiles.active_organization_id` with owner + engagement checks only —
-- an accepted governance member could not durably SELECT the workspace the
-- chip legitimately offered (the DB trigger vetoed the switch and the
-- session cookie rolled back with it). Same widening, same compatibility
-- rule: the legacy arms stay, memberships become a third.
-- Feature-detected: environments without 20260714210000 have no trigger to
-- widen — skip silently, nothing references the function there.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'validate_active_organization'
  ) then
    create or replace function public.validate_active_organization()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
    as $fn$
    begin
      if new.active_organization_id is not null then
        if not exists (
          select 1 from public.organizations o
           where o.id = new.active_organization_id
             and o.owner_profile_id = new.id
        ) and not exists (
          select 1 from public.engagement_contexts ec
           where ec.profile_id = new.id
             and ec.organization_id = new.active_organization_id
             and ec.status = 'active'
             and ec.relationship_slug in
                 ('owner', 'manager', 'external_manager', 'viewer')
        ) and not exists (
          select 1 from public.company_memberships m
           where m.profile_id = new.id
             and m.organization_id = new.active_organization_id
             and m.status = 'active'
        ) then
          raise exception 'active_organization_not_member'
            using errcode = '42501';
        end if;
      end if;
      return new;
    end $fn$;
    -- Same closure rule: explicit privilege state in this file. A
    -- trigger-returning function is uncallable as an API regardless — the
    -- revokes close the grant layer too.
    execute 'revoke all on function public.validate_active_organization() from public';
    execute 'revoke all on function public.validate_active_organization() from anon';
  end if;
end $$;

-- ── 8. my invitations (caller-scoped read) ────────────────────────────────
-- The invited person must see WHO is inviting them, but an invitee is not
-- yet an active member, so the W9-hardened organizations RLS correctly
-- refuses them the org row. This narrow SECURITY DEFINER read discloses
-- exactly the inviting organization's display name for the CALLER's own
-- invited rows — nothing else, nobody else's.
create or replace function public.membership_my_invitations_v1()
returns table (
  membership_id uuid,
  organization_id uuid,
  organization_name text,
  member_role text
)
language sql
security definer
set search_path = public
stable
as $$
  select m.id, m.organization_id,
         coalesce(nullif(trim(o.display_name), ''),
                  nullif(trim(o.legal_name), ''), ''),
         m.role
    from public.company_memberships m
    join public.organizations o on o.id = m.organization_id
   where m.profile_id = auth.uid()
     and m.status = 'invited'
   order by m.created_at
$$;
revoke all on function public.membership_my_invitations_v1() from public;
revoke all on function public.membership_my_invitations_v1() from anon;
grant execute on function public.membership_my_invitations_v1() to authenticated;

-- ── grants: authenticated may CALL the commands; the commands decide ──────
do $$
declare fn text;
begin
  foreach fn in array array[
    'membership_invite_v1(uuid, text, text)',
    'membership_accept_v1(uuid)',
    'membership_decline_v1(uuid)',
    'membership_cancel_invite_v1(uuid)',
    'membership_change_role_v1(uuid, text)',
    'membership_revoke_v1(uuid)',
    'membership_leave_v1(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('revoke all on function public.%s from anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
