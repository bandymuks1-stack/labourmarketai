#!/usr/bin/env bash
# ============================================================================
# AUTHORITY CLOSURE - FIRST PACKAGE: RUNTIME proof, BEFORE -> AFTER.
#
# Findings (audit 2026-10-06): A1 org-hours status/tenant forgery, F-1
# conversation participant authority, F-4 self-asserted employer authority,
# F-8 lmc_* ledger EXECUTE grants.
#
# Every probe is ONE transaction that is ROLLED BACK (the database is left as it
# was). Probes run as a real role (`set local role authenticated|service_role`)
# with a real JWT subject, exactly the way PostgREST runs a client call.
# Fixtures come from the local dev stack (supabase/dev-fixtures.sql: dev.worker,
# dev.company, dev.agency) plus rows created INSIDE each transaction.
#
# Usage (local stack only; refuses any non-loopback host):
#   PHASE=before bash scripts/db-proof/authority-closure-first-package.sh   # exploits work
#   (apply the four 20261006100*.sql migrations to the LOCAL stack)
#   PHASE=after  bash scripts/db-proof/authority-closure-first-package.sh   # exploits denied
# Never point this at production.
# ============================================================================
set -uo pipefail
export PGCLIENTENCODING=UTF8
HOST="${PGPROOF_HOST:-127.0.0.1}"; PORT="${PGPROOF_PORT:-54322}"
PHASE="${PHASE:-after}"
case "$HOST" in 127.0.0.1|localhost) ;; *) echo "refusing non-local host $HOST"; exit 2;; esac
case "$PHASE" in before|after) ;; *) echo "PHASE must be before|after"; exit 2;; esac
export PGPASSWORD="${PGPASSWORD:-postgres}"
PSQL="psql -h $HOST -p $PORT -U postgres -d postgres -tAq -v ON_ERROR_STOP=0"

W=aaaaaaaa-0000-0000-0000-000000000001   # dev.worker  (employee of ORG1)
C=aaaaaaaa-0000-0000-0000-000000000002   # dev.company (owner of ORG1)
G=aaaaaaaa-0000-0000-0000-000000000003   # dev.agency  (owner of ORG2, foreign to W)
WID=9e09525b-cc8b-4dcb-a253-aa2b45e75750 # workers.id of W
CWID=94e1a029-6f45-4705-8f6c-e8cdb32c03da # workers.id of C
GWID=956a6084-c49c-40e5-a654-cc501eb4da9b # workers.id of G
ORG1=79eb96ad-89a2-4e47-849b-89bad2ad7108
ORG2=b2c86c73-e8b3-4ebf-abfd-97ad866020e3
O1=0b100000-0000-4000-8000-000000000001
O2=0b200000-0000-4000-8000-000000000002
AL1=a1100000-0000-4000-8000-000000000001
CV1=c0100000-0000-4000-8000-000000000001

pass=0; fail=0
SU="set local role postgres; set local request.jwt.claims = '';"
as_claims() { echo "set local role $1; set local request.jwt.claims = '{\"sub\":\"$2\",\"role\":\"$1\"}';"; }

FIXTURE="
insert into public.work_objects(id, organization_id, name, created_by) values
  ('$O1','$ORG1','proof O1','$C'), ('$O2','$ORG2','proof O2','$G');
insert into public.work_hour_allocations
  (id, organization_id, worker_id, entered_by, work_date, work_object_id, hours_numeric, source, status)
  values ('$AL1','$ORG1','$WID','$C',current_date,'$O1',8,'manual','recorded');
"

