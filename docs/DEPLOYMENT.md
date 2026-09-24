# Deployment

> Status (2026-07-11; migrations section rewritten 2026-09-23): PRODUCTION LIVE.
> Vercel auto-deploys `main` to `labourmarket.ai` (public canonical) and
> `app.labourmarket.ai` (auth/dashboard) — see
> `docs/policies/domain-truth-v1.md` (v2). The Supabase section below is
> the founder-actionable source of truth for secrets and migrations.
> **Production migrations are applied only through the human-gated process:
> reviewed PR, then Supabase MCP `apply_migration` — never by `supabase db
> push`, never automatically on merge.** `pnpm db:push` now REFUSES (exit 2)
> for the reasons in § Database migrations.

## Secrets — where they come from

Secrets NEVER live in the repo. The founder fetches them and puts them in
`.env.local` (gitignored) for local work and in Vercel project env vars for
deploys.

| Variable | Where to get it |
| -------- | --------------- |
| `NEXT_PUBLIC_SUPABASE_URL` | Already known: `https://gorgitwvdzxbnaxhrsrw.supabase.co` (also in `.env.example`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → Project API keys → `anon` `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → Project API keys → `service_role` (secret — never commit, never expose to the browser) |
| `SUPABASE_DB_PASSWORD` | Supabase Dashboard → Settings → Database → Database password |
| `NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS` | `true` for dev/preview, `false` for production |

Copy `.env.example` → `apps/web/.env.local`, fill the values, and add the same
keys in Vercel → Project → Settings → Environment Variables.

## Database migrations — PRODUCTION

The production project (`gorgitwvdzxbnaxhrsrw`) is live with real data and
several hundred applied migrations (`docs/APPLIED_LEDGER.md`). There is
exactly ONE way a migration reaches it:

1. The migration file lands in `supabase/migrations/YYYYMMDDHHMMSS_snake_case.sql`
   through a reviewed PR (`migration-safety` CI gate; GREEN class auto-merges,
   RED class waits for the human gate — `CLAUDE.md` § Merge model).
2. **Every DB-touching migration ships its rollback** as
   `supabase/rollbacks/<same name>.down.sql` (doctrine § reversibility).
3. An operator session applies it with the **Supabase MCP `apply_migration`**
   — one migration, verified against the production project ref — and
   records the apply in `docs/APPLIED_LEDGER.md`. The conditions under which
   this may happen autonomously are in `AGENTS.md` → Migrations → PROD APPLY
   AUTONOMY; risky, destructive, ambiguous or irreversible migrations require
   a human checkpoint.

### Why `supabase db push` is forbidden (and `pnpm db:push` refuses)

`supabase db push` pushes to whatever project the local CLI is **linked** to
(`supabase/.temp/linked-project.json`, gitignored). On the owner's machine
that link is PRODUCTION. The CLI decides what to apply by comparing the repo's
migration **filenames** against the production ledger's **versions** — and
those do not match: many migrations were applied under different or combined
names (`docs/APPLIED_LEDGER.md` § CORRECTION, `docs/launch/SCHEMA_DRIFT_REPO_VS_PRODUCTION_2026-09-14.md`).
A push would therefore re-run migrations that are already applied, against
real data. The same holds for `prisma migrate deploy` (there is no Prisma) and
for `supabase db reset --linked` (catastrophic).

`pnpm db:push` is kept as a **refusal** (`scripts/db-push-refused.mjs`,
exit 2) so that an old habit, a stale document or a copied command stops with
an explanation instead of reaching production. Owner-side hygiene, not a code
change: run `npx supabase unlink` on any machine whose CLI is linked to
production, so no CLI command can target it by default.

### Regenerating the typed client

`pnpm db:types` (`supabase gen types typescript --project-id gorgitwvdzxbnaxhrsrw`)
reads the production schema and OVERWRITES `apps/web/lib/supabase/types.ts`.
It is read-only against production and needs a CLI login
(`supabase login`, or `SUPABASE_ACCESS_TOKEN` for non-interactive use — a CLI
token, not an app env var, never committed).

### CLI binary note

`supabase` is a repo devDependency and is provisioned on `pnpm install`
(`pnpm.onlyBuiltDependencies` allows its postinstall). If `supabase` is not on
PATH, prefix the commands with `pnpm exec` or use `npx supabase`.

## First admin user

No admin row is ever seeded (brief §10.2). After the founder signs up through
the app normally (which creates their `profiles` row), promote it:

```bash
pnpm admin:promote founder@example.com
```

It uses the service-role key, confirms interactively (or `--yes` in scripts),
and flips that profile's `role` to `admin`. It refuses if no profile with that
email exists yet — sign up first.

## Local database (Docker Desktop — a LOCAL_TEST_DEPENDENCY only)

The Supabase Cloud project stays real-data-only. A local database exists for
the LOCAL INTEGRATION test class (`docs/TESTING.md`) and is never a step on
the way to production. Docker may be OFF by owner decision; every local
helper then stops with `LOCAL_INTEGRATION_TEST_REQUIRES_DOCKER` (exit 3).

```bash
npx supabase start             # local Postgres + Auth on :54321/:54322
npx supabase db reset          # rebuilds the LOCAL db from supabase/migrations
pnpm db:fixtures:local         # local-only fixtures (users, journal flow, demand)
pnpm -C apps/web e2e:local     # or dev:acceptance — boots the app on the local stack
```

`npx supabase db reset` (WITHOUT `--linked`) is the only way the repo's
migrations are loaded into the local database. It never touches the linked
cloud project. **Do not point `apps/web/.env.local` at the local stack**: that
file is what `pnpm dev` needs for production and the local helpers deliberately
never read it — `e2e:local` and `dev:acceptance` resolve the running stack
themselves via `npx supabase status` (`lib/testing/local-supabase-env.ts`)
and refuse any non-local target (`REFUSED_NON_LOCAL_E2E_SESSION_MINT`).

`pnpm db:fixtures:local` has two **hard guards**: the resolved Supabase API
target must be the local stack (loopback host, allowlisted origin, no cloud
key), and the psql connection string must name a loopback host — asserted
before any psql client is spawned. Override the psql target with
`LOCAL_DB_URL` (loopback only; default
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). The former
override name `SUPABASE_DB_URL` is a production secret name and is now
**refused** when set, rather than honoured. `dev-fixtures.sql` must never
reach the cloud project.

## Vercel deploys

> SUPERSEDED NOTE (was "Vercel preview deploy", M0 era): the project is no
> longer preview-only. Vercel builds every PR as a preview deployment and
> auto-deploys `main` to production on the real domains. The historical M0
> setup steps (project creation, env vars, first preview) remain valid as
> onboarding reference.
