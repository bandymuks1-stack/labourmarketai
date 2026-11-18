-- @human-gate-approved  (acknowledgement only: RED class — SECURITY DEFINER + REVOKE/GRANT; draft + needs-human-gate, OWNER APPLIES — NOT applied by the agent)
-- invitation_known_historical_unknown_v1 — how many owner-registered historical unknown outcomes are still exactly as
-- reviewed (owner decision 2026-11-14, invitation 862a91f4: NO RESEND, KNOWN_HISTORICAL_UNKNOWN_OUTCOME).
--
-- WHY. apps/web/lib/invitations/delivery-retry-run.ts readKnownHistoricalCount read public.invitations and
-- public.invitation_delivery_attempts_v1 through the service-role client. In production service_role holds NO SELECT on
-- public.invitations (has_table_privilege = false, measured 2026-11-14), so that read always failed closed (the alert
-- stayed), and the guard lib/guards/agency-client-invite-delivery.test.ts forbids table reads from that module. This
-- function is the one aggregate door instead: it returns a single integer, never a row, id, address or timestamp.
--
-- WHAT. Counts rows of public.invitations with id = any(p_ids) that are still an open, unclassified, pre-ledger unknown
-- outcome: status 'pending', delivery_status 'delivery_failed', not bounced, delivery_failure_class null, and NO row in
-- public.invitation_delivery_attempts_v1. The same conditions as known-historical-outcomes.ts countKnownHistorical.
-- Columns and the attempts table come from 20261113190000_invitation_delivery_attempts_v1.
--
-- WHO MAY CALL. service_role only (revoked from public, anon, authenticated). STABLE (read-only), SECURITY DEFINER,
-- empty search_path (every object schema-qualified).
--
-- -- ROLLBACK
-- drop function if exists public.invitation_known_historical_unknown_v1(uuid[]);
-- (also: supabase/rollbacks/20261114150000_invitation_known_historical_unknown_v1.down.sql)

create or replace function public.invitation_known_historical_unknown_v1(p_ids uuid[])
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.invitations i
   where i.id = any(p_ids)
     and i.status = 'pending'
     and i.delivery_status = 'delivery_failed'
     and i.delivery_bounced_at is null
     and i.delivery_failure_class is null
     and not exists (
       select 1 from public.invitation_delivery_attempts_v1 a where a.invitation_id = i.id
     );
$$;

revoke all on function public.invitation_known_historical_unknown_v1(uuid[]) from public;
revoke all on function public.invitation_known_historical_unknown_v1(uuid[]) from anon;
revoke all on function public.invitation_known_historical_unknown_v1(uuid[]) from authenticated;
grant execute on function public.invitation_known_historical_unknown_v1(uuid[]) to service_role;

comment on function public.invitation_known_historical_unknown_v1(uuid[]) is
  'Count of owner-registered invitations still an open, unclassified, pre-ledger unknown outcome (integer only). service_role only. Owner decision 2026-11-14.';
