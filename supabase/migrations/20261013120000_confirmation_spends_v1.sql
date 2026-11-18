-- @human-gate-approved
--
-- SAFETY CLASS: RED (new table + GRANT INSERT to authenticated + RLS policy).
-- Production has NO default privileges in public, so the grant is required.
-- Draft PR + needs-human-gate; apply ONLY via Supabase MCP apply_migration
-- after explicit owner approval. The marker is the risk acknowledgement the
-- static gate reads, not an approval.
--
-- 20261013120000 — confirmation spends: a confirmation token is spent ONCE.
--
-- WHY: a confirmation token (lib/conversation/confirmation-token.ts) is bound
-- to caller, action, exact input, workspace and a state fingerprint, for a
-- 5-minute TTL. A state fingerprint stops a SEQUENTIAL replay only when the
-- write changes the state it reads; two confirms arriving at the same moment
-- both read the old state before either writes, and actions with no
-- fingerprint ("n/a") could be repeated for the whole TTL. External clients
-- (ChatGPT / MCP, #2336) retry calls. Decision 0024: confirmations are
-- single-use — this makes that a database fact instead of an instruction.
--
-- WHY A NEW TABLE (existing structures inspected, none suffices):
--   * audit_logs (record_external_action_receipt_v1) — written AFTER the
--     action, no unique key on the confirmation reference, MCP door only.
--   * email_send_ledger_v1 — outbound email reservations, not confirmations.
--   * lmc ledger idempotency_key — credit ledger only.
--
-- DESIGN: the dispatcher inserts sha256(token) BEFORE the executor runs. The
-- primary key makes the spend atomic: of any number of concurrent confirms
-- with one token exactly one insert succeeds; the rest get 23505 and are
-- refused as stale before anything is written.
--
-- DATA MINIMISATION: a 64-hex digest, the actor, the action id, a time. No
-- token, no input, no output. One row per confirmed action (a useful result),
-- and rows are purged after a day — a token is dead after 5 minutes, so an
-- older row can never refuse anything.
--
-- ACCESS: RLS on; authenticated may INSERT its own row only (spent_by =
-- auth.uid()); no SELECT / UPDATE / DELETE for any client role.
-- ADDITIVE: one table, one index, one policy, one schedule. No existing object
-- is touched. Idempotent.
-- ROLLBACK: supabase/rollbacks/20261013120000_confirmation_spends_v1.down.sql

begin;

create table if not exists public.confirmation_spends (
  token_digest text primary key,
  spent_by     uuid not null default auth.uid()
               references public.profiles(id) on delete cascade,
  action_id    text not null,
  spent_at     timestamptz not null default now(),
  constraint confirmation_spends_digest_chk check (token_digest ~ '^[0-9a-f]{64}$'),
  constraint confirmation_spends_action_chk check (char_length(action_id) between 3 and 120)
);

comment on table public.confirmation_spends is
  'One row per SPENT confirmation token (sha256 digest only). Primary key = single use, including under concurrency. Written by the conversation dispatcher before an executor runs; purged after 1 day.';

create index if not exists confirmation_spends_spent_at_idx
  on public.confirmation_spends (spent_at);

alter table public.confirmation_spends enable row level security;

drop policy if exists confirmation_spends_insert_own on public.confirmation_spends;
create policy confirmation_spends_insert_own on public.confirmation_spends
  for insert to authenticated
  with check (spent_by = auth.uid());

revoke all on table public.confirmation_spends from public;
revoke all on table public.confirmation_spends from anon;
revoke all on table public.confirmation_spends from authenticated;
grant insert on table public.confirmation_spends to authenticated;

do $$
begin
  if to_regclass('cron.job') is not null then
    if exists (select 1 from cron.job where jobname = 'confirmation-spends-purge-daily') then
      perform cron.unschedule('confirmation-spends-purge-daily');
    end if;
    perform cron.schedule(
      'confirmation-spends-purge-daily',
      '23 3 * * *',
      $job$delete from public.confirmation_spends where spent_at < now() - interval '1 day'$job$
    );
  end if;
end $$;

commit;
