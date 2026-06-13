# Step 4B — Communication / booking persistence + RLS decision packet

> Owner decision required before any booking persistence ships. This packet
> documents the design; **no migration is applied and none is committed** in
> this PR. The typed state machine (`apps/web/lib/booking/booking-state.ts`) is
> **inert** (pure, no IO, not imported by any route) so it can be reviewed and
> unit-tested without touching production.

## What already exists (and is enough for communication)
- **Communication**: Step 4A ships a gated, in-app **request-to-communicate**
  reusing the existing `0021` conversations backend — **no new table needed**.
  Contacts stay hidden; the worker's `profile_id` is resolved server-side only.

## What booking would additionally need
Booking is a **commitment** ("I propose to engage this worker from date X"),
which communication is not. It needs durable, owner-scoped state a worker can
**accept or decline** — i.e. a new table. There is no safe way to persist this
on the existing schema without a migration.

### Proposed additive table (NOT applied — for owner review)
```sql
-- additive, reversible. Owner-gated apply (Supabase MCP after approval).
create table if not exists public.booking_requests (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  request_id  uuid not null references public.customer_requests(id) on delete cascade,
  worker_id   uuid not null references public.workers(id) on delete cascade,
  status      text not null default 'proposed'
              check (status in ('proposed','accepted','declined','withdrawn','expired')),
  start_date  date,
  note        text check (note is null or char_length(note) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (owner_id, request_id, worker_id)
);
alter table public.booking_requests enable row level security;

-- The company (owner) sees + writes its own proposals.
create policy booking_requests_owner_select on public.booking_requests
  for select using (owner_id = auth.uid() or public.is_admin());
create policy booking_requests_owner_write on public.booking_requests
  for insert with check (owner_id = auth.uid());
create policy booking_requests_owner_update on public.booking_requests
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- The WORKER (subject) sees proposals addressed to them and may accept/decline.
-- (Worker acceptance must move status proposed→accepted ONLY; enforced by a
--  SECURITY DEFINER RPC, not a broad update grant — see open questions.)
create policy booking_requests_worker_select on public.booking_requests
  for select using (
    exists (select 1 from public.workers w
             where w.id = booking_requests.worker_id and w.profile_id = auth.uid())
  );

grant select, insert, update on public.booking_requests to authenticated;
```
Rollback: `drop table if exists public.booking_requests;` (zero-row at creation).

### State machine (implemented + tested, inert)
`proposed → {accepted|declined}` by the **worker only**; `proposed → withdrawn`
by the company; `proposed → expired` by the system. All others terminal. The
company can **never** self-accept — no fake acceptance. See
`apps/web/lib/booking/booking-state.ts` + its tests.

## Why this is NOT auto-merged as a live feature
- A `booking_requests` migration committed but **not applied** to prod would
  leave the table absent; any live query would fail. Per the operating rules we
  do **not** apply Supabase production, and we don't ship a half-live feature.
- Worker acceptance is a **consent action** with product/legal weight (it is the
  first step toward a real engagement) — the owner should approve the model.

## Open questions for the owner (decision needed)
1. **Acceptance path**: confirm worker accept/decline via a `SECURITY DEFINER`
   RPC (recommended — narrow, auditable) vs a scoped UPDATE grant.
2. **Notification**: how is the worker told a proposal exists? In-app inbox only
   (no external email/SMS in this scope) — confirm.
3. **Contact exposure on acceptance**: does accepting reveal any contact detail,
   or stay in-app only until a separate paid/contact slice? Recommended:
   **in-app only**, contacts still hidden.
4. **Expiry**: auto-expire window for `proposed` (e.g. 14 days)?

## Recommendation
Keep booking **inert** until the owner answers the four questions. When
approved, ship as a dedicated migration PR (additive + reversible +
`migration-safety` green), applied to prod manually by the owner, with the live
actions written against the already-tested state machine. **Step 4A
communication is sufficient for launch**; booking is a fast follow.
