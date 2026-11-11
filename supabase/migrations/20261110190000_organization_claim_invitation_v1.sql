-- @human-gate-approved
-- The marker above is the human-gate ACKNOWLEDGEMENT, not an approval. NO OWNER APPROVAL OF THIS SQL
-- EXISTS YET. Draft PR + needs-human-gate. NOT applied. Apply only via Supabase MCP apply_migration.
-- ============================================================================
-- 20261110190000_organization_claim_invitation_v1
--
-- Partner registration, Slice 1 (owner decision 2026-11-10, docs/proposals/partner-registration-v1.md).
-- A company an operator added (claim_state 'discovered', no owner) is taken over by its real
-- representative:
--
--   operator: create_claim_invitation_v1        one-time, 14-day, one company, one e-mail
--   representative: get_claim_invitation_preview_v1, accept_claim_invitation_v1
--                                               proven mailbox + role + authority statement
--   representative without an invitation: submit_organization_verification_request_v1
--                                               a request only; changes nothing on the company
--   second operator: decide_organization_claim_v2
--                                               not the claimant, not the inviting operator;
--                                               verify links in the same transaction
--   internal: link_verified_organization_claim_v1
--                                               owner, claimed, owner membership + engagement, audit
--
-- REUSED, NOT COPIED: invitations (token hashed, expiry, use count), invitation_session_email_matches_v1
-- (address binding), session_email_verified_v1 (mailbox proof, independent of "Confirm email"),
-- organization_claims, has_platform_capability('marketplace_company_ingest'), audit_logs.
--
-- CLOSED: request_organization_claim_v1 and decide_organization_claim_v1 are no longer executable by
-- `authenticated`. They stay defined (nothing calls them in the app) so the rollback restores them as is.
--
-- @plan-cache-proof: n/a — uniqueness only, no RPC filters by it (organization_claims_invitation_uq: one claim per invitation)
-- SAFETY CLASS: RED (SECURITY DEFINER functions, GRANT/REVOKE, CHECK widening, additive columns).
-- ZERO existing rows change at apply time. Rollback: supabase/rollbacks/<this name>.down.sql.
-- ============================================================================

-- 1. The invitation type ------------------------------------------------------------------------
alter table public.invitations drop constraint if exists invitations_invitation_type_check;
alter table public.invitations add constraint invitations_invitation_type_check check (invitation_type in (
  'join_platform','join_organization','join_team','join_as_employee','collaborate_partner',
  'join_project','invite_company','invite_to_demand','claim_organization'));

alter table public.invitations drop constraint if exists invitations_context_chk;
alter table public.invitations add constraint invitations_context_chk check (
     (invitation_type in ('join_organization','join_team','join_as_employee','collaborate_partner')
        and organization_id is not null)
  or (invitation_type = 'join_project' and project_id is not null)
  or (invitation_type = 'invite_to_demand' and target_request_id is not null)
  or (invitation_type in ('join_platform','invite_company'))
  or (invitation_type = 'claim_organization' and organization_id is not null
        and invited_email is not null and max_uses = 1));

-- The generic accept doors know nothing of this type. A claim invitation is accepted ONLY by
-- accept_claim_invitation_v1, which sets a transaction-local flag; any other path is refused.
create or replace function public.claim_invitation_accept_guard_v1()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.invitation_type = 'claim_organization'
     and new.status is distinct from old.status
     and new.status = 'accepted'
     and coalesce(current_setting('lm.claim_accept', true), '') <> 'on' then
    raise exception 'claim_invitation_wrong_door' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists claim_invitation_accept_guard on public.invitations;
create trigger claim_invitation_accept_guard
  before update on public.invitations
  for each row execute function public.claim_invitation_accept_guard_v1();

-- An operator never becomes a company's owner through a claim: admins and holders of an active
-- ingest grant are refused as claimants. Internal; read by the functions below only.
create or replace function public.claimant_is_operator_v1(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = p_profile_id and p.active_role = 'admin')
      or exists (select 1 from public.profile_roles r where r.profile_id = p_profile_id and r.role = 'admin')
      or exists (select 1 from public.platform_capability_grants g
                  where g.profile_id = p_profile_id and g.revoked_at is null)
$$;

-- 2. What the representative stated ------------------------------------------------------------
alter table public.organization_claims
  add column if not exists invitation_id uuid references public.invitations(id) on delete set null,
  add column if not exists representative_role text,
  add column if not exists authority_confirmed_at timestamptz;

