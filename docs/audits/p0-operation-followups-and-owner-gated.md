# P0 Operation Fixes — Follow-ups & Owner-Gated Items (2026-06-16)

This PR fixes three real-user bugs **at the app layer only** — no DB apply, no
Stripe, no env/secrets, no language rollout, no role-model refactor. This note
records what was fixed, what stays owner-gated, and the language-expansion rule.

## What shipped (app-layer, no DB)

1. **Request sent to a worker is now reachable + noticed.** The conversation row
   and RLS were already correct (the worker is a real participant and can read
   it); the bug was discoverability. `communication` is now a first-class
   primary-nav surface (desktop tab + mobile bottom-nav) with a **real unread
   badge** driven by `getUnreadConversationCount()` (a count over the user's
   `conversation_participants` rows with `last_read_at IS NULL`). A worker now
   sees a "Žinutės/Messages" tab with a badge when a request arrives.
2. **Work-order / company-need submit surfaces the real cause.** The submit
   action collapsed every Postgres error into a generic "try again", hiding a
   missing RPC/column. It now maps `42883 / PGRST202 / 42P01 / 42703` to an
   honest `needs_migration` state and logs `error.code`.
3. **Mobile skills save can no longer hang on "Įrašoma…".** The profile
   text-first save is bounded by `withTimeout` so a stalled mobile request flips
   the indicator to a retryable error instead of hanging forever.

## Owner-gated — do NOT apply without explicit owner approval

### A. Work-order submit: re-apply demand-intake migration IF the new honest error fires
The submit RPC `submit_demand_request` and `save_demand_draft` are defined in
`supabase/migrations/20260530150000_demand_intake_consolidation.sql` and recorded
as applied in `docs/APPLIED_LEDGER.md`. The app no longer hides the cause, so:
- If, in production, submitting a need now shows the **needs_migration** message,
  the consolidation RPCs are not actually live in the running project — re-apply
  that migration via Supabase MCP `apply_migration` (RED / owner-gated;
  SECURITY DEFINER functions). **Never** `supabase db push` (filenames don't
  match the ledger versions → re-run hazard).
- If it shows the generic **error** (not needs_migration), it is a transient /
  RLS / session issue, not a migration — diagnose from the now-logged `error.code`.

No migration is applied by this PR. The app change only makes the real cause
visible so the owner can decide.

### B. Durable notifications table (optional, beyond the nav badge)
The nav badge already makes an incoming request noticeable without any new table.
A richer, durable notification feed (email / cross-device / "X sent you a
request" with a deep link) needs a real table. Proposed RED migration shape — for
owner approval, not applied here:

```sql
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  type text not null,            -- 'conversation_started' | 'message_received' | …
  entity text, entity_id uuid,   -- 'conversations', conversation_id
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select
  using (recipient_id = auth.uid() or public.is_admin());
create policy notifications_update on public.notifications for update
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
grant select, update (read_at) on public.notifications to authenticated;
```
Insertion via a `SECURITY DEFINER` RPC (or a trigger on
`conversation_participants` insert) so a sender can address a notification to a
recipient without a broad cross-user INSERT grant. Then wire `createConversation`
/ `sendMessage` to create a row and feed the existing `NotificationPanel` (which
is already cross-role aware) from real rows instead of `[]`.

## Language expansion follow-up (binding for this sprint)

Active languages stay **LT / EN / RU** only. No additional European language is
rolled out in this sprint, and inactive bundles are not called "ready".

**Rule:** language expansion starts only **after** the core system is stable —
i.e. after request delivery, work-order submit/persist, mobile save flows, role /
account logic, communication, market map / search, and documents all work for
real users. Promoting a new locale is a one-row add in
`apps/web/lib/i18n/config.ts` (`activeLocales`) plus full-parity message files
guarded by the active-locale parity guard — to be done as its own PR once core
operation is signed off, not before.
