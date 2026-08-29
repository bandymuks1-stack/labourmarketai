-- @human-gate-approved — TIER: owner-gated (CREATE TRIGGER on public.profiles,
--   SECURITY DEFINER recreate ×2, DROP/CREATE POLICY ×2). The marker is the
--   doctrine ACKNOWLEDGEMENT that this file is RED.
--   OWNER APPROVAL: RECORDED 2026-08-29 (PR #1338). Verbatim scope, because
--   an approval that is remembered loosely is an approval that grows:
--     "#1338 — APPROVED. Approved security invariant: a user-editable profile
--      attribute must never be authoritative identity for organization
--      membership or another actor-sensitive authorization decision. Identity
--      authority must come from a verified session/credential/authentication
--      authority. Preserve: invitations to already registered users;
--      invitations to not-yet-registered users; eventual claim by the
--      authenticated owner of the invited email; pending/unclaimed identity
--      compatibility; future human and AI actor architecture. Do not turn
--      profiles.email into a new independent identity system. APPROVAL DOES
--      NOT AUTHORIZE CAPABILITY REDUCTION."
--   Reviewed HEAD 7e5daafb (the tree the owner approved), rebased onto main
--   32ecf124 with the executable SQL byte-identical; this header block is the
--   only change after approval. Full record:
--   docs/human-gates/profile-email-identity-binding-gate.md
-- ═══════════════════════════════════════════════════════════════════════════
-- PROFILE EMAIL IDENTITY BINDING v1
-- a user-editable profile field stops being an account identity
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CLASS: RED. Auth-core adjacent: it changes how the platform decides WHO an
-- invitation is for. Apply only via Supabase MCP `apply_migration` after the
-- owner's explicit approval. Never `db push`.
--
-- WHAT THIS MARKER COVERS, and nothing else (.github/scripts/migration-safety.mjs
-- finding names): create-trigger, security-definer-function, grant-or-revoke,
-- alter-drop-policy, data-dml (the UPDATE inside the accept bodies, unchanged
-- from 0036). It covers no drop, no grant change on any table, no auth-schema
-- object.
--
-- SECURITY INVARIANT
--   A USER-EDITABLE PROFILE FIELD MUST NOT BE AN AUTHORITATIVE
--   ACCOUNT-IDENTITY BINDING FOR ORGANIZATION MEMBERSHIP.
--
-- THE DEFECT (measured on production 2026-08-29, project gorgitwvdzxbnaxhrsrw)
--   • has_column_privilege('authenticated','public.profiles','email','UPDATE')
--     = true (0004 grants table-level UPDATE; no column revoke since);
--     profiles_update = `id = auth.uid()`; 0 unique constraints on profiles;
--     0 triggers touch `email`. Any signed-in user can therefore
--     PATCH /rest/v1/profiles?id=eq.<self> {"email":"victim@x"} with the
--     public key. No product path writes profiles.email; the API does.
--   • membership_invite_v1 (20260806120000:155) resolves the invitee with
--     `select id from profiles where lower(email) = … limit 1`, then writes
--     company_memberships(profile_id = that id, status 'invited').
--     membership_accept_v1 binds by membership id + auth.uid() only — the
--     whole trust decision is the invite-time profiles.email lookup.
--   • accept_company_worker_invitation / accept_agency_worker_invitation
--     (0036:56, :128) read the CALLER's own identity from profiles.email and
--     match `lower(invited_email) = lower(v_email)` — so a caller who has
--     rewritten their own profiles.email claims ANY pending worker invitation
--     addressed to that address, directly.
--   • company_worker_invitations_select / agency_worker_invitations_select
--     (0027:94, 0025:72) grant the invitee-side read on
--     `invited_email = (select email from profiles where id = auth.uid())`.
--   • Four newer families copied the invite-side lookup as "precedent": the
--     workflow-step delegation, training-assignment, performance-review and
--     management-decision commands (20260817130000, 20260817230000,
--     20260817231000, 20260817232000).
--   Today: 36 profiles, 36 distinct emails, 0 rows where profiles.email
--   differs from auth.users.email. Nothing was exploited. The mechanism was
--   read from the live definitions, not executed.
--
-- THE FIX — two additive layers
--   1. THE COLUMN STOPS BEING USER-EDITABLE (root cause). A BEFORE trigger on
--      profiles (INSERT, UPDATE OF email) refuses any JWT-bearing non-admin
--      write of `email` to anything but the address the session was
--      authenticated with (`auth.jwt() ->> 'email'`). Service role, owner
--      scripts, pg_cron and the signup trigger carry no JWT subject and are
--      untouched — the same exemption shape as enforce_admin_grant_guard
--      (20260702130000). Column grants are NOT rewritten: a column-level
--      REVOKE cannot subtract from 0004's table-level grant, and enumerating
--      the legitimately writable columns is exactly the kind of change that
--      breaks a product path silently. Every existing profiles.email reader
--      becomes trustworthy the moment this holds, including the four newer
--      families above.
--   2. THE CALLER'S OWN IDENTITY COMES FROM THE SESSION (defence in depth,
--      and the model the canonical `invitations` family already uses —
--      list_invitations_for_me_v1 / accept_invitation_by_id_v1 read
--      `auth.jwt() ->> 'email'`). The two legacy accept RPCs and the two
--      invitee-side SELECT policies stop consulting profiles.email at all.
--
-- INVITATION SEMANTICS PRESERVED
--   • invited email ≠ bound profile: company_worker_invitations /
--     agency_worker_invitations keep storing `invited_email` and bind to a
--     worker only at acceptance, by the accepting session's verified email —
--     so an invitation to a not-yet-registered address stays claimable by
--     whoever later authenticates as that address, and by nobody else.
--   • membership_invite_v1 keeps resolving a REGISTERED profile by email
--     (it never supported not-yet-registered invitees: 'no_such_user'). Its
--     lookup is left byte-identical and is now safe because (1) holds.
--
-- WHAT IS DELIBERATELY NOT CHANGED
--   • no UNIQUE(profiles.email) — uniqueness alone would not stop a user from
--     claiming an unregistered victim's address first;
--   • no auth-schema object (no trigger on auth.users): profiles.email is
--     not re-synced on an auth email change — a functional gap (invite by
--     the NEW address answers 'no_such_user'), not a security one, recorded
--     as a follow-up;
--   • the 'no_such_user' account-existence oracle in membership_invite_v1 —
--     changing it changes UX semantics; recorded separately;
--   • the invite-side lookups (membership_invite_v1, invite_company_worker,
--     invite_agency_worker) — moving them to auth.users is optional
--     hardening once (1) holds, recorded as a follow-up.
--
-- PRE-APPLY ASSERTION (fail-closed): every profiles.email already equals
-- auth.users.email. If a row diverges, this migration refuses to apply and
-- names the count — a pre-existing spoof must be reconciled by a human first.
--
-- ROLLBACK: supabase/rollbacks/20260829120000_profile_email_identity_binding_v1.down.sql
--   drops the trigger + function and restores the 0036 accept bodies and the
--   0027/0025 policies verbatim. READ ITS HEADER: rolling back REOPENS the
--   defect above.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── 0. pre-apply integrity assertion ───────────────────────────────────────
do $$
declare
  v_n int;