alter table public.organization_claims drop constraint if exists organization_claims_representative_role_chk;
alter table public.organization_claims add constraint organization_claims_representative_role_chk
  check (representative_role is null or char_length(btrim(representative_role)) between 2 and 80);

create unique index if not exists organization_claims_invitation_uq
  on public.organization_claims (invitation_id) where invitation_id is not null;

-- 3. Operator: the invitation --------------------------------------------------------------------
create or replace function public.create_claim_invitation_v1(
  p_organization_id uuid,
  p_invited_email   text,
  p_token_hash      text,
  p_locale          text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_invited_email, '')));
  v_org   public.organizations%rowtype;
  v_id    uuid;
  v_exp   timestamptz;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if not (public.is_admin() or public.has_platform_capability('marketplace_company_ingest')) then
    raise exception 'Not authorized to invite a company representative' using errcode = '42501';
  end if;
  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid token hash' using errcode = '22023';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(v_email) > 254 then
    return jsonb_build_object('outcome', 'invalid_email');
  end if;

  select * into v_org from public.organizations where id = p_organization_id for update;
  if not found or v_org.archived_at is not null then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if v_org.claim_state not in ('discovered', 'invited') or v_org.owner_profile_id is not null then
    return jsonb_build_object('outcome', 'not_claimable');
  end if;
  if exists (select 1 from public.invitations i
              where i.organization_id = p_organization_id
                and i.invitation_type = 'claim_organization'
                and i.status = 'pending' and i.expires_at > now()) then
    return jsonb_build_object('outcome', 'already_invited');
  end if;

  insert into public.invitations
    (token_hash, invitation_type, organization_id, invited_email, locale,
     inviter_profile_id, max_uses, expires_at)
  values
    (p_token_hash, 'claim_organization', p_organization_id, v_email,
     case when p_locale ~ '^[a-z]{2}$' then p_locale else null end,
     uid, 1, now() + interval '14 days')
  returning id, expires_at into v_id, v_exp;

  update public.organizations set claim_state = 'invited', updated_at = now()
   where id = p_organization_id and claim_state = 'discovered';

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload, occurred_at)
  values (uid, 'organization_claim.invited', 'organizations', p_organization_id,
          jsonb_build_object('invitation_id', v_id), now());

  return jsonb_build_object('outcome', 'invited', 'invitation_id', v_id, 'expires_at', v_exp);
end $$;

