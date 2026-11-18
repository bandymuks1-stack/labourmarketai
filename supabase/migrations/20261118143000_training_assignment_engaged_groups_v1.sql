-- ============================================================================
-- 20261118143000 — training_assignment_engaged_groups_v1  (registry 11.8,
-- training & certification register)
--
-- *** RED — SECURITY DEFINER body replace + restated GRANT/REVOKE + one RLS
--     policy replaced (DROP POLICY / CREATE POLICY). ***
--   Ships as a DRAFT + needs-human-gate PR. The `-- @human-gate-approved`
--   marker is deliberately ABSENT: the owner adds it only when approving the
--   apply (and the same commit adds this file to the approved-marker list in
--   apps/web/lib/guards/booking-engagement-end-v1.test.ts). Applied ONLY
--   through Supabase MCP apply_migration after explicit owner approval —
--   never `supabase db push`.
--
--   RENAMED: this file was prepared on 2026-10-26 as
--   20261026140000_assign_training_employees_v1 (employees only) and was
--   never applied (docs/program/SYSTEM_REGISTER.md lists it as an open draft,
--   not in the production ledger). main has since gained later migrations
--   (latest 20261115120000), so it carries a NEW timestamp that sorts after
--   every migration on main, and its scope follows the owner decision below.
--
-- ----------------------------------------------------------------------------
-- OWNER DECISION (binding, 2026-11-18) — function 11.8
-- ----------------------------------------------------------------------------
--   Training is assigned to four groups:
--     1. employees (members);
--     2. interns (`intern` relationship, category `education`, practice in a
--        company);
--     3. learners (`student` relationship at a training provider);
--     4. lawfully invited external people (engaged non-member workers the
--        organization lawfully invited: collaborator / consultant /
--        freelancer engagements created through the invite flow).
--   Consistent with 20261115120000 (owner decision 2026-11-17): an ended
--   relationship removes current access, never the organization's lawfully
--   retained records; for `education` links access requires an ACTIVE
--   engagement.
--   Owner decision 2026-11-18 (P3-1): a paused relationship is not an end. A
--   paused, not-ended non-learning relationship may receive a training
--   assignment; the pause gives no other access.
--
-- ----------------------------------------------------------------------------
-- WHAT CHANGES
-- ----------------------------------------------------------------------------
--   1. assign_training_v1 — the assignee must, in the programme's OWN
--      organization, hold EITHER
--        · an active governance membership (company_memberships, as today), OR
--        · a started, not-ended engagement_contexts row whose relationship
--          is one of the four groups:
--            members      employee, manager, owner
--            interns      intern
--            learners     student
--            external     collaborator, consultant, freelancer
--          The status test is split by group (owner decision 2026-11-18,
--          "a paused relationship is not an end"):
--            non-learning slugs (employee, manager, owner, collaborator,
--              consultant, freelancer): status 'active' OR 'paused';
--            learning slugs (intern, student): status 'active' ONLY, as
--              20261115120000 requires for education links.
--          The pause gives nothing else: no read policy, grant or other
--          function changes with it.
--      An ended, end-dated or not-yet-started engagement never qualifies, nor
--      does a paused learning link, so a NEW assignment is refused once the
--      link ends.
--      The second argument also accepts the assignee's profile id: the
--      register's picker lists the organization's own people, and an owner
--      cannot read their e-mail addresses (profiles RLS). An id answers
--      exactly like an e-mail: one `invalid_assignee` for "unknown" and "not
--      in a group here" — no new outcome, no new oracle.
--   2. training_programs_select — a person keeps reading the programme of a
--      training they were assigned (title and description of their OWN
--      record) after their engagement ends. Before, the programme was
--      readable only through belongs_to_organization, so an ended intern's
--      own history lost its course name.
--
-- WHAT DOES NOT CHANGE
--   * Who may assign: has_org_demand_access(prog.organization_id).
--   * What the organization reads: training_assignments / _events /
--     training_skill_links through training_can_view_assignment_v1 —
--     assignee, assigner, the assigning organization's managing roles,
--     platform admin. That is ONLY the training records the organization
--     itself created; it never depended on the engagement, so the history
--     stays readable to the organization after the relationship ends. No
--     journal, CV, document or profile data of the person is opened.
--   * Completion stays self-only (complete_training_assignment_v1).
--   * Signature, return values, SECURITY DEFINER, search_path, owner and
--     grants of assign_training_v1; no table, column, trigger or data change.
--
-- CANONICAL CHECK (doctrine §2): no new table, column, helper or status. The
--   groups are relationship_types slugs already in the registry (0013,
--   20261012170000); the date test is the one 20261026 used and
--   team_member_at_v1 uses (started_at <= day < ended_at); 'paused' is an
--   existing engagement status (engagement_contexts_status_check).
--   The slug list is explicit on purpose: a new relationship type (volunteer,
--   viewer, a future apprentice) joins training only by a new owner decision.
--
-- ROLLBACK: supabase/rollbacks/20261118143000_training_assignment_engaged_groups_v1.down.sql
--   restores the production body of assign_training_v1 (md5(prosrc)
--   74795f98243e2ce340c424cf3c0ee0a5), its grants, and the original
--   training_programs_select policy. No data to guard: this migration writes
--   no rows; assignments made while it was live stay as records.
-- ============================================================================

