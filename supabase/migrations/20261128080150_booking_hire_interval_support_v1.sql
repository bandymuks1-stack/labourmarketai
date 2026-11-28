-- Private candidate. Requires independent review and owner approval before application.
-- @human-gate-approved
-- @plan-cache-proof: scripts/db-proof/plan-cache-probe.sql methodology, PostgreSQL 16.13, 60009 audit rows, 10 prepared calls per UUID case on one connection; worst auto 6.953 ms, force_generic_plan 1.126 ms.
-- RED gate marker for submission to the owner. Apply only after the owner authorizes these exact bytes.
-- Forward-only attribution in private append-only audit rows. The partial indexes
-- cover only receipt kinds used by this rule. No historical rows are rewritten.
begin;
lock table public.booking_requests, public.booking_request_events, public.company_worker_engagements,
           public.audit_logs in share row exclusive mode;

-- Body fingerprints are normalized only for transport line endings. An
-- absent or changed dependency is a stop, never an invitation to overwrite it.
do $compat$
declare item record;
begin
  for item in select * from (values
      ('public.booking_reopened_close_ends_engagement()','281b3bad625d217eb65ad69abc90e6bee997661eb42250a4d949f148bddf11a6'),
      ('public.expire_stale_booking_requests_v1(integer)','2f341c98bcf5b49210ab0393def830af2faab7035ad117107effd974f83da795'),
      ('public.expire_stale_booking_requests_system_v1(integer)','6d0b22cb05bbaf35016df7fa5155b1022825f59d1b892acb40ddc0da0be953c9'),
      ('public.booking_hire_open_relationship_v1()','1ac309f44a142fb5306836768519ba00010b23454cf7351ec941742e428a0944'),
      ('public.booking_hire_close_relationship_v1()','e16099525ba5390fd57d9d26c7b434d4a153b58c2b9d9d2f8c199574fa241920')
    ) expected(signature, digest)
  loop
    if not exists (select 1 from pg_catalog.pg_proc p
       where p.oid = pg_catalog.to_regprocedure(item.signature)
         and pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
               pg_catalog.replace(p.prosrc, pg_catalog.chr(13), ''), 'UTF8')), 'hex') = item.digest) then
      raise exception 'Prior function body differs or is missing: %', item.signature;
    end if;
  end loop;
end $compat$;

create index booking_hire_support_admitted_lookup_v1 on public.audit_logs(entity_id)
  where action = 'booking_hire_support_admitted_v1' and entity = 'company_worker_engagements';
create index booking_hire_support_released_lookup_v1 on public.audit_logs(entity_id)
  where action = 'booking_hire_support_released_v1' and entity = 'booking_hire_admission';
create index booking_hire_context_origin_lookup_v1
  on public.audit_logs((payload->>'company_worker_engagement_id'), entity_id)
  where entity = 'engagement_contexts' and action in ('booking_hire_relationship_opened','booking_hire_relationship_ended');

-- A grant identifies its hire, activation, and booking. A release references the
-- exact grant id. Transaction timestamps cannot order concurrent commits and the
-- same source hire row can reactivate, so neither a date nor the hire id is an epoch.
create function public.booking_hire_live_support_v1(p_hire uuid)
returns table(admission_id uuid, interval_id uuid, booking_id uuid, organization_id uuid)
language sql stable security invoker set search_path = pg_catalog, public, pg_temp
as $$
  select a.id, (a.payload->>'interval_id')::uuid, (a.payload->>'booking_id')::uuid,
         (a.payload->>'organization_id')::uuid
    from public.audit_logs a
   where a.action = 'booking_hire_support_admitted_v1'
     and a.entity = 'company_worker_engagements' and a.entity_id = p_hire
     and not exists (
       select 1 from public.audit_logs r
        where r.action = 'booking_hire_support_released_v1'
          and r.entity = 'booking_hire_admission' and r.entity_id = a.id)
$$;
revoke all on function public.booking_hire_live_support_v1(uuid) from public, anon, authenticated;

-- Resolve the incoming booking exactly as v3/v4 do. An organization-free
-- demand also needs the unique hiring organization that #2795 would select.
-- An unresolved/ambiguous origin cannot preserve organizational access.
create function public.booking_hire_support_origin_v1(p_booking uuid)
returns table(company_id uuid, organization_id uuid)
language sql stable security invoker set search_path = pg_catalog, public, pg_temp
as $$
  with demand as (
    select d.profile_id, d.organization_id
      from public.booking_requests b
      join public.customer_requests d on d.id = b.request_id and d.profile_id = b.owner_id
     where b.id = p_booking
  ), resolved as (
    select d.organization_id, case when d.organization_id is not null then o.legacy_company_id
             else (select (array_agg(c.id))[1] from public.companies c
                    where c.profile_id = d.profile_id having count(*) = 1)
           end as company_id
      from demand d left join public.organizations o on o.id = d.organization_id
  )
  select r.company_id, coalesce(r.organization_id,
           (select (array_agg(o.id))[1] from public.organizations o
             where o.legacy_company_id = r.company_id having count(*) = 1))
    from resolved r where r.company_id is not null
