-- ============================================================================
-- @human-gate-approved — TIER: owner-gated. The owner reviewed the W9 slice 1
-- human-gate package on PR #975 (2026-08-02) and explicitly approved these
-- three migration-safety findings: `security-definer-function`,
-- `grant-or-revoke`, and `data-dml` (an UPDATE in the FUNCTION BODY — this
-- migration performs zero DML at apply time). The annotation downgrades the CI
-- finding ONLY.
--
-- PRODUCTION APPLY IS **NOT** APPROVED BY THAT DECISION.
-- The same owner approval covers rebase, gate marking, PR merge and the normal
-- application deployment — and explicitly EXCLUDES `apply_migration` against
-- production Supabase, manual production SQL, and any production data
-- mutation. Production status after merge: PENDING_SEPARATE_OWNER_APPROVAL.
-- Apply ONLY via Supabase MCP apply_migration after that separate approval.
-- Never `db push`.
--
-- 20260802160000 — organization membership revocation v1 (W9 slice 1, P0-1).
--
-- PROBLEM (W9 read-only audit, finding P0-1): organization membership is
-- effectively IRREVOCABLE. `public.engagement_contexts` is the canonical
-- membership spine (0013), and:
--   * no RPC anywhere sets `status` away from 'active' — `add_org_member` and
--     `grant_org_manager` (20260530140000) only ever INSERT, and
--     `set_engagement_journal_review` only flips a boolean;
--   * the table's own write policy `engagement_contexts_write` (0013) is
--     self-scoped, but `authenticated` holds only `GRANT SELECT` (0013 line
--     416) — so not even a self-leave is reachable from the product.
-- Net effect: once a person holds an ACTIVE 'manager' / 'owner' engagement,
-- `public.manages_organization()` (0013) stays TRUE forever. That single
-- helper gates the organization's journal stream (0013
-- `journal_entries_select`), the membership list itself (0013
-- `engagement_contexts_select`), invitation sending (20260712200000
-- `create_invitation_v1`), journal review (20260530140000) and — once W6
-- slice 3 lands — replying and disputing in the ORGANIZATION's name.
-- A dismissed foreman keeps all of it.
--
-- SOLUTION (one RPC, zero schema change): `end_org_membership_v1` moves the
-- engagement to the EXISTING terminal `status = 'ended'` value (0013 CHECK
-- already allows 'active' | 'paused' | 'ended'). Nothing is deleted; the row,
-- its hash chain and its history stay intact. Authority is recomputed
-- NATURALLY — every helper listed above already filters `status = 'active'`,
-- so no policy, no helper and no W6-specific exception is touched by this
-- migration. That is the whole point: revocation must fall out of the
-- canonical model, not out of a special case.
--
-- WHAT THIS MIGRATION DOES (additive only — ONE new function):
--   public.end_org_membership_v1(p_engagement_id uuid, p_reason text)
--     → jsonb { outcome, engagement_id?, organization_id?, profile_id?,
--               from_role?, to_role? }
--
--   Outcomes (expected states return, they never raise):
--     'ended'          — membership moved to 'ended' (audit row written)
--     'already_ended'  — idempotent no-op (NO second audit row)
--     'not_found'      — no such engagement, or the caller may not see it
--                        (deliberately merged: no existence oracle, same
--                        posture as 20260712200000's accept path)
--     'not_org_scoped' — a personal / project engagement, not a membership
--     'not_authorized' — caller lacks authority over this membership
--     'last_owner'     — refused: the organization would lose its owner
--
-- AUTHORITY LADDER (checked in this order, most privileged first):
--   admin   — `is_admin()`; may end any membership except a last owner.
--   owner   — `organizations.owner_profile_id = auth.uid()`; may end any
--             membership in the org except a last owner (i.e. except itself
--             while it is still the org's registered owner).
--   manager — `manages_organization()`; may end 'employee' / 'collaborator' /
--             'viewer' / 'consultant' / 'freelancer' memberships ONLY. A
--             manager can NEVER end another 'manager' or an 'owner' — that
--             would be lateral escalation (mirrors 20260530140000, where
--             granting a manager is already owner-only).
--   self    — the member may always end their OWN membership (leave), except
--             a last owner.
--
-- LAST-OWNER PROTECTION (two independent checks, both must pass):
--   (1) the target profile is not the org's registered
--       `organizations.owner_profile_id`; and
--   (2) if the target engagement's slug is 'owner', at least one OTHER active
--       'owner' engagement remains in that organization.
--   Check (1) is the authoritative one in this schema: `owner_profile_id` is
--   what `add_org_member` / `grant_org_manager` / `create_invitation_v1` read
--   as "the owner". Check (2) is defence in depth for orgs that carry several
--   owner engagements.
--   OWNERSHIP TRANSFER is deliberately OUT OF SCOPE for this slice (W9 audit
--   lists it as MISSING). The design is nonetheless transfer-ready: the guard
--   keys on the CURRENT `owner_profile_id`, so once a transfer path exists and
--   moves that pointer, the PREVIOUS owner's stale 'owner' engagement stops
--   being protected and can be ended by this same RPC — the old owner loses
--   owner rights through the normal path, with no special case.
--
-- AUDIT: one append-only `public.audit_logs` row per REAL state change
-- (action 'end_org_membership'), carrying who initiated it, when, from which
-- role, to which role, in which capacity, and the optional reason. Idempotent
-- repeats write nothing — the trail records changes, not attempts.
--
-- WHAT IS DELIBERATELY NOT TOUCHED (W9 slice 1 scope):
--   NO new table, NO new column, NO new relationship_types slug;
--   NO RLS policy change (in particular `organizations_select` and
--   `engagement_contexts_write` stay exactly as they are — W9 slice 2);
--   NO table GRANT change; NO existing function is recreated (this is a NEW
--   name, so the rollback chain has nothing to restore verbatim);
--   NO workspace / multi-org / suspension / team / invitation-role work;
--   NO DELETE of any row, ever.
--
-- SAFETY CLASS: SECURITY DEFINER + GRANT ⇒ `.github/scripts/migration-safety.mjs`
-- marks this RED. It stayed RED through the whole review; the marker at the top
-- of this header was added ONLY after the owner's explicit approval of the
-- human-gate package on PR #975, never on the agent's initiative.
--
-- COMPATIBILITY: until applied, `endOrgMembership` in
-- `apps/web/lib/operations/org-membership.ts` detects 42883 (undefined
-- function) and returns `needs_migration`; the panel renders the control as
-- unavailable rather than faking a removal.
--
-- ROLLBACK: supabase/rollbacks/20260802160000_org_membership_revocation_v1.down.sql
-- (drops ONLY the new function; memberships already ended STAY ended — a
-- rollback must never silently re-grant revoked authority).
--
-- POST-APPLY VERIFICATION:
--   select proname, prosecdef from pg_proc where proname = 'end_org_membership_v1';
--   select has_function_privilege('anon','public.end_org_membership_v1(uuid,text)','execute');   -- false
--   select has_function_privilege('authenticated','public.end_org_membership_v1(uuid,text)','execute'); -- true
--   As org owner, on own owner engagement            → {"outcome":"last_owner"}
--   As org owner, on a manager engagement            → {"outcome":"ended"}
--   repeat the same call                             → {"outcome":"already_ended"}
--   As the ended manager: select manages_organization('<org>')  → false
--   + APPLIED_LEDGER.md row.
-- ============================================================================

begin;

create or replace function public.end_org_membership_v1(
  p_engagement_id uuid,
  p_reason        text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid          uuid := auth.uid();
  v_profile    uuid;
  v_org        uuid;
  v_slug       text;
  v_status     text;
  v_org_owner  uuid;
  v_capacity   text;
  v_reason     text := nullif(trim(coalesce(p_reason, '')), '');
  v_other_owners int;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_engagement_id is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if v_reason is not null and char_length(v_reason) > 500 then
    v_reason := left(v_reason, 500);
  end if;

  select ec.profile_id, ec.organization_id, ec.relationship_slug, ec.status
    into v_profile, v_org, v_slug, v_status
    from public.engagement_contexts ec
   where ec.id = p_engagement_id;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if v_org is null then
    -- personal / project-only engagement: not an organization membership.
    return jsonb_build_object('outcome', 'not_org_scoped');
  end if;

  select o.owner_profile_id into v_org_owner
    from public.organizations o where o.id = v_org;

  -- ── Authority ladder ────────────────────────────────────────────────────
  if public.is_admin() then
    v_capacity := 'admin';
  elsif v_org_owner is not null and v_org_owner = uid then
    v_capacity := 'owner';
  elsif public.manages_organization(v_org)
        and v_slug not in ('owner', 'manager', 'external_manager') then
    v_capacity := 'manager';
  elsif v_profile = uid then
    v_capacity := 'self';
  else
    -- A caller with no relationship to the organization must not be able to
    -- tell an existing engagement id from a non-existent one.
    if public.manages_organization(v_org) or v_profile = uid then
      return jsonb_build_object('outcome', 'not_authorized');
    end if;
    return jsonb_build_object('outcome', 'not_found');
  end if;

  -- ── Last-owner protection (both checks, before any write) ───────────────
  if v_org_owner is not null and v_profile = v_org_owner then
    return jsonb_build_object('outcome', 'last_owner');
  end if;
  if v_slug = 'owner' then
    select count(*) into v_other_owners
      from public.engagement_contexts ec
     where ec.organization_id = v_org
       and ec.relationship_slug = 'owner'
       and ec.status = 'active'
       and ec.id <> p_engagement_id;
    if v_other_owners = 0 then
      return jsonb_build_object('outcome', 'last_owner');
    end if;
  end if;

  -- ── Idempotency: an already-ended membership is a no-op, not an error ───
  if v_status = 'ended' then
    return jsonb_build_object(
      'outcome', 'already_ended',
      'engagement_id', p_engagement_id,
      'organization_id', v_org,
      'profile_id', v_profile,
      'from_role', v_slug,
      'to_role', 'ended');
  end if;

  -- ── The state change. Never a DELETE. ───────────────────────────────────
  -- journal_review_enabled is cleared in the same statement so a re-added
  -- member never inherits a stale review grant, and is_primary is dropped so
  -- an ended engagement can no longer be anyone's primary context.
  update public.engagement_contexts
     set status                 = 'ended',
         ended_at               = coalesce(ended_at, current_date),
         journal_review_enabled = false,
         is_primary             = false,
         updated_at             = now()
   where id = p_engagement_id
     and status <> 'ended';

  -- ── Audit: who, when, from which role, to which role, why ───────────────
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (
    uid,
    'end_org_membership',
    'engagement_contexts',
    p_engagement_id,
    jsonb_build_object(
      'organization_id', v_org,
      'profile_id',      v_profile,
      'from_role',       v_slug,
      'to_role',         'ended',
      'from_status',     v_status,
      'to_status',       'ended',
      'actor_capacity',  v_capacity,
      'self_initiated',  (v_profile = uid),
      'reason',          v_reason
    ));

  return jsonb_build_object(
    'outcome', 'ended',
    'engagement_id', p_engagement_id,
    'organization_id', v_org,
    'profile_id', v_profile,
    'from_role', v_slug,
    'to_role', 'ended');
end $$;

-- Standard SECURITY DEFINER hygiene (mirrors applied 20260722160000):
-- PUBLIC and anon hold nothing; only a real user session may call it.
revoke all on function public.end_org_membership_v1(uuid, text) from public;
revoke all on function public.end_org_membership_v1(uuid, text) from anon;
grant execute on function public.end_org_membership_v1(uuid, text) to authenticated;

commit;
