-- ============================================================================
-- ROLLBACK for 20261026140000_assign_training_employees_v1
--
-- Restores public.assign_training_v1(text, text, text) EXACTLY as production
-- holds it before the forward migration (read 2026-10-26 from
-- pg_get_functiondef + pg_proc.proacl on project gorgitwvdzxbnaxhrsrw):
--   * body = 20260817230000_training_certification_v1 as patched by
--     20261003151000_email_verified_boundary_v1 (verified-email resolver),
--     with its comments stripped by that patch — md5(prosrc) on production
--     = 74795f98243e2ce340c424cf3c0ee0a5; this file reproduces that body byte
--     for byte (the guard and scripts/db-proof/assign-training-employees-v1.sh
--     both check the hash);
--   * SECURITY DEFINER, search_path = public, owner postgres;
--   * proacl = {postgres=X/postgres,authenticated=X/postgres}.
--
-- Data: nothing to guard. The forward migration writes no rows; assignments
-- made to employees while it was live stay as the employee's history (they
-- are rows of training_assignments, not of the function), and the restored
-- body only decides who may be assigned NEXT. No DROP, no data change.
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
  if not exists (
    select 1 from public.company_memberships m
     where m.profile_id = v_target
       and m.organization_id = prog.organization_id
       and m.status = 'active'
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
