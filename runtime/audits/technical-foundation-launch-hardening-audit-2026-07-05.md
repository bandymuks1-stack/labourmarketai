# Technical Foundation — Launch Hardening Audit (2026-07-05, PR15)

**Owner question:** are the two logged technical launch risks closed, and is
the foundation clean for the PR16 final audit?

## Item 1 — customer_requests status-transition latitude (CLOSED, apply-gated)

**Finding (verified in source):** `0028_customer_requests.sql` grants
`UPDATE` to `authenticated` with an owner-row RLS policy. That is REQUIRED
by three live flows (close: `submitted→closed`, reopen: `closed→submitted`,
draft-remove: `draft→closed`), but it also let any owner PATCH
`status` directly via PostgREST to ANY CHECK-list value — including the
admin-only pipeline states (`in_review`, `needs_followup`, `approved`).
The `save_customer_request` RPC already demotes owner self-promotion to
`submitted`; the direct-table path had no such brake. Real abuse shapes:
self-approval (`draft→approved`) and submit-bypass (`draft→submitted`
without the RPC's validation).

**Fix:** migration `20260705150000_customer_requests_status_transition_guard.sql`
— a plain INVOKER trigger (NOT security definer) on
`before update of status`:
- no JWT (service_role / SQL editor / migrations): bypass;
- `public.is_admin()`: full pipeline latitude (unchanged);
- owner: whitelist = `draft→submitted`, `draft→closed`,
  `submitted→closed`, `closed→submitted`; anything else raises
  `check_violation` — invalid transitions can never pass silently.

Paired rollback `supabase/rollbacks/…down.sql` drops trigger + function
(exact pre-trigger state; no data touched either way).

**Class: RED** (`create trigger` — classifier flags it by design).
`-- @human-gate-approved` annotation set → CI passes but the PR is
needs-human-gate. **Prod apply: owner-gated, Supabase MCP
`apply_migration` only, after explicit approval.** Guard
`lib/guards/demand-status-transition.test.ts` pins migration ↔ rollback ↔
app lifecycle model in lockstep (whitelist shape, invoker-only, bypass
classes, app preconditions).

## Item 2 — NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS production lock (CLOSED)

**Finding:** four components read the raw env var; a production deploy
with the var set to `"false"` would have stripped every §18 placeholder
marker, letting governed fabricated values render as real platform data.

**Fix:** single lock in `lib/env.ts` — `showPlaceholderMarkers` is forced
`true` when `NODE_ENV === "production"`; the `"false"` opt-out works only
in dev/test. All four consumers (Placeholder, dashboard-section,
notification-panel, player-card) now read the constant. Guard
`lib/guards/placeholder-marker-prod.test.ts` pins the lock shape and
walks app/components/lib/content to fail on ANY future raw-env consumer.
No env change is needed in Vercel: the variable may stay set or unset —
production markers render regardless.

## Item 3 — dev design galleries reachable in production (found by Item 2's guard; CLOSED)

**Finding:** the new no-raw-env guard immediately caught three more
consumers. Two were `/design` and `/design/text-first` — internal dev
galleries ("Design system preview — dev only") gated on the marker env
var, whose DEFAULT of `"true"` left them **publicly reachable in
production**. The third was the admin project-truth diagnostic reporting
the raw var instead of the effective state.

**Fix:** dedicated `designGalleryEnabled` in `lib/env.ts` — hard-false in
every production build, opt-in in dev; both gallery pages `notFound()` on
it (guard-pinned). Project-truth now reports the EFFECTIVE marker state
("on (forced on in production)").

## Sweep (existing CI already holds these lines)

| Check | State |
|---|---|
| Migrations repo ↔ prod | 100 applied + 3 owner-gated RED drafts already merged & applied earlier this train; this PR adds the 103rd file (apply-gated) — counts pinned in 3 baseline guards (102→103) |
| Rollback files | CI `missing-rollback-file` enforces pairing; new migration ships its rollback |
| RLS safety | no policy touched in this PR; trigger narrows (never widens) effective write latitude |
| Duplicate routes / dead public buttons | swept + guarded in PR13 (`public-market-entry.test.ts`) |
| Auth-guard consistency | superadmin double-gate pinned (PR12); no auth-core changes here |
| Secrets | none added; env schema unchanged except the derived constant |
| typecheck / lint / build / tests | green (see PR validation) |

## Status
Technical foundation: **YELLOW → pending exactly one thing** — the
owner-gated prod apply of `20260705150000`. Code-side hardening is done
and guarded; PR16 flips the board item after the apply is verified.
