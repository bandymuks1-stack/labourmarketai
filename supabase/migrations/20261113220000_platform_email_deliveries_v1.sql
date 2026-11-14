-- @human-gate-approved
--
-- ── SCOPE OF THE HUMAN GATE ────────────────────────────────────────────────
-- SAFETY CLASS: RED (GRANT / REVOKE). Draft PR + `needs-human-gate`; apply ONLY
-- via Supabase MCP `apply_migration` after explicit owner approval. Never
-- `supabase db push`. NO OWNER APPROVAL EXISTS FOR THIS FILE YET: the marker
-- above is the risk acknowledgement the static gate reads, not an approval.
--
-- 20261113220000 — platform e-mail delivery record + who/when on an intake
-- status (owner P0 2026-11-13: company registration notices, welcome e-mail,
-- request alerts, delivery control, retries, no duplicates, error record).
--
-- WHY A NEW TABLE (existing structures inspected, none suffices):
--   * email_send_ledger_v1  — a RATE LIMITER: one append-only row per send
--                             attempt, recipient hash only, no event identity,
--                             no outcome, no attempt count; written solely by
--                             reserve_email_send_v1. It stays the cost guard
--                             for the welcome e-mail, unchanged.
--   * notification_events   — the in-app bell for PLATFORM USERS (recipient is
--                             a profile); the owner mailbox is not a profile
--                             and an anonymous request has no user at all.
--   * canonical_invitations — invitation sends only.
--   No table can answer "was THIS event's e-mail sent, how many times was it
--   tried, and did the last try fail".
--
-- DESIGN: one row per EVENT, not per attempt.
--   * event_key is UNIQUE: the insert is the claim. A second caller for the
--     same event gets 23505 and sends nothing — one event, one e-mail.
--   * status: sending → sent | retry_wait | failed | suppressed. A retry is
--     claimed by a compare-and-set UPDATE (status + attempts in the WHERE), so
--     two instances cannot both take the same attempt.
--   * `failed` is terminal and stays visible to the administrator; nothing
--     deletes it. A row left in `sending` (process died mid-send) is NOT
--     re-sent — its outcome is unknown, so it is shown as failed
--     (`outcome_unknown`) for a person to decide.
--   * NO PERSONAL DATA: no address, no name, no subject, no body. The row
--     holds the event kind and the id of the organization or the intake; the
--     e-mail is rebuilt from the live row at send time. last_error is a short
--     machine code (CHECK), never a server reply text.
--
-- INTAKE STATUS, WHO AND WHEN: two nullable columns on
-- company_need_public_intakes. status_changed_by is the operator's profile id
-- WITHOUT A FOREIGN KEY, ON PURPOSE:
--   * the GDPR erasure executor (20261019140000) refuses to erase an account
--     while any foreign key onto profiles has no reviewed registry decision;
--     a new key here would block every operator's erasure until a second RED
--     migration extended that registry;
--   * the alternatives are both wrong for an audit pointer: ON DELETE CASCADE
--     would delete a company's request because an operator left, and
--     ON DELETE SET NULL would silently rewrite the audit trail.
--   The value is written only by the server from the signed-in operator's
--   session (never from a form field), read only by superadmins, and a value
--   that no longer matches a profile is shown as "unidentified operator".
--
-- LOCKS: `set local lock_timeout = '5s'`. Adding a nullable column without a
-- default takes a brief ACCESS EXCLUSIVE lock on company_need_public_intakes;
-- if it cannot be had in five seconds the whole migration fails and changes
-- nothing (retry the apply once).
--
-- BEFORE APPLYING, keep the output of this with the apply record — the
-- rollback leaves the four grants on pre-existing objects in place unless
-- this shows they were absent:
--   select table_name, column_name, privilege_type
--     from information_schema.column_privileges
--    where grantee = 'service_role' and table_schema = 'public'
--      and table_name in ('organizations', 'profiles', 'customer_requests')
--    order by 1, 2;
--   select has_function_privilege('service_role',
--          'public.email_is_verified_v1(uuid, text)', 'execute');
--
-- READS THE RETRY NEEDS (column-scoped, service_role only). A retry runs from
-- the scheduled sweep with no signed-in user, and production service_role holds
-- almost no table privilege, so the columns the two registration e-mails are
-- composed from are granted here and nothing wider:
--   organizations    id, legal_name, display_name, country, owner_profile_id,
--                    legacy_company_id, organization_type
--   profiles         full_name (id, email, locale are granted since 20261012120000)
--   customer_requests organization_id, status  ("has the company published a need")
-- and EXECUTE on email_is_verified_v1(uuid, text) — the existing rule that says
-- whether an address is verified for a profile (20261003151000). The welcome
-- e-mail goes only to an address that rule accepts; no second rule is written.
-- The owner permitted the contact person's name and work e-mail for the
-- registration notice to the administration mailbox (2026-11-13).
--
-- @plan-cache-proof: n/a — a small operational table; the one index serves the bounded sweep (status + next_attempt_at, limit 20) and no RPC filters by it
--
-- ADDITIVE: one new table, two new nullable columns, service_role-only grants.
-- No existing row is read or changed, no policy, no function, no trigger.
-- Idempotent (IF NOT EXISTS). ACCESS: RLS enabled with NO policy; every
-- privilege revoked from PUBLIC, anon and authenticated.
-- UNTIL APPLIED the application degrades on purpose: the internal alert is
-- still sent once per request (as before this change) but unrecorded, the
-- welcome e-mail is NOT sent (no record = no proof against a duplicate), and
-- a status change is saved without who/when.
--
-- -- ROLLBACK
-- supabase/rollbacks/20261113220000_platform_email_deliveries_v1.down.sql