$$;
revoke all on function public.booking_hire_support_origin_v1(uuid) from public, anon, authenticated;

-- Capture #2795's exact opening/reuse receipt in the transaction in which
-- that activation occurs. A separately owned, reused context can stay active
-- across a manual end. Only this activation's admissions can then support it.
create function public.booking_hire_record_source_v1()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, pg_temp
as $$
begin
  insert into public.audit_logs(actor_id, action, entity, entity_id, payload)
    select new.actor_id, 'booking_hire_support_admitted_v1', 'company_worker_engagements', h.id,
           jsonb_build_object('interval_id', new.id, 'booking_id', h.source_booking_id,
                              'organization_id', ec.organization_id, 'basis', 'hire_source')
      from public.company_worker_engagements h
      join public.workers w on w.id = h.worker_id
      join public.engagement_contexts ec on ec.id = new.entity_id and ec.profile_id = w.profile_id
     where h.id = (new.payload->>'company_worker_engagement_id')::uuid and h.status = 'active'
       and h.source_booking_id = (new.payload->>'booking_id')::uuid
       and ec.status = 'active' and ec.organization_id = (new.payload->>'organization_id')::uuid;
  return null;
end $$;
revoke all on function public.booking_hire_record_source_v1() from public, anon, authenticated;
create trigger booking_hire_record_source_v1 after insert on public.audit_logs for each row
  when (new.entity = 'engagement_contexts' and new.action in ('booking_hire_relationship_opened','booking_hire_relationship_reused'))
  execute function public.booking_hire_record_source_v1();

-- v1/v2 delegate to v3; v3/v4 emit this acceptance event before their hire
-- INSERT / already_active decision. A newly minted hire already has its source
-- booking. Only an actual fresh event may add support to an existing hire.
create function public.booking_hire_admit_support_v1()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_hire public.company_worker_engagements%rowtype;
  v_locked_hire uuid;
  v_interval uuid;
  v_incoming_org uuid;
  v_source_org uuid;
  v_origins integer;
begin
  if exists (select 1 from public.agency_candidate_offers where booking_id = new.booking_request_id) then
    return null;
  end if;

  select h.id, incoming.organization_id into v_locked_hire, v_incoming_org from public.booking_requests b
    cross join lateral public.booking_hire_support_origin_v1(b.id) incoming
    join public.company_worker_engagements h
      on h.company_id = incoming.company_id and h.worker_id = b.worker_id and h.status = 'active'
   where b.id = new.booking_request_id and b.status = 'accepted'
     and incoming.organization_id is not null
     and not exists (select 1 from public.agency_candidate_offers ao where ao.booking_id = h.source_booking_id)
   for update of h;
  if not found or v_incoming_org is null then return null; end if;
  select * into strict v_hire from public.company_worker_engagements where id = v_locked_hire;
  select count(*), (array_agg(s.interval_id))[1], (array_agg(s.organization_id))[1]
    into v_origins, v_interval, v_source_org
    from (select distinct t.interval_id, t.organization_id
            from public.booking_hire_live_support_v1(v_hire.id) t) s;
  if v_origins > 1 then return null; end if;
  if v_interval is null then
    if v_hire.source_booking_id = new.booking_request_id then return null; end if;
    -- The hire's own positional source is explicit on the active row. No
    -- acceptance date/event is inferred for it. Previously covered bookings
    -- without a receipt are never adopted by scanning the pair's history.
    -- For a pre-candidate hire use its explicitly attributed demand organization.
    -- If absent, only one still-active context that #2795 itself OPENED and
    -- never closed is proof. A historical REUSE can survive the hire's end.
    select d.organization_id into v_source_org
      from public.booking_requests b join public.customer_requests d on d.id = b.request_id
      join public.organizations o on o.id = d.organization_id and o.legacy_company_id = v_hire.company_id
     where b.id = v_hire.source_booking_id and d.profile_id = b.owner_id;
    if v_source_org is null then
      select (array_agg(ec.organization_id))[1] into v_source_org
        from public.audit_logs a
        join public.engagement_contexts ec on ec.id = a.entity_id and ec.status = 'active'
        join public.workers w on w.id = v_hire.worker_id and ec.profile_id = w.profile_id
        join public.organizations o on o.id = ec.organization_id and o.legacy_company_id = v_hire.company_id
       where a.entity = 'engagement_contexts' and a.action = 'booking_hire_relationship_opened'
         and a.payload->>'company_worker_engagement_id' = v_hire.id::text
         and a.payload->>'booking_id' = v_hire.source_booking_id::text
         and a.payload->>'organization_id' = ec.organization_id::text
         and not exists (select 1 from public.audit_logs z where z.entity = 'engagement_contexts'
             and z.action = 'booking_hire_relationship_ended' and z.entity_id = ec.id
             and z.payload->>'company_worker_engagement_id' = v_hire.id::text)
       having count(*) = 1;
    end if;
    if v_source_org is null or v_source_org is distinct from v_incoming_org then return null; end if;
    v_interval := gen_random_uuid();
    insert into public.audit_logs(actor_id, action, entity, entity_id, payload)
    values (new.actor_id, 'booking_hire_support_admitted_v1', 'company_worker_engagements', v_hire.id,
            jsonb_build_object('interval_id', v_interval, 'booking_id', v_hire.source_booking_id,
                               'organization_id', v_source_org, 'basis', 'hire_source'));
  end if;
  if v_source_org is null or v_source_org is distinct from v_incoming_org then return null; end if;
  insert into public.audit_logs(actor_id, action, entity, entity_id, payload)
  values (new.actor_id, 'booking_hire_support_admitted_v1', 'company_worker_engagements', v_hire.id,
          jsonb_build_object('interval_id', v_interval, 'booking_id', new.booking_request_id,
                             'organization_id', v_source_org, 'basis', 'accepted', 'acceptance_event_id', new.id));
  return null;
