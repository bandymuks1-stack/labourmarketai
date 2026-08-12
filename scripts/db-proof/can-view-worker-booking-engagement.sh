#!/usr/bin/env bash
# ============================================================================
# can_view_worker vs booking engagements: REAL per-role proof.
#
# Spins up a THROWAWAY Postgres container, loads the faithful harness
# (prelude + seed), then measures who can read WHAT
#   BEFORE -> AFTER -> ROLLBACK -> RE-APPLY
# around the actual files
#   supabase/migrations/20260809120000_can_view_worker_booking_engagement_v1.sql
#   supabase/rollbacks/20260809120000_can_view_worker_booking_engagement_v1.down.sql
# each executed VERBATIM. Nothing here re-implements them.
#
# Every probe runs under `set local role authenticated` (or `anon`), never as
# the superuser, so RLS genuinely decides the result.
#
# Never point this at production or at a shared local Supabase stack.
# Usage:  bash scripts/db-proof/can-view-worker-booking-engagement.sh
#         KEEP=1 bash ...   # leave the container running for inspection
# ============================================================================
set -uo pipefail

CT=${CT:-can-view-worker-eng-proof}
IMAGE=${IMAGE:-postgres:15-alpine}
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
MIGRATION="$REPO/supabase/migrations/20260809120000_can_view_worker_booking_engagement_v1.sql"
ROLLBACK="$REPO/supabase/rollbacks/20260809120000_can_view_worker_booking_engagement_v1.down.sql"

# Actors (profiles)
E1='22222222-2222-4222-8222-222222222222'   # ACTIVE engagement with W1
E2='33333333-3333-4333-8333-333333333333'   # unrelated; rosters W4; DETACHED row
E3='55555555-5555-4555-8555-555555555555'   # ENDED engagement with W1
E4='66666666-6666-4666-8666-666666666666'   # ACTIVE engagement with W3 (withdrawn consent)
E5='77777777-7777-4777-8777-777777777777'   # engagement + active project assignment (W5)
ADMIN='44444444-4444-4444-8444-444444444444'
WP1='11111111-1111-4111-8111-111111111111'  # W1's own profile

# Worker rows
W1='aaaa1111-0000-4000-8000-00000000000a'   # engaged, NO consent   ← the subject
W2='aaaa2222-0000-4000-8000-00000000000b'   # consented control
W3='aaaa3333-0000-4000-8000-00000000000c'   # granted then WITHDREW, engaged with E4
W4='aaaa4444-0000-4000-8000-00000000000d'   # roster control (E2)
W5='aaaa5555-0000-4000-8000-00000000000e'   # engaged AND assigned (E5)

ENG1='e9000001-0000-4000-8000-000000000001' # C1 ↔ W1, active
ENG5='e9000005-0000-4000-8000-000000000005' # C5 ↔ W5, active

cleanup() { [ "${KEEP:-0}" = "1" ] || docker rm -f "$CT" >/dev/null 2>&1; }
trap cleanup EXIT

q() { docker exec -i "$CT" psql -U postgres -tA -v ON_ERROR_STOP=0 -c "$1" 2>&1; }

# Run SQL as a real role with a real actor GUC. $1=role $2=uid $3=sql
as() {
  docker exec -i "$CT" psql -U postgres -tA -v ON_ERROR_STOP=0 2>&1 <<SQL
begin;
set local role $1;
set local app.uid = '$2';
$3
commit;
SQL
}

# Collapse a probe result to a single comparable token.
tok() { local out; out=$(cat); out=$(echo "$out" | grep -vE '^(BEGIN|COMMIT|SET|ROLLBACK)$' | sed '/^$/d');
        if echo "$out" | grep -qiE '^(ERROR|FATAL)'; then echo "DENIED"; \
        elif [ -z "$out" ]; then echo "NOROWS"; else echo "$out" | tr '\n' '|' | sed 's/|$//'; fi; }

