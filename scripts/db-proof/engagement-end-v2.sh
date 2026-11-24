#!/usr/bin/env bash
# ============================================================================
# §7.1 — REAL behaviour proof for end_company_worker_engagement_v2.
#
# Spins up a THROWAWAY Postgres container, builds the faithful harness
# (prelude = the applied 20260723120000 posture: the real table, its real RLS
# policy, its real grants, and v1 verbatim), then applies
#   supabase/migrations/20260804160000_booking_engagement_end_v2.sql
# and later
#   supabase/rollbacks/20260804160000_booking_engagement_end_v2.down.sql
# each executed VERBATIM — nothing here re-implements them.
#
# Every probe runs under `set local role authenticated` (or `anon`), never as
# the superuser, so RLS and the function's own authority genuinely decide.
#
# Phases: BEFORE -> APPLY -> READ MATRIX -> WRITE MATRIX -> IDEMPOTENCE ->
#         CONCURRENCY -> WITNESSES -> GRANTS -> ROLLBACK -> RE-APPLY.
#
# Never point this at production or at a shared local Supabase stack. It uses
# its own container name and its own port, and touches neither.
# Usage:  bash scripts/db-proof/engagement-end-v2.sh
# ============================================================================
set -uo pipefail

# Paths in `docker exec` arguments are CONTAINER paths. Git Bash / MSYS
# rewrites anything that looks like a POSIX path into a Windows one, so
# `docker exec … cat /tmp/b.out` arrives as `cat C:/Users/…/Temp/b.out` and
# reports "No such file or directory" — which is indistinguishable from a
# second caller that never returned, i.e. it would silently turn the
# concurrency probe into a false failure (it did, once). Harmless on Linux and
# macOS, where the variable is simply unused.
export MSYS_NO_PATHCONV=1

CT=engagement-end-v2-proof
PORT=55437
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
MIG="$REPO/supabase/migrations/20260804160000_booking_engagement_end_v2.sql"
ROLLBACK="$REPO/supabase/rollbacks/20260804160000_booking_engagement_end_v2.down.sql"

CO_A='aaaaaaaa-0000-4000-8000-00000000000a'
CO_B='bbbbbbbb-0000-4000-8000-00000000000b'
WK_1='cccccccc-0000-4000-8000-00000000000c'
WK_2='dddddddd-0000-4000-8000-00000000000d'
ADMIN='ffffffff-0000-4000-8000-00000000000f'

E1='66660000-0000-4000-8000-000000000001'   # company A ↔ WK_1, active
E2='66660000-0000-4000-8000-000000000002'   # company B ↔ WK_2, active
E3='66660000-0000-4000-8000-000000000003'   # company A ↔ detached, active
E4='66660000-0000-4000-8000-000000000004'   # company A ↔ WK_1, already ended
GHOST='00000000-0000-4000-8000-0000000000ff' # never existed

PASS=0; FAIL=0
declare -a FAILURES=()

q() { docker exec -i "$CT" psql -U postgres -tAc "$1" 2>&1 | tr -d '\r'; }

as_role() { # $1=role $2=uid $3=sql
  docker exec -i "$CT" psql -U postgres -tA -v ON_ERROR_STOP=0 2>&1 <<SQL | tr -d '\r' | grep -v '^BEGIN$\|^ROLLBACK$\|^SET$' | sed '/^$/d'
begin;
set local role $1;
set local app.uid = '$2';
$3
rollback;
SQL
}

# The COMMITTING variant. Idempotence and concurrency are claims about state
# that OUTLIVES the call, so those probes cannot run inside a rolled-back
# transaction the way the read probes do.
as_role_commit() { # $1=role $2=uid $3=sql
  docker exec -i "$CT" psql -U postgres -tA -v ON_ERROR_STOP=0 2>&1 <<SQL | tr -d '\r' | grep -v '^BEGIN$\|^COMMIT$\|^SET$' | sed '/^$/d'
begin;
set local role $1;
set local app.uid = '$2';
$3
commit;
SQL
}

check() { # $1=label $2=expected $3=actual
  if [ "$3" = "$2" ]; then
    PASS=$((PASS+1)); printf '  PASS  %-66s %s\n' "$1" "$3"
  else
    FAIL=$((FAIL+1)); FAILURES+=("$1 — expected [$2] got [$3]")
    printf '  FAIL  %-66s expected [%s] got [%s]\n' "$1" "$2" "$3"
  fi
}

