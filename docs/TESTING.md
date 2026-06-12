# Testing

End-to-end tests live in `apps/web/tests/e2e/` and run with Playwright.
The unit/typecheck/lint/build gates run via the existing pnpm scripts.

## Gate matrix (slice 6 baseline)

| Gate | Command | Required green |
| ---- | ------- | -------------- |
| Type | `pnpm typecheck` | always |
| Lint | `pnpm lint` | always |
| Build | `pnpm build` | always |
| Placeholders | `pnpm placeholders:check` | always |
| **e2e** | `pnpm e2e` | when `SUPABASE_TEST_URL` is set; otherwise specs **skip cleanly** |

## Playwright setup (one-time, per machine)

```bash
pnpm install                       # installs @playwright/test
pnpm -C apps/web e2e:install       # downloads the chromium binary
```

## Authenticated e2e — local Supabase stack (the standard path)

Authenticated flows (journal, manager confirmations, team views) run against
the **local Supabase stack** — never the cloud project. One-time prereqs:
Docker Desktop + `pnpm -C apps/web e2e:install`.

```bash
# 1. Start the local stack (repo root; first run pulls images)
npx supabase start

# 2. Apply every migration to a clean local DB
npx supabase db reset

# 3. Seed the test users + journal-flow links (LOCAL-ONLY, hard-guarded)
pnpm db:fixtures:local

# 4. Run the suite — resolves local URL/keys itself, hard-refuses non-local,
#    boots the app on :3100 so your own `pnpm dev` is never reused
pnpm -C apps/web e2e:local
```

Seeded users (all password `password`, pre-confirmed): `dev.worker@local.test`
(worker with an active employee engagement at Dev Construction,
journal review enabled), `dev.company@local.test` (the company owner —
manager side of the review inbox), `dev.agency@local.test`.

`pnpm e2e:local` exports `SUPABASE_TEST_URL` + the local
`NEXT_PUBLIC_SUPABASE_*` values for the spawned app, so the authenticated
specs (e.g. `journal-confirm-loop.spec.ts`) enable themselves. Everything it
uses is the publicly-documented shared local-dev default — no cloud
credential exists anywhere in this path, and fixtures live in
`supabase/dev-fixtures.sql` (never `supabase/migrations/`).

## Environment (manual override)

Tests skip themselves at runtime if `SUPABASE_TEST_URL` is missing — the gate
stays green on machines without the local stack. `pnpm e2e:local` sets
everything below automatically; set it manually only if you need a custom
arrangement:

```
SUPABASE_TEST_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key from `npx supabase status`>
SUPABASE_SERVICE_ROLE_KEY=<local service key from `npx supabase status`>
E2E_BASE_URL=http://127.0.0.1:3100
```

The production project (`gorgitwvdzxbnaxhrsrw`) stays real-data-only
(brief §10.2) — it is never a test target, and both `db:fixtures:local` and
`e2e:local` hard-refuse non-local URLs.

## Run

```bash
pnpm -C apps/web e2e:local        # authenticated suite vs the local stack
pnpm e2e                          # unauthenticated-only (no env) — auth specs skip
pnpm -C apps/web e2e:local --ui   # Playwright UI mode
pnpm -C apps/web e2e:local --debug
E2E_NO_SERVER=1 pnpm e2e          # don't auto-start dev (use a running one)
```

## Slice 6 test surface

`apps/web/tests/e2e/auth.spec.ts`:

- **Signup flow** — `/lt/auth/signup` renders, accepts an email + role,
  submits, shows the "check your email" state. One spec per role
  variant (currently worker + company).
- **Login flow** — `/lt/auth/login` renders, accepts an email, submits,
  shows the success state.
- **Multi-role + logout** — wired but `test.skip`'d until the test
  Supabase project is configured (these require an authenticated
  session). Re-enable in M1.x.

## Convention going forward

- One spec file per feature slice under `tests/e2e/<feature>.spec.ts`.
- Every spec must `test.skip` cleanly if the env it needs isn't
  configured — never red on a missing local config.
- M2 will add: skill verification, work journal entry, decision queue.
- M3 will add: service request, booking.
