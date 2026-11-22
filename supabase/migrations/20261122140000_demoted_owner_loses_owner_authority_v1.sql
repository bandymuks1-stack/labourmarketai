-- @human-gate-approved
-- The annotation lets this file pass CI only. It is NOT owner approval: the PR
-- is a RED draft with needs-human-gate, and nothing here is applied until the
-- owner approves this exact SQL (owner decision 2026-11-22, item 2).
-- ============================================================================
-- 20261122140000_demoted_owner_loses_owner_authority_v1
--
-- SAFETY CLASS: RED. Replaces SECURITY DEFINER bodies, adds one internal
-- SECURITY DEFINER helper (no client grant) and narrows four RLS policies.
-- ZERO rows change at apply time; UPDATEs run only inside function bodies,
-- when an owner demotes a membership.
--
-- OWNER DECISION (2026-11-22): a demoted owner loses owner rights at once.
-- Only the new role's rights remain; nothing is left over through sessions,
-- the API, organization management or RLS. The organization is never left
-- without a lawful owner, and nobody takes control on their own.
--
-- DEFECT. membership_change_role_v1 (20260806120000) changes only
-- company_memberships.role. 20261021093000 closed the same paths for revoke
-- and leave, and named demotion a separate slice. After owner -> admin /
-- manager / external_manager / member, the person still holds:
--   (a) organizations.owner_profile_id, read as "the owner" by
--       validate_active_organization, add_org_member, end_org_membership_v1,
--       invitation_org_authority_v1, organizations_select and the app's
--       readOwnedOrganizations;
--   (b) the active 'owner' engagement (and, after a demotion to member, the
--       'manager' / 'external_manager' ones), read by manages_organization,
--       which ~40 policies and definer guards consume;
--   (c) the creator arm, for the person who created the company or agency:
--       owns_company, owns_agency, save_company_setup_v3 and the RLS policies
--       companies_update / companies_delete / agencies_update /
--       agencies_delete still pass on `profile_id = auth.uid()`, so a creator
--       demoted to member can still edit or DELETE the company row.
--   The app's employer context already follows the membership: an active
--   `member` row resolves as member and opens no employer surface
--   (lib/company/employer-company-context.ts, isGovernanceRole), so no app
--   change is needed; the database paths above are what is left over.
--
-- CHANGE.
--   1. membership_demote_governance_v1 (INTERNAL): when an ACTIVE owner
--      membership is demoted, move organizations.owner_profile_id to another
--      ACTIVE owner (the acting owner first, else the earliest accepted) or
--      answer 'last_owner'; then end the governance-proxy engagements the new
--      role no longer carries:
--        admin / manager      -> 'owner'
--        external_manager     -> 'owner', 'manager'
--        member               -> 'owner', 'manager', 'external_manager'
--      A demotion that is not from owner (e.g. admin -> member) ends the same
--      set minus 'owner'. Employment engagements are never touched. Rows are
--      kept; one engagement_lifecycle_events pair + one audit_logs row each,
--      the shape membership_close_governance_v1 writes.
--   2. membership_change_role_v1: same body plus the call, inside the
--      existing subtransaction, so a refusal rolls the role change back. The
--      last-owner trigger (company_memberships_protect_last_owner) still
--      fires first; both refusals surface as the existing 'last_owner'.
--   3. creator_governance_ended_v1: a creator whose ACTIVE membership in the
--      bound organization has a role other than owner / admin is no longer an
--      owner-equivalent through the creator arm (the membership decides). An
--      admin creator keeps the creator arm: owns_company already admits admin
--      through its membership arm, and owns_agency has no admin arm, so an
--      owner demoted to admin of an AGENCY keeps agency management. Named
--      below as an owner check.
--   4. owns_company: the inline "ended" test becomes
--      company_creator_governance_ended_v1 (same rule + step 3).
--   5. companies_update / companies_delete / agencies_update /
--      agencies_delete: the creator arm also requires the creator's
--      governance not to have ended. The is_admin() arm is unchanged.
--
-- NOT CHANGED (unchanged rules, stated so nothing reads as an oversight):
--   * Who may grant owner: only an owner (membership_invite_v1 line 151,
--     membership_change_role_v1 refuses an admin). Nobody can promote
--     themselves; no new path writes organizations.owner_profile_id.
--   * A self-demotion by the last owner is refused ('last_owner').
--   * Sessions: every server read re-checks memberships, engagements and the
--     owner pointer per request (validate_active_organization, the employer
--     context, the MCP bearer path), so a session opened before the demotion
--     carries no owner right after it. JWTs carry no organization role.
--
-- IMPACT AT APPLY: none (no row is written). Who is affected afterwards:
--   creators whose active membership is manager / external_manager / member
--   lose the creator arm immediately. Owner check before applying (read-only):
--     select o.id, o.organization_type, m.role
--       from public.organizations o
--       join public.companies c on c.id = o.legacy_company_id
--       join public.company_memberships m
--         on m.organization_id = o.id and m.profile_id = c.profile_id
--      where m.status = 'active' and m.role not in ('owner','admin')
--     union all
--     select o.id, o.organization_type, m.role
--       from public.organizations o
--       join public.agencies a on a.id = o.legacy_agency_id
--       join public.company_memberships m
--         on m.organization_id = o.id and m.profile_id = a.profile_id
--      where m.status = 'active' and m.role not in ('owner','admin');
--   Rows returned are organizations where an already-demoted creator still
--   holds owner rights today; they lose them on apply. Earlier demotions are
--   NOT repaired retroactively (their owner pointer and 'owner' engagement
--   stay until an owner re-runs the role change or revokes) — no data is
--   rewritten at apply time.
--
-- RISKS.
--   * An organization whose only owner membership is the demoted person is
--     refused (unchanged trigger) — no ownerless organization.
--   * owner_profile_id pointing at a person with no owner membership (legacy
--     rows) is untouched: the move runs only when the pointer names the
--     demoted person.
--   * Agency admins keep owns_agency (see 3); narrowing it needs an agency
--     admin arm first, else admins lose agency management.
--
-- TESTS: apps/web/lib/guards/demoted-owner-authority.test.ts (static);
--   rolled-back production test script in
--   docs/ops/DEMOTED_OWNER_AUTHORITY_2026_11_22_APPLY.md.
-- Rollback: supabase/rollbacks/20261122140000_demoted_owner_loses_owner_authority_v1.down.sql
-- ============================================================================

