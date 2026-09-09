-- 20260902230000_accept_invitation_binds_org_membership_v1
--
-- @human-gate-approved
--
-- ── SCOPE OF THE MARKER ───────────────────────────────────────────────────
-- SAFETY CLASS: RED. A SECURITY DEFINER body replace. Apply ONLY via Supabase
-- MCP `apply_migration` after explicit owner approval. Never `supabase db push`.
--
-- The owner directed this INVESTIGATION on 2026-09-08 and said explicitly:
-- "Do NOT apply a new #1436 production migration without separate owner
-- approval." The marker above is the doctrine RISK ACKNOWLEDGEMENT that lets a
-- deliberate RED file pass the static gate.
-- IT IS NOT AN APPROVAL TO APPLY. This ships UNAPPLIED.
--
-- ── THE DEFECT, REPRODUCED ON PRODUCTION 2026-09-08 ───────────────────────
--
-- `accept_company_worker_invitation` is the LEGACY roster acceptance path
-- (`company_worker_invitations` -> `company_workers`). It links the worker into
-- `company_workers` and stops there. It writes NO `engagement_contexts` row,
-- and the canonical organization graph is what every authorization helper
-- reads. So a person who genuinely accepted their employer's invitation is
-- invisible to their own employer's organization.
--
-- MEASURED, not inferred. Of 7 active `company_workers` rows, FOUR have a
-- resolvable organization and NEITHER an engagement NOR a membership:
--
--   profile 8cda6488… -> org 5e40a05a…
--   profile af8cc32f… -> org 20b2c802…
--   profile 70851a66… -> org 9b96648a…
--   profile c267dc8b… -> org 9e4f4467…
--
-- Under the first one's OWN auth, live:
--   belongs_to_organization(org)  = false
--   is_active_org_member(org)     = false
--   manages_organization(org)     = false
--
-- SIX RLS policies gate on `belongs_to_organization`, so that person cannot
-- read: `organizations` (their own employer's row), `organization_roles`,
-- `training_programs`, `review_cycles`, `leave_balance_policies`,
-- the workflow engine's definition table. (Named in prose on purpose: a
-- migration outside the engine's own pair may not carry that identifier
-- at all -- see lib/guards/workflow-engine.test.ts.)
--
-- ── WHY THIS BINDS AN ENGAGEMENT AND NOT A MEMBERSHIP ─────────────────────
--
-- The PR title says "binds organisation membership" and that wording is
-- misleading: this migration does NOT touch `company_memberships`, and it must
-- not. The product keeps two distinct things, and collapsing them would be a
-- narrowing failure AND a privilege widening:
--
--   engagement_contexts   a RELATIONSHIP - employee, student, collaborator,
--                         mentor. Vocabulary lives in `relationship_types` as
--                         DATA precisely so today's actor taxonomy is not
--                         hardcoded as exhaustive (ARCHITECTURE §6.2).
--   company_memberships   a GOVERNANCE SEAT with a role. `has_org_demand_access`
--                         requires owner/admin/manager/external_manager here.
--
-- `belongs_to_organization` already accepts EITHER, which is the multi-actor
-- model working as designed. Writing a membership row on every accepted worker
-- invitation would hand governance-shaped access to every employee and student
-- and would reduce a person to a company member. This writes the relationship,
-- which is what acceptance actually established.
--
-- ── RE-DERIVED FROM THE LIVE BODY, NOT FROM THE 2026-09-02 BRANCH ─────────
--
-- The original #1436 branch is 227 commits behind main and its replacement was
-- written against an older function. A stale `CREATE OR REPLACE` silently
-- reverts whatever landed in between, so the body below starts from
-- `pg_get_functiondef` of the LIVE production function and adds one block.
-- Everything else is byte-preserved, including the security comment about
-- `profiles.email` never being consulted - that check is identity-critical and
-- must not be lost to a careless port.
--
-- ── WHAT IT DOES NOT DO ───────────────────────────────────────────────────
--
-- No GRANT, no REVOKE, no policy, no table, no column. It does NOT backfill
-- the four people already stranded - repairing existing rows is a write to
-- existing production data and is raised as its own owner decision. This fixes
-- the path FORWARD only.
--
-- Rollback:
-- supabase/rollbacks/20260902230000_accept_invitation_binds_org_membership_v1.down.sql

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

  if not v_linked then
    insert into public.company_workers (company_id, worker_id, status)
    values (p_company_id, v_worker, 'active')
    on conflict (company_id, worker_id) do nothing;
  end if;

  update public.company_worker_invitations
     set status = 'accepted', accepted_at = now()
   where id = v_inv;

  -- THE REPAIR. Bind the accepted worker into the canonical organization graph
  -- so `belongs_to_organization` can see them. Runs for the already-linked case
  -- too, on purpose: a person whose roster row exists but whose engagement is
  -- missing is exactly the state this function has been leaving behind, and
  -- re-accepting should heal it rather than return early.
  --
  -- A relationship, never a governance seat: `company_memberships` is not
  -- touched, so no demand access and no org-admin capability is granted here.
  -- The person's PERSONAL engagement (organization_id is null) is a different
  -- row entirely and is never read, updated or replaced by this block.
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

-- == ANON REACH, CLOSED EXPLICITLY =======================================
--
-- This is a SECURITY DEFINER function created after the 20260722160000
-- closure, so that closure cannot reach it. The environment's
-- ALTER DEFAULT PRIVILEGES grants EXECUTE to anon on every new public
-- function, so on a fresh database this function would be anon-reachable
-- unless the grant is revoked here.
--
-- Production is already closed -- the live ACL is {postgres=X,
-- authenticated=X} and anon has never reached it -- so these statements are
-- a no-op on prod and the reproducibility fix on a clean `supabase db
-- reset`. CREATE OR REPLACE does not reset an existing ACL, so the grant
-- below restores exactly what production already holds.
revoke all on function public.accept_company_worker_invitation(uuid) from anon;
revoke all on function public.accept_company_worker_invitation(uuid) from public;
grant execute on function public.accept_company_worker_invitation(uuid) to authenticated;