end $$;
revoke all on function public.booking_hire_admit_support_v1() from public, anon, authenticated;
create trigger booking_hire_admit_support_v1 after insert on public.booking_request_events
  for each row when (new.event_type = 'accepted' and new.from_status = 'proposed' and new.to_status = 'accepted')
  execute function public.booking_hire_admit_support_v1();

-- All booking transitions that can decide a hire use the respondent's
-- existing worker lock, including undated accepts, withdrawal and expiry.
-- Manual end locks the hire and never waits on this advisory lock.
create or replace function public.booking_reopened_close_ends_engagement()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_hire public.company_worker_engagements%rowtype;
  v_released integer;
begin
  if old.status <> 'proposed' or new.status not in ('accepted','declined','withdrawn','expired') then
    return new;
  end if;
  if new.status = 'accepted' then
    perform pg_advisory_xact_lock(hashtextextended(new.worker_id::text, 0));
    -- Lock an existing positional source, including its active state, before
    -- choosing whether a fresh acceptance must reactivate it.
    perform 1 from public.company_worker_engagements h
     where h.source_booking_id = new.id or (h.worker_id = new.worker_id and h.status = 'active'
       and h.company_id = (select own.company_id from public.company_worker_engagements own
                             where own.source_booking_id = new.id))
     order by h.id for update of h;
    update public.company_worker_engagements ce
       set status = 'active', ended_at = null, ended_by = null
     where ce.source_booking_id = new.id and ce.status = 'ended'
       and not exists (select 1 from public.company_worker_engagements o
                        where o.company_id = ce.company_id and o.worker_id = ce.worker_id and o.status = 'active');
    return new;
  end if;
  if not exists (select 1 from public.booking_request_events e where e.booking_request_id = new.id
                  and e.from_status = 'accepted' and e.to_status = 'proposed') then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.worker_id::text, 0));
  select h.* into v_hire from public.company_worker_engagements h
   where h.worker_id = new.worker_id and h.status = 'active'
     and (h.source_booking_id = new.id or exists (
       select 1 from public.booking_hire_live_support_v1(h.id) s where s.booking_id = new.id))
   order by exists (select 1 from public.booking_hire_live_support_v1(h.id) s where s.booking_id = new.id) desc
   limit 1 for update of h;
  if not found then return new; end if;

  insert into public.audit_logs(actor_id, action, entity, entity_id, payload)
    select auth.uid(), 'booking_hire_support_released_v1', 'booking_hire_admission', s.admission_id,
           jsonb_build_object('reason', new.status)
      from public.booking_hire_live_support_v1(v_hire.id) s where s.booking_id = new.id;
  get diagnostics v_released = row_count;
  if exists (select 1 from public.booking_hire_live_support_v1(v_hire.id)) then
    return new;
  end if;
  if v_released > 0 or v_hire.source_booking_id = new.id then
    update public.company_worker_engagements set status = 'ended', ended_at = now(), ended_by = auth.uid()
     where id = v_hire.id and status = 'active';
  end if;
  return new;
