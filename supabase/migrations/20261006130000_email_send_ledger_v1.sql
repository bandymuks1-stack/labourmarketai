-- @human-gate-approved
--
-- ── SCOPE OF THE HUMAN GATE ────────────────────────────────────────────────
-- SAFETY CLASS: RED (new SECURITY DEFINER function + REVOKE/GRANT). Draft PR +
-- `needs-human-gate`; apply ONLY via Supabase MCP `apply_migration` after
-- explicit owner approval. Never `supabase db push`. NO OWNER APPROVAL EXISTS
-- FOR THIS FILE YET: the marker above is the risk acknowledgement the static
-- gate reads, not an approval.
--
-- 20261006130000 — durable outbound-email send ledger + atomic reserve RPC.
--
-- WHY: the trial-readiness cost guardrail (apps/web/lib/notifications/
-- email-send-guard.ts) was in-memory, per server instance: a cold start or a
-- second instance reset it. Owner decision: 500 emails / 24h PER ORGANIZATION
-- plus 5 emails / recipient / 24h anti-runaway, surviving process and container
-- restarts and multiple instances.
--
-- WHY A NEW TABLE (existing structures inspected, none suffices):
--   * notification_events      — one row per bell event, NOT per email sent;
--                                carries no organization; email is opt-in.
--   * canonical_invitations    — invitation sends only, delivery outcome
--                                recorded AFTER the provider call.
--   * request_rate_limits_v3   — a wrapper over booking proposals, not email.
--   No table records "an email was (about to be) sent to H by/for org O at T".
--
-- DESIGN: ONE minimal append-only ledger + ONE atomic check-and-record RPC.
--   * Recipient is stored ONLY as a 64-hex hash (computed by the app); a raw
--     address never reaches this table.
--   * The RPC takes transaction-scoped advisory locks (org key, then recipient
--     key — always in that order, so no deadlock), counts the trailing 24h and
--     inserts the reservation in the SAME transaction. Concurrent callers on
--     any number of app instances serialise per org / per recipient and cannot
--     over-subscribe a cap.
--   * RESERVE-BEFORE-SEND: a slot is consumed when granted, even if the
--     provider then fails. Deliberately conservative (a failing provider that
--     is retried in a loop is exactly the runaway this guards).
--   * Organization resolution: the app passes p_organization_id when it knows
--     it (invitations). For notification emails it passes only the recipient
--     profile id and the RPC resolves the recipient's oldest ACTIVE
--     company_memberships row (read inside the definer — the service role holds
--     no grant on company_memberships). No organization at all => the
--     recipient cap + a global per-day ceiling (p_max_global) apply instead.
--
-- ADDITIVE: one new table, one new function. No existing object is touched,
-- no data is read-modified. Idempotent (IF NOT EXISTS / CREATE OR REPLACE).
-- ACCESS: RLS enabled with NO policy; every privilege revoked from PUBLIC,
-- anon and authenticated; the function is executable by service_role only.
-- RETENTION: rows older than 24h no longer influence any decision. Suggested
-- housekeeping (owner/cron, NOT automated here): delete rows from
-- public.email_send_ledger_v1 whose sent_at is older than 30 days.
-- ROLLBACK: supabase/rollbacks/20261006130000_email_send_ledger_v1.down.sql

begin;

create table if not exists public.email_send_ledger_v1 (
  id              bigint generated always as identity primary key,
  organization_id uuid,
  recipient_hash  text not null,
  kind            text not null,
  sent_at         timestamptz not null default clock_timestamp(),
  constraint email_send_ledger_v1_hash_chk
    check (recipient_hash ~ '^[0-9a-f]{64}$'),
  constraint email_send_ledger_v1_kind_chk
    check (kind in ('notification', 'invitation', 'transactional'))
);

comment on table public.email_send_ledger_v1 is
  'Durable outbound-email reservation ledger (cost guardrail). Recipient is a hash only. Written solely by reserve_email_send_v1 (service_role). No raw address, subject or body is ever stored.';

create index if not exists email_send_ledger_v1_org_sent_idx
  on public.email_send_ledger_v1 (organization_id, sent_at);
