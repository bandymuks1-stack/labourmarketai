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

## Environment

Tests skip themselves at runtime if `SUPABASE_TEST_URL` is missing —
the gate stays green until you stand up a separate test Supabase
project. Set the following in `apps/web/.env.local` (or your shell)
to enable them:

```
SUPABASE_TEST_URL=https://<test-project>.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://<test-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<test anon key>
SUPABASE_SERVICE_ROLE_KEY=<test service role key>
E2E_BASE_URL=http://127.0.0.1:3000
```

Use a **separate** Supabase project for tests — the production project
(`gorgitwvdzxbnaxhrsrw`) stays real-data-only (brief §10.2).

## Run

```bash
pnpm e2e                  # boots `pnpm dev`, runs the suite
pnpm e2e --ui             # opens Playwright UI mode
pnpm e2e --debug          # step-through
E2E_NO_SERVER=1 pnpm e2e  # don't auto-start dev (use an already-running one)
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
