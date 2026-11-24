-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply via Supabase MCP apply_migration by the lead session after review.
-- Never `db push`.
--
-- 20260817121000 — invitation org-bound authority v1 (security train A, Fix C).
--
-- PROBLEM (full-reality-audit-2026-08-17: "invitations ... authority
-- person-bound not org-bound"). The canonical invitations system
-- (20260712200000_canonical_invitations_v1.sql) authorizes CREATION with org
-- authority — is_admin() OR org owner OR manages_organization() — but every
-- LATER authority check is bound to the individual inviter:
--
--   invitations_select           inviter_profile_id = auth.uid() OR is_admin()
--   revoke_invitation_v1         inviter OR is_admin()
--   resend_invitation_v1         inviter ONLY
--   mark_invitation_delivery_v1  inviter ONLY
--
-- Consequence, verified against the live definitions: when the inviting
-- manager leaves the organization (membership revoked), the org owner can
-- neither SEE nor REVOKE nor RESEND that still-pending org invitation. A
-- revoked manager's pending invitations stay live for up to 14 days with
-- nobody in the org able to act on them. Authority over an ORG invitation
-- must belong to the ORG, not to the person who happened to click "invite".
--
-- THE CHANGE. One symmetry rule: whoever holds the authority that could have
-- CREATED an org invitation may also see / revoke / resend / mark it.
--
--   1. Helper `invitation_org_authority_v1(p_organization_id)` — EXACTLY the
--      create-side predicate of create_invitation_v1 (org owner OR
--      public.manages_organization, which is membership-role-based over
--      company_memberships — the membership_actor_role_v1 authority spine —
--      plus active engagement contexts). NULL org (join_platform /
--      join_project invitations) grants nothing.
--   2. invitations_select gains `or invitation_org_authority_v1(organization_id)`
--      and is pinned `to authenticated`.
--   3. revoke / resend / mark_delivery RPCs gain the same branch. Everything
--      else in each function body is byte-identical to the live definition
--      (captured from production pg_get_functiondef on 2026-08-17).
--
-- INTENTIONALLY NOT CHANGED (documented, not "fixed"):
--   * accept/decline/get_invitation_preview are TOKEN-bound: whoever holds
--     the emailed token acts. That is inherently person-bound by design.
--   * project-type invitations stay inviter-bound here; project authority is
--     a different spine (can_manage_project) and out of this fix's scope.
--   * resend/mark_delivery still exclude bare is_admin(): the original
--     design keeps token custody with people in the send flow; org authority
--     joins that flow, platform admin does not. revoke keeps is_admin().
--
-- COMPATIBILITY. Strictly widening for org-linked invitations; no existing
-- caller loses access. App-side: listMySentInvitations() gains an explicit
-- inviter filter in the same PR so the "my sent invitations" UI keeps its
-- "mine" semantics instead of inheriting the widened policy.
--
-- @human-gate-approved — policy correction + org-authority extension of three
-- existing SECURITY DEFINER RPCs + one new STABLE SECURITY DEFINER boolean
-- helper (no writes, no token exposure — token_hash is a sha256 digest, the
-- raw token never touches the database). Pre-approved by owner mandate
-- 2026-08-17 (autonomous functional completion train V2, §4 migration
-- authority); production apply stays with the lead session via Supabase MCP.
--
-- ROLLBACK: supabase/rollbacks/20260817121000_invitation_org_authority_v1.down.sql
-- ============================================================================

begin;

-- ── 1. Org-authority helper (create-side predicate, reused) ────────────────
create or replace function public.invitation_org_authority_v1(p_organization_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select p_organization_id is not null and (
    exists (
      select 1 from public.organizations o
       where o.id = p_organization_id
         and o.owner_profile_id = auth.uid()
    )
    or public.manages_organization(p_organization_id)
  )
$$;

comment on function public.invitation_org_authority_v1(uuid) is
  'Org-bound invitation authority: the same predicate create_invitation_v1 uses to authorize creating an org invitation (org owner OR manages_organization). NULL organization grants nothing.';

revoke execute on function public.invitation_org_authority_v1(uuid) from public;
revoke execute on function public.invitation_org_authority_v1(uuid) from anon;
grant execute on function public.invitation_org_authority_v1(uuid) to authenticated;

-- ── 2. Org-aware SELECT policy ─────────────────────────────────────────────
drop policy if exists invitations_select on public.invitations;
create policy invitations_select on public.invitations
  for select
  to authenticated
  using (
    inviter_profile_id = auth.uid()
    or public.is_admin()
    or public.invitation_org_authority_v1(organization_id)
  );

-- ── 3. revoke_invitation_v1: inviter OR admin OR org authority ─────────────
create or replace function public.revoke_invitation_v1(p_invitation_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  v_inviter uuid;
  v_status  text;
  v_org     uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select inviter_profile_id, status, organization_id
    into v_inviter, v_status, v_org
    from public.invitations where id = p_invitation_id;
  if not found then return 'not_found'; end if;
  if v_inviter is distinct from uid
     and not public.is_admin()
     and not public.invitation_org_authority_v1(v_org) then
    return 'not_authorized';
  end if;
  if v_status <> 'pending' then return 'not_pending'; end if;

  update public.invitations
     set status = 'revoked', revoked_at = now()
   where id = p_invitation_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'revoke_invitation_v1', 'invitations', p_invitation_id,
    jsonb_build_object('result', 'revoked'));
  return 'revoked';
end $$;

-- ── 4. resend_invitation_v1: inviter OR org authority ──────────────────────
create or replace function public.resend_invitation_v1(p_invitation_id uuid, p_new_token_hash text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  v_inviter uuid;
  v_status  text;
  v_resends int;
  v_org     uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_new_token_hash is null or p_new_token_hash !~ '^[0-9a-f]{64}$' then
    return 'invalid_token_hash';
  end if;
  select inviter_profile_id, status, resend_count, organization_id
    into v_inviter, v_status, v_resends, v_org
    from public.invitations where id = p_invitation_id;
  if not found then return 'not_found'; end if;
  if v_inviter is distinct from uid
     and not public.invitation_org_authority_v1(v_org) then
    return 'not_authorized';
  end if;
  if v_status <> 'pending' then return 'not_pending'; end if;
  if v_resends >= 10 then return 'resend_limit'; end if;

  update public.invitations
     set token_hash = p_new_token_hash,
         expires_at = now() + interval '14 days',
         last_sent_at = null,
         delivery_status = 'not_sent',
         resend_count = resend_count + 1
   where id = p_invitation_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'resend_invitation_v1', 'invitations', p_invitation_id,
    jsonb_build_object('result', 'token_rotated', 'resend_count', v_resends + 1));
  return 'ok';
end $$;

-- ── 5. mark_invitation_delivery_v1: inviter OR org authority ───────────────
create or replace function public.mark_invitation_delivery_v1(p_invitation_id uuid, p_outcome text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  v_inviter uuid;
  v_org     uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_outcome not in ('sent','delivery_failed') then return 'invalid_outcome'; end if;
  select inviter_profile_id, organization_id into v_inviter, v_org
    from public.invitations where id = p_invitation_id;
  if not found then return 'not_found'; end if;
  if v_inviter is distinct from uid
     and not public.invitation_org_authority_v1(v_org) then
    return 'not_authorized';
  end if;

  update public.invitations
     set delivery_status = p_outcome,
         last_sent_at = case when p_outcome = 'sent' then now() else last_sent_at end
   where id = p_invitation_id;
  return 'ok';
end $$;


-- Re-state grants for every REDEFINED SECURITY DEFINER function above:
-- `create or replace` preserves live grants in production, but a fresh local
-- reset replays this file into default privileges (PUBLIC EXECUTE). The
-- secdef-local-reset-reproducibility guard requires file-local revokes.
revoke all on function public.revoke_invitation_v1(uuid) from public;
revoke all on function public.revoke_invitation_v1(uuid) from anon;
grant execute on function public.revoke_invitation_v1(uuid) to authenticated;
revoke all on function public.resend_invitation_v1(uuid, text) from public;
revoke all on function public.resend_invitation_v1(uuid, text) from anon;
grant execute on function public.resend_invitation_v1(uuid, text) to authenticated;
revoke all on function public.mark_invitation_delivery_v1(uuid, text) from public;
revoke all on function public.mark_invitation_delivery_v1(uuid, text) from anon;
grant execute on function public.mark_invitation_delivery_v1(uuid, text) to authenticated;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- DOWN (manual rollback — also in supabase/rollbacks/): restores the exact
-- live 2026-08-17 definitions of the policy and the three functions and drops
-- the helper. See the .down.sql file.
-- ════════════════════════════════════════════════════════════════════════════
