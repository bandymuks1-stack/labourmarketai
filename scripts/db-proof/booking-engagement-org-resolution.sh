#!/usr/bin/env bash
# ============================================================================
# Booking→engagement ORG-FIRST resolution — local two-company proof.
#
# Spins up a THROWAWAY Postgres container, builds the faithful harness
# (prelude), applies the CURRENT PRODUCTION v3 verbatim
#   supabase/migrations/20260802150000_booking_atomic_double_booking_v1.sql
# to reproduce the live 2026-08-06 defect (org-stamped demand from a
# TWO-company owner → 'ambiguous_company', nothing minted), then applies the
# migration under test verbatim
#   supabase/migrations/20260807140000_booking_engagement_org_resolution_v1.sql
# and proves: org-first minting, byte-preserved fallback honesty, idempotent
# replay, the surviving 23P01 overlap guard, and the untouched decline path.
#
# Never point this at production or at a shared local Supabase stack.
# Usage:  bash scripts/db-proof/booking-engagement-org-resolution.sh
# ============================================================================
set -uo pipefail

CT=org-bridge-proof
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
PROD_V3="$REPO/supabase/migrations/20260802150000_booking_atomic_double_booking_v1.sql"
MIGRATION="$REPO/supabase/migrations/20260807140000_booking_engagement_org_resolution_v1.sql"

P_OWN='a0000000-0000-4000-8000-00000000000a'   # owner of TWO companies
P_W1='c0000000-0000-4000-8000-000000000001'    # worker 1's profile
P_W2='c0000000-0000-4000-8000-000000000002'    # worker 2's profile
P_W3='c0000000-0000-4000-8000-000000000003'    # worker 3's profile
CA='ca000000-0000-4000-8000-0000000000ca'      # company A (org OA's canonical company)
CB='cb000000-0000-4000-8000-0000000000cb'      # company B (org OB's canonical company, SAME owner)
CS='cc000000-0000-4000-8000-0000000000cc'      # single owner's company
B_BEFORE='b0000000-0000-4000-8000-000000000001'
B1='b0000000-0000-4000-8000-000000000002'
B2='b0000000-0000-4000-8000-000000000003'
B3='b0000000-0000-4000-8000-000000000004'
B4='b0000000-0000-4000-8000-000000000005'
B5='b0000000-0000-4000-8000-000000000006'
B6='b0000000-0000-4000-8000-000000000007'
B7='b0000000-0000-4000-8000-000000000008'
B8='b0000000-0000-4000-8000-000000000009'

psqlf() { docker exec -i "$CT" psql -U postgres -v ON_ERROR_STOP=0 "$@"; }
q()     { docker exec -i "$CT" psql -U postgres -tAc "$1" 2>&1; }

# Respond in a session that authenticates as $3 via the app.uid GUC stub.
respond() { # $1=booking $2=decision $3=actor_profile → full jsonb or ERROR line
  docker exec -i "$CT" psql -U postgres -tA 2>&1 <<SQL | grep -E 'RESULT:|ERROR' | head -1
begin;
set local app.uid = '$3';
select 'RESULT:'||coalesce((select public.respond_booking_request_v3('$1','$2',null,null))::text,'null');
commit;
SQL
}
engagement_of() { echo "$1" | sed -n 's/.*"engagement": *"\([a-z_]*\)".*/\1/p'; }
rows_for()      { q "select count(*) from public.company_worker_engagements where source_booking_id='$1';"; }
company_for()   { q "select company_id from public.company_worker_engagements where source_booking_id='$1';"; }
events_for()    { q "select count(*) from public.booking_request_events where booking_request_id='$1';"; }
status_of()     { q "select status from public.booking_requests where id='$1';"; }

