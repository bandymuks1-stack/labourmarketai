-- ============================================================================
-- 20260928200000 — a RE-ACCEPTED booking has an active engagement again.
--
-- RED by rule (redefines a SECURITY DEFINER trigger function). Covered by the
-- owner decision 2026-09-28 on the reopened-booking lifecycle ("decline/accept
-- → truthful engagement state/history"). Apply only via MCP apply_migration.
-- @human-gate-approved
--
-- Found in the production walk 2026-09-28: 20260928181000 ends the engagement
-- a reopened booking minted when the changed terms are declined. If the
-- company then proposes again on the same booking and the worker ACCEPTS,
-- respond_booking_request_v4 sees that (ended) engagement for this source and
-- answers 'already_recorded' — the booking is accepted while its engagement
-- stays ended. A new acceptance is a new agreement, so the same trigger now
-- also restores the engagement this booking minted to 'active' on a
-- proposed -> accepted transition — unless the company already has another
-- active engagement with this worker (the active-pair unique index), which
-- then stands as the truth. History is not rewritten: the booking's events
-- keep the decline and the new acceptance.
--
-- ROLLBACK: supabase/rollbacks/20260928200000_booking_reaccept_restores_engagement_v1.down.sql
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
