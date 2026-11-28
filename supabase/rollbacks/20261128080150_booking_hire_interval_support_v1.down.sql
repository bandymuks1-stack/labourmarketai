-- Paired private rollback; no historical rows are deleted. Once the new
-- rule has recorded any admission, reverting would lose lifecycle semantics.
begin;
lock table public.booking_requests, public.booking_request_events,
           public.company_worker_engagements, public.audit_logs in access exclusive mode;

-- Body fingerprints are normalized only for transport line endings. An
-- absent or changed dependency is a stop, never an invitation to overwrite it.
do $compat$
declare item record;
begin
  for item in select * from (values
      ('public.booking_reopened_close_ends_engagement()','0dcf1dce8afc318fab6a8e1b3390b3f712dbac304e20ca188efb83cf92d08b58'),
      ('public.expire_stale_booking_requests_v1(integer)','ab99b4464bc89c98a8c813abaa2f325325db912fb55b69ac722fd559d261b86c'),
      ('public.expire_stale_booking_requests_system_v1(integer)','179a8b7857159c5e02895d60e8c39ffc1f247500bbe79927bf3e35b8be0ce4b6'),
      ('public.booking_hire_live_support_v1(uuid)','95712aec51333425cd9d709197c4a83eebf750eafee49b2014ba044a2fc896a9'),
      ('public.booking_hire_support_origin_v1(uuid)','23dd33b4749a5f9f352a0114d110bda4aa302a085c07c7525c97f52c940350e1'),
      ('public.booking_hire_record_source_v1()','1d16ff56a67578b2328b8dc528edb584998dcea29910598a88f506d53340b3d6'),
      ('public.booking_hire_admit_support_v1()','810a4e591f8a6a423be61a53c19b408426c82c93cda08dc5f536d8db5058b5e0'),
      ('public.booking_hire_end_support_v1()','918a8cd88c0461c03a47818009409910d81904da9600d5c1703a99a7208fc15d')
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
do $$
begin
  if exists (select 1 from public.audit_logs
              where action in ('booking_hire_support_admitted_v1','booking_hire_support_released_v1')) then
    raise exception 'Booking support history exists. Use a history-preserving forward correction.';
  end if;
end $$;

drop trigger booking_hire_admit_support_v1 on public.booking_request_events;
drop trigger booking_hire_end_support_v1 on public.company_worker_engagements;
drop trigger booking_hire_record_source_v1 on public.audit_logs;
drop function public.booking_hire_admit_support_v1();
drop function public.booking_hire_end_support_v1();
drop function public.booking_hire_record_source_v1();

-- Restore the deployed 20260928200000 booking lifecycle trigger body.
create or replace function public.booking_reopened_close_ends_engagement()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if old.status = 'proposed'
     and new.status in ('declined', 'withdrawn', 'expired')
     and exists (select 1 from public.booking_request_events e
                  where e.booking_request_id = new.id
                    and e.from_status = 'accepted'
                    and e.to_status = 'proposed') then
    update public.company_worker_engagements
       set status = 'ended', ended_at = now(), ended_by = auth.uid()
     where source_booking_id = new.id
       and status = 'active';
  elsif old.status = 'proposed' and new.status = 'accepted' then
    update public.company_worker_engagements ce
       set status = 'active', ended_at = null, ended_by = null
     where ce.source_booking_id = new.id
       and ce.status = 'ended'
       and not exists (select 1 from public.company_worker_engagements o
                        where o.company_id = ce.company_id
                          and o.worker_id = ce.worker_id
                          and o.status = 'active');
  end if;
  return new;
end;
$function$;

revoke all on function public.booking_reopened_close_ends_engagement() from public, anon, authenticated;
drop function public.booking_hire_support_origin_v1(uuid);
drop function public.booking_hire_live_support_v1(uuid);
drop index public.booking_hire_support_admitted_lookup_v1;
drop index public.booking_hire_support_released_lookup_v1;
drop index public.booking_hire_context_origin_lookup_v1;
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
    select id from public.booking_requests br
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
     limit 500
  loop
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
    select id, owner_id from public.booking_requests br
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
     limit 500
  loop
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

commit;