pass=0; fail=0
check() { if [ "$2" == "$3" ]; then printf '  PASS  %-66s %s\n' "$1" "$3"; pass=$((pass+1));
          else printf '  FAIL  %-66s expected=%s actual=%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi; }

seed() { docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/can-view-worker-booking-engagement.seed.sql" >/dev/null; }

echo "=============================================================="
echo " can_view_worker vs booking engagements"
echo "=============================================================="

docker rm -f "$CT" >/dev/null 2>&1
docker run -d --name "$CT" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null || { echo "docker run failed"; exit 1; }
for _ in $(seq 1 60); do docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 || { echo "container $CT never became ready"; exit 1; }

docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$HERE/can-view-worker-booking-engagement.prelude.sql" >/dev/null || { echo "prelude failed"; exit 1; }
seed || { echo "seed failed"; exit 1; }
echo "harness loaded (throwaway $CT)"

# ── Probes ─────────────────────────────────────────────────────────────────
# Identity read (the disclosure under review) and the three companion tables.
p_e1_w1_name()  { as authenticated "$E1"    "select display_name from public.workers where id='$W1';" | tok; }
p_e1_w1_bio()   { as authenticated "$E1"    "select bio from public.workers where id='$W1';" | tok; }
p_e1_w1_pred()  { as authenticated "$E1"    "select public.can_view_worker('$W1');" | tok; }
p_e1_w1_skill() { as authenticated "$E1"    "select count(*) from public.worker_skills where worker_id='$W1';" | tok; }
p_e1_w1_prof()  { as authenticated "$E1"    "select count(*) from public.worker_professions where worker_id='$W1';" | tok; }
p_e1_w1_lang()  { as authenticated "$E1"    "select count(*) from public.worker_languages where worker_id='$W1';" | tok; }
p_e1_w2_name()  { as authenticated "$E1"    "select display_name from public.workers where id='$W2';" | tok; }

p_e2_w1_name()  { as authenticated "$E2"    "select display_name from public.workers where id='$W1';" | tok; }
p_e2_w1_pred()  { as authenticated "$E2"    "select public.can_view_worker('$W1');" | tok; }
p_e2_w4_name()  { as authenticated "$E2"    "select display_name from public.workers where id='$W4';" | tok; }
p_e2_w2_name()  { as authenticated "$E2"    "select display_name from public.workers where id='$W2';" | tok; }

p_e3_w1_pred()  { as authenticated "$E3"    "select public.can_view_worker('$W1');" | tok; }
p_e3_w1_name()  { as authenticated "$E3"    "select display_name from public.workers where id='$W1';" | tok; }

p_e4_w3_name()  { as authenticated "$E4"    "select display_name from public.workers where id='$W3';" | tok; }
p_e1_w3_name()  { as authenticated "$E1"    "select display_name from public.workers where id='$W3';" | tok; }

p_e5_w5_pred()  { as authenticated "$E5"    "select public.can_view_worker('$W5');" | tok; }
p_e5_w5_name()  { as authenticated "$E5"    "select display_name from public.workers where id='$W5';" | tok; }

p_self_w1()     { as authenticated "$WP1"   "select display_name||':'||coalesce(bio,'-') from public.workers where id='$W1';" | tok; }
p_admin_all()   { as authenticated "$ADMIN" "select count(*) from public.workers;" | tok; }
p_anon_base()   { as anon          "$E1"    "select count(*) from public.workers;" | tok; }
p_anon_pred()   { as anon          "$E1"    "select public.can_view_worker('$W1');" | tok; }

# The already-applied definer disclosure the memo turns on.
p_e1_rpc_name() { as authenticated "$E1"    "select display_name from public.list_booking_engagement_workers_v1();" | tok; }

echo
echo "--- PRE-EXISTING DISCLOSURE (why the predicate contradicts the database) ---"
check "APPLIED definer RPC ALREADY hands E1 the engaged worker's name" \
      "ENGAGED-W1" "$(p_e1_rpc_name)"
check "…while the RLS predicate says E1 may not see that worker" \
      "f" "$(p_e1_w1_pred)"

echo
echo "--- BEFORE (production's current behaviour) ---"
B_SELF=$(p_self_w1);      echo "  W1 -> own row             : $B_SELF"
B_ROSTER=$(p_e2_w4_name); echo "  E2 -> W4 (roster)         : $B_ROSTER"
B_CONSENT=$(p_e2_w2_name);echo "  E2 -> W2 (consented)      : $B_CONSENT"
check "GAP REPRODUCED: engaging employer sees NO name"          "NOROWS" "$(p_e1_w1_name)"
check "GAP REPRODUCED: engaging employer sees NO skills"        "0"      "$(p_e1_w1_skill)"
check "GAP REPRODUCED: engaging employer sees NO professions"   "0"      "$(p_e1_w1_prof)"
check "GAP REPRODUCED: engaging employer sees NO languages"     "0"      "$(p_e1_w1_lang)"
check "BEFORE: roster control works (E2 reads W4)"        "ROSTER-W4"    "$B_ROSTER"
check "BEFORE: consent control works (E2 reads W2)"       "CONSENTED-W2" "$B_CONSENT"
check "BEFORE: withdrawn consent already fails closed (E4 -> W3)" "NOROWS" "$(p_e4_w3_name)"
check "BEFORE: assignment arm already grants E5 -> W5"    "ASSIGNED-W5"  "$(p_e5_w5_name)"

echo
echo "--- APPLYING $(basename "$MIGRATION") verbatim ---"
APPLY_OUT=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$MIGRATION" 2>&1)
if echo "$APPLY_OUT" | grep -qiE '^(ERROR|FATAL)'; then echo "$APPLY_OUT" | head -20; echo "MIGRATION FAILED"; exit 1; fi
echo "  applied cleanly"

echo
echo "--- AFTER: (a) the engaging company owner is admitted ---"
check "(a) predicate now TRUE via the engagement"            "t"           "$(p_e1_w1_pred)"
check "(a) engaging employer reads the display name"         "ENGAGED-W1"  "$(p_e1_w1_name)"
check "(a) …and the RLS answer now MATCHES the definer RPC"  "$(p_e1_rpc_name)" "$(p_e1_w1_name)"
check "(a) skills become readable"                           "1"           "$(p_e1_w1_skill)"
check "(a) professions become readable"                      "1"           "$(p_e1_w1_prof)"
check "(a) languages become readable"                        "2"           "$(p_e1_w1_lang)"
check "(a) free-text bio becomes readable (the widening, stated)" \
      "W1 private bio" "$(p_e1_w1_bio)"

echo
echo "--- AFTER: (b) unrelated / ended / detached still see nothing ---"
check "(b) UNRELATED employer: predicate still false"        "f"      "$(p_e2_w1_pred)"
check "(b) UNRELATED employer: no name for W1"               "NOROWS" "$(p_e2_w1_name)"
check "(b) ENDED engagement: predicate false"                "f"      "$(p_e3_w1_pred)"
check "(b) ENDED engagement: no name for W1"                 "NOROWS" "$(p_e3_w1_name)"
check "(b) DETACHED row (worker_id NULL) grants E2 nothing"  "f"      "$(p_e2_w1_pred)"
check "(b) DETACHED row grants no read of ANY worker to E2 beyond its roster" \
      "NOROWS" "$(as authenticated "$E2" "select display_name from public.workers where id='$W5';" | tok)"
check "(b) ANON: base table denied"                          "DENIED" "$(p_anon_base)"
check "(b) ANON: predicate EXECUTE denied"                   "DENIED" "$(p_anon_pred)"

echo
echo "--- AFTER: (c) the consent arm is untouched ---"
check "(c) consented worker still visible to any employer"  "$B_CONSENT" "$(p_e2_w2_name)"
check "(c) consented worker visible to E1 too (consent, not relationship)" \
      "CONSENTED-W2" "$(p_e1_w2_name)"
check "(c) roster control unchanged"                        "$B_ROSTER"  "$(p_e2_w4_name)"
check "(c) worker self-read byte-identical to BEFORE"       "$B_SELF"    "$(p_self_w1)"
check "(c) admin unchanged (all 5 workers)"                 "5"          "$(p_admin_all)"
check "(c) is_employer() is still AND-ed with the consent predicate" "1" \
      "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='can_view_worker' and p.prosrc ~ 'is_employer\(\)[[:space:]]*and' and p.prosrc like '%worker_profile_discoverable%';")"

echo
echo "--- AFTER: memo §7.1 — the WITHDRAWAL path, measured ---"
# W3 granted discoverability, then withdrew, then accepted a booking from E4.
check "§7.1 E4 (engaged) CAN read W3 despite the withdrawal" \
      "WITHDRAWN-W3" "$(p_e4_w3_name)"
check "§7.1 every OTHER employer still cannot read W3"      "NOROWS" "$(p_e1_w3_name)"
check "§7.1 the discovery predicate itself still says NOT discoverable" "f" \
      "$(as authenticated "$E4" "select public.worker_profile_discoverable('16161616-1616-4161-8161-161616161616');" | tok)"
# ^ This is the memo's central honest finding: the read is restored on the
#   RELATIONSHIP basis, not by reviving the withdrawn consent. Condition C1
#   (accept-screen copy) exists precisely because of this row.

echo
echo "--- AFTER: no policy, no grant, no schema changed ---"
check "workers_select policy count unchanged (1)"  "1" \
      "$(q "select count(*) from pg_policies where tablename='workers';")"
check "policy count across all four gated tables unchanged (4)" "4" \
      "$(q "select count(*) from pg_policies where tablename in ('workers','worker_skills','worker_professions','worker_languages');")"
check "workers_select still keyed on can_view_worker(id)" "1" \
      "$(q "select count(*) from pg_policies where tablename='workers' and policyname='workers_select' and qual like '%can_view_worker%';")"
check "predicate is still SECURITY DEFINER with search_path pinned" "1" \
      "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='can_view_worker' and p.prosecdef and 'search_path=public' = any(p.proconfig);")"
