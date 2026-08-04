#!/usr/bin/env bash
# ============================================================================
# W11 — LOCAL-ONLY fixtures for the authenticated browser proof
# (apps/web/tests/e2e/w11-project-lifecycle-browser.spec.ts).
#
# WHY A DEDICATED STACK. The repo's shared local stack uses ONE `project_id`
# (`labourmarketai`) across ~50 worktrees, so `db reset`ting it would destroy
# another session's database. This proof therefore runs against a DISPOSABLE
# stack with its own project_id and its own ports — the same mechanism W12's
# browser proof used (`lm-w12-proof`, :55321). Nothing here can reach the
# shared stack, and nothing here can reach production.
#
# Base identities come from `supabase/dev-fixtures.sql` (the canonical local
# fixture): dev.worker@local.test, dev.company@local.test (owns company
# cccccccc-…0001, whose organization is auto-mirrored), plus the active
# `company_workers` roster row that makes the worker assignable.
#
# This script adds ONLY what W11 needs on top:
#
#   PROJECTS (company cccccccc-…0001, org = its mirrored organization)
#     2c000001…  "W11 Lifecycle Alpha"   draft      1 ACTIVE assignment
#     2c000002…  "W11 Scope Control"     live       1 ACTIVE assignment
#                  → must be UNTOUCHED when Alpha completes
#     2c000003…  "W11 Terminal Done"     completed  0 assignments
#     2c000004…  "W11 Pre Ended"         live       1 ACTIVE assignment that
#                  ALREADY carries an ended_at → must NOT be overwritten
#
#   ACCOUNTS (disposable, @local.test)
#     w11.stranger@local.test  — owns their OWN company/organization, so they
#       have a real employer context and are still a stranger to the projects
#       above. Proves absence of existence leakage, not merely absence of a
#       company.
#
# WHY DIRECT INSERTS FOR THE PROJECT ROWS: `projects` has no canonical create
# RPC — `create-project-core.ts` INSERTs directly and always writes 'draft'.
# The rows below are exactly what that path produces, plus the statuses the
# lifecycle is meant to move between. Accounts DO go through the canonical
# routes (auth admin API + `complete_onboarding`), so the identity model under
# test is never faked.
#
# NEVER run against production or the shared stack. The guard below hard-
# refuses any URL that is not the dedicated proof stack.
#
# Prereqs:
#   1. a dedicated local stack (project_id `lm-w11-proof`, API on :55421)
#   2. `supabase status -o env --workdir <stackdir> > /tmp/w11env.txt`
#
# Usage:  bash scripts/db-proof/w11-browser-proof-seed.sh
# Cleanup: `supabase stop --project-id lm-w11-proof` (throwaway volume).
# ============================================================================
set -uo pipefail

ENVFILE="${W11_ENV_FILE:-/tmp/w11env.txt}"
CONTAINER="${W11_DB_CONTAINER:-supabase_db_lm-w11-proof}"
REPO_ROOT="${W11_REPO_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
[ -f "$ENVFILE" ] || { echo "missing $ENVFILE (run: supabase status -o env --workdir <stackdir> > $ENVFILE)"; exit 1; }
set -a; . "$ENVFILE"; set +a

API="${API_URL:-}"
SR="${SERVICE_ROLE_KEY:-}"

# ── HARD LOCAL-ONLY GUARD ──────────────────────────────────────────────────
case "$API" in
  *supabase.co*) echo "REFUSING: remote Supabase URL"; exit 1 ;;
  http://127.0.0.1:55421|http://localhost:55421) ;;
  *) echo "REFUSING: unexpected API URL (expected the dedicated lm-w11-proof stack on :55421)"; exit 1 ;;
esac
echo "local proof stack confirmed: $API (is_local=true)"

PSQL() { docker exec -i "$CONTAINER" psql -U postgres -d postgres "$@"; }

# ── 1. Canonical base fixture ──────────────────────────────────────────────
FIXTURES="$REPO_ROOT/supabase/dev-fixtures.sql"
[ -f "$FIXTURES" ] || { echo "missing $FIXTURES"; exit 1; }
echo "[seed] applying supabase/dev-fixtures.sql…"
PSQL -v ON_ERROR_STOP=1 -q -f - < "$FIXTURES" || { echo "dev-fixtures failed"; exit 1; }

