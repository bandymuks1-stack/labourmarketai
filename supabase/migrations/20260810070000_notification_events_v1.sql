-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- OWNER_APPROVAL_REQUIRED_BEFORE_APPLY.
-- Gate doc: docs/human-gates/notification-events-gate.md
-- Rollback:  supabase/rollbacks/20260810070000_notification_events_v1.down.sql
--
-- @human-gate-approved — TIER: owner-gated (RED class: a new table with RLS
-- policies + GRANT/REVOKE is RED by construction; there is no non-RED way to
-- add a row-level-secured table). The annotation states the ROUTE — this
-- migration goes through the human gate, never auto-apply. The APPLY decision
-- itself is still AWAITING_OWNER_DECISION in the gate doc.
--
-- ── PROBLEM, MEASURED ───────────────────────────────────────────────────────
-- Production (2026-08-10) has NO notification storage of any kind. The
-- "spine" (lib/notifications/spine-signals.ts) derives 9 counts at render
-- time from other tables; nothing is durable, `markAllRead` is a client
-- setState that the next hydration reverts, and the absence-outcome /
-- engagement signals disappear the moment their source rows change state.
-- A worker whose absence was rejected while they were offline never learns.
--
-- ── WHAT THIS IS ────────────────────────────────────────────────────────────
-- ONE append-only events table — the canonical durable notification WRITE
-- model. Events are emitted server-side (service_role) after the underlying
-- domain write has already succeeded; the recipient reads their own rows and
-- may mark them read. The derived spine keeps running unchanged beside it —
-- derived counts remain the right shape for "N things need attention now",
-- durable events are the right shape for "this happened to you".
--
-- ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
-- Not a message store, not an outbox, not a scheduler, not an email/push
-- channel, not a second spine. No trigger writes it (writers are explicit
-- code paths), nothing here sends anything anywhere.
--
-- ── RLS DECISION, STATED EXPLICITLY ────────────────────────────────────────
--   anon:           NOTHING. No grant, no policy.
--   authenticated:  SELECT own rows (recipient_profile_id = auth.uid());
--                   UPDATE of the read_at COLUMN ONLY, own rows only —
--                   column-level grant, so even a crafted request cannot
--                   rewrite an event's content, only its read marker.
--   service_role:   full (the only writer; emitters run server-side after
--                   the domain write succeeded).
-- INSERT is deliberately NOT granted to authenticated: a user must not be
-- able to fabricate events for themselves (or anyone), and every legitimate
-- event has a server-side origin.
--
-- Idempotency: (recipient_profile_id, dedupe_key) is UNIQUE; emitters build
-- the key from event_type + entity id, so a retried action re-emitting the
-- same event is a silent no-op, never a duplicate row.
--
-- Privacy: metadata is BOUNDED (2 KB) jsonb intended for safe render hints
-- (country code, role slug, a truncated neutral label) — never free-form
-- personal text; the emitting adapter enforces the field allowlist in code.
-- ============================================================================

create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null
    references public.profiles (id) on delete cascade,
  event_type text not null
    constraint notification_events_type_check check (event_type in (
      'booking_proposed',
      'booking_accepted',
      'booking_declined',
      'absence_requested',
      'absence_approved',
      'absence_rejected',
      'engagement_created'
    )),
  entity_type text not null
    constraint notification_events_entity_type_check check (entity_type in (
      'booking_request',
      'worker_absence',
      'engagement'
    )),
  entity_id uuid not null,
  dedupe_key text not null
    constraint notification_events_dedupe_key_bounded check (char_length(dedupe_key) <= 200),
  metadata jsonb not null default '{}'::jsonb
    constraint notification_events_metadata_bounded check (pg_column_size(metadata) <= 2048),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint notification_events_dedupe unique (recipient_profile_id, dedupe_key)
);

comment on table public.notification_events is
  'Durable per-recipient notification events. Append-only via service_role; recipients may only read and mark read. See docs/human-gates/notification-events-gate.md.';

-- The two real read shapes: "my feed, newest first" and "my unread count".
create index notification_events_recipient_created_idx
  on public.notification_events (recipient_profile_id, created_at desc);
create index notification_events_recipient_unread_idx
  on public.notification_events (recipient_profile_id)
  where read_at is null;

alter table public.notification_events enable row level security;

-- Default-closed, then grant exactly what the decision above states.
revoke all on public.notification_events from public;
revoke all on public.notification_events from anon;
revoke all on public.notification_events from authenticated;

grant select on public.notification_events to authenticated;
grant update (read_at) on public.notification_events to authenticated;

create policy notification_events_select_own
  on public.notification_events
  for select
  to authenticated
  using (recipient_profile_id = auth.uid());

create policy notification_events_mark_read_own
  on public.notification_events
  for update
  to authenticated
  using (recipient_profile_id = auth.uid())
  with check (recipient_profile_id = auth.uid());