check "predicate is still STABLE (not volatile)" "s" \
      "$(q "select provolatile from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='can_view_worker';")"
check "anon holds NO execute on the predicate" "f" \
      "$(q "select has_function_privilege('anon','public.can_view_worker(uuid)','execute');")"
check "authenticated holds execute on the predicate" "t" \
      "$(q "select has_function_privilege('authenticated','public.can_view_worker(uuid)','execute');")"
check "no UPDATE/DELETE/INSERT grant on workers for authenticated" "0" \
      "$(q "select count(*) from information_schema.role_table_grants where table_name='workers' and grantee='authenticated' and privilege_type in ('UPDATE','DELETE','INSERT');")"
check "exactly ONE function was replaced (signature unchanged)" "1" \
      "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='can_view_worker';")"

echo
echo "--- AFTER: ending the engagement REVOKES (and where it does not) ---"
check "worker's OWN end action is accepted" "{\"outcome\": \"ended\"}" \
      "$(as authenticated "$WP1" "select public.end_company_worker_engagement_v2('$ENG1');" | tok)"
check "…revocation is immediate: predicate false again"  "f"      "$(p_e1_w1_pred)"
check "…and the name is gone again"                      "NOROWS" "$(p_e1_w1_name)"
check "…skills/professions/languages gone again"         "0|0|0" \
      "$(as authenticated "$E1" "select (select count(*) from public.worker_skills where worker_id='$W1')||'|'||(select count(*) from public.worker_professions where worker_id='$W1')||'|'||(select count(*) from public.worker_languages where worker_id='$W1');" | tok)"
