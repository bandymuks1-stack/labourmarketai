-- @human-gate-approved: owner approved #3837 manual merge/apply/cron on 2026-11-27; NOT APPLIED.
-- Approved payload SHA256 A5202D18C79DF732D956553BF6ED987FF36E340AA8AD25EDACF4A2C3A3E1B9EE; only header comments differ.
-- @plan-cache-proof: scripts/db-proof/plan-cache-probe.sql method; scripts/db-proof/timesheet-schedules.cjs repeats both bounded selectors 12 times under auto and force_generic_plan.
-- RED: private opt-in settings and explicitly delegated scheduled submission.
-- Existing journal, timesheet, workflow and notification stores remain canonical.
begin;

create table public.timesheet_schedules (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  definition_id uuid not null references public.workflow_definitions(id),
  frequency text not null check (frequency in ('daily','weekly','monthly')),
  local_time time not null check (extract(second from local_time) = 0),
  time_zone text not null check (length(time_zone) between 1 and 64),
  weekday smallint not null default 1 check (weekday between 1 and 7),
  enabled boolean not null default false,
  next_run_at timestamptz not null,
  retry_after timestamptz,
  last_run_at timestamptz,
  last_outcome text check (last_outcome in ('submitted','already_submitted','empty','overlap','not_allowed','no_template','error')),
  last_timesheet_id uuid references public.timesheets(id),
  pending_instance_id uuid references public.workflow_instances(id),
  updated_at timestamptz not null default now(),
  unique (profile_id, organization_id)
);
create index timesheet_schedules_due_idx on public.timesheet_schedules(next_run_at) where enabled;
create index timesheet_schedules_notification_idx on public.timesheet_schedules(id) where pending_instance_id is not null;
alter table public.timesheet_schedules enable row level security;
revoke all on public.timesheet_schedules from public, anon, authenticated;
grant select on public.timesheet_schedules to authenticated;
create policy timesheet_schedules_self_read on public.timesheet_schedules for select to authenticated
  using (profile_id = (select auth.uid()));

-- Calendar arithmetic stays in the chosen zone (including DST), never UTC-day arithmetic.
-- Monthly delivery is on day 1 for the preceding full calendar month.
create function public.timesheet_schedule_next_v1(
  p_frequency text, p_time time, p_zone text, p_weekday smallint, p_after timestamptz
) returns timestamptz language plpgsql stable set search_path = public as $$
declare d date; candidate timestamptz; i integer;
begin
  if p_frequency is null or p_frequency not in ('daily','weekly','monthly')
    or p_time is null or p_weekday is null or p_weekday not between 1 and 7
    or p_after is null or not exists(select 1 from pg_timezone_names where name=p_zone) then
    raise exception 'Invalid schedule' using errcode='22023';
  end if;
  d := (p_after at time zone p_zone)::date;
  for i in 0..32 loop
    if p_frequency='daily' or (p_frequency='weekly' and extract(isodow from d)=p_weekday)
       or (p_frequency='monthly' and extract(day from d)=1) then
      candidate := (d + p_time) at time zone p_zone;
      if candidate > p_after then return candidate; end if;
    end if;
    d := d + 1;
  end loop;
  raise exception 'Invalid schedule' using errcode='22023';
end $$;
revoke all on function public.timesheet_schedule_next_v1(text,time,text,smallint,timestamptz) from public,anon,authenticated;