begin
  select count(*) into v_n
    from public.profiles p
    join auth.users u on u.id = p.id
   where lower(coalesce(p.email, '')) is distinct from lower(coalesce(u.email, ''));
  if v_n > 0 then
    raise exception
      'profile_email_identity_binding_v1: % profiles.email row(s) diverge from auth.users.email — reconcile before applying',
      v_n;
  end if;
end $$;

-- ── 1. the column stops being user-editable ────────────────────────────────
-- Invoker rights on purpose (like enforce_admin_grant_guard): the guard must
-- see the caller's auth.uid()/auth.jwt(), and it needs no privilege of its own.
create or replace function public.enforce_profile_email_binding()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_jwt_email text := lower(nullif(trim(coalesce(auth.jwt() ->> 'email', '')), ''));
begin
  -- No JWT subject: service role, owner scripts, pg_cron, the signup trigger.
  if auth.uid() is null then
    return new;
  end if;
  -- An existing admin may correct a record (same exemption as the admin guard).
  if public.is_admin() then
    return new;
  end if;
  -- Touching the row without changing the address is not a rebinding.
  if tg_op = 'UPDATE'
     and lower(coalesce(new.email, '')) = lower(coalesce(old.email, '')) then
    return new;
  end if;
  -- A JWT-bearing user may only hold the address the session authenticated.
  if v_jwt_email is null or lower(coalesce(new.email, '')) <> v_jwt_email then
    raise exception
      'profiles.email is bound to the authenticated identity and cannot be set to another address'
      using errcode = '42501';
  end if;
  return new;
