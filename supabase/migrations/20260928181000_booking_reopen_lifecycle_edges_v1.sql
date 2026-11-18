-- ============================================================================
-- 20260928181000 — the two lifecycle edges of a REOPENED booking.
--
-- RED by rule (a SECURITY DEFINER trigger function + a redefined definer).
-- OWNER-APPROVED 2026-09-28 ("close the two discovered state edges as part
-- of the same booking lifecycle, without building another booking system").
-- Apply only via Supabase MCP apply_migration. Never `db push`.
-- @human-gate-approved
--
-- Context: 20260928140000 made a date change on an ACCEPTED booking reopen
-- it ('rescheduled' event accepted -> proposed, previous terms kept). The
-- first acceptance had already minted a company_worker_engagements row
-- (source_booking_id = the booking).
--
-- EDGE 1 — changed terms not accepted. If a reopened booking then closes
-- WITHOUT a new acceptance (declined by the worker, withdrawn by the company,
-- expired), the agreement it recorded no longer stands, so the engagement it
-- minted is ENDED (status 'ended', ended_at, ended_by — exactly the columns
-- end_company_worker_engagement_v1 writes). One AFTER UPDATE trigger on
-- booking_requests, so every respond / withdraw / expire RPC version obeys
-- it; it touches ONLY the engagement whose source is this booking, and ONLY
-- when the booking had been reopened from 'accepted' (a plain proposal that
-- was never accepted has no engagement). History is not rewritten: the
-- booking's events and previous_terms stay; the engagement keeps its row.
-- A re-accept goes through respond_booking_request_v4 unchanged
-- ('already_recorded' reuses the still-active engagement).
--
-- EDGE 2 — expiry. `expire_stale_booking_requests_v1` measured staleness
-- from the row's created_at, so a booking created weeks ago and reopened
-- today could be expired at once. Staleness is now measured from the LATEST
-- moment the booking became 'proposed' (its newest event with
-- to_status = 'proposed' — the original proposal, a re-proposal, or a
-- reopening), falling back to created_at. It still only ever touches
-- 'proposed' rows: accepted / historical rows are never expired or rewritten.
-- Everything else is byte-identical to production (read back 2026-09-28).
--
-- No table, column or policy change.
-- ROLLBACK: supabase/rollbacks/20260928181000_booking_reopen_lifecycle_edges_v1.down.sql
-- ============================================================================

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
  end if;
  return new;
end;
$function$;

revoke all on function public.booking_reopened_close_ends_engagement() from public, anon, authenticated;

drop trigger if exists booking_reopened_close_ends_engagement on public.booking_requests;
create trigger booking_reopened_close_ends_engagement
  after update of status on public.booking_requests
  for each row
  when (old.status is distinct from new.status)
  execute function public.booking_reopened_close_ends_engagement();

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

revoke all on function public.expire_stale_booking_requests_v1(integer) from public, anon;
grant execute on function public.expire_stale_booking_requests_v1(integer) to authenticated;