-- Only the signed-in worker may opt their own reports in. No actor parameter.
create function public.save_timesheet_schedule_v1(
  p_organization_id uuid, p_definition_id uuid, p_frequency text,
  p_local_time text, p_time_zone text, p_weekday smallint, p_enabled boolean
) returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_time time; v_next timestamptz;
begin
  if uid is null then raise exception 'Not authenticated' using errcode='42501'; end if;
  -- Disabling never depends on a still-active membership or template.
  if p_enabled is false then
    update public.timesheet_schedules set enabled=false,updated_at=now()
      where profile_id=uid and organization_id=p_organization_id;
    return 'saved';
  end if;
  if p_enabled is null or not coalesce(public.belongs_to_organization(p_organization_id),false)
    or not exists(select 1 from public.workers where profile_id=uid) then return 'not_allowed'; end if;
  if not exists(select 1 from public.workflow_definitions d where d.id=p_definition_id
      and d.organization_id=p_organization_id and d.is_active and d.context_entity_type='timesheet'
      and exists(select 1 from public.workflow_definition_versions v where v.definition_id=d.id and v.published_at is not null)) then
    return 'no_template';
  end if;
  if p_local_time is null or p_local_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return 'invalid'; end if;
  begin
    v_time := p_local_time::time;
    v_next := public.timesheet_schedule_next_v1(p_frequency,v_time,p_time_zone,p_weekday,now());
  exception when invalid_parameter_value then return 'invalid';
  end;
  insert into public.timesheet_schedules(profile_id,organization_id,definition_id,frequency,local_time,time_zone,weekday,enabled,next_run_at)
    values(uid,p_organization_id,p_definition_id,p_frequency,v_time,p_time_zone,p_weekday,true,v_next)
    on conflict (profile_id,organization_id) do update set
      definition_id=excluded.definition_id,frequency=excluded.frequency,local_time=excluded.local_time,
      time_zone=excluded.time_zone,weekday=excluded.weekday,enabled=true,next_run_at=excluded.next_run_at,
      retry_after=null,last_outcome=null,updated_at=now();
  return 'saved';
end $$;
revoke all on function public.save_timesheet_schedule_v1(uuid,uuid,text,text,text,smallint,boolean) from public,anon;
grant execute on function public.save_timesheet_schedule_v1(uuid,uuid,text,text,text,smallint,boolean) to authenticated;