create index if not exists email_send_ledger_v1_recipient_sent_idx
  on public.email_send_ledger_v1 (recipient_hash, sent_at);

alter table public.email_send_ledger_v1 enable row level security;
-- Deliberately NO policy: no client role can read or write the ledger.
revoke all on table public.email_send_ledger_v1 from public;
revoke all on table public.email_send_ledger_v1 from anon;
revoke all on table public.email_send_ledger_v1 from authenticated;

create or replace function public.reserve_email_send_v1(
  p_organization_id       uuid,
  p_recipient_profile_id  uuid,
  p_recipient_hash        text,
  p_kind                  text,
  p_max_per_org           integer,
  p_max_per_recipient     integer,
  p_max_global            integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org     uuid := p_organization_id;
  v_since   timestamptz := clock_timestamp() - interval '24 hours';
  v_count   integer;
begin
  if p_recipient_hash is null or p_recipient_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('allowed', false, 'reason', 'invalid_recipient_hash');
  end if;
  if p_kind is null or p_kind not in ('notification', 'invitation', 'transactional') then
    return jsonb_build_object('allowed', false, 'reason', 'invalid_kind');
  end if;
  if p_max_per_org is null or p_max_per_org < 0 or p_max_per_org > 1000000
     or p_max_per_recipient is null or p_max_per_recipient < 0 or p_max_per_recipient > 1000000
     or p_max_global is null or p_max_global < 0 or p_max_global > 10000000 then
    return jsonb_build_object('allowed', false, 'reason', 'invalid_limits');
  end if;

  -- Organization: explicit, else the recipient's oldest active membership.
  if v_org is null and p_recipient_profile_id is not null then
    select cm.organization_id into v_org
      from public.company_memberships cm
     where cm.profile_id = p_recipient_profile_id
       and cm.status = 'active'
     order by cm.accepted_at asc nulls last, cm.created_at asc
     limit 1;
  end if;

  -- Lock order is fixed (org/global key, then recipient key): no deadlock.
  if v_org is not null then
    perform pg_advisory_xact_lock(hashtextextended('email_send_v1:org:' || v_org::text, 0));
  else
    perform pg_advisory_xact_lock(hashtextextended('email_send_v1:global', 0));
  end if;
  perform pg_advisory_xact_lock(hashtextextended('email_send_v1:rcpt:' || p_recipient_hash, 0));

  select count(*) into v_count
    from public.email_send_ledger_v1
   where recipient_hash = p_recipient_hash and sent_at > v_since;
  if v_count >= p_max_per_recipient then
    return jsonb_build_object('allowed', false, 'reason', 'recipient_cap', 'organization_id', v_org);
  end if;

  if v_org is not null then
    select count(*) into v_count
      from public.email_send_ledger_v1
     where organization_id = v_org and sent_at > v_since;
    if v_count >= p_max_per_org then
      return jsonb_build_object('allowed', false, 'reason', 'organization_cap', 'organization_id', v_org);
    end if;
  else
    select count(*) into v_count
      from public.email_send_ledger_v1
     where organization_id is null and sent_at > v_since;
    if v_count >= p_max_global then
      return jsonb_build_object('allowed', false, 'reason', 'global_cap');
    end if;
  end if;

  insert into public.email_send_ledger_v1 (organization_id, recipient_hash, kind)
  values (v_org, p_recipient_hash, p_kind);

  return jsonb_build_object('allowed', true, 'organization_id', v_org);
end;
$$;

revoke all on function public.reserve_email_send_v1(uuid, uuid, text, text, integer, integer, integer) from public;
revoke all on function public.reserve_email_send_v1(uuid, uuid, text, text, integer, integer, integer) from anon;
revoke all on function public.reserve_email_send_v1(uuid, uuid, text, text, integer, integer, integer) from authenticated;
grant execute on function public.reserve_email_send_v1(uuid, uuid, text, text, integer, integer, integer) to service_role;

commit;

-- ROLLBACK: supabase/rollbacks/20261006130000_email_send_ledger_v1.down.sql