end $$;

-- Trigger functions are fired by the engine, never called by a client: no
-- role needs EXECUTE (precedent: company_memberships_v1_trigger_fn_revoke).
revoke all on function public.enforce_profile_email_binding() from public;
revoke all on function public.enforce_profile_email_binding() from anon;
revoke all on function public.enforce_profile_email_binding() from authenticated;

drop trigger if exists trg_profiles_email_binding on public.profiles;
create trigger trg_profiles_email_binding
  before insert or update of email on public.profiles
  for each row execute function public.enforce_profile_email_binding();

-- ── 2a. accept_company_worker_invitation — identity from the session ───────
-- Body identical to 0036 except: v_email comes from auth.jwt(), the worker
-- row is looked up directly, and an email-less session cannot match anything.
create or replace function public.accept_company_worker_invitation(
  p_company_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
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

  -- A PENDING invitation addressed to the SESSION's verified email must exist.
  -- profiles.email is never consulted: it is user-writable history, not identity.
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
  if v_linked then
    update public.company_worker_invitations
       set status = 'accepted', accepted_at = now()
     where id = v_inv;
    return 'already_linked';
  end if;

  insert into public.company_workers (company_id, worker_id, status)
  values (p_company_id, v_worker, 'active')
  on conflict (company_id, worker_id) do nothing;

  update public.company_worker_invitations
     set status = 'accepted', accepted_at = now()
   where id = v_inv;

  insert into public.audit_logs (actor_id, action, entity, payload)
  values (uid, 'accept_company_worker_invitation', 'company_workers',
    jsonb_build_object(
      'company_id', p_company_id, 'worker_id', v_worker,
      'invitation_id', v_inv, 'result', 'linked'));

  return 'linked';
end $$;

revoke all on function
  public.accept_company_worker_invitation(uuid) from public;
revoke all on function
  public.accept_company_worker_invitation(uuid) from anon;
grant execute on function
  public.accept_company_worker_invitation(uuid) to authenticated;

-- ── 2b. accept_agency_worker_invitation — identity from the session ────────
create or replace function public.accept_agency_worker_invitation(
  p_agency_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
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
end $$;

revoke all on function
  public.accept_agency_worker_invitation(uuid) from public;
revoke all on function
  public.accept_agency_worker_invitation(uuid) from anon;
grant execute on function
  public.accept_agency_worker_invitation(uuid) to authenticated;

-- ── 3. invitee-side reads key on the session email, not profiles.email ─────
-- Same three-way shape as 0027/0025; only the middle arm changes. An
-- email-less session matches nothing (nullif → NULL → false).
drop policy if exists company_worker_invitations_select
  on public.company_worker_invitations;
create policy company_worker_invitations_select
  on public.company_worker_invitations for select
  using (
    public.owns_company(company_id)
    or lower(invited_email) = lower(nullif(auth.jwt() ->> 'email', ''))
    or public.is_admin()
  );

drop policy if exists agency_worker_invitations_select
  on public.agency_worker_invitations;
create policy agency_worker_invitations_select
  on public.agency_worker_invitations for select
  using (
    public.owns_agency(agency_id)
    or lower(invited_email) = lower(nullif(auth.jwt() ->> 'email', ''))
    or public.is_admin()
  );

commit;
