-- ════════════════════════════════════════════════════════════════════════
-- 0020 — Pilot telemetry events (Agent OS + Tester Intelligence v1).
--
-- Lightweight task / event log written by the app's authenticated session
-- (RLS = INSERT only by `auth.uid()` or NULL for anonymous testers). The
-- admin inbox at `/[locale]/dashboard/admin/pilot-telemetry` is the only
-- read surface and is gated by `public.is_admin()`. NEVER public.
--
-- Privacy boundaries (enforced both in the server action AND by these
-- column shapes):
--   - `metadata` is jsonb with a server-side allowlist + size cap; the
--     action drops keys outside the allowlist and trims oversize values
--     BEFORE the insert. There is no schema-level CHECK on the shape
--     (jsonb is opaque to Postgres CHECKs); the safety lives in
--     `lib/telemetry/actions.ts` + the guard tests.
--   - `route` / `error_code` / `task_name` / `task_step` / `app_version`
--     are short bounded strings — never paste a full URL with a query
--     string that might carry an auth code, or a raw journal entry.
--   - No column carries raw profile / journal / CV text. The recording
--     helper rejects payloads that look like free-text (>200 chars in a
--     single allowlisted value) at the boundary.
--
-- Additive only — does not drop, alter-drop, or remove any rows. Idempotent
-- via `create table if not exists` + `create policy` (no `if not exists`
-- needed because re-runs of this migration on an existing table will be
-- a no-op for the table itself; policy duplicates would error but the
-- migration is only intended to run once per environment).
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.pilot_events (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  profile_id   uuid references public.profiles(id),
  -- Pseudonymous session id minted client-side in `lib/telemetry/task.ts`
  -- and cached in sessionStorage. Reset on browser close / private mode.
  -- Bounded so a hostile client can't pad it past ~60 chars.
  session_id   text not null check (char_length(session_id) <= 64),
  route        text not null check (char_length(route) <= 240),
  locale       text not null check (char_length(locale) <= 16),
  event_name   text not null check (char_length(event_name) <= 64),
  task_name    text check (char_length(task_name) <= 64),
  task_step    text check (char_length(task_step) <= 64),
  duration_ms  integer check (duration_ms is null or duration_ms >= 0),
  result       text not null
               check (result in ('started','success','error','abandoned','info')),
  error_code   text check (char_length(error_code) <= 64),
  metadata     jsonb not null default '{}'::jsonb,
  app_version  text check (char_length(app_version) <= 64)
);

create index if not exists idx_pilot_events_created_at
  on public.pilot_events(created_at desc);
create index if not exists idx_pilot_events_task_created
  on public.pilot_events(task_name, created_at desc)
  where task_name is not null;
create index if not exists idx_pilot_events_event_created
  on public.pilot_events(event_name, created_at desc);
create index if not exists idx_pilot_events_result
  on public.pilot_events(result)
  where result in ('error','abandoned');

alter table public.pilot_events enable row level security;

-- INSERT: authenticated callers may write for themselves OR anonymously
-- (profile_id NULL). Anon testers exercising the marketing surface can
-- still emit a `page_view` without a logged-in profile.
create policy pilot_events_insert on public.pilot_events for insert
  with check (profile_id is null or profile_id = auth.uid());

-- SELECT: admins only. Workers / companies / agencies / clients see
-- zero rows. NEVER public.
create policy pilot_events_select on public.pilot_events for select
  using (public.is_admin());

-- No UPDATE / DELETE policy. The append-only model mirrors §3 doctrine
-- for journal entries: rotation/retention will land in a future
-- maintenance RPC, not here.

grant select, insert on public.pilot_events to authenticated;