# MEMO §5 CAVEAT, MEASURED: ending the engagement does NOT revoke when an
# active project assignment exists, because that branch is independent. The
# worker who clicks "End engagement" will believe otherwise. Follow-up F2.
check "CAVEAT: E5 ends the W5 engagement…" "{\"outcome\": \"ended\"}" \
      "$(as authenticated "$E5" "select public.end_company_worker_engagement_v2('$ENG5');" | tok)"
check "CAVEAT: …yet E5 STILL sees W5 via the assignment branch" \
      "ASSIGNED-W5" "$(p_e5_w5_name)"
check "CAVEAT: predicate still true for E5 (assignment, not engagement)" "t" "$(p_e5_w5_pred)"
seed  # restore the pre-end state so the rollback comparison is like-for-like

echo
echo "--- ROLLBACK $(basename "$ROLLBACK") verbatim ---"
RB_OUT=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$ROLLBACK" 2>&1)
if echo "$RB_OUT" | grep -qiE '^(ERROR|FATAL)'; then echo "$RB_OUT" | head -20; echo "ROLLBACK FAILED"; exit 1; fi
check "ROLLBACK restores the BEFORE state (E1 sees no name)" "NOROWS" "$(p_e1_w1_name)"
check "ROLLBACK restores the roster control unchanged"       "$B_ROSTER"   "$(p_e2_w4_name)"
check "ROLLBACK restores the consent control unchanged"      "$B_CONSENT"  "$(p_e2_w2_name)"
check "ROLLBACK restores the worker self-read unchanged"     "$B_SELF"     "$(p_self_w1)"
check "ROLLBACK removes the engagement branch from the body" "0" \
      "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='can_view_worker' and p.prosrc like '%company_worker_engagements%';")"
check "ROLLBACK leaves the four policies intact"             "4" \
      "$(q "select count(*) from pg_policies where tablename in ('workers','worker_skills','worker_professions','worker_languages');")"
check "ROLLBACK: the definer RPC still discloses the name (the contradiction returns)" \
      "ENGAGED-W1" "$(p_e1_rpc_name)"

echo
echo "--- RE-APPLY (migration is re-runnable) ---"
RE_OUT=$(docker exec -i "$CT" psql -U postgres -q -v ON_ERROR_STOP=1 -f - < "$MIGRATION" 2>&1)
if echo "$RE_OUT" | grep -qiE '^(ERROR|FATAL)'; then echo "$RE_OUT" | head -20; echo "RE-APPLY FAILED"; exit 1; fi
check "RE-APPLY: engaging employer reads the name again"  "ENGAGED-W1" "$(p_e1_w1_name)"
check "RE-APPLY: unrelated employer still sees nothing"   "NOROWS"     "$(p_e2_w1_name)"
check "RE-APPLY: ended engagement still grants nothing"   "f"          "$(p_e3_w1_pred)"
check "RE-APPLY: consent control unchanged"               "$B_CONSENT" "$(p_e2_w2_name)"
check "RE-APPLY: policy count still 4"                    "4" \
      "$(q "select count(*) from pg_policies where tablename in ('workers','worker_skills','worker_professions','worker_languages');")"

echo
echo "=============================================================="
printf ' RESULT: %d passed, %d failed\n' "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ] || exit 1
