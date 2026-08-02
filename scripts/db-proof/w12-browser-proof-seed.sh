#!/usr/bin/env bash
# ============================================================================
# W12 Slice 1 — LOCAL-ONLY fixtures for the browser proof
# (apps/web/tests/e2e/w12-atomic-double-booking.spec.ts).
#
# Creates three DISPOSABLE accounts and the four bookings the spec drives:
#
#   "W12 A overlapping"      employer A  2026-09-01..09-10  proposed
#   "W12 B overlapping"      employer B  2026-09-05..09-15  proposed  (overlaps)
#   "W12 A non-overlapping"  employer A  2026-12-01..12-05  proposed
#   "W12 B declined"         employer B  2026-09-02..09-08  declined  (must not block)
#
# WHY DIRECT INSERTS FOR THE BOOKINGS: the canonical propose path
# (`propose_booking_request_v3`) is an employer-side RPC gated on entitlements
# and rate limits, and this proof is about the WORKER's accept path. Accounts
# and onboarding DO go through the canonical routes (auth admin API +
# `complete_onboarding` RPC); only the four booking rows are inserted directly,
# so the fixture cannot drift from the real accept semantics under test.
#
# NEVER run against production. The stack guard below hard-refuses any URL that
# is not the dedicated local stack, and nothing here belongs in a migration.
#
# Prereqs:
#   1. a dedicated local stack (project_id `lm-w12-proof`, API on :55321)
#   2. `supabase status -o env > /tmp/w12env.txt`
#
# Usage:  bash scripts/db-proof/w12-browser-proof-seed.sh
# Cleanup: `supabase stop --project-id lm-w12-proof` (throwaway volume).
# ============================================================================
set -uo pipefail

ENVFILE="${W12_ENV_FILE:-/tmp/w12env.txt}"
CONTAINER="${W12_DB_CONTAINER:-supabase_db_lm-w12-proof}"
[ -f "$ENVFILE" ] || { echo "missing $ENVFILE (run: supabase status -o env > $ENVFILE)"; exit 1; }
set -a; . "$ENVFILE"; set +a

API="${API_URL:-}"
SR="${SERVICE_ROLE_KEY:-}"

# ── HARD LOCAL-ONLY GUARD ──────────────────────────────────────────────────
case "$API" in
  *supabase.co*) echo "REFUSING: remote Supabase URL"; exit 1 ;;
  http://127.0.0.1:55321|http://localhost:55321) ;;
  *) echo "REFUSING: unexpected API URL (expected the dedicated local stack)"; exit 1 ;;
esac
echo "local stack confirmed: $API (is_local=true)"

PSQL() { docker exec -i "$CONTAINER" psql -U postgres "$@"; }

mkuser() { # $1=email $2=password -> uid (empty when the user already exists)
  curl -s -X POST "$API/auth/v1/admin/users" \
    -H "apikey: $SR" -H "Authorization: Bearer $SR" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$2\",\"email_confirm\":true}" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).id||'')}catch(e){console.log('')}})"
}
uid_of() { PSQL -tAc "select id from auth.users where email='$1';" | tr -d '[:space:]'; }

PW='W12proof!local'
mkuser "w12.worker@local.test"     "$PW" >/dev/null
mkuser "w12.employer.a@local.test" "$PW" >/dev/null
mkuser "w12.employer.b@local.test" "$PW" >/dev/null
WORKER=$(uid_of "w12.worker@local.test")
EMPA=$(uid_of "w12.employer.a@local.test")
EMPB=$(uid_of "w12.employer.b@local.test")
[ -n "$WORKER" ] && [ -n "$EMPA" ] && [ -n "$EMPB" ] || { echo "account setup failed"; exit 1; }
echo "accounts ready (disposable, @local.test)"

# ── Canonical onboarding RPC, executed AS each user ────────────────────────
onboard() { # $1=uid $2=role $3=display $4=role_data_json
  PSQL -v ON_ERROR_STOP=1 -q <<SQL
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"$1","role":"authenticated"}';
select public.complete_onboarding('$2','$3','LT','$4'::jsonb,null);
commit;
SQL
}
onboard "$WORKER" worker  "W12 Proof Worker" '{}'
onboard "$EMPA"   company "W12 Employer A"   '{"name":"W12 Employer A UAB"}'
onboard "$EMPB"   company "W12 Employer B"   '{"name":"W12 Employer B UAB"}'
echo "onboarding completed via the canonical complete_onboarding RPC"

PSQL -v ON_ERROR_STOP=1 <<SQL
insert into public.customer_requests (id, profile_id, title, status) values
  ('d0000001-0000-4000-8000-000000000001','$EMPA','W12 A overlap','submitted'),
  ('d0000002-0000-4000-8000-000000000002','$EMPB','W12 B overlap','submitted'),
  ('d0000003-0000-4000-8000-000000000003','$EMPA','W12 A no-overlap','submitted'),
  ('d0000004-0000-4000-8000-000000000004','$EMPB','W12 B declined','submitted')
on conflict (id) do nothing;

insert into public.booking_requests
  (id, owner_id, request_id, worker_id, status, start_date, expected_end_date, role_text)
select v.id, v.owner, v.req, w.id, v.st, v.sd, v.ed, v.role
from (values
  ('b0000001-0000-4000-8000-000000000001'::uuid,'$EMPA'::uuid,'d0000001-0000-4000-8000-000000000001'::uuid,'proposed','2026-09-01'::date,'2026-09-10'::date,'W12 A overlapping'),
  ('b0000002-0000-4000-8000-000000000002'::uuid,'$EMPB'::uuid,'d0000002-0000-4000-8000-000000000002'::uuid,'proposed','2026-09-05'::date,'2026-09-15'::date,'W12 B overlapping'),
  ('b0000003-0000-4000-8000-000000000003'::uuid,'$EMPA'::uuid,'d0000003-0000-4000-8000-000000000003'::uuid,'proposed','2026-12-01'::date,'2026-12-05'::date,'W12 A non-overlapping'),
  ('b0000004-0000-4000-8000-000000000004'::uuid,'$EMPB'::uuid,'d0000004-0000-4000-8000-000000000004'::uuid,'declined','2026-09-02'::date,'2026-09-08'::date,'W12 B declined')
) as v(id,owner,req,st,sd,ed,role)
cross join lateral (select id from public.workers where profile_id='$WORKER' limit 1) w
on conflict (id) do nothing;

select role_text, status, start_date, expected_end_date from public.booking_requests order by role_text;
SQL

cat <<'NOTE'

Fixtures ready. Run the browser proof with a dev server on :3112:

  W12_PROOF=1 E2E_NO_SERVER=1 E2E_LOCAL_STACK=1 \
  E2E_BASE_URL=http://127.0.0.1:3112 \
  NEXT_PUBLIC_SUPABASE_URL=<local> SUPABASE_SERVICE_ROLE_KEY=<local> \
  npx playwright test tests/e2e/w12-atomic-double-booking.spec.ts

NOTE