begin;

-- 1. assign_training_v1 -------------------------------------------------------
create or replace function public.assign_training_v1(p_program_id text, p_assignee_email text, p_required_by text default null)
 returns text
 language plpgsql
 security definer
 set search_path = public
as $function$
declare
  uid        uuid := auth.uid();
  v_id       uuid;
  v_required date;
  v_target   uuid;
  v_who      text := trim(coalesce(p_assignee_email, ''));
  prog       public.training_programs%rowtype;
  v_new      uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id := nullif(trim(coalesce(p_program_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null then return 'invalid'; end if;
  if nullif(v_who, '') is null then return 'invalid'; end if;
  begin
    v_required := nullif(trim(coalesce(p_required_by, '')), '')::date;
  exception when invalid_text_representation or datetime_field_overflow
              or invalid_datetime_format then
    return 'invalid';
  end;

  select * into prog from public.training_programs p where p.id = v_id;
  if prog.id is null or not public.has_org_demand_access(prog.organization_id) then
    return 'not_found';
  end if;
  if not prog.is_active then return 'inactive_program'; end if;

  -- The assignee: a profile id from the register's picker, or a verified e-mail.
  if v_who ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select p.id into v_target from public.profiles p where p.id = v_who::uuid;
  else
    select p.id into v_target from public.profiles p where p.id = public.profile_id_by_verified_email_v1(v_who) limit 1;
  end if;
  if v_target is null then return 'invalid_assignee'; end if;
  -- The four groups of the owner decision (2026-11-18), in THIS organization,
  -- while the link is current. A paused non-learning link still counts (a
  -- pause is not an end); a learning link (intern, student) must be active.
  -- One answer otherwise.
  if not exists (
    select 1 from public.company_memberships m
     where m.profile_id = v_target
       and m.organization_id = prog.organization_id
       and m.status = 'active'
  ) and not exists (
    select 1 from public.engagement_contexts ec
     where ec.profile_id = v_target
       and ec.organization_id = prog.organization_id
       and (
             (ec.relationship_slug in ('employee', 'manager', 'owner',
                                       'collaborator', 'consultant', 'freelancer')
              and ec.status in ('active', 'paused'))
          or (ec.relationship_slug in ('intern', 'student')
              and ec.status = 'active')
       )
       and (ec.started_at is null or ec.started_at <= current_date)
       and (ec.ended_at is null or ec.ended_at > current_date)
  ) then
    return 'invalid_assignee';
  end if;

  if (select count(*) from public.training_assignments a
       where a.organization_id = prog.organization_id
         and a.status = 'assigned') >= 5000 then
    return 'limit_reached';
  end if;

  begin
    insert into public.training_assignments
      (program_id, organization_id, assignee_profile_id, required_by, assigned_by)
    values (prog.id, prog.organization_id, v_target, v_required, uid)
    returning id into v_new;
  exception when unique_violation then
    return 'already_assigned';
  end;

  insert into public.training_assignment_events
    (training_assignment_id, actor_id, event_type, after_state)
  values (v_new, uid, 'assigned',
          jsonb_build_object('program_id', prog.id::text,
                             'required_by', v_required));

  return 'assigned';
end $function$;

revoke all on function public.assign_training_v1(text, text, text) from public;
revoke all on function public.assign_training_v1(text, text, text) from anon;
grant execute on function public.assign_training_v1(text, text, text) to authenticated;

-- 2. training_programs_select -------------------------------------------------
-- The training_assignments sub-select runs under that table's own RLS
-- (training_can_view_assignment_v1, SECURITY DEFINER), so there is no policy
-- recursion; the arm admits only the person the programme was assigned to.
drop policy if exists training_programs_select on public.training_programs;
create policy training_programs_select on public.training_programs
  for select to authenticated
  using (
    public.belongs_to_organization(organization_id)
    or public.is_admin()
    or exists (
      select 1 from public.training_assignments a
       where a.program_id = training_programs.id
         and a.assignee_profile_id = auth.uid()
    )
  );

commit;
