-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260705220000 — teams / brigades minimum on the org spine (product-tree
-- branch 13, train §8.3).
--
-- PROBLEM (reality-map 2026-07-05 §branch 13, YELLOW): brigades exist ONLY as
-- non-persisted marketing-preview fragments (lib/staffing worker-intake
-- 'brigade' engagement type, NEED_TEAM_SHAPES). There is no persisted team
-- identity, no team membership, no capability summary — a company cannot
-- represent a real work brigade anywhere.
--
-- SOLUTION (map row 5: "team identity on organizations + membership via
-- engagement_contexts + capability summary"): NO new org system, NO new
-- table. A team/brigade is an organizations ROW (additive typed rows on the
-- EXISTING table — the additive-widening precedent is company_type =
-- 'staffing_agency' in 20260612090000):
--
--   1. organizations_organization_type_check is WIDENED from
--      ('company','agency','other') to ('company','agency','team','other').
--      Strictly additive: every previously valid value stays valid.
--   2. create_team_v1(p_team_name) — the ONLY write RPC added. organizations
--      writes are admin-only under RLS (0013 organizations_write_admin), so
--      team creation needs a definer RPC exactly like every other org-spine
--      write. It inserts ONE organizations row (organization_type='team',
--      owner_profile_id = caller). The EXISTING 0035 trigger
--      (on_org_owner_engagement) then provisions the creator's 'owner'
--      engagement_context — so manages_organization() and the EXISTING
--      canonical membership RPC add_org_member (20260530140000) work on the
--      team org with ZERO changes. Membership is the EXISTING
--      engagement_contexts 'employee' relationship — this migration adds NO
--      membership RPC, NO new relationship_types slug, and does NOT touch
--      add_org_member.
--   3. get_team_capability_summary_v1(p_org_id) — read-only summary derived
--      from members' EXISTING worker_skills rows (0010): per skill slug, how
--      many active members declared it and how many of those declarations a
--      manager confirmed (worker_skills.verified, set only by the existing
--      confirm_entry_and_verify_skills review chain). Honest counts only —
--      no team rating, no fake team verification, no new skill table.
--
-- WHAT IS DELIBERATELY NOT ADDED:
--   - NO new table, NO parallel team/HR subsystem (§8.3 "no separate HR
--     platform"), NO new column on any table;
--   - NO recreate of ANY existing RPC or trigger — both functions below are
--     NEW names (rollback-chain rule: nothing to restore verbatim);
--   - NO new relationship_types slug — team membership reuses the canonical
--     'employee' engagement written by the EXISTING add_org_member;
--   - NO matching visibility change, NO availability aggregation (later
--     wagon if ever), NO RLS/policy/table-grant change.
--
-- @human-gate-approved — TIER: owner-gated (SECURITY DEFINER functions +
-- GRANT + check-constraint change are RED-class). Ships as a
-- needs-human-gate DRAFT with the exact SQL; prod apply stays manual via
-- Supabase MCP after owner approval — never db push. Until applied, the app
-- degrades honestly: the readiness probe sees 42883 and the company room
-- keeps showing the existing honest roster empty state.
--
-- ROLLBACK: supabase/rollbacks/20260705220000_team_brigade_org_spine.down.sql
-- restores the prior state exactly: drops ONLY the two NEW functions, removes
-- ONLY feature-created rows (organization_type='team' orgs + their
-- engagements), and restores the 0013 organization_type check constraint
-- VERBATIM. No existing RPC was recreated, so no RPC body needs restoring.
-- ============================================================================

begin;

-- ── 1. Widen organizations.organization_type (additive typed rows) ─────────
-- Precedent 20260612090000 (companies.company_type widening): drop + re-add
-- with a strict superset. 'team' joins the allowlist; nothing is removed.
alter table public.organizations
  drop constraint if exists organizations_organization_type_check;
alter table public.organizations
  add constraint organizations_organization_type_check
  check (organization_type in ('company','agency','team','other'));

-- ── 2. create_team_v1 — team identity row on the EXISTING org spine ────────
create or replace function public.create_team_v1(
  p_team_name text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid          uuid := auth.uid();
  cleaned_name text := nullif(trim(coalesce(p_team_name, '')), '');
  v_new        uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Only someone who already OWNS a real organization on the spine (a
  -- company/agency mirror org, 0013) may create a brigade. No org → no team.
  if not exists (
    select 1 from public.organizations o
     where o.owner_profile_id = uid
       and o.organization_type <> 'team'
  ) and not public.is_admin() then
    return 'not_allowed';
  end if;

  if cleaned_name is null
     or char_length(cleaned_name) < 2
     or char_length(cleaned_name) > 80 then
    return 'invalid_team_name';
  end if;

  -- Abuse cap: a single owner cannot mint unlimited team rows.
  if (select count(*) from public.organizations o
       where o.owner_profile_id = uid
         and o.organization_type = 'team') >= 20 then
    return 'team_limit_reached';
  end if;

  -- ONE additive typed row. The EXISTING 0035 trigger on organizations
  -- (on_org_owner_engagement) provisions the creator's 'owner'
  -- engagement_context — membership management then flows through the
  -- EXISTING add_org_member / manages_organization spine untouched.
  insert into public.organizations
    (owner_profile_id, organization_type, display_name)
  values
    (uid, 'team', cleaned_name)
  returning id into v_new;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'create_team_v1', 'organizations', v_new,
    jsonb_build_object(
      'organization_type', 'team',
      'display_name', cleaned_name,
      'result', 'created'));

  return 'created';
end $$;

revoke all on function public.create_team_v1(text) from public;
grant execute on function public.create_team_v1(text) to authenticated;

-- ── 3. get_team_capability_summary_v1 — read-only honest counts ────────────
-- Derived ONLY from members' EXISTING worker_skills rows. members_declared =
-- distinct active members declaring the skill; members_confirmed = those
-- whose declaration a manager confirmed through the EXISTING journal review
-- chain (worker_skills.verified). SELECT-only body: it never writes
-- worker_skills, engagement_contexts, or organizations.
create or replace function public.get_team_capability_summary_v1(
  p_org_id uuid
) returns table (
  skill_slug        text,
  members_declared  integer,
  members_confirmed integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  v_owner uuid;
  v_type  text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select o.owner_profile_id, o.organization_type
    into v_owner, v_type
    from public.organizations o
   where o.id = p_org_id;
  if not found or v_type <> 'team' then
    return; -- not a team → empty, never an error surface
  end if;
  if not (public.is_admin()
          or v_owner = uid
          or public.manages_organization(p_org_id)) then
    return; -- not the team's owner/manager → empty
  end if;

  return query
  select s.slug,
         count(distinct w.id)::integer as members_declared,
         count(distinct w.id) filter (where ws.verified)::integer
           as members_confirmed
    from public.engagement_contexts ec
    join public.workers w        on w.profile_id = ec.profile_id
    join public.worker_skills ws on ws.worker_id = w.id
    join public.skills s         on s.id = ws.skill_id
   where ec.organization_id = p_org_id
     and ec.relationship_slug = 'employee'
     and ec.status = 'active'
   group by s.slug
   order by members_declared desc, s.slug
   limit 30;
end $$;

revoke all on function public.get_team_capability_summary_v1(uuid) from public;
grant execute on function public.get_team_capability_summary_v1(uuid) to authenticated;

commit;

-- ROLLBACK (down): supabase/rollbacks/20260705220000_team_brigade_org_spine.down.sql
-- restores the prior state exactly (drops the two NEW functions, removes
-- feature-created 'team' rows, restores the 0013 check constraint verbatim).