begin;

set local lock_timeout = '5s';

create table if not exists public.platform_email_deliveries_v1 (
  id               uuid primary key default gen_random_uuid(),
  event_key        text not null,
  kind             text not null,
  audience         text not null,
  subject_id       uuid not null,
  locale           text,
  status           text not null default 'sending',
  attempts         integer not null default 0,
  last_error       text,
  message_id       text,
  next_attempt_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  sent_at          timestamptz,
  constraint platform_email_deliveries_v1_event_key_uq unique (event_key),
  constraint platform_email_deliveries_v1_event_key_chk
    check (event_key ~ '^[a-z_]{3,40}:[0-9a-f-]{36}$'),
  constraint platform_email_deliveries_v1_kind_chk
    check (kind in ('company_registration_notice', 'company_welcome', 'intake_alert')),
  constraint platform_email_deliveries_v1_audience_chk
    check (audience in ('internal', 'company')),
  constraint platform_email_deliveries_v1_status_chk
    check (status in ('sending', 'sent', 'retry_wait', 'failed', 'suppressed')),
  constraint platform_email_deliveries_v1_attempts_chk
    check (attempts >= 0 and attempts <= 20),
  constraint platform_email_deliveries_v1_error_chk
    check (last_error is null or last_error ~ '^[a-z0-9_]{1,60}$'),
  constraint platform_email_deliveries_v1_locale_chk
    check (locale is null or locale ~ '^[a-z]{2}$'),
  constraint platform_email_deliveries_v1_message_id_chk
    check (message_id is null or length(message_id) <= 200)
);

comment on table public.platform_email_deliveries_v1 is
  'One row per platform e-mail EVENT (company registration notice, company welcome, request alert): unique event key, outcome, attempt count. No address, name, subject or body. service_role only.';

create index if not exists platform_email_deliveries_v1_status_idx
  on public.platform_email_deliveries_v1 (status, next_attempt_at);

alter table public.platform_email_deliveries_v1 enable row level security;
-- Deliberately NO policy: no client role can read or write the record.
revoke all on table public.platform_email_deliveries_v1 from public;
revoke all on table public.platform_email_deliveries_v1 from anon;
revoke all on table public.platform_email_deliveries_v1 from authenticated;
grant select, insert, update on table public.platform_email_deliveries_v1 to service_role;

alter table public.company_need_public_intakes
  add column if not exists status_changed_at timestamptz;
alter table public.company_need_public_intakes
  add column if not exists status_changed_by uuid;

comment on column public.company_need_public_intakes.status_changed_by is
  'Profile id of the operator who last changed the status. No foreign key on purpose (audit pointer that must neither block nor be rewritten by an account erasure; see migration header).';

grant update (status_changed_at, status_changed_by) on public.company_need_public_intakes to service_role;

grant select (id, legal_name, display_name, country, owner_profile_id, legacy_company_id, organization_type)
  on public.organizations to service_role;
grant select (full_name) on public.profiles to service_role;
grant select (organization_id, status) on public.customer_requests to service_role;
grant execute on function public.email_is_verified_v1(uuid, text) to service_role;

commit;
