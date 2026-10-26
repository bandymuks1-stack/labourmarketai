-- ============================================================================
-- 20261026140000 — assign_training_employees_v1  (registry 11.8, training &
-- certification register)
--
-- *** RED — SECURITY DEFINER body replace + restated GRANT/REVOKE. ***
--   Ships as a DRAFT + needs-human-gate PR. The `-- @human-gate-approved`
--   marker is deliberately ABSENT: the owner adds it only when approving the
--   apply (and the same commit adds this file to the approved-marker list in
--   apps/web/lib/guards/booking-engagement-end-v1.test.ts). Applied ONLY
--   through Supabase MCP apply_migration after explicit owner approval —
--   never `supabase db push`.
--
-- ----------------------------------------------------------------------------
-- THE DEFECT (production walk company-governance, run 40296167812, T-2)
-- ----------------------------------------------------------------------------
--   The owner of "QA-SYNTHETIC Alfa" assigns a course to Alfa's employee and
--   is told `invalid_assignee` ("To žmogaus jūsų organizacijoje nėra"). The
--   live body admits ONLY a person with an active `company_memberships` row in
--   the programme's organization — i.e. GOVERNANCE (owner/admin/manager/...).
--   An ordinary employee is not a governance member: they stand in the
--   organization through an accepted EMPLOYMENT relation (an active
--   `engagement_contexts` row with relationship_slug = 'employee'), so an
--   organization could not ask its own staff to take a course.
--
-- ----------------------------------------------------------------------------
-- WHAT CHANGES — one predicate, nothing else
-- ----------------------------------------------------------------------------
--   The assignee-eligibility check becomes:
--       active governance membership in prog.organization_id        (as today)
--    OR an active, confirmed EMPLOYEE engagement in prog.organization_id (new)
--   Signature, return values, SECURITY DEFINER, search_path, owner, grants,
--   the caller check (has_org_demand_access -> 'not_found'), the verified-
--   email resolver, the 5000 cap, the insert, the event and the
--   'already_assigned' path are byte-for-byte the production body.
--
-- ----------------------------------------------------------------------------
-- CANONICAL CHECK (doctrine §2 — the SAME "active employee of the org")
-- ----------------------------------------------------------------------------
--   No new table, column, status or helper. The employee predicate is the one
--   the product already uses to say "this person is an active employee of
--   THIS organization":
--     · accept_company_worker_invitation  — the worker's own acceptance
--       writes it (company_workers.company_id -> organizations.legacy_company_id
--       -> engagement_contexts.organization_id, slug 'employee', 'active');
--     · add_org_member / provision_company_worker_engagement_context — only
--       for a person with an ACCEPTED roster link (R-16);
--     · company_worker_engagement_links — the people list's
--       "engagementContextLinked" bridge (lib/company/company-workers.ts);
--     · end_roster_link_v1 — ending the roster link sets that same row
--       status = 'ended' (+ ended_at);
--     · team_member_at_v1 — the time-bounded form: started_at <= day <
--       ended_at. Its ACTIVE branch's date bounds are carried here, so a row
--       whose recorded end date has passed (or whose start is still in the
--       future) does not count even if its status was not yet flipped.
--       (Its other branch — status 'ended' with a FUTURE ended_at — is
--       deliberately NOT carried: an ended relation never qualifies.)
--   Rejected alternatives: profile_is_member_of_organization_v1 /
--   belongs_to_organization (ANY active slug — student, collaborator,
--   consultant, volunteer, owner ...: too broad, not employment);
--   company_workers alone (a roster row, keyed by legacy company; every
--   active Alfa roster row already has its employee engagement — measured
--   2/2 on production 2026-10-26 — and the engagement is what ending the
--   relation closes).
--
-- ----------------------------------------------------------------------------
-- WHY ISOLATION HOLDS
-- ----------------------------------------------------------------------------
--   * ec.organization_id = prog.organization_id: an employee of ANOTHER
--     organization never matches (and the caller must still have demand
--     access to prog.organization_id, else 'not_found').
--   * ec.status = 'active' + date bounds: ended / paused / end-dated
--     relations never match.
--   * relationship_slug = 'employee' only: no freelancer, collaborator,
--     consultant, student, volunteer, intern, viewer, manager or owner row
--     is widened in.
--   * Invited-but-not-accepted never matches: a pending invitation lives in
--     company_worker_invitations / invitations / company_memberships
--     (status 'invited') and creates NO engagement row until the worker
--     accepts; engagement_contexts has no 'invited' status (CHECK: active,
--     paused, ended); authenticated holds SELECT only on engagement_contexts
--     (writes: admin policy + consent-backed SECURITY DEFINER doors).
--   * Self-declared work history and the personal engagement are always
--     organization_id NULL, so they can never equal prog.organization_id.
--   * ONE answer: "no verified account", "not in this organization" and
--     "not an active employee" all return 'invalid_assignee' — no new oracle.
--
-- ROLLBACK (down): supabase/rollbacks/20261026140000_assign_training_employees_v1.down.sql
--   restores the exact production body (md5(prosrc) 74795f98243e2ce340c424cf3c0ee0a5)
--   and the same grants. No data to guard: this migration writes no rows.
-- ============================================================================

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
  if nullif(trim(coalesce(p_assignee_email, '')), '') is null then return 'invalid'; end if;
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

  select p.id into v_target from public.profiles p where p.id = public.profile_id_by_verified_email_v1(p_assignee_email) limit 1;
  if v_target is null then return 'invalid_assignee'; end if;
  -- Same organization: an active governance member, OR an active confirmed
  -- employee (the accepted 'employee' engagement). One answer otherwise.
  if not exists (
    select 1 from public.company_memberships m
     where m.profile_id = v_target
       and m.organization_id = prog.organization_id
       and m.status = 'active'
  ) and not exists (
    select 1 from public.engagement_contexts ec
     where ec.profile_id = v_target
       and ec.organization_id = prog.organization_id
       and ec.relationship_slug = 'employee'
       and ec.status = 'active'
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