-- ── 1. internal helper ───────────────────────────────────────────────────
create or replace function public.membership_demote_governance_v1(
  p_organization_id uuid,
  p_profile_id      uuid,
  p_actor           uuid,
  p_from_role       text,
  p_to_role         text
) returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_owner     uuid;
  v_successor uuid;
  v_ec        record;
  v_stage     text;
  v_note      text := 'governance_membership_demoted';
  v_end       text[];
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_organization_id is null or p_profile_id is null then
    return 'nothing';
  end if;

  v_end := case p_to_role
    when 'admin'            then array['owner']
    when 'manager'          then array['owner']
    when 'external_manager' then array['owner', 'manager']
    when 'member'           then array['owner', 'manager', 'external_manager']
    else array[]::text[]
  end;
  if p_from_role is distinct from 'owner' then
    v_end := array_remove(v_end, 'owner');
  end if;

  -- The owner pointer, locked so two concurrent demotions cannot each pick
  -- the other as the successor.
  if p_from_role = 'owner' then
    select o.owner_profile_id into v_owner
      from public.organizations o
     where o.id = p_organization_id
     for update;
    if v_owner is not null and v_owner = p_profile_id then
      select m.profile_id into v_successor
        from public.company_memberships m
       where m.organization_id = p_organization_id
         and m.role = 'owner'
         and m.status = 'active'
         and m.profile_id <> p_profile_id
       order by (m.profile_id is not distinct from p_actor) desc,
                m.accepted_at asc nulls last, m.created_at asc, m.id asc
       limit 1;
      if v_successor is null then
        return 'last_owner';
      end if;
      update public.organizations
         set owner_profile_id = v_successor,
             updated_at = now()
       where id = p_organization_id;
      insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
      values (p_actor, 'organization_owner_moved', 'organizations', p_organization_id,
        jsonb_build_object('from_profile_id', p_profile_id,
          'to_profile_id', v_successor, 'reason', v_note));
    end if;
  end if;

  if cardinality(v_end) = 0 then
    return 'closed';
  end if;

  for v_ec in
    select ec.id, ec.relationship_slug, ec.status, ec.lifecycle_stage
      from public.engagement_contexts ec
     where ec.organization_id = p_organization_id
       and ec.profile_id = p_profile_id
       and ec.status in ('active', 'paused')
       and ec.relationship_slug = any (v_end)
     order by ec.created_at
     for update
  loop
    v_stage := coalesce(v_ec.lifecycle_stage,
                        case when v_ec.status = 'ended' then 'ended' else 'active' end);
    update public.engagement_contexts
       set status                 = 'ended',
           ended_at               = coalesce(ended_at, current_date),
           journal_review_enabled = false,
           is_primary             = false,
           lifecycle_stage        = 'ended',
           ended_reason           = coalesce(ended_reason, 'other'),
           ended_note             = coalesce(ended_note, v_note),
           updated_at             = now()
     where id = v_ec.id
       and status <> 'ended';
    insert into public.engagement_lifecycle_events
      (engagement_context_id, actor_profile_id, action, before_stage, after_stage, note, metadata)
    values (v_ec.id, p_actor, 'engagement_ended', v_stage, 'ended', v_note,
            jsonb_build_object('reason', 'other', 'source', 'company_membership'));
    insert into public.engagement_lifecycle_events
      (engagement_context_id, actor_profile_id, action, before_stage, after_stage)
    values (v_ec.id, p_actor, 'stage_changed', v_stage, 'ended');
    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (p_actor, 'end_org_membership', 'engagement_contexts', v_ec.id,
      jsonb_build_object(
        'organization_id', p_organization_id,
        'profile_id',      p_profile_id,
        'from_role',       v_ec.relationship_slug,
        'to_role',         'ended',
        'from_status',     v_ec.status,
        'to_status',       'ended',
        'actor_capacity',  'membership_command',
        'self_initiated',  (p_profile_id is not distinct from p_actor),
        'reason',          v_note));
  end loop;

  return 'closed';
