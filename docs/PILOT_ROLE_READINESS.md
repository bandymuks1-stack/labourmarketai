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
- [ ] The "First useful action" card titled `Sukurti darbo / paslaugos / komandos paklausą` is visible with a `Ruošiama` status badge (honest — draft persistence ships in a follow-up slice).
- [ ] A link `Mano gebėjimai →` is visible and goes to `/lt/dashboard/profile`.
- [ ] If you do NOT hold the `company` role, navigating to `/lt/dashboard/company` redirects to `/lt/dashboard` (the overview). Server-side; no flash of company content.

## Agency / Agentūra

- [ ] Sign in as a user who holds the `agency` role.
- [ ] Navigate to `/lt/dashboard/agency`. Page renders `Agentūros pilotinis skydas`.
- [ ] Pilot disclaimer mentions that candidates are not auto-verified.
- [ ] First-action card: `Sukurti kandidatų / paslaugų pasiūlymo juodraštį` with `Ruošiama` status.
- [ ] `Mano gebėjimai →` link works.
- [ ] Non-agency users are server-side redirected to `/lt/dashboard`.

## Buyer / Pirkėjas

- [ ] Sign in as a user who holds the `customer` role (the DB slug; the user-facing label is "Pirkėjas").
- [ ] Navigate to `/lt/dashboard/buyer`. Page renders `Pirkėjo pilotinis skydas`.
- [ ] Pilot disclaimer mentions request stays private.
- [ ] First-action card: `Sukurti paslaugos / komandos / rangovo užklausą` with `Ruošiama`.
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

## What's deferred to a follow-up PR

This sprint ships **dashboards + onboarding + copy** for the three non-worker roles. The honest first-action card status is `Ruošiama` because:

- **Draft persistence** (company request / agency offer / buyer request rows in their own table, with owner-scoped RLS + `closed` visibility) is the next slice.
- **Admin pilot-observability metrics** (per-role profile count, drafts count by type) will be added once the drafts table exists.

These two are the explicit follow-ups documented in the sprint goal under "Required work package C" and "Required work package D".

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

## Out of scope (intentional, this sprint)

- DB migrations.
- Production DB writes.
- Service-role grant.
- Drafts persistence — explicit follow-up.
- Admin per-role / per-draft metrics — depends on drafts persistence.
- Billing / payment / provider work.
- External AI / API.
- Broad visual redesign.
- Public profile sharing.
- Matching / ranking / recommendations.

---

After this checklist is green on production, the controlled pilot can extend from worker-only to all four pilot roles.