# ── 2. Disposable stranger account, through the canonical routes ───────────
mkuser() { # $1=email $2=password
  curl -s -X POST "$API/auth/v1/admin/users" \
    -H "apikey: $SR" -H "Authorization: Bearer $SR" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$2\",\"email_confirm\":true}" >/dev/null
}
uid_of() { PSQL -tAc "select id from auth.users where email='$1';" | tr -d '[:space:]'; }

PW='password'
mkuser "w11.stranger@local.test" "$PW"
STRANGER=$(uid_of "w11.stranger@local.test")
[ -n "$STRANGER" ] || { echo "stranger account setup failed"; exit 1; }

# Canonical onboarding RPC, executed AS the user — never a hand-built profile.
PSQL -v ON_ERROR_STOP=1 -q <<SQL
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"$STRANGER","role":"authenticated"}';
select public.complete_onboarding('company','W11 Stranger','LT','{"name":"W11 Stranger UAB"}'::jsonb,null);
commit;
SQL
echo "[seed] stranger onboarded via the canonical complete_onboarding RPC"

# ── 3. W11 project rows + assignments ──────────────────────────────────────
PSQL -v ON_ERROR_STOP=1 <<'SQL'
\set ON_ERROR_STOP on

-- The company's mirrored organization — resolved, never assumed.
create temporary table _w11 as
select o.id as org_id, 'cccccccc-0000-0000-0000-000000000001'::uuid as company_id,
       w.id as worker_id
  from public.organizations o
  cross join lateral (
    select id from public.workers where profile_id = 'aaaaaaaa-0000-0000-0000-000000000001' limit 1
  ) w
 where o.legacy_company_id = 'cccccccc-0000-0000-0000-000000000001'
 limit 1;

do $$
begin
  if (select count(*) from _w11) <> 1 then
    raise exception 'W11 seed: could not resolve the mirrored organization or the dev worker';
  end if;
end $$;

insert into public.projects
  (id, company_id, organization_id, title, country, city, status)
select v.id, t.company_id, t.org_id, v.title, 'LT', 'Vilnius', v.status
from _w11 t, (values
  ('2c000001-0000-4000-8000-000000000001'::uuid, 'W11 Lifecycle Alpha', 'draft'),
  ('2c000002-0000-4000-8000-000000000002'::uuid, 'W11 Scope Control',   'live'),
  ('2c000003-0000-4000-8000-000000000003'::uuid, 'W11 Terminal Done',   'completed'),
  ('2c000004-0000-4000-8000-000000000004'::uuid, 'W11 Pre Ended',       'live')
) as v(id, title, status)
on conflict (id) do update
  set status = excluded.status,
      title = excluded.title,
      organization_id = excluded.organization_id;

-- Alpha and Scope Control each carry ONE ACTIVE assignment. Completing Alpha
-- must end Alpha's and leave Scope Control's alone — that is the scoping proof.
insert into public.project_worker_assignments (id, project_id, worker_id, status, ended_at)
select v.id, v.project_id, t.worker_id, v.status, v.ended_at
from _w11 t, (values
  ('2d000001-0000-4000-8000-000000000001'::uuid, '2c000001-0000-4000-8000-000000000001'::uuid, 'active', null::timestamptz),
  ('2d000002-0000-4000-8000-000000000002'::uuid, '2c000002-0000-4000-8000-000000000002'::uuid, 'active', null::timestamptz),
  -- ACTIVE but already stamped: `ended_at = coalesce(ended_at, now())` must
  -- leave this exact timestamp alone.
  ('2d000004-0000-4000-8000-000000000004'::uuid, '2c000004-0000-4000-8000-000000000004'::uuid, 'active', '2026-01-02 03:04:05+00'::timestamptz)
) as v(id, project_id, status, ended_at)
on conflict (id) do update
  set status = excluded.status, ended_at = excluded.ended_at;

select p.id, p.title, p.status,
       (select count(*) from public.project_worker_assignments a
         where a.project_id = p.id and a.status = 'active') as active_assignments
  from public.projects p
 where p.id::text like '2c%'
 order by p.title;
SQL

cat <<'NOTE'

W11 fixtures ready on the disposable stack.

Run the browser proof with a dev server on :3111 pointed at :55421:

  W11_PROOF=1 E2E_NO_SERVER=1 E2E_LOCAL_STACK=1 \
  E2E_BASE_URL=http://127.0.0.1:3111 \
  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55421 \
  SUPABASE_SERVICE_ROLE_KEY=<local service key> \
  npx playwright test tests/e2e/w11-project-lifecycle-browser.spec.ts

NOTE
