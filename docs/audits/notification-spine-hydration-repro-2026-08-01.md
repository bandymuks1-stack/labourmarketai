# Notification-spine hydration repro — CLOSED, NOT REPRODUCIBLE (2026-08-01)

## The reported observation

During the PR #959 (MobileSheet outside-close) session, on a LOCAL dev run of
`main` (local Supabase stack, fixture worker `dev.worker@local.test`,
viewport 375×812, `/lt/dashboard/bookings`):

- the RSC flight payload embedded in the page HTML contained the streamed
  spine chunk (`{"id":"pending-bookings","count":1,"href":"/dashboard/bookings"}`),
- but the client `AuthProvider.notifications` state stayed `[]`,
- a fiber-tree walk found no mounted `SpineHydrator`
  ([components/app/spine-hydrator.tsx](../../apps/web/components/app/spine-hydrator.tsx)),
- the bell dot stayed gray and the sheet showed the empty state.

Suspicion: the `<Suspense fallback={null}>` boundary around `SpineStream` in
[app/[locale]/dashboard/layout.tsx](../../apps/web/app/%5Blocale%5D/dashboard/layout.tsx)
never commits client-side. Known caveats at observation time: dev mode only,
the pre-existing `caret-color` hydration-attribute warning, and the shared
local fixture DB being **concurrently cleared by another session's e2e runs**.

## Repro protocol (clean, this session)

Baseline `main@3d663787` (the commit the observation was made on), local
Supabase stack (fixtures intact, `booking_requests` empty), fresh minted
sessions for both fixture identities, dev server on a **private port 3211**
(another live session owned :3100 — never reused).

1. **Existing spec, full clean run** —
   [w3-calendar-rows-11-12.spec.ts](../../apps/web/tests/e2e/w3-calendar-rows-11-12.spec.ts)
   (its "the bell carries the signal" test is byte-for-byte the reported
   scenario minus the viewport): **8/8 passed**, including the seeded-proposal
   badge, the bell on `/lt/dashboard/bookings`, the 375 px test, RLS, and the
   company side.
2. **Targeted spec at the exact observed conditions** — temporary spec (not
   committed): seed ONE `proposed` booking for the fixture worker, then
   4 fresh 375×812 contexts × (initial load + reload) on
   `/lt/dashboard/bookings`, asserting BOTH halves on every load:
   - the flight payload contains `pending-bookings` (server truth streamed), and
   - the client actually hydrated it — bell dot `bg-state-live`, and the
     opened MobileSheet shows `notification-signal-pending-bookings` with
     count 1.

   **8/8 loads hydrated correctly.** Only console noise: the known
   report-only-CSP notice. The `caret-color` mismatch did not even appear in
   these runs.

## Why the original observation happened (assessed)

The shared-fixture contamination class is real and was **demonstrated live
during this very investigation**: re-minting `.storage-state.json` while the
suite was running made exactly one test (the 375 px one — a fresh context that
reads the file at test time) fail with "badge not found", and its page
snapshot showed **"Sveiki, Dev Company"** — the wrong identity, not a product
defect. A clean rerun passed.

The original observation's environment had the same shape: another session's
e2e runs were clearing the same fixture DB. If the `booking_requests` row was
deleted between the observed page render (payload built with count 1) and the
fiber/state inspection (a later render/refresh with count 0),
`buildSpineNotifications` correctly returns `[]` — empty bell, gray dot, and
`applySpine([])` leaving `notifications: []` — while stale payload text from
the earlier render still sits in `__next_f`. Nothing about that requires a
hydration failure. The "no mounted SpineHydrator" fiber-walk claim could not
be reproduced under any clean condition.

## Verdict

- **No product defect.** `SpineStream` → `Suspense` → `SpineHydrator` →
  `applySpine` hydrates reliably in dev at 1440×900 and 375×812, on first
  load and reload, on `/lt/dashboard/bookings`.
- **Closed as environment contamination** of the original observation
  (shared fixture DB + shared storage-state under concurrent sessions).

## Rules this re-confirms (for future sessions)

- One local stack = one session at a time for authenticated e2e. A concurrent
  session clearing fixtures produces failures indistinguishable from product
  bugs (see also the playwright.config.ts serial-worker comment).
- Never re-mint `tests/e2e/.storage-state*.json` while a suite is running —
  fresh contexts read the file at test time.
- Never reuse another worktree's dev server: set `E2E_PORT` per session.