# probe <label> <expect_before_regex> <expect_after_regex> <role|-> <uid|-> <sql>
probe() {
  local label="$1" eb="$2" ea="$3" role="$4" uid="$5" sql="$6" out tok want
  local pre="begin; $FIXTURE"
  local set_role=""
  if [ "$role" != "-" ]; then
    set_role="set local role $role; set local request.jwt.claims = '{\"sub\":\"$uid\",\"role\":\"$role\"}';"
  fi
  out=$($PSQL 2>&1 <<SQL | tr -d '\r'
\\set VERBOSITY terse
$pre
$set_role
$sql
rollback;
SQL
)
  out=$(printf '%s\n' "$out" | grep -vE '^(BEGIN|COMMIT|ROLLBACK|SET|INSERT 0 [0-9]+|UPDATE [0-9]+|DELETE [0-9]+)$' | sed '/^$/d')
  if printf '%s\n' "$out" | grep -qE '^(ERROR|FATAL)'; then
    tok="DENIED:$(printf '%s\n' "$out" | grep -E '^(ERROR|FATAL)' | head -1 | sed -E 's/^(ERROR|FATAL):  //' | cut -c1-72)"
  else
    tok="$(printf '%s\n' "$out" | tail -1)"
  fi
  if [ "$PHASE" = "before" ]; then want="$eb"; else want="$ea"; fi
  if printf '%s' "$tok" | grep -qE "$want"; then
    printf '  PASS  %-70s %s\n' "$label" "$tok"; pass=$((pass+1))
  else
    printf '  FAIL  %-70s\n        wanted /%s/ (phase=%s)\n        actual  =%s\n' "$label" "$want" "$PHASE" "$tok"; fail=$((fail+1))
  fi
}

echo "== phase: $PHASE =="
echo "-- A1  work_hour_allocations"
INS="insert into public.work_hour_allocations (organization_id, worker_id, entered_by, work_date, work_object_id, hours_numeric, source%s) values ('%s','%s','%s',current_date,'%s',2,'manual'%s); select 'OK';"
probe "A1.1 worker records OWN hours in the org they belong to (legit)" '^OK$' '^OK$' authenticated "$W" "$(printf "$INS" "" "$ORG1" "$WID" "$W" "$O1" "")"
probe "A1.2 worker self-writes status='approved'"                      '^OK$' '^DENIED' authenticated "$W" "$(printf "$INS" ",status" "$ORG1" "$WID" "$W" "$O1" ",'approved'")"
probe "A1.3 worker writes hours into a FOREIGN organization's ledger"   '^OK$' '^DENIED' authenticated "$W" "$(printf "$INS" "" "$ORG2" "$WID" "$W" "$O2" "")"
probe "A1.4 manager records hours for a crew member (legit, no status)" '^OK$' '^OK$' authenticated "$C" "$(printf "$INS" "" "$ORG1" "$WID" "$C" "$O1" "")"
probe "A1.5 manager inserts status='approved'"                          '^OK$' '^DENIED' authenticated "$C" "$(printf "$INS" ",status" "$ORG1" "$WID" "$C" "$O1" ",'approved'")"
probe "A1.6 manager UPDATEs an existing row to status='approved'"       '^OK$' '^DENIED' authenticated "$C" "update public.work_hour_allocations set status='approved' where id='$AL1'; select 'OK';"
probe "A1.7 worker moves their row to another organization (tenant move)" '^OK$' '^DENIED' authenticated "$W" "update public.work_hour_allocations set organization_id='$ORG2' where id='$AL1'; select 'OK';"
probe "A1.8 manager changes the worker a row is about"                  '^OK$' '^DENIED' authenticated "$C" "update public.work_hour_allocations set worker_id='$CWID' where id='$AL1'; select 'OK';"
probe "A1.9 correction chain still works (insert recorded + link both)" '^OK$' '^OK$' authenticated "$C" "insert into public.work_hour_allocations (id, organization_id, worker_id, entered_by, work_date, work_object_id, hours_numeric, source) values ('$CV1','$ORG1','$WID','$C',current_date,'$O1',7,'manual'); update public.work_hour_allocations set correction_of='$AL1' where id='$CV1'; update public.work_hour_allocations set superseded_by='$CV1' where id='$AL1'; select 'OK';"
probe "A1.10 service role / privileged pipeline may still set approved" '^OK$' '^OK$' service_role "$C" "update public.work_hour_allocations set status='approved' where id='$AL1'; select 'OK';"
probe "A1.11 anon cannot write at all"                                 '^DENIED' '^DENIED' anon "$W" "$(printf "$INS" "" "$ORG1" "$WID" "$W" "$O1" "")"
probe "A1.12 RESIDUAL (documented): manager of ORG2 records hours for a worker outside ORG2" '^OK$' '^OK$' authenticated "$G" "$(printf "$INS" "" "$ORG2" "$WID" "$G" "$O2" "")"