pass=0; fail=0
check() { # $1=label $2=expected $3=actual
  if [ "$2" == "$3" ]; then printf '  PASS  %-62s %s\n' "$1" "$3"; pass=$((pass+1));
  else printf '  FAIL  %-62s expected=%s actual=%s\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

echo "=============================================================="
echo " booking→engagement ORG-FIRST resolution — two-company proof"
echo "=============================================================="

# ── Throwaway container ─────────────────────────────────────────────────────
docker rm -f "$CT" >/dev/null 2>&1
docker run -d --name "$CT" -e POSTGRES_HOST_AUTH_METHOD=trust postgres:15 >/dev/null || {
  echo "could not start postgres container"; exit 1; }
trap 'docker rm -f "$CT" >/dev/null 2>&1' EXIT
for i in $(seq 1 30); do
  docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$CT" pg_isready -U postgres >/dev/null 2>&1 || { echo "container not ready"; exit 1; }

psqlf -q -f - < "$HERE/booking-engagement-org-resolution.prelude.sql" >/dev/null 2>&1
psqlf -q -f - < "$HERE/booking-engagement-org-resolution.seed.sql" >/dev/null 2>&1
echo "harness + seed loaded (throwaway postgres:15)"

# ── CURRENT PRODUCTION STATE: apply the W12 v3 verbatim ────────────────────
echo
echo "--- APPLYING $(basename "$PROD_V3") (current prod v3) verbatim ---"
OUT=$(psqlf -q -f - < "$PROD_V3" 2>&1)
if echo "$OUT" | grep -qiE '^ERROR|FATAL'; then
  echo "$OUT" | grep -iE '^ERROR|FATAL' | head -5
  echo "PROD V3 FAILED TO APPLY"; exit 1
fi
check "prod v3 installed" "1" "$(q "select count(*) from pg_proc where proname='respond_booking_request_v3';")"

# ── BEFORE: reproduce the live 2026-08-06 defect ───────────────────────────
echo
echo "--- BEFORE: org-stamped demand, owner holds TWO companies ---"
R=$(respond "$B_BEFORE" accepted "$P_W1")
echo "  v3 -> $R"
check "BEFORE: accept stands" "accepted" "$(status_of "$B_BEFORE")"
check "BEFORE: engagement is the ambiguous_company dead-end" "ambiguous_company" "$(engagement_of "$R")"
check "BEFORE: nothing minted (the live 88a43ead outcome)" "0" "$(rows_for "$B_BEFORE")"

# ── APPLY THE MIGRATION UNDER TEST ─────────────────────────────────────────
echo
echo "--- APPLYING $(basename "$MIGRATION") verbatim ---"
OUT=$(psqlf -q -f - < "$MIGRATION" 2>&1)
if echo "$OUT" | grep -qiE '^ERROR|FATAL'; then
  echo "$OUT" | grep -iE '^ERROR|FATAL' | head -5
  echo "MIGRATION FAILED TO APPLY"; exit 1
fi
echo "  applied (safety assertions passed)"

# ── S1: org-first — the SAME shape now mints, to the org's exact company ───
echo
echo "--- S1: org-stamped demand, TWO-company owner -> mints via the org ---"
R=$(respond "$B1" accepted "$P_W1")
echo "  v3 -> $R"
check "S1: engagement created" "created" "$(engagement_of "$R")"
check "S1: exactly one engagement row" "1" "$(rows_for "$B1")"
check "S1: company = the ORG's legacy company (CA), not a guess" "$CA" "$(company_for "$B1")"
check "S1: single acceptance event" "1" "$(events_for "$B1")"

# ── S2: idempotent replay (W12 L1 preserved) ───────────────────────────────
echo
echo "--- S2: duplicate submit of the SAME accepted booking ---"
R=$(respond "$B1" accepted "$P_W1")
echo "  v3 -> $R"
check "S2: replay reports already_recorded" "already_recorded" "$(engagement_of "$R")"
check "S2: replay flagged idempotent" "1" "$(echo "$R" | grep -c '"idempotent": *true')"
check "S2: STILL exactly one event row (no double audit)" "1" "$(events_for "$B1")"
check "S2: STILL exactly one engagement row" "1" "$(rows_for "$B1")"

# ── S3: NULL-org fallback keeps refusing to guess ──────────────────────────
echo
echo "--- S3: NULL-organization demand, TWO-company owner (fallback) ---"
R=$(respond "$B2" accepted "$P_W2")
echo "  v3 -> $R"
check "S3: accept stands" "accepted" "$(status_of "$B2")"
check "S3: fallback still honestly ambiguous" "ambiguous_company" "$(engagement_of "$R")"
check "S3: nothing minted" "0" "$(rows_for "$B2")"

# ── S4: NULL-org fallback still mints for the singleton owner ──────────────
echo
echo "--- S4: NULL-organization demand, SINGLE-company owner (fallback) ---"
R=$(respond "$B3" accepted "$P_W2")
echo "  v3 -> $R"
check "S4: engagement created via the singleton rule" "created" "$(engagement_of "$R")"
check "S4: company = the owner's only company (CS)" "$CS" "$(company_for "$B3")"

# ── S5: organization WITHOUT a bound company — honest non-mint ─────────────
echo
echo "--- S5: demand stamped with a company-less organization ---"
R=$(respond "$B4" accepted "$P_W3")
echo "  v3 -> $R"
check "S5: accept stands" "accepted" "$(status_of "$B4")"
check "S5: honest no_company (never some other company)" "no_company" "$(engagement_of "$R")"
check "S5: nothing minted" "0" "$(rows_for "$B4")"

# ── S6: the 23P01 overlap guard survived the replacement ───────────────────
echo
echo "--- S6: overlapping accept for worker 1 (B5 overlaps accepted B1) ---"
R=$(respond "$B5" accepted "$P_W1")
echo "  v3 -> $R"
check "S6: canonical 23P01 conflict raised" "1" "$(echo "$R" | grep -c 'Conflicting accepted booking')"
check "S6: booking stays proposed" "proposed" "$(status_of "$B5")"
check "S6: zero overlapping accepted pairs" "0" "$(q "select count(*) from public.booking_requests a join public.booking_requests b
       on a.worker_id=b.worker_id and a.id<b.id
      where a.status='accepted' and b.status='accepted'
        and a.start_date is not null and b.start_date is not null
        and daterange(a.start_date,coalesce(a.expected_end_date,a.start_date),'[]')
         && daterange(b.start_date,coalesce(b.expected_end_date,b.start_date),'[]');")"

# ── S7: decline path untouched ─────────────────────────────────────────────
echo
echo "--- S7: decline never mints and reports engagement null ---"
R=$(respond "$B6" declined "$P_W3")
echo "  v3 -> $R"
check "S7: declined" "declined" "$(status_of "$B6")"
check "S7: engagement is null on decline" "1" "$(echo "$R" | grep -c '"engagement": *null')"
check "S7: nothing minted" "0" "$(rows_for "$B6")"

# ── Foreign caller still rejected (authorization preserved) ────────────────
echo
echo "--- S8: a NON-addressed caller can never accept / mint ---"
R=$(respond "$B5" accepted "$P_W2")
check "S8: foreign caller rejected (42501 text)" "1" "$(echo "$R" | grep -c 'Only the addressed worker may respond')"

echo
echo "--- S9: SIBLING company of the SAME owner — demand belongs to B ---"
# §4's exact question. One profile owns CA and CB. This demand is stamped with
# OB, so the engagement must land under CB — and CA must NOT receive it merely
# because the same profile owns it. Under the old body this was the
# ambiguous_company dead-end; under org-first it is deterministic.
R=$(respond "$B7" accepted "$P_W3")
check "S9: engagement created" "created" "$(engagement_of "$R")"
check "S9: company = CB, the DEMAND'S org company" "$CB" "$(company_for "$B7")"
check "S9: sibling CA received NOTHING from this booking" "0" \
  "$(q "select count(*) from public.company_worker_engagements where source_booking_id='$B7' and company_id='$CA';")"
check "S9: exactly one engagement row" "1" "$(rows_for "$B7")"

echo
echo "--- S10: worker ALREADY actively engaged with the resolved company ---"
# Worker 1 gained an active CA engagement via B1 (S1). A second accepted
# booking resolving to the SAME company must not mint a second active
# engagement — the already_active arm, previously only reachable in the
# singleton fallback, now exercised through the org-first path.
R=$(respond "$B8" accepted "$P_W1")
check "S10: accept stands" "accepted" "$(status_of "$B8")"
check "S10: reported already_active, not created" "already_active" "$(engagement_of "$R")"
check "S10: NO second engagement row minted for this booking" "0" "$(rows_for "$B8")"
check "S10: worker 1 still holds exactly ONE active CA engagement" "1" \
  "$(q "select count(*) from public.company_worker_engagements where company_id='$CA' and worker_id='d0000000-0000-4000-8000-000000000001' and status='active';")"

echo
echo "--- S11: WHO SEES the minted engagement (real RLS, real roles) ---"
# §9's visibility question, answered under `set local role authenticated`
# (never the superuser): the engagement's company owner and its subject
# worker each see the B1 row; an unrelated authenticated profile sees zero;
# anon is denied outright.
see_b1() { # $1=actor_profile
  docker exec -i "$CT" psql -U postgres -tA -v ON_ERROR_STOP=0 2>&1 <<SQL | grep -vE '^(BEGIN|COMMIT|SET)$' | sed '/^$/d' | head -1
begin;
set local role authenticated;
set local app.uid = '$1';
select count(*) from public.company_worker_engagements where source_booking_id='$B1';
commit;
SQL
}
ANON_B1=$(docker exec -i "$CT" psql -U postgres -tA -v ON_ERROR_STOP=0 2>&1 <<SQL | grep -c 'permission denied'
begin;
set local role anon;
select count(*) from public.company_worker_engagements;
commit;
SQL
)
check "S11: company owner (P_OWN) sees the engagement"      "1" "$(see_b1 "$P_OWN")"
check "S11: the subject worker (P_W1) sees the engagement"  "1" "$(see_b1 "$P_W1")"
check "S11: an unrelated profile (P_W2) sees NOTHING"       "0" "$(see_b1 "$P_W2")"
check "S11: anon is DENIED at the grant layer"              "1" "$ANON_B1"

echo
echo "=============================================================="
printf ' RESULT: %d passed, %d failed\n' "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ] || exit 1
