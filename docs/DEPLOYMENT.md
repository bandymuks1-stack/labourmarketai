# Deployment

> Status: M0. The Supabase section below is complete and founder-actionable.
> The Vercel preview-deploy section is completed in slice 8 (§10.7).

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

## Applying the database (founder runs this)

The Supabase project at `https://gorgitwvdzxbnaxhrsrw.supabase.co` already
exists but is empty. The migration files are committed and ready; no agent has
applied them (no Supabase access token was available). Run, from the repo
root:

```bash
# 1. Authenticate the Supabase CLI (opens a browser; stores a token locally)
supabase login

# 2. Link this repo to the cloud project
supabase link --project-ref gorgitwvdzxbnaxhrsrw
#    (prompts for the DB password — SUPABASE_DB_PASSWORD above)

# 3. Apply schema + reference data (migrations 0001 then 0002)
pnpm db:push

# 4. Regenerate the typed DB client from the now-real cloud schema.
#    This OVERWRITES the hand-authored mirror at
#    apps/web/lib/supabase/types.ts.
pnpm db:types
```

`pnpm db:push` runs `supabase db push`, which applies everything in
`supabase/migrations/` in order:

- `0001_initial_schema.sql` — all tables, triggers, RLS helpers, RLS policies.
- `0002_reference_data.sql` — countries, 38 construction skills, 4 plan
  tiers. Idempotent (`ON CONFLICT`), so it is safe on every subsequent
  deploy. (`supabase/reference-data.sql` is the canonical editable copy of
  the same inserts; keep the two in sync.)

After this, verify in the SQL editor: `select count(*) from skills;` (38),
`select count(*) from countries;` (9), `select count(*) from plans;` (4), and
that `select * from pg_policies where schemaname='public';` lists policies for
every table. See `docs/DATA_MODEL.md` → "Testing the policies".

### CLI binary note

`supabase` is a repo devDependency and is provisioned on `pnpm install`
(`pnpm.onlyBuiltDependencies` allows its postinstall). If `supabase` is not on
PATH, prefix the commands with `pnpm exec` (e.g. `pnpm exec supabase login`)
or use `npx supabase`. For non-interactive/CI use, export
`SUPABASE_ACCESS_TOKEN` instead of `supabase login` (Supabase Dashboard →
Account → Access Tokens) — this is a CLI token, not an app env var, and is
never committed.

## First admin user

No admin row is ever seeded (brief §10.2). After the founder signs up through
the app normally (which creates their `profiles` row), promote it:

```bash
pnpm admin:promote founder@example.com
```

It uses the service-role key, confirms interactively (or `--yes` in scripts),
and flips that profile's `role` to `admin`. It refuses if no profile with that
email exists yet — sign up first.

## Local development with test data

The Supabase Cloud project stays real-data-only. For a local DB with throwaway
rows so the authenticated dashboard (M2+) has content:

```bash
supabase start                 # local Postgres + Auth on :54321/:54322
# point .env.local NEXT_PUBLIC_SUPABASE_URL at the local API (http://127.0.0.1:54321)
pnpm db:push                   # schema + reference data into the local DB
pnpm db:fixtures:local         # test profiles/workers/companies/projects
```

`pnpm db:fixtures:local` has a **hard guard**: it parses the configured
Supabase URL and refuses to run unless the host is local
(`localhost`/`127.0.0.1`/`*.local`/…). It applies `supabase/dev-fixtures.sql`
via `psql` (override the target with `SUPABASE_DB_URL`; default
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). `dev-fixtures.sql`
must never reach the cloud project.

## Vercel preview deploy

> Completed in slice 8 (§10.7): GitHub → Vercel project setup → environment
> variables → first preview deploy → finding the `.vercel.app` URL →
> optional preview password protection.