UPS="insert into public.work_hour_allocations (id, organization_id, worker_id, entered_by, work_date, work_object_id, hours_numeric, source, status) values ('$AL1','$ORG1','$WID','$C',current_date,'$O1',8,'manual','%s') on conflict (id) do update set %s; select 'OK';"
probe "A1.13 upsert whose INSERT arm carries status='approved'"           '^OK$' '^DENIED' authenticated "$C" "$(printf "$UPS" approved "hours_numeric = excluded.hours_numeric")"
probe "A1.14 upsert whose UPDATE arm sets status='approved'"               '^OK$' '^DENIED' authenticated "$C" "$(printf "$UPS" recorded "status = 'approved'")"
probe "A1.15 delete is impossible for end users (no grant, no policy)"     '^DENIED' '^DENIED' authenticated "$C" "delete from public.work_hour_allocations where id='$AL1'; select 'OK';"

echo "-- F-1  conversation participants"
CONV="insert into public.conversations(id, created_by, kind) values ('c0000000-0000-4000-8000-0000000000c1','%s','direct');"
PADD="insert into public.conversation_participants(conversation_id, profile_id, added_by) values ('c0000000-0000-4000-8000-0000000000c1','%s','%s'); select 'OK';"
probe "C.1 creator adds THEMSELVES to their own thread (legit)"        '^OK$' '^OK$' authenticated "$W" "$(printf "$CONV" "$W")$(printf "$PADD" "$W" "$W")"
probe "C.2 creator adds ANOTHER profile directly (consent bypass)"     '^OK$' '^DENIED' authenticated "$W" "$(printf "$CONV" "$W")$(printf "$PADD" "$C" "$W")"
probe "C.3 non-creator adds themselves to someone else's thread"       '^DENIED' '^DENIED' authenticated "$G" "$(printf "$CONV" "$W")$(printf "$PADD" "$G" "$G")"
probe "C.4 service role (server after the gate) adds another profile"  '^OK$' '^OK$' service_role "$W" "$(printf "$CONV" "$W")$(printf "$PADD" "$C" "$W")"
probe "C.5 admin may still join a thread (support flow)"               '^OK$' '^OK$' authenticated "$G" "$SU update public.profiles set active_role='admin' where id='$G'; $(printf "$CONV" "$W") $(as_claims authenticated $G) $(printf "$PADD" "$G" "$G")"

probe "C.6 participant rewrites their own row to point at ANOTHER profile" '^DENIED' '^DENIED' authenticated "$W" "$(printf "$CONV" "$W")$(printf "$PADD" "$W" "$W") update public.conversation_participants set profile_id='$C' where conversation_id='c0000000-0000-4000-8000-0000000000c1' and profile_id='$W'; select 'OK';"

echo "-- F-4  employer authority"
IE="select public.is_employer()::text;"
probe "E.1 worker flips OWN active_role to company -> is_employer()"   '^true$' '^false$' authenticated "$W" "update public.profiles set active_role='company' where id='$W'; $IE"
probe "E.2 real owner of an organization (active_role company)"        '^true$' '^true$' authenticated "$C" "$IE"
probe "E.3 real agency owner (active_role agency)"                     '^true$' '^true$' authenticated "$G" "$IE"
probe "E.4 owner whose active_role points at worker (workspace pointer)" '^false$' '^false$' authenticated "$C" "update public.profiles set active_role='worker' where id='$C'; $IE"
probe "E.5 no session"                                                  '^false$' '^false$' - - "$IE"
DISC="insert into public.privacy_consent_events(user_id, purpose, action, consent_text_version, consent_text_hash, locale, source) values ('$G','profile_discoverability','granted','2026-07-11.v2','x','en','proof');"
probe "E.6 fake employer can DISCOVER a consenting, unrelated worker"  '^true$' '^false$' authenticated "$W" "$SU $DISC $(as_claims authenticated $W) update public.profiles set active_role='company' where id='$W'; select public.can_view_worker('$GWID')::text;"
probe "E.7 real employer discovery of a consenting worker still works" '^true$' '^true$' authenticated "$C" "$SU $DISC $(as_claims authenticated $C) select public.can_view_worker('$GWID')::text;"