-- Service-only bounded dispatcher. The actor is read ONLY from an explicit saved
-- opt-in, never supplied by a cron caller. Re-check current membership/template,
-- then delegate to the unchanged canonical user commands in one transaction.
-- Temporary request identity is always restored, including failed submissions.
-- Existing published approvals are required; this NEVER approves any work.
create function public.run_due_timesheet_schedules_v1()
returns table(schedule_id uuid, instance_id uuid, outcome text)
language plpgsql security definer set search_path = public as $$
declare
  s public.timesheet_schedules%rowtype; worker uuid; first_day date; last_day date;
  due_day date; sheet uuid; instance uuid; result text; state text; snapshot jsonb;
  saved_claims text := current_setting('request.jwt.claims',true);
  saved_sub text := current_setting('request.jwt.claim.sub',true);
  saved_role text := current_setting('request.jwt.claim.role',true);
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Not allowed' using errcode='42501'; end if;
  for s in select * from public.timesheet_schedules ts
      where ts.enabled and ts.next_run_at<=now() and ts.pending_instance_id is null
        and (ts.retry_after is null or ts.retry_after<=now())
      order by ts.next_run_at,ts.id limit 20 for update skip locked loop
    sheet := null; instance := null; result := null; worker := null;
    begin
      perform set_config('request.jwt.claims',jsonb_build_object('sub',s.profile_id,'role','authenticated')::text,true);
      perform set_config('request.jwt.claim.sub',s.profile_id::text,true);
      perform set_config('request.jwt.claim.role','authenticated',true);
      select w.id into worker from public.workers w where w.profile_id=s.profile_id;
      if worker is null or not coalesce(public.belongs_to_organization(s.organization_id),false) then
        result := 'not_allowed';
      elsif not exists(select 1 from public.workflow_definitions d where d.id=s.definition_id
          and d.organization_id=s.organization_id and d.is_active and d.context_entity_type='timesheet'
          and exists(select 1 from public.workflow_definition_versions v where v.definition_id=d.id and v.published_at is not null)) then
        result := 'no_template';
      else
        due_day := (s.next_run_at at time zone s.time_zone)::date;
        last_day := due_day-1;
        first_day := case s.frequency when 'daily' then last_day when 'weekly' then due_day-7
          else (date_trunc('month',due_day::timestamp)-interval '1 month')::date end;
        perform pg_advisory_xact_lock(hashtextextended('timesheets:'||worker::text||':'||s.organization_id::text,0));
        select t.id,t.status into sheet,state from public.timesheets t where t.worker_id=worker
          and t.organization_id=s.organization_id and t.period_start=first_day and t.period_end=last_day for update;
        if sheet is not null and state in ('submitted','approved') then result := 'already_submitted';
        elsif sheet is not null then result := 'overlap'; -- never seize a person's manual draft/rejection
        elsif exists(select 1 from public.timesheets t where t.worker_id=worker and t.organization_id=s.organization_id
            and daterange(t.period_start,t.period_end,'[]') && daterange(first_day,last_day,'[]')) then result := 'overlap';
        else
          snapshot := public.timesheet_compute_lines_v1(worker,s.organization_id,first_day,last_day);
          if jsonb_array_length(coalesce(snapshot->'lines','[]'::jsonb))=0 then result := 'empty';
          else
            -- A subtransaction rolls back BOTH document and workflow on any rejected command.
            result := public.create_timesheet_v1(s.organization_id::text,first_day::text,last_day::text);
            if result is null or result !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Schedule command rejected'; end if;
            sheet := result::uuid;
            result := public.start_workflow_instance_v1(s.definition_id::text,first_day::text||' – '||last_day::text,
              jsonb_build_object('periodStart',first_day,'periodEnd',last_day,'timesheetScheduleId',s.id,'scheduledFor',s.next_run_at),sheet::text);
            if result is null or result !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Schedule command rejected'; end if;
            instance := result::uuid;
            result := public.submit_timesheet_v1(sheet::text);
            if result<>'submitted' then raise exception 'Schedule command rejected'; end if;
          end if;
        end if;
      end if;
    exception when others then result := 'error'; sheet := null; instance := null;
    end;
    perform set_config('request.jwt.claims',coalesce(saved_claims,''),true);
    perform set_config('request.jwt.claim.sub',coalesce(saved_sub,''),true);
    perform set_config('request.jwt.claim.role',coalesce(saved_role,''),true);
    update public.timesheet_schedules set
      enabled=case when result in ('overlap','not_allowed','no_template') then false else enabled end,
      next_run_at=case when result in ('submitted','already_submitted','empty') then
        public.timesheet_schedule_next_v1(s.frequency,s.local_time,s.time_zone,s.weekday,s.next_run_at) else next_run_at end,
      retry_after=case when result='error' then now()+interval '15 minutes' else null end,
      last_run_at=now(),last_outcome=result,last_timesheet_id=sheet,pending_instance_id=instance
      where id=s.id;
    schedule_id:=s.id; instance_id:=instance; outcome:=result; return next;
  end loop;
end $$;
revoke all on function public.run_due_timesheet_schedules_v1() from public,anon,authenticated;
grant execute on function public.run_due_timesheet_schedules_v1() to service_role;

-- The same pending workflow notification is retried after a process interruption.
-- No recipient ids or report contents cross the cron HTTP response.
create function public.pending_timesheet_schedule_notifications_v1()
returns table(schedule_id uuid,instance_id uuid) language plpgsql security definer set search_path=public as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Not allowed' using errcode='42501'; end if;
  return query select t.id,t.pending_instance_id from public.timesheet_schedules t
    where t.pending_instance_id is not null and (t.retry_after is null or t.retry_after<=now())
    order by t.last_run_at,t.id limit 40;
end $$;
revoke all on function public.pending_timesheet_schedule_notifications_v1() from public,anon,authenticated;
grant execute on function public.pending_timesheet_schedule_notifications_v1() to service_role;

create function public.ack_timesheet_schedule_notification_v1(p_schedule_id uuid,p_instance_id uuid,p_delivered boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Not allowed' using errcode='42501'; end if;
  update public.timesheet_schedules set
    pending_instance_id=case when p_delivered is true then null else pending_instance_id end,
    retry_after=case when p_delivered is true then null else now()+interval '5 minutes' end
    where id=p_schedule_id and pending_instance_id=p_instance_id;
end $$;
revoke all on function public.ack_timesheet_schedule_notification_v1(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.ack_timesheet_schedule_notification_v1(uuid,uuid,boolean) to service_role;

commit;