end $$;
revoke all on function public.booking_reopened_close_ends_engagement() from public, anon, authenticated;

-- Every effective end, including the explicit worker/company action, releases
-- all grants of this activation. Re-using a hire id never inherits consent or
-- admissions from the ended interval. #2795 alone owns the journal context.
create function public.booking_hire_end_support_v1()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, pg_temp
as $$
begin
  insert into public.audit_logs(actor_id, action, entity, entity_id, payload)
    select new.ended_by, 'booking_hire_support_released_v1', 'booking_hire_admission', s.admission_id,
           jsonb_build_object('reason','hire_ended')
      from public.booking_hire_live_support_v1(new.id) s;
  return null;
end $$;
revoke all on function public.booking_hire_end_support_v1() from public, anon, authenticated;
create trigger booking_hire_end_support_v1 after update of status on public.company_worker_engagements
  for each row when (old.status = 'active' and new.status <> 'active')
  execute function public.booking_hire_end_support_v1();

create or replace function public.expire_stale_booking_requests_v1(p_stale_days integer default 14)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  expired_count integer := 0;
  r record;
begin
  if uid is null or not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  if p_stale_days is null or p_stale_days < 1 or p_stale_days > 365 then
    raise exception 'Invalid staleness window' using errcode = '22023';
  end if;

  for r in
    select id, worker_id from public.booking_requests br
     where br.status = 'proposed'
       and (
         (br.response_deadline_date is not null and br.response_deadline_date < current_date)
         or (br.response_deadline_date is null
             and coalesce(
                   (select max(e.created_at) from public.booking_request_events e
                     where e.booking_request_id = br.id and e.to_status = 'proposed'),
                   br.created_at)
                 < now() - make_interval(days => p_stale_days))
       )
     limit 500 for update of br skip locked
  loop
    -- Another booking transaction can hold the worker while waiting for
    -- an item in this batch. Leave that worker for a later run.
    if not pg_try_advisory_xact_lock(hashtextextended(r.worker_id::text, 0)) then
      continue;
    end if;
    update public.booking_requests
       set status = 'expired', updated_at = now()
     where id = r.id and status = 'proposed';
    if found then
      insert into public.booking_request_events
          (booking_request_id, actor_id, event_type, from_status, to_status,
           reason_kind, reason_note)
        values (r.id, uid, 'expired', 'proposed', 'expired', 'no_response', null);
      expired_count := expired_count + 1;
    end if;
  end loop;

  return expired_count;
end;
$function$;

create or replace function public.expire_stale_booking_requests_system_v1(p_stale_days integer default 14)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  expired_count integer := 0;
  r record;
begin
  if p_stale_days is null or p_stale_days < 1 or p_stale_days > 365 then
    raise exception 'Invalid staleness window' using errcode = '22023';
  end if;

  for r in
    select id, owner_id, worker_id from public.booking_requests br
     where br.status = 'proposed'
       and (
         (br.response_deadline_date is not null and br.response_deadline_date < current_date)
         or (br.response_deadline_date is null
             and coalesce(
                   (select max(e.created_at) from public.booking_request_events e
                     where e.booking_request_id = br.id and e.to_status = 'proposed'),
                   br.created_at)
                 < now() - make_interval(days => p_stale_days))
       )
     limit 500 for update of br skip locked
  loop
    -- Another booking transaction can hold the worker while waiting for
    -- an item in this batch. Leave that worker for a later run.
    if not pg_try_advisory_xact_lock(hashtextextended(r.worker_id::text, 0)) then
      continue;
    end if;
    update public.booking_requests
       set status = 'expired', updated_at = now()
     where id = r.id and status = 'proposed';
    if found then
      insert into public.booking_request_events
          (booking_request_id, actor_id, event_type, from_status, to_status,
           reason_kind, reason_note)
        values (r.id, r.owner_id, 'expired', 'proposed', 'expired', 'no_response', 'system_expiry');
      expired_count := expired_count + 1;
    end if;
  end loop;

  return expired_count;
end;
$function$;

revoke all on function public.expire_stale_booking_requests_v1(integer) from public, anon;
revoke all on function public.expire_stale_booking_requests_system_v1(integer) from public, anon, authenticated, service_role;

commit;