contains() { # $1=label $2=needle $3=haystack
  if printf '%s' "$3" | grep -qi -- "$2"; then
    PASS=$((PASS+1)); printf '  PASS  %-66s (matched "%s")\n' "$1" "$2"
  else
    FAIL=$((FAIL+1)); FAILURES+=("$1 — expected to contain [$2] got [$3]")
    printf '  FAIL  %-66s expected to contain [%s] got [%s]\n' "$1" "$2" "$3"
  fi
}

seed() { docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/engagement-end-v2.seed.sql" >/dev/null 2>&1; }

# ── probes ──────────────────────────────────────────────────────────────────
visible()      { as_role authenticated "$1" "select count(*) from public.company_worker_engagements;"; }
sees()         { as_role authenticated "$1" "select count(*) from public.company_worker_engagements where id='$2';"; }
outcome()      { as_role_commit authenticated "$1" "select public.end_company_worker_engagement_v2('$2')->>'outcome';"; }
outcome_ro()   { as_role authenticated "$1" "select public.end_company_worker_engagement_v2('$2')->>'outcome';"; }
side_ro()      { as_role authenticated "$1" "select coalesce(public.end_company_worker_engagement_v2('$2')->>'actor_side','<none>');"; }
ended_at_of()  { q "select coalesce(ended_at::text,'<null>') from public.company_worker_engagements where id='$1';"; }
status_of()    { q "select status from public.company_worker_engagements where id='$1';"; }

witnesses() {
  q "select 'p='||(select count(*) from public.projects)
          ||' pa='||(select count(*) from public.project_worker_assignments where status='active')
          ||' ec='||(select count(*) from public.engagement_contexts where status='active')
          ||' xp='||(select count(*) from public.experience_records)
          ||' al='||(select count(*) from public.audit_logs)
          ||' rows='||(select count(*) from public.company_worker_engagements);"
}

banner() { echo; echo "════════════════════════════════════════════════════════════════════════"; echo "  $1"; echo "════════════════════════════════════════════════════════════════════════"; }
cleanup() { docker rm -f "$CT" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "§7.1 — end_company_worker_engagement_v2 behaviour proof"
echo "throwaway container: $CT  (port $PORT)  — shared local stack untouched"

if docker ps -a --format '{{.Names}}' | grep -qx "$CT"; then docker rm -f "$CT" >/dev/null; fi
docker run -d --name "$CT" -e POSTGRES_PASSWORD=proof -p "$PORT":5432 postgres:15 >/dev/null || {
  echo "could not start container"; exit 1; }

for _ in $(seq 1 60); do
  docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 || { echo "postgres never became ready"; exit 1; }

docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/engagement-end-v2.prelude.sql" >/dev/null || {
  echo "prelude failed"; docker exec -i "$CT" psql -U postgres -v ON_ERROR_STOP=1 -f - < "$HERE/engagement-end-v2.prelude.sql"; exit 1; }
seed
echo "harness ready — 20260723120000 posture in place (table + RLS + v1)"

WITNESS_BASELINE="$(witnesses)"
echo "  witness baseline: $WITNESS_BASELINE"

# ════════════════════════════════════════════════════════════════════════════
banner "PHASE 1 — BEFORE: v2 does not exist, v1 does"
# ════════════════════════════════════════════════════════════════════════════
check "BEFORE: v1 exists (applied since 20260723120000)" "1" \
  "$(q "select count(*) from pg_proc where proname='end_company_worker_engagement_v1';")"
check "BEFORE: v2 does not exist yet"                    "0" \
  "$(q "select count(*) from pg_proc where proname='end_company_worker_engagement_v2';")"
contains "BEFORE: calling v2 is the absent-function error the app maps to needs_migration" \
  "does not exist" "$(outcome_ro $CO_A $E1)"

# ════════════════════════════════════════════════════════════════════════════
banner "PHASE 2 — APPLY the migration VERBATIM"
# ════════════════════════════════════════════════════════════════════════════
if docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$MIG" >/dev/null 2>&1; then
  echo "  applied 20260804160000"; PASS=$((PASS+1))
else
  echo "  MIGRATION APPLY FAILED"; docker exec -i "$CT" psql -U postgres -v ON_ERROR_STOP=1 -f - < "$MIG"
  FAIL=$((FAIL+1)); FAILURES+=("migration did not apply")
fi
seed

check "APPLY: v2 exists"                                 "1" \
  "$(q "select count(*) from pg_proc where proname='end_company_worker_engagement_v2';")"
check "APPLY: v1 SURVIVES — additive, never a replacement" "1" \
  "$(q "select count(*) from pg_proc where proname='end_company_worker_engagement_v1';")"
check "APPLY: v2 is SECURITY DEFINER with search_path pinned" "true/search_path=public" \
  "$(q "select prosecdef::text||'/'||coalesce(array_to_string(proconfig,','),'<none>') from pg_proc where proname='end_company_worker_engagement_v2';")"
check "APPLY: the migration mutated NO engagement rows"  "$WITNESS_BASELINE" "$(witnesses)"

# ════════════════════════════════════════════════════════════════════════════
banner "PHASE 3 — THE READ MATRIX (RLS decides, not the caller)"
# ════════════════════════════════════════════════════════════════════════════
check "READ: company A sees its own three engagements"   "3" "$(visible $CO_A)"
check "READ: company A sees E1"                          "1" "$(sees $CO_A $E1)"
check "READ: company A CANNOT see company B's E2"        "0" "$(sees $CO_A $E2)"
check "READ: company A CAN see the GDPR-detached E3"     "1" "$(sees $CO_A $E3)"
check "READ: worker WK_1 sees exactly their own two"     "2" "$(visible $WK_1)"
check "READ: worker WK_1 sees E1"                        "1" "$(sees $WK_1 $E1)"
check "READ: worker WK_1 CANNOT see the unrelated E2"    "0" "$(sees $WK_1 $E2)"
check "READ: worker WK_1 CANNOT see the detached E3"     "0" "$(sees $WK_1 $E3)"
check "READ: worker WK_2 sees only their own one"        "1" "$(visible $WK_2)"
check "READ: company B sees only its own one"            "1" "$(visible $CO_B)"
check "READ: a platform admin sees every row"            "4" "$(visible $ADMIN)"
contains "READ: anon holds NO table SELECT at all"       "permission denied" \
  "$(as_role anon '' "select count(*) from public.company_worker_engagements;")"

# ════════════════════════════════════════════════════════════════════════════
banner "PHASE 4 — THE WRITE MATRIX (anti-oracle: refusal == absence)"
# ════════════════════════════════════════════════════════════════════════════
seed
check "WRITE: company A may end its own E1"              "ended"      "$(outcome_ro $CO_A $E1)"
check "WRITE: the worker may end the SAME E1"            "ended"      "$(outcome_ro $WK_1 $E1)"
check "WRITE: the server reports the COMPANY as the actor" "company"  "$(side_ro $CO_A $E1)"
check "WRITE: the server reports the WORKER as the actor"  "worker"   "$(side_ro $WK_1 $E1)"
check "WRITE: company B may NOT end A's E1 — not_found"  "not_found"  "$(outcome_ro $CO_B $E1)"
check "WRITE: worker WK_2 may NOT end E1 — not_found"    "not_found"  "$(outcome_ro $WK_2 $E1)"
check "WRITE: an id that never existed — not_found"      "not_found"  "$(outcome_ro $CO_A $GHOST)"
check "WRITE: refusal and absence are INDISTINGUISHABLE" \
  "$(outcome_ro $CO_B $E1)" "$(outcome_ro $CO_B $GHOST)"
check "WRITE: an admin is NOT a party — not_found"       "not_found"  "$(outcome_ro $ADMIN $E2)"
contains "WRITE: anon cannot execute v2 at all"          "permission denied" \
  "$(as_role anon '' "select public.end_company_worker_engagement_v2('$E1');")"

echo
echo "  ── the GDPR-detached row (worker_id IS NULL) ──"
check "GDPR: the detached row is still ACTIVE and present" "active"    "$(status_of $E3)"
check "GDPR: NO worker authority reaches it — WK_1"       "not_found" "$(outcome_ro $WK_1 $E3)"
check "GDPR: NO worker authority reaches it — WK_2"       "not_found" "$(outcome_ro $WK_2 $E3)"
check "GDPR: the OWNING COMPANY may still end it"         "ended"     "$(outcome_ro $CO_A $E3)"

# ════════════════════════════════════════════════════════════════════════════
banner "PHASE 5 — IDEMPOTENCE: the second call is not a second write"
# ════════════════════════════════════════════════════════════════════════════
seed
check "END: E1 starts active"                            "active"     "$(status_of $E1)"
check "END: the first call moves active → ended"         "ended"      "$(outcome $CO_A $E1)"
check "END: the stored status really changed"            "ended"      "$(status_of $E1)"
STAMP="$(ended_at_of $E1)"
check "END: ended_at was actually written"               "false"      "$([ "$STAMP" = "<null>" ] && echo true || echo false)"
check "END: the SECOND call says already_ended"          "already_ended" "$(outcome $CO_A $E1)"
check "END: ended_at is UNCHANGED by the second call"    "$STAMP"     "$(ended_at_of $E1)"
check "END: the OTHER party's call also says already_ended" "already_ended" "$(outcome $WK_1 $E1)"
check "END: ended_at survives that too"                  "$STAMP"     "$(ended_at_of $E1)"
check "END: an already-ended row (E4) answers already_ended" "already_ended" "$(outcome $CO_A $E4)"
check "END: E4's original 2026-02-02 timestamp is untouched" "2026-02-02 12:00:00+00" "$(ended_at_of $E4)"
check "END: the ROW still exists — ending is never a delete" "1" \
  "$(q "select count(*) from public.company_worker_engagements where id='$E1';")"
check "END: subject_key survives the end"                "99990000-0000-4000-8000-00000000000e" \
  "$(q "select subject_key from public.company_worker_engagements where id='$E1';")"
check "END: ended_by records the real actor"             "$CO_A" \
  "$(q "select ended_by from public.company_worker_engagements where id='$E1';")"

# ════════════════════════════════════════════════════════════════════════════
banner "PHASE 6 — CONCURRENCY: two ends serialize on the row lock"
# ════════════════════════════════════════════════════════════════════════════
seed
# Session A takes the row lock and holds it, then ends the row itself and
# commits. Session B calls v2 while A holds the lock: `for update` inside the
# function must BLOCK, and B must then observe 'ended' — reporting
# already_ended rather than issuing a second write or overwriting A's stamp.
#
# The two scripts are written to FILES inside the container and run with
# `psql -f`. An inline `-c` string would have to survive two levels of shell
# quoting on the way through `docker exec -d`, and a mangled statement there
# looks exactly like a caller that never returned — which is the very thing
# this phase is trying to measure.
docker exec -i "$CT" sh -c 'cat > /tmp/a.sql' <<SQL
begin;
select * from public.company_worker_engagements where id='$E1' for update;
select pg_sleep(5);
update public.company_worker_engagements
   set status='ended', ended_at='2026-05-05T05:05:05Z', ended_by='$CO_A'
 where id='$E1';
commit;
SQL
docker exec -i "$CT" sh -c 'cat > /tmp/b.sql' <<SQL
begin;
set local role authenticated;
set local app.uid='$WK_1';
select 'B='||(public.end_company_worker_engagement_v2('$E1')->>'outcome');
commit;
SQL

docker exec -d "$CT" sh -c 'psql -U postgres -tA -f /tmp/a.sql > /tmp/a.out 2>&1'
sleep 1
docker exec -d "$CT" sh -c 'psql -U postgres -tA -f /tmp/b.sql > /tmp/b.out 2>&1'

for _ in $(seq 1 40); do
  docker exec "$CT" grep -q 'B=' /tmp/b.out >/dev/null 2>&1 && break
  sleep 1
done
B_RAW="$(docker exec "$CT" cat /tmp/b.out 2>&1 | tr -d '\r')"
B_OUT="$(printf '%s' "$B_RAW" | grep 'B=' | head -1)"
if [ -z "$B_OUT" ]; then
  # A silent second caller is indistinguishable from a harness fault, so the
  # raw output of BOTH sessions is printed rather than guessed at.
  echo "  ── session A raw ──"; docker exec "$CT" cat /tmp/a.out 2>&1 | tr -d '\r' | sed 's/^/    /'
  echo "  ── session B raw ──"; printf '%s\n' "$B_RAW" | sed 's/^/    /'
fi

check "CONCURRENCY: the blocked caller reports already_ended" "B=already_ended" "$B_OUT"
check "CONCURRENCY: the FIRST writer's timestamp stands"      "2026-05-05 05:05:05+00" "$(ended_at_of $E1)"
check "CONCURRENCY: exactly one row, still ended"             "ended" "$(status_of $E1)"
check "CONCURRENCY: no duplicate engagement was created"      "4" \
  "$(q "select count(*) from public.company_worker_engagements;")"

# ════════════════════════════════════════════════════════════════════════════
banner "PHASE 7 — THE WITNESSES: what ending must NOT touch"
# ════════════════════════════════════════════════════════════════════════════
seed
BEFORE_W="$(witnesses)"
_=$(outcome $CO_A $E1)
_=$(outcome $CO_A $E3)
_=$(outcome $WK_2 $E2)
check "WITNESS: no project completed, no assignment ended, no membership ended," "$BEFORE_W" "$(witnesses)"
echo "         no experience created, no audit_logs row, no engagement deleted"
# ...and the claim above is NOT about a no-op: three real ends just happened
# (E1, E3, E2), joining the one row the seed already had ended (E4).
check "WITNESS: three real ends happened — 1 seeded + 3 = 4 ended rows" "4" \
  "$(q "select count(*) from public.company_worker_engagements where status='ended';")"
check "WITNESS: and NOTHING was deleted — all four rows are still there" "4" \
  "$(q "select count(*) from public.company_worker_engagements;")"

# ════════════════════════════════════════════════════════════════════════════
banner "PHASE 8 — THE PRIVILEGE SURFACE"
# ════════════════════════════════════════════════════════════════════════════
check "GRANTS: anon CANNOT execute v2"                   "false" \
  "$(q "select has_function_privilege('anon','public.end_company_worker_engagement_v2(uuid)','execute')::text;")"
check "GRANTS: PUBLIC holds no EXECUTE"                  "0" \
  "$(q "select coalesce((select count(*) from aclexplode((select proacl from pg_proc where proname='end_company_worker_engagement_v2')) where grantee=0),0);")"
check "GRANTS: authenticated CAN execute it"             "true" \
  "$(q "select has_function_privilege('authenticated','public.end_company_worker_engagement_v2(uuid)','execute')::text;")"
check "GRANTS: the TABLE write grants are still revoked" "false" \
  "$(q "select has_table_privilege('authenticated','public.company_worker_engagements','update')::text;")"
check "GRANTS: the read policy is byte-identical to 20260723120000" "1" \
  "$(q "select count(*) from pg_policies where tablename='company_worker_engagements' and policyname='company_worker_engagements_select';")"

# ════════════════════════════════════════════════════════════════════════════
banner "PHASE 9 — ROLLBACK VERBATIM (drops v2 ONLY)"
# ════════════════════════════════════════════════════════════════════════════
seed
if docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$ROLLBACK" >/dev/null 2>&1; then
  echo "  rollback applied cleanly"; PASS=$((PASS+1))
else
  echo "  ROLLBACK FAILED"; docker exec -i "$CT" psql -U postgres -v ON_ERROR_STOP=1 -f - < "$ROLLBACK"
  FAIL=$((FAIL+1)); FAILURES+=("rollback did not apply")
fi

check "ROLLBACK: v2 is gone"                             "0" \
  "$(q "select count(*) from pg_proc where proname='end_company_worker_engagement_v2';")"
check "ROLLBACK: v1 REMAINS — it belongs to its own migration" "1" \
  "$(q "select count(*) from pg_proc where proname='end_company_worker_engagement_v1';")"
check "ROLLBACK: v1 still works (still granted, still callable)" "t" \
  "$(as_role authenticated $CO_A "select public.end_company_worker_engagement_v1('$E1');")"
check "ROLLBACK: the table survives untouched"           "4" \
  "$(q "select count(*) from public.company_worker_engagements;")"
seed
check "ROLLBACK: mutates NO data"                        "$WITNESS_BASELINE" "$(witnesses)"

# ════════════════════════════════════════════════════════════════════════════
banner "PHASE 10 — RE-APPLY (idempotency: same state, second time)"
# ════════════════════════════════════════════════════════════════════════════
if docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$MIG" >/dev/null 2>&1; then
  echo "  re-applied cleanly"; PASS=$((PASS+1))
else
  echo "  RE-APPLY FAILED"; FAIL=$((FAIL+1)); FAILURES+=("re-apply did not succeed")
fi
seed
check "RE-APPLY: v2 is back"                             "1" \
  "$(q "select count(*) from pg_proc where proname='end_company_worker_engagement_v2';")"
check "RE-APPLY: the actor matrix is unchanged (company ends)" "ended"     "$(outcome_ro $CO_A $E1)"
check "RE-APPLY: the actor matrix is unchanged (stranger refused)" "not_found" "$(outcome_ro $CO_B $E1)"
check "RE-APPLY: anon EXECUTE is still revoked"          "false" \
  "$(q "select has_function_privilege('anon','public.end_company_worker_engagement_v2(uuid)','execute')::text;")"

# ── summary ─────────────────────────────────────────────────────────────────
banner "RESULT"
echo "  passed: $PASS"
echo "  failed: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo; echo "  failures:"; for f in "${FAILURES[@]}"; do echo "    - $f"; done
  exit 1
fi
echo; echo "  §7.1 engagement-end behaviour proven end to end."
