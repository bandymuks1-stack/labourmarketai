-- DOWN for 20260923114500_nonstop_org_consolidation_v1
--
-- Restores EXACTLY what the forward run changed, from the old/new values it
-- wrote to `audit_logs` (action 'org_consolidation_v1', one run_id), newest
-- change first:
--   organizations (4)        archived_at / archived_reason -> the logged old values (NULL)
--   customer_requests (1)    status / updated_at -> the logged old values (submitted)
--   engagement_contexts (1)  status, ended_at, ended_reason, ended_note,
--                            lifecycle_stage, journal_review_enabled, is_primary,
--                            updated_at -> the logged old values (active)
--   profiles (2)             active_organization_id -> the logged old value
--                            (Ramunas f2315826, bandymuks1 a3d59458); profiles.updated_at
--                            is re-stamped by its set_updated_at trigger (not restorable,
--                            and it truthfully records the restore)
--   company_memberships (1)  the INSERTED manager row of Donatas in 20b2c802 is removed
--   organization_roles (1)   the INSERTED (20b2c802, workforce_provider) row is removed
-- Every restore is GUARDED: it only applies while the row still holds the value
-- the forward run wrote. A row that has changed since (someone reopened the
-- need, switched workspace, re-used the membership) aborts the rollback for a
-- human to decide — except a stored workspace pointer the PERSON changed since,
-- which is left as they chose it (NOTICE), because overriding a person's own
-- choice is not a restore.
-- Then, only when NO organization is archived any more, the CHECK and the two
-- columns are dropped. No audit row is deleted: the forward rows stay and a
-- 'rolled_back' marker is appended, so a later re-apply is allowed and the
-- history of both decisions remains.
--
-- Apply via Supabase MCP `apply_migration` only (never `supabase db push`).

begin;

do $$
declare
  c_action constant text := 'org_consolidation_v1';
  v_run    text;
  v_log    record;
  v_n      bigint;
  v_old    jsonb;
  v_new    jsonb;
begin
  -- The newest completed run that has not been rolled back.
  select a.payload->>'run_id' into v_run
    from public.audit_logs a
   where a.action = c_action
     and a.payload->>'step' = 'complete'
     and not exists (
       select 1 from public.audit_logs r
        where r.action = c_action
          and r.payload->>'step' = 'rolled_back'
          and r.payload->>'run_id' = a.payload->>'run_id')
   order by a.created_at desc
   limit 1;

  if v_run is null then
    raise notice 'org_consolidation_v1 DOWN: no applied run to restore; data untouched';
  else
    -- Reverse order of the forward writes.
    for v_log in
      select a.entity, a.entity_id, a.payload
        from public.audit_logs a
       where a.action = c_action
         and a.payload->>'run_id' = v_run
         and a.payload->>'step' <> 'complete'
       order by case a.payload->>'step'
                  when 'archive_organization'         then 1
                  when 'close_test_need'              then 2
                  when 'end_obsolete_engagement'      then 3
                  when 'repoint_active_organization'  then 4
                  when 'add_manager_membership'       then 5
                  when 'grant_capability'             then 6
                  else 99 end,
                a.entity_id
    loop
      v_old := v_log.payload->'old';
      v_new := v_log.payload->'new';

      if v_log.payload->>'step' = 'archive_organization' then
        update public.organizations
           set archived_at = (v_old->>'archived_at')::timestamptz,
               archived_reason = v_old->>'archived_reason'
         where id = v_log.entity_id
           and archived_at = (v_new->>'archived_at')::timestamptz
           and archived_reason = v_new->>'archived_reason';
        get diagnostics v_n = row_count;
        if v_n <> 1 then
          raise exception 'DOWN: organization % is no longer as archived by run %', v_log.entity_id, v_run;
        end if;

      elsif v_log.payload->>'step' = 'close_test_need' then
        update public.customer_requests
           set status = v_old->>'status',
               updated_at = (v_old->>'updated_at')::timestamptz
         where id = v_log.entity_id and status = v_new->>'status';
        get diagnostics v_n = row_count;
        if v_n <> 1 then
          raise exception 'DOWN: need % changed since run % (status is no longer closed)', v_log.entity_id, v_run;
        end if;

      elsif v_log.payload->>'step' = 'end_obsolete_engagement' then
        update public.engagement_contexts
           set status                 = v_old->>'status',
               ended_at               = (v_old->>'ended_at')::date,
               ended_reason           = v_old->>'ended_reason',
               ended_note             = v_old->>'ended_note',
               lifecycle_stage        = v_old->>'lifecycle_stage',
               journal_review_enabled = (v_old->>'journal_review_enabled')::boolean,
               is_primary             = (v_old->>'is_primary')::boolean,
               updated_at             = (v_old->>'updated_at')::timestamptz
         where id = v_log.entity_id
           and status = v_new->>'status'
           and ended_note is not distinct from v_new->>'ended_note';
        get diagnostics v_n = row_count;
        if v_n <> 1 then
          raise exception 'DOWN: engagement % changed since run %', v_log.entity_id, v_run;
        end if;

      elsif v_log.payload->>'step' = 'repoint_active_organization' then
        update public.profiles
           set active_organization_id = (v_old->>'active_organization_id')::uuid
         where id = v_log.entity_id
           and active_organization_id is not distinct from (v_new->>'active_organization_id')::uuid;
        get diagnostics v_n = row_count;
        if v_n <> 1 then
          raise notice 'DOWN: profile % switched workspace since run %; their own choice is kept', v_log.entity_id, v_run;
        end if;

      elsif v_log.payload->>'step' = 'add_manager_membership' then
        -- The row did not exist before the forward run: removing it is the
        -- exact restore. Refused if it was revoked/changed since.
        delete from public.company_memberships
         where id = v_log.entity_id
           and organization_id = (v_new->>'organization_id')::uuid
           and profile_id = (v_new->>'profile_id')::uuid
           and role = 'manager' and status = 'active'
           and source = v_new->>'source';
        get diagnostics v_n = row_count;
        if v_n <> 1 then
          raise exception 'DOWN: membership % changed since run %', v_log.entity_id, v_run;
        end if;

      elsif v_log.payload->>'step' = 'grant_capability' then
        delete from public.organization_roles
         where id = v_log.entity_id
           and organization_id = (v_new->>'organization_id')::uuid
           and role_slug = v_new->>'role_slug';
        get diagnostics v_n = row_count;
        if v_n <> 1 then
          raise exception 'DOWN: capability row % changed since run %', v_log.entity_id, v_run;
        end if;

      else
        raise exception 'DOWN: unknown logged step %', v_log.payload->>'step';
      end if;
    end loop;

    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (null, c_action, 'organizations', '20b2c802-c624-43c0-b368-8fa6c1fbeae3',
            jsonb_build_object('run_id', v_run, 'step', 'rolled_back', 'op', 'marker'));
  end if;

  -- The columns go only when nothing is archived any more (0-row guard).
  -- Read dynamically: on a database where the forward never ran, the column
  -- does not exist and there is nothing to guard.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'organizations'
       and column_name = 'archived_at') then
    execute 'select count(*) from public.organizations where archived_at is not null' into v_n;
    if v_n > 0 then
      raise exception 'DOWN: % organization(s) are still archived; refusing to drop organizations.archived_at', v_n;
    end if;
  end if;
end $$;

alter table public.organizations drop constraint if exists organizations_archive_shape_check;
alter table public.organizations drop column if exists archived_reason;
alter table public.organizations drop column if exists archived_at;

commit;