-- 4. Representative: what the link shows ---------------------------------------------------------
-- Answers only for a claim invitation, and never returns the address itself.
create or replace function public.get_claim_invitation_preview_v1(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_inv public.invitations%rowtype;
  v_org public.organizations%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select * into v_inv from public.invitations
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and invitation_type = 'claim_organization';
  if not found then return jsonb_build_object('outcome', 'not_found'); end if;
  if v_inv.status <> 'pending' then return jsonb_build_object('outcome', v_inv.status); end if;
  if v_inv.expires_at <= now() then return jsonb_build_object('outcome', 'expired'); end if;
  select * into v_org from public.organizations where id = v_inv.organization_id;
  if v_org.archived_at is not null or v_org.claim_state not in ('discovered', 'invited') then
    return jsonb_build_object('outcome', 'not_claimable');
  end if;
  return jsonb_build_object(
    'outcome', 'ok',
    'organization_name', v_org.display_name,
    'organization_country', v_org.country,
    'email_matches', public.invitation_session_email_matches_v1(v_inv.invited_email),
    'email_verified', public.session_email_verified_v1(),
    'expires_at', v_inv.expires_at);
end $$;

-- 5. Representative: accept ----------------------------------------------------------------------
create or replace function public.accept_claim_invitation_v1(
  p_token              text,
  p_role               text,
  p_authority_confirmed boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  v_inv   public.invitations%rowtype;
  v_org   public.organizations%rowtype;
  v_role  text := btrim(coalesce(p_role, ''));
  v_claim uuid;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;

  select * into v_inv from public.invitations
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and invitation_type = 'claim_organization';
  if not found then return jsonb_build_object('outcome', 'not_found'); end if;

  -- Lock order everywhere in this file: the organization, then its claim rows.
  select * into v_org from public.organizations where id = v_inv.organization_id for update;
  select * into v_inv from public.invitations where id = v_inv.id for update;

  if not public.invitation_session_email_matches_v1(v_inv.invited_email) then
    return jsonb_build_object('outcome', 'email_mismatch');
  end if;
  if v_inv.status = 'accepted' or v_inv.use_count >= v_inv.max_uses then
    return jsonb_build_object('outcome', 'already_used');
  end if;
  if v_inv.status <> 'pending' then return jsonb_build_object('outcome', v_inv.status); end if;
  if v_inv.expires_at <= now() then
    update public.invitations set status = 'expired' where id = v_inv.id and status = 'pending';
    return jsonb_build_object('outcome', 'expired');
  end if;
  if not public.session_email_verified_v1() then
    return jsonb_build_object('outcome', 'email_not_verified');
  end if;
  if v_inv.inviter_profile_id = uid then
    return jsonb_build_object('outcome', 'inviter_cannot_claim');
  end if;
  if public.claimant_is_operator_v1(uid) then
    return jsonb_build_object('outcome', 'operator_cannot_claim');
  end if;
  if v_org.archived_at is not null or v_org.claim_state <> 'invited' or v_org.owner_profile_id is not null then
    return jsonb_build_object('outcome', 'not_claimable');
  end if;
  if p_authority_confirmed is not true then
    return jsonb_build_object('outcome', 'authority_not_confirmed');
  end if;
  if char_length(v_role) not between 2 and 80 then
    return jsonb_build_object('outcome', 'invalid_role');
  end if;

  insert into public.organization_claims
    (organization_id, claimant_profile_id, state, verification_method, verification_evidence_ref,
     invitation_id, representative_role, authority_confirmed_at)
  values
    (v_org.id, uid, 'requested', 'existing_org_admin_invitation', 'invitation:' || v_inv.id::text,
     v_inv.id, v_role, now())
  returning id into v_claim;

  perform set_config('lm.claim_accept', 'on', true);
  update public.invitations
     set status = 'accepted', accepted_at = now(), accepted_by_profile_id = uid,
         use_count = use_count + 1
   where id = v_inv.id;
  perform set_config('lm.claim_accept', '', true);

  update public.organizations set claim_state = 'claim_requested', updated_at = now()
   where id = v_org.id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload, occurred_at)
  values (uid, 'organization_claim.requested', 'organizations', v_org.id,
          jsonb_build_object('claim_id', v_claim, 'invitation_id', v_inv.id, 'via', 'invitation'), now());

  return jsonb_build_object('outcome', 'claim_requested', 'claim_id', v_claim);
exception when unique_violation then
  return jsonb_build_object('outcome', 'already_requested');
end $$;

-- 6. Representative without an invitation: a request only ----------------------------------------
-- It grants nothing and leaves the company's claim_state as it is, so it can't block or replace the
-- invited path. An operator decides it like any claim.
create or replace function public.submit_organization_verification_request_v1(
  p_organization_id     uuid,
  p_role                text,
  p_evidence_ref        text,
  p_authority_confirmed boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_org    public.organizations%rowtype;
  v_role   text := btrim(coalesce(p_role, ''));
  v_ev     text := btrim(coalesce(p_evidence_ref, ''));
  v_claim  uuid;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if not public.session_email_verified_v1() then
    return jsonb_build_object('outcome', 'email_not_verified');
  end if;
  select * into v_org from public.organizations where id = p_organization_id;
  if not found or v_org.archived_at is not null then return jsonb_build_object('outcome', 'not_found'); end if;
  if v_org.claim_state = 'claimed' or v_org.owner_profile_id is not null then
    return jsonb_build_object('outcome', 'not_claimable');
  end if;
  if public.claimant_is_operator_v1(uid) then return jsonb_build_object('outcome', 'operator_cannot_claim'); end if;
  if p_authority_confirmed is not true then return jsonb_build_object('outcome', 'authority_not_confirmed'); end if;
  if char_length(v_role) not between 2 and 80 then return jsonb_build_object('outcome', 'invalid_role'); end if;
  if char_length(v_ev) not between 3 and 500 then return jsonb_build_object('outcome', 'invalid_evidence'); end if;
  if (select count(*) from public.organization_claims c
       where c.claimant_profile_id = uid and c.state = 'requested') >= 3
     or (select count(*) from public.organization_claims c
          where c.claimant_profile_id = uid and c.created_at > now() - interval '24 hours') >= 5 then
    return jsonb_build_object('outcome', 'too_many_requests');
  end if;

  insert into public.organization_claims
    (organization_id, claimant_profile_id, state, verification_method, verification_evidence_ref,
     representative_role, authority_confirmed_at)
  values (v_org.id, uid, 'requested', 'operator_manual_review', v_ev, v_role, now())
  returning id into v_claim;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload, occurred_at)
  values (uid, 'organization_claim.requested', 'organizations', v_org.id,
          jsonb_build_object('claim_id', v_claim, 'via', 'verification_request'), now());

  return jsonb_build_object('outcome', 'request_submitted', 'claim_id', v_claim);
exception when unique_violation then
  return jsonb_build_object('outcome', 'already_requested');
end $$;

-- 7. The link (internal) -------------------------------------------------------------------------
-- Not callable by any client role: only decide_organization_claim_v2 reaches it, inside its
-- transaction. Replay-safe: a second call finds the claim linked and the company owned, and stops.
create or replace function public.link_verified_organization_claim_v1(p_claim_id uuid, p_decider uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.organization_claims%rowtype;
  v_org   public.organizations%rowtype;
begin
  select * into v_claim from public.organization_claims where id = p_claim_id;
  if not found then return 'not_found'; end if;
  select * into v_org from public.organizations where id = v_claim.organization_id for update;
  select * into v_claim from public.organization_claims where id = p_claim_id for update;
  if v_claim.state = 'linked' then return 'already_linked'; end if;
  if v_claim.state <> 'representative_verified' then return 'not_verified'; end if;
  if v_org.owner_profile_id is not null or v_org.claim_state = 'claimed' or v_org.archived_at is not null then
    return 'already_claimed';
  end if;
  if p_decider is null or v_claim.claimant_profile_id = p_decider then return 'refused'; end if;
  if public.claimant_is_operator_v1(v_claim.claimant_profile_id) then return 'operator_claimant'; end if;

  update public.organizations
     set owner_profile_id = v_claim.claimant_profile_id, claim_state = 'claimed', updated_at = now()
   where id = v_org.id;

  -- The owner triggers fire on INSERT only, so the link writes what they would have.
  insert into public.company_memberships (organization_id, profile_id, role, status, accepted_at, source)
  select v_org.id, v_claim.claimant_profile_id, 'owner', 'active', now(), 'org-claim'
   where not exists (select 1 from public.company_memberships m
                      where m.organization_id = v_org.id and m.profile_id = v_claim.claimant_profile_id
                        and m.status in ('invited', 'active'));
  update public.company_memberships set role = 'owner'
   where organization_id = v_org.id and profile_id = v_claim.claimant_profile_id
     and status in ('invited', 'active') and role <> 'owner';

  insert into public.engagement_contexts
    (profile_id, organization_id, relationship_slug, is_primary, status, country_code, hash_self)
  select v_claim.claimant_profile_id, v_org.id, 'owner', false, 'active',
         (select c.code from public.countries c where c.code = v_org.country),
         encode(extensions.digest(v_claim.claimant_profile_id::text || ':owner:' || v_org.id::text, 'sha256'), 'hex')
   where not exists (select 1 from public.engagement_contexts ec
                      where ec.profile_id = v_claim.claimant_profile_id and ec.organization_id = v_org.id
                        and ec.relationship_slug = 'owner');

  update public.organization_claims set state = 'linked' where id = p_claim_id;
  update public.organization_claims
     set state = 'rejected', decided_by = p_decider, decided_at = now(), decision_note = 'superseded by a linked claim'
   where organization_id = v_org.id and id <> p_claim_id and state in ('invited', 'requested');
  update public.invitations set status = 'revoked', revoked_at = now()
   where organization_id = v_org.id and invitation_type = 'claim_organization' and status = 'pending';

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload, occurred_at)
  values (p_decider, 'organization_claim.linked', 'organizations', v_org.id,
          jsonb_build_object('claim_id', p_claim_id, 'owner_profile_id', v_claim.claimant_profile_id), now());
  return 'linked';
end $$;

-- 8. Second operator: decide ---------------------------------------------------------------------
create or replace function public.decide_organization_claim_v2(
  p_claim_id     uuid,
  p_decision     text,
  p_evidence_ref text,
  p_note         text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  v_claim public.organization_claims%rowtype;
  v_org   public.organizations%rowtype;
  v_link  text;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if not (public.is_admin() or public.has_platform_capability('marketplace_company_ingest')) then
    raise exception 'Not authorized to decide claims' using errcode = '42501';
  end if;
  if p_decision not in ('verify', 'reject') then
    raise exception 'Decision must be verify or reject' using errcode = '22023';
  end if;

  select * into v_claim from public.organization_claims where id = p_claim_id;
  if not found then return jsonb_build_object('outcome', 'not_found'); end if;
  select * into v_org from public.organizations where id = v_claim.organization_id for update;
  select * into v_claim from public.organization_claims where id = p_claim_id for update;

  if v_claim.claimant_profile_id = uid then
    raise exception 'A claimant cannot decide their own claim' using errcode = '42501';
  end if;
  if v_claim.invitation_id is not null and exists (
       select 1 from public.invitations i where i.id = v_claim.invitation_id and i.inviter_profile_id = uid) then
    raise exception 'The operator who sent the invitation cannot decide its claim' using errcode = '42501';
  end if;
  if v_claim.state <> 'requested' then
    return jsonb_build_object('outcome', 'not_pending', 'state', v_claim.state);
  end if;

  if p_decision = 'reject' then
    update public.organization_claims
       set state = 'rejected', decided_by = uid, decided_at = now(), decision_note = left(p_note, 500)
     where id = p_claim_id;
    -- An invited claim that is rejected frees the company for a new invitation.
    if v_claim.invitation_id is not null and v_org.claim_state = 'claim_requested' then
      update public.organizations set claim_state = 'discovered', updated_at = now() where id = v_org.id;
    end if;
    insert into public.audit_logs (actor_id, action, entity, entity_id, payload, occurred_at)
    values (uid, 'organization_claim.rejected', 'organizations', v_org.id,
            jsonb_build_object('claim_id', p_claim_id), now());
    return jsonb_build_object('outcome', 'rejected');
  end if;

  if coalesce(btrim(p_evidence_ref), '') = '' then
    raise exception 'Verification needs documented evidence' using errcode = '22023';
  end if;
  if v_org.owner_profile_id is not null or v_org.claim_state = 'claimed' or v_org.archived_at is not null then
    return jsonb_build_object('outcome', 'already_claimed');
  end if;
  if public.claimant_is_operator_v1(v_claim.claimant_profile_id) then
    return jsonb_build_object('outcome', 'operator_claimant');
  end if;

  update public.organization_claims
     set state = 'representative_verified', decided_by = uid, decided_at = now(),
         verification_evidence_ref = left(p_evidence_ref, 500), decision_note = left(p_note, 500)
   where id = p_claim_id;
  update public.organizations set claim_state = 'representative_verified', updated_at = now()
   where id = v_org.id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload, occurred_at)
  values (uid, 'organization_claim.verified', 'organizations', v_org.id,
          jsonb_build_object('claim_id', p_claim_id), now());

  v_link := public.link_verified_organization_claim_v1(p_claim_id, uid);
  if v_link <> 'linked' then
    raise exception 'organization_claim_link_failed: %', v_link using errcode = 'P0001';
  end if;
  return jsonb_build_object('outcome', 'linked', 'organization_id', v_org.id);
end $$;

-- 9. Grants ---------------------------------------------------------------------------------------
revoke all on function public.claim_invitation_accept_guard_v1() from public, anon, authenticated;
revoke all on function public.claimant_is_operator_v1(uuid) from public, anon, authenticated;
revoke all on function public.create_claim_invitation_v1(uuid, text, text, text) from public, anon;
grant execute on function public.create_claim_invitation_v1(uuid, text, text, text) to authenticated;
revoke all on function public.get_claim_invitation_preview_v1(text) from public, anon;
grant execute on function public.get_claim_invitation_preview_v1(text) to authenticated;
revoke all on function public.accept_claim_invitation_v1(text, text, boolean) from public, anon;
grant execute on function public.accept_claim_invitation_v1(text, text, boolean) to authenticated;
revoke all on function public.submit_organization_verification_request_v1(uuid, text, text, boolean) from public, anon;
grant execute on function public.submit_organization_verification_request_v1(uuid, text, text, boolean) to authenticated;
revoke all on function public.decide_organization_claim_v2(uuid, text, text, text) from public, anon;
grant execute on function public.decide_organization_claim_v2(uuid, text, text, text) to authenticated;
revoke all on function public.link_verified_organization_claim_v1(uuid, uuid) from public, anon, authenticated;

-- The open doors this replaces.
revoke execute on function public.request_organization_claim_v1(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.decide_organization_claim_v1(uuid, text, text, text) from public, anon, authenticated;