probe "E.8 NO side door: self-insert a manager engagement into a foreign org" '^DENIED' '^DENIED' authenticated "$W" "insert into public.engagement_contexts(profile_id, organization_id, relationship_slug, status, hash_self) values ('$W','$ORG2','manager','active','x'); select 'OK';"
probe "E.9 NO side door: self-insert a manager membership into a foreign org" '^DENIED' '^DENIED' authenticated "$W" "insert into public.company_memberships(profile_id, organization_id, role, status) values ('$W','$ORG2','manager','active'); select 'OK';"
probe "E.10 NO side door: flipping active_role AND holding profile_roles company is still not employer" '^true$' '^false$' authenticated "$W" "insert into public.profile_roles(profile_id, role) values ('$W','company') on conflict do nothing; update public.profiles set active_role='company' where id='$W'; select public.is_employer()::text;"

echo "-- F-8  lmc ledger"
FLAG="$SU update public.profiles set active_role='admin' where id='$G'; select public.lmc_set_flag_v1('lmc_purchases_enabled', true, '$G'); select public.lmc_set_flag_v1('lmc_promotional_grants_enabled', true, '$G');"
PURCH="select (public.lmc_record_purchase_v1(100000, 'proof-ref', 'proof-key-1', '$W', null))::text;"
probe "L.1 signed-in user mints ledger credit (purchases flag enabled)" '^\{' '^DENIED:permission denied' authenticated "$W" "$FLAG $(as_claims authenticated $W) $PURCH"
probe "L.2 signed-in user calls the promotional grant"                  '.' '^DENIED:permission denied' authenticated "$W" "$FLAG $(as_claims authenticated $W) select (public.lmc_grant_promotional_v1('signup','$W','proof','proof-key-2'))::text;"
probe "L.3 signed-in user calls the reverse door"                       '.' '^DENIED:permission denied' authenticated "$W" "select (public.lmc_reverse_v1('$AL1','refund','x','proof-key-3','$W'))::text;"
probe "L.4 signed-in user calls the expiry sweep"                       '.' '^DENIED:permission denied' authenticated "$W" "select (public.lmc_expire_lots_v1(1))::text;"
probe "L.5 signed-in user calls the internal account helper"            '.' '^DENIED:permission denied' authenticated "$W" "select (public.lmc_ensure_account_v1('$W', null))::text;"
probe "L.6 service role can still record a purchase (server path)"      '^\{' '^\{' service_role "$W" "$FLAG $(as_claims service_role $W) $PURCH"
probe "L.7 authenticated keeps the read-only flag helper"               '^(true|false)$' '^(true|false)$' authenticated "$W" "select public.lmc_flag_enabled('lmc_purchases_enabled')::text;"
probe "L.8 authenticated still REACHES lmc_admin_grant_v1 (its own in-body admin gate answers)" '^DENIED:Admin only' '^DENIED:Admin only' authenticated "$W" "select (public.lmc_admin_grant_v1('x@example.com', 100, 'r', 'c', now() + interval '10 days', 'proof-key-4'))::text;"
probe "L.9 catalog: authenticated EXECUTE on lmc_* definers outside the allowlist = 0" '^[1-9]' '^0$' - - "select count(*)::text from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'lmc\_%' and p.prosecdef and p.prorettype <> 'trigger'::regtype and has_function_privilege('authenticated', p.oid, 'execute') and p.proname not in ('lmc_admin_grant_v1','lmc_flag_enabled','lmc_flag_policy_v1');"

echo
echo "RESULT ($PHASE): pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
