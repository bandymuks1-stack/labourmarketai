-- @human-gate-approved
-- ============================================================================
-- 20260823160000 — notification channel preferences v1.
--
-- RED CLASS, OWNER-APPROVED. The annotation above is applied on the owner's
-- explicit D7 approval (2026-08-23, "OWNER CONTINUATION — TRAIN 2+ CLOSE THE
-- OPEN VALUE LOOP" §1–§2: consent/preferences direction approved — per-type
-- explicit consent, privacy-safe defaults, marketing never silently opt-in,
-- no second consent system; recorded in
-- docs/human-gates/value-train-2-owner-decisions-v1.md → D7). It lets CI
-- evaluate the file; the PR stays RED-class (draft + needs-human-gate) and
-- the apply happens ONLY via Supabase MCP `apply_migration`.
--
-- WHY THIS EXISTS. The weekly personal digest (v6, applied) reaches workers
-- who VISIT. Reaching absent workers needs the email channel, and email
-- without consent, per-type control and unsubscribe is spam. The 2026-08-23
-- notification audit found NO preference primitive anywhere: no channel, no
-- frequency, no unsubscribe column or table (`dashboard_preferences` is
-- contractually display-layout-only). This is that missing primitive — the
-- justified NEW structure, stated per the doctrine-guard canonical check.
--
-- SHAPE (doctrine):
--   - §10 Lego: notification types are an EXTENSIBLE taxonomy → the type is
--     a slug column, never a boolean-per-type column set. New types need no
--     schema change. Channels are a small fixed TECHNICAL set (the §5.2
--     boundary note pattern), so a CHECK is appropriate; widening it later
--     uses the canonical drop+re-add idiom.
--   - §4 default-closed / consent-first: NO ROW means the DEFAULT applies,
--     and the default for EMAIL is OFF — email goes out only where an
--     explicit (profile, type, email, enabled=true) row exists. In-app
--     notifications keep today's behaviour (on; a row can turn one off).
--   - §6 minimalism: no derived data, no denormalized copies, one row per
--     (profile, type, channel) fact. Unsubscribe links need NO token column:
--     they are stateless signed tokens minted per send (server secret),
--     verified on click, landing on an authenticated-or-signed update of
--     these same rows.
--   - §2: no translation columns; the recipient's locale stays on profiles.
--
-- RLS: enabled; the person manages ONLY their own rows. The email
-- dispatcher (a later wagon) reads via service_role. No anon access of any
-- kind.
--
-- ROLLBACK: supabase/rollbacks/20260823160000_notification_preferences_v1.down.sql
-- (drops the table; preferences are user-editable settings, not evidence —
-- §3 append-only does not apply, and the rollback recreates nothing because
-- there is nothing upstream of it).
-- ============================================================================

create table public.notification_preferences (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- Notification-type slug (§10): matches notification_events.event_type
  -- values plus digest-family slugs. Free slug by design — validated
  -- app-side against the registry; a CHECK here would turn every new type
  -- into a schema migration, which is exactly what §10 forbids.
  notification_type text not null,
  channel text not null check (channel in ('in_app', 'email')),
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key (profile_id, notification_type, channel),
  constraint notification_preferences_type_len check (
    char_length(notification_type) between 1 and 64
  )
);

alter table public.notification_preferences enable row level security;

-- Own rows only, all four verbs — a preference is the person's own setting.
create policy notification_preferences_select_own
  on public.notification_preferences for select
  to authenticated
  using (profile_id = auth.uid());

create policy notification_preferences_insert_own
  on public.notification_preferences for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy notification_preferences_update_own
  on public.notification_preferences for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy notification_preferences_delete_own
  on public.notification_preferences for delete
  to authenticated
  using (profile_id = auth.uid());

grant select, insert, update, delete
  on public.notification_preferences to authenticated;
-- The dispatcher reads consent under service_role (RLS-bypassing by role);
-- no separate grant rows are needed for service_role in Supabase, and anon
-- receives nothing.
