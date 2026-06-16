# Bug Hunter — Mobile Hang & Delivery-Chain Audit v1 (2026-06-16)

Applied the Claude Bug Hunter skill (full-chain reality check:
`UI click → action/API/RPC → DB/RLS → recipient/reload → visible`) as a
pre-invite real-user bug hunt. No bug is treated as fixed on a copy change — only
when the real action works.

## Fixed in this PR (Mode B — stuck-pending / mobile hang, bug class #5)

Three `"use client"` components issued a `fetch(...)` with **no timeout/abort**.
A `try/catch/finally` does NOT protect these: a mobile request that never settles
(radio sleep, cell↔wifi handoff, frozen backgrounded tab) never reaches `finally`,
so the pending state hangs forever.

| Component | Fetch | Before | After |
|---|---|---|---|
| `profession-skills-picker.tsx` `save()` | POST `/api/workers/[id]/skills` | hung on "Įrašoma…" on a stalled mobile request | `AbortSignal.timeout` → rejects → error shown → `finally` clears "saving" → retry |
| `profession-skills-picker.tsx` load | GET `/api/professions/[id]/skills` | stuck "loading skills…" forever | timeout → `loadError` state (retryable) |
| `waitlist-modal.tsx` `onSubmit` | POST `/api/waitlist` | public signup stuck on "sending" | timeout → "error" state → retry |

This is the **same class** as the owner's original "Įrašoma…" report, at sites
the first fix didn't cover (the catalogued manual skill picker + the public
waitlist). The persistence itself was always real (the API routes write); the fix
guarantees the pending state always resolves. Bounded by the shared
`SAVE_TIMEOUT_MS` (`lib/async/with-timeout.ts`). Stripe `test-checkout-button`
is intentionally excluded (out of scope; it redirects away on success).

**Guard:** `lib/guards/client-fetch-timeout.test.ts` — fails CI if any client
component issues a fetch without an abort/timeout (explicit allowlist for the
documented Stripe exception), and pins the three fixed flows.

## Delivery-chain audit (Mode A — bug class #3, recipient visibility)

Traced each non-communication delivery surface end-to-end (insert → recipient
column → RLS SELECT → recipient route → reload). Communication was already fixed
in #443 and was not re-audited.

| Surface | Verdict |
|---|---|
| Manager instructions | **DELIVERS** — RPC adds the worker as a participant; reachable via account-menu + the communication-tab attention block + player-card; reload-safe. |
| Scouting → communication request | **DELIVERS** — worker correctly added as conversation participant (rides the fixed 0021 backend). |
| Org member invites | **DELIVERS (reflective)** — worker sees the new org on their own journal/profile after reload (own `profile_id`, RLS-scoped). Direct active membership, no accept-step, no announce-badge. |
| Candidate drafts | **OWNER-SIDE-ONLY (by design)** — honestly labelled private drafts; never framed as reaching a person. |
| **Booking proposals** | **GATED — see owner-gated below.** |

## Owner-gated follow-up (do NOT apply / do NOT add dead nav)

### Booking proposals — discoverability gap, blocked on an unapplied migration
- The data layer is sound: `propose_booking_request` writes `booking_requests`
  with `worker_id`, and the SELECT RLS lets the worker (`workers.profile_id =
  auth.uid()`) read it; `listMyBookings()` splits incoming for the worker at
  `/dashboard/bookings`.
- BUT `/dashboard/bookings` has **no nav tab / account-menu link / attention
  surface / badge** — a worker could only reach it by typing the URL.
- HOWEVER the booking migration `20260613100100_booking_requests.sql` is a RED
  human-gated draft and is **NOT in `docs/APPLIED_LEDGER.md`** (not applied in
  prod). The feature is correctly inert: `proposeBookingAction` returns
  `needs-migration` and the button shows an honest **"unavailable"** — never a
  fake "sent". So there is **no live delivery bug today** (no real proposals exist
  to be missed).
- **Therefore a nav entry is intentionally NOT added now** — pointing a primary
  nav item at an unapplied feature would be a dead/empty route, which this skill
  forbids.
- **Owner action, in order:** (1) apply `20260613100100_booking_requests.sql`
  (owner-gated, via Supabase MCP `apply_migration`); (2) THEN add a worker-facing
  discoverability surface for `/dashboard/bookings` (a nav/attention entry +
  unread badge, mirroring the communication fix) so proposed bookings are found.
  Until both are done, bookings stays honestly "unavailable".

## Not changed (intentionally)
- No DB apply, no Supabase apply, no Stripe, no env/secrets, no new languages, no
  role-model refactor.
- Server actions invoked via `useTransition` (framework-managed pending) were not
  wrapped in per-call timeouts — out of scope; the reported hangs were the manual
  `useState` + un-timed `fetch` pattern, now fixed.
