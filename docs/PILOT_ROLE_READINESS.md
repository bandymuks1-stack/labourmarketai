# Controlled-pilot role readiness — Worker / Company / Agency / Buyer / Admin

Companion to `docs/PILOT_READINESS.md` (which covers the worker capability flow and admin panel). This file covers the **role-context** dashboards added in this sprint: every pilot tester gets a clear first useful action after login.

Run this on **production** (`https://app.labourmarket.ai`) with a tester for each role. **No fake data**, no service-role grant.

## Role doctrine (PLATFORM_DOCTRINE)

1. Role choice is an entry point, not a prison.
2. A person/account can grow into multiple roles over time.
3. A company can be employer / buyer / partner / project owner.
4. An agency can supply workers / find assignments / later become a buyer.
5. A buyer can request work / become an employer.
6. Nobody is blocked by a narrow category if they honestly want to use another path.
7. No fake matching. No fake verification. No public-by-default exposure.

The role-context dashboards encode these as honest copy + role-gated routes; the role switcher (PR #52) lets a user move between roles without losing data.

## Worker — already covered

See `docs/PILOT_READINESS.md`. Worker capability flow is mature; this sprint does not change it.

- [ ] login + onboarding works;
- [ ] `/lt/dashboard/profile` renders Mano gebėjimai + composer + saved chips;
- [ ] capability suggestions, manual add, save/reload, remove all work;
- [ ] honest "self-declared / not externally verified" status row visible.

## Company / Įmonė

- [ ] Sign in as a user who holds the `company` role (or add it from the role switcher).
- [ ] Navigate to `/lt/dashboard/company` directly. The page renders with header `Įmonės pilotinis skydas` + subtitle that says role is an entry point.
- [ ] A `PILOT` disclaimer card is visible explaining no fake matching, no auto-publication.
- [ ] The "First useful action" card renders a save form titled `Sukurti darbo / paslaugos / komandos paklausą` (PR B / feat/cc/pilot-draft-flows — draft persistence is shipped; one private row per user per draft_type).
- [ ] Fill any field (e.g. `Pavadinimas` / `Pajėgumai`) and press `Išsaugoti`. The green `✓ Išsaugota privačiai` confirmation appears; reload shows the values pre-filled.
- [ ] `Ištrinti juodraštį` is only visible when a draft already exists; pressing it removes the row and the form returns empty.
- [ ] A link `Mano gebėjimai →` is visible and goes to `/lt/dashboard/profile`.
- [ ] If you do NOT hold the `company` role, navigating to `/lt/dashboard/company` redirects to `/lt/dashboard` (the overview). Server-side; no flash of company content.

## Agency / Agentūra

- [ ] Sign in as a user who holds the `agency` role.
- [ ] Navigate to `/lt/dashboard/agency`. Page renders `Agentūros pilotinis skydas`.
- [ ] Pilot disclaimer mentions that candidates are not auto-verified.
- [ ] First-action card renders the agency draft form; save / reload / edit / delete loop works as for the company role.
- [ ] `Mano gebėjimai →` link works.
- [ ] Non-agency users are server-side redirected to `/lt/dashboard`.

## Buyer / Pirkėjas

- [ ] Sign in as a user who holds the `customer` role (the DB slug; the user-facing label is "Pirkėjas").
- [ ] Navigate to `/lt/dashboard/buyer`. Page renders `Pirkėjo pilotinis skydas`.
- [ ] Pilot disclaimer mentions request stays private.
- [ ] First-action card renders the buyer draft form; save / reload / edit / delete loop works as for the company role.
- [ ] `Mano gebėjimai →` link works.
- [ ] Non-buyer users are server-side redirected to `/lt/dashboard`.

## Admin — already covered

See `docs/PILOT_READINESS.md`. Admin role-switcher badge (PR #52) and pilot panel (PR #51) are already shipped.

- [ ] `⚙ ADMIN REŽIMAS` badge visible in dashboard header for the admin user.
- [ ] Clicking the badge navigates to `/lt/dashboard/admin`.
- [ ] Non-admin users do not see the badge.

## General

- [ ] No public exposure by default — every chip/draft visible only to its owner via RLS or owner-scoped routes.
- [ ] No fake `Patvirtinta` / `Confirmed` / `Verified` wording for self-declared claims or pilot drafts.
- [ ] No fake matching claims anywhere ("Sistema rado X atitikmenis" — does not appear).
- [ ] No billing/payment UI visible.
- [ ] LT copy understandable to a Lithuanian-speaking pilot tester.

## What ships in PR B (feat/cc/pilot-draft-flows)

- **Draft persistence** — `public.pilot_drafts` (migration 0016) holds one private row per `(profile_id, draft_type)` with owner-scoped RLS, `closed`-only visibility CHECK, explicit GRANT to `authenticated` only (no service_role), and `is_admin()` read-only path.
- **Admin pilot-observability metrics** — the admin pilot panel now shows total + per-type draft counts and the per-user inspect view lists each draft's payload.
- **Honesty** — no public exposure, no fake matching / verified / confirmed copy, no billing, no service_role grant. Source-level invariants enforced by `lib/guards/pilot-drafts.test.ts`.

The migration file is committed; **owner applies on production** via Supabase SQL Editor / MCP (CLAUDE.md: "Running migrations on production — NEVER automatic.").

## Auto-verified invariants (existing test suite)

These don't need manual verification — `pnpm -F web test` enforces them:

| Invariant | Test file |
|---|---|
| `requireRoleOrRedirect` reads from `profile_roles`, not `active_role` | `lib/guards/role-dashboards.test.ts` |
| Each role dashboard calls the gate first | same |
| Each role dashboard does no DB writes (`insert`/`update`/`delete`/`upsert`/`saveProfileSkillClaimsAction`) | same |
| Each role dashboard does not use the service-role client | same |
| Shared `RoleDashboard` renders pilot disclaimer + first-action slot | same |
| LT + EN `roleDashboards.*` keys present + honest (no verified/confirmed/match-found copy) | same |
| Admin badge fix (PR #52) preserved | `lib/guards/admin-role-switcher.test.ts` |
| Superadmin server-side gate (PR #51) preserved | `lib/guards/superadmin.test.ts` |

## Out of scope (intentional, even with PR B)

- Public exposure of drafts — explicitly forbidden; will require a separate consent-driven slice.
- Service-role grant on `pilot_drafts` — explicitly forbidden.
- Production DB writes by an agent — owner applies migrations manually.
- Billing / payment / provider work.
- External AI / API.
- Broad visual redesign.
- Public profile sharing.
- Matching / ranking / recommendations.

---

After this checklist is green on production, the controlled pilot can extend from worker-only to all four pilot roles.
