-- @human-gate-approved
-- 20260702150000 — Grant INSERT on pilot_events to anon (P1 telemetry gap
-- F-T1, full-project audit 2026-07-02).
--
-- Problem: 0020's own INSERT policy explicitly admits anonymous rows
-- ("profile_id is null or profile_id = auth.uid()") and its comments
-- promise anon testers can emit events — but the table GRANT went only
-- `to authenticated` and this repo's doctrine gives anon no default
-- privileges. Result: the funnel's very first event (`login_started`,
-- fired pre-auth from the login page and Google button) fails with
-- permission-denied for every logged-out visitor, and the fire-and-forget
-- pipe swallows it. Top-of-funnel is silently missing.
--
-- Fix: INSERT-only grant to anon. RLS still constrains anon rows to
-- profile_id IS NULL (auth.uid() is null for anon, so the other branch
-- can never match), SELECT stays admin-only, no UPDATE/DELETE exists.
-- The server action additionally allowlists and caps all metadata.
--
-- Owner verification step BEFORE prod apply: run one anon-key insert
-- against staging and confirm it lands with profile_id null.
--
-- NOT applied to production by the automated session.

grant insert on public.pilot_events to anon;

-- ROLLBACK (down):
--   revoke insert on public.pilot_events from anon;