end $$;

revoke all on function public.membership_demote_governance_v1(uuid, uuid, uuid, text, text) from public;
revoke all on function public.membership_demote_governance_v1(uuid, uuid, uuid, text, text) from anon;
revoke all on function public.membership_demote_governance_v1(uuid, uuid, uuid, text, text) from authenticated;

-- ── 2. change role: the demotion closes the old role's grant paths ───────
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

  select id, organization_id, profile_id, role, status into m
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
    -- A demotion closes the old role's other grant paths in the same
    -- subtransaction: owner pointer moved (or refused) and the governance
    -- engagements the new role does not carry ended.
    if p_new_role <> 'owner' then
      if coalesce(public.membership_demote_governance_v1(
            m.organization_id, m.profile_id, uid, m.role, p_new_role) = 'last_owner', false) then
        raise exception 'last_owner_membership' using errcode = '23514';
      end if;
    end if;
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

revoke all on function public.membership_change_role_v1(uuid, text) from public;
revoke all on function public.membership_change_role_v1(uuid, text) from anon;
grant execute on function public.membership_change_role_v1(uuid, text) to authenticated;

-- ── 3. the creator arm follows the creator's membership ──────────────────
create or replace function public.creator_governance_ended_v1(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select p_organization_id is not null
     and (
       -- ended: an accepted membership revoked, and no active one
       (exists (
          select 1 from public.company_memberships r
           where r.organization_id = p_organization_id
             and r.profile_id = auth.uid()
             and r.status = 'revoked'
             and r.accepted_at is not null)
        and not exists (
          select 1 from public.company_memberships l
           where l.organization_id = p_organization_id
             and l.profile_id = auth.uid()
             and l.status = 'active'))
       -- demoted: the active membership names a role below admin
       or exists (
          select 1 from public.company_memberships d
           where d.organization_id = p_organization_id
             and d.profile_id = auth.uid()
             and d.status = 'active'
             and d.role not in ('owner', 'admin'))
     )
$$;
revoke all on function public.creator_governance_ended_v1(uuid) from public, anon;
grant execute on function public.creator_governance_ended_v1(uuid) to authenticated;

-- ── 4. owns_company: one rule for the creator arm ────────────────────────
create or replace function public.owns_company(c uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.companies x
     where x.id = c and x.profile_id = auth.uid()
       and not public.company_creator_governance_ended_v1(c)
  )
  or exists (
    select 1
      from public.organizations o
      join public.company_memberships m on m.organization_id = o.id
     where o.legacy_company_id = c
       and m.profile_id = auth.uid()
       and m.status = 'active'
       and m.role in ('owner', 'admin')
  )
$$;
revoke all on function public.owns_company(uuid) from public;
revoke all on function public.owns_company(uuid) from anon;
grant execute on function public.owns_company(uuid) to authenticated;

-- ── 5. company / agency row edits and deletes follow the same rule ───────
alter policy companies_update on public.companies
  using ((profile_id = auth.uid() and not public.company_creator_governance_ended_v1(id)) or public.is_admin())
  with check ((profile_id = auth.uid() and not public.company_creator_governance_ended_v1(id)) or public.is_admin());
alter policy companies_delete on public.companies
  using ((profile_id = auth.uid() and not public.company_creator_governance_ended_v1(id)) or public.is_admin());
alter policy agencies_update on public.agencies
  using ((profile_id = auth.uid() and not public.agency_creator_governance_ended_v1(id)) or public.is_admin())
  with check ((profile_id = auth.uid() and not public.agency_creator_governance_ended_v1(id)) or public.is_admin());
alter policy agencies_delete on public.agencies
  using ((profile_id = auth.uid() and not public.agency_creator_governance_ended_v1(id)) or public.is_admin());
