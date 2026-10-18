#!/usr/bin/env bash
# ============================================================================
# EVID-6 — experience_responses_select resolves the REPLY's moderation status.
# REAL PostgreSQL proof (no Docker, no Supabase) on a throwaway local PG16.
#
# The schema comes from the REAL migrations that created the evidence domain
# (20260802120000_experience_records_v1 + 20260806230000_experience_author_subject_v1);
# only the external bits are stubbed in evid6-experience-responses.prelude.sql
# (roles, auth.uid(), profiles/organizations/engagement helper predicates copied
# from production). The policy text under test is the LIVE one: asserted equal to
# the production read-back (pg_get_expr) before anything runs.
#
#   BEFORE  the record author reads a 'submitted'/'in_moderation'/'rejected' reply
#           under a published record (the exposure, reproduced);
#   AFTER   denied; the reply's own author, admin and the published-and-published
#           case are unchanged; nobody else gains anything.
#
# Setup (Windows git-bash; ports 54290-54389 are outside the excluded range):
#   initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#   pg_ctl -D $DIR/data -o "-p 54300 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=54300 bash scripts/db-proof/evid6-experience-responses.sh
# Uses database `evid6` (dropped and rebuilt). Refuses non-local hosts.
# ============================================================================
set -uo pipefail
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
M="$REPO/supabase/migrations"
NAME=20261002143000_experience_responses_select_reply_status_v1
MIG="$M/$NAME.sql"; DOWN="$REPO/supabase/rollbacks/$NAME.down.sql"
PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}; PGPROOF_PORT=${PGPROOF_PORT:-54300}
case "$PGPROOF_HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host $PGPROOF_HOST"; exit 2;; esac
ADMINP="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d evid6 -tA -q"

$ADMINP -c "drop database if exists evid6" -c "create database evid6" >/dev/null 2>&1
for f in "$HERE/evid6-experience-responses.prelude.sql" "$M/20260802120000_experience_records_v1.sql" "$M/20260806230000_experience_author_subject_v1.sql"; do
  $PSQL -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>/tmp/_e6_err_$$ || { echo "BASELINE FAILED: $f"; cat /tmp/_e6_err_$$; rm -f /tmp/_e6_err_$$; exit 1; }
done
rm -f /tmp/_e6_err_$$

pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi; }
as() { local who="$1"; shift
  case "$who" in anon) pre="set role anon;";; none) pre="set role authenticated;";; *) pre="set role authenticated; set request.jwt.claim.sub='$who';";; esac
  printf '%s\n' "$pre $*" | $PSQL -f - 2>&1 | tr -d '\r' | sed 's/^psql:<stdin>:[0-9]*: //'; }
su() { $PSQL -c "$1" 2>&1 | tr -d '\r'; }
q() { su "$1" | head -1; }

su "insert into public.profiles (id, active_role) values
  ('a0000000-0000-0000-0000-000000000001','worker'),('a0000000-0000-0000-0000-000000000002','worker'),
  ('a0000000-0000-0000-0000-000000000003','worker'),('a0000000-0000-0000-0000-000000000004','admin'),
  ('a0000000-0000-0000-0000-000000000005','company');
 insert into public.organizations (id) values ('b0b0b0b0-0000-0000-0000-00000000000b');
 insert into public.engagement_contexts (profile_id, organization_id, status, relationship_slug) values
  ('a0000000-0000-0000-0000-000000000005','b0b0b0b0-0000-0000-0000-00000000000b','active','manager');" >/dev/null
A=a0000000-0000-0000-0000-000000000001; S=a0000000-0000-0000-0000-000000000002; O=a0000000-0000-0000-0000-000000000003
ADM=a0000000-0000-0000-0000-000000000004; MX=a0000000-0000-0000-0000-000000000005
ORGX=b0b0b0b0-0000-0000-0000-00000000000b
# record ids (all authored by A about S) and the reply id of each: reply id = same suffix with 'c' prefix
rec() { echo "d0000000-0000-0000-0000-00000000000$1"; }
rep() { echo "c0000000-0000-0000-0000-00000000000$1"; }
# 1 pub/submitted  2 pub/in_moderation  3 pub/rejected  4 pub/published  5 rejected-record/published  6 pub/(RPC target, no reply)

reset_state() {
  su "truncate public.experience_responses, public.experience_records, public.audit_logs cascade;
   insert into public.experience_records (id, author_profile_id, subject_type, subject_profile_id, interaction_kind, interaction_id, sentiment, body, moderation_status, published_at, rejected_at, moderation_reason) values
    ('$(rec 1)','$A','worker','$S','completed_engagement','e0000000-0000-0000-0000-000000000001','positive','r1','published',now(),null,null),
    ('$(rec 2)','$A','worker','$S','completed_engagement','e0000000-0000-0000-0000-000000000002','positive','r2','published',now(),null,null),
    ('$(rec 3)','$A','worker','$S','completed_engagement','e0000000-0000-0000-0000-000000000003','positive','r3','published',now(),null,null),
    ('$(rec 4)','$A','worker','$S','completed_engagement','e0000000-0000-0000-0000-000000000004','positive','r4','published',now(),null,null),
    ('$(rec 5)','$A','worker','$S','completed_engagement','e0000000-0000-0000-0000-000000000005','negative','r5','rejected',null,now(),'not acceptable'),
    ('$(rec 6)','$A','worker','$S','completed_engagement','e0000000-0000-0000-0000-000000000006','positive','r6','published',now(),null,null);
   insert into public.experience_responses (id, experience_record_id, author_profile_id, body, moderation_status) values
    ('$(rep 1)','$(rec 1)','$S','reply submitted','submitted'),
    ('$(rep 2)','$(rec 2)','$S','reply in moderation','in_moderation'),
    ('$(rep 3)','$(rec 3)','$S','reply rejected','rejected'),
    ('$(rep 4)','$(rec 4)','$S','reply published','published'),
    ('$(rep 5)','$(rec 5)','$S','reply published, record rejected','published');" >/dev/null
}
seen() { as "$1" "select count(*) from public.experience_responses where id='$(rep $2)';" | head -1; }
PHASE=BEFORE
# probe <label> <expect-BEFORE> <expect-AFTER> <actor> <reply-no>
probe() { local label="$1" eb="$2" ea="$3" who="$4" n="$5"; local want="$ea"; [ "$PHASE" = BEFORE ] && want="$eb"
  check "[$PHASE] $label" "$want" "$(seen "$who" "$n")"; }
suite() {
  reset_state
  echo "--- record author A (the exposure)"
  probe "A reads reply 1 (reply submitted, record published)"            1 0 $A 1
  probe "A reads reply 2 (reply in_moderation, record published)"        1 0 $A 2
  probe "A reads reply 3 (reply rejected, record published)"             1 0 $A 3
  probe "A reads reply 4 (reply published, record published)"            1 1 $A 4
  probe "A reads reply 5 (reply published, record NOT published)"        0 0 $A 5
  echo "--- reply author S sees their own reply in ALL states"
  for n in 1 2 3 4 5; do probe "S reads own reply $n" 1 1 $S $n; done
  echo "--- admin sees all"
  for n in 1 2 3 4 5; do probe "admin reads reply $n" 1 1 $ADM $n; done
  echo "--- everybody else sees none"
  for n in 1 2 3 4 5; do probe "unrelated user O reads reply $n" 0 0 $O $n; done
  for n in 1 4; do probe "manager of an unrelated org reads reply $n" 0 0 $MX $n; done
  for n in 1 4; do probe "NULL auth.uid() (authenticated, no sub) reads reply $n" 0 0 none $n; done
  echo "--- anon and writes"
  check "[$PHASE] anon cannot read the table (permission denied)" "1" "$(as anon "select count(*) from public.experience_responses;" | grep -c 'permission denied')"
  for who in $A $S $O; do
    check "[$PHASE] $who cannot INSERT directly" "1" "$(as $who "insert into public.experience_responses (experience_record_id, author_profile_id, body) values ('$(rec 6)','$who','x');" | grep -c 'permission denied')"
    check "[$PHASE] $who cannot UPDATE directly" "1" "$(as $who "update public.experience_responses set moderation_status='published';" | grep -c 'permission denied')"
    check "[$PHASE] $who cannot DELETE directly" "1" "$(as $who "delete from public.experience_responses;" | grep -c 'permission denied')"
  done
  echo "--- the write RPCs still work (bodies unchanged)"
  check "[$PHASE] subject S submits a reply to a published record via the RPC" "t" "$(as $S "select (public.submit_experience_response('$(rec 6)','a fresh reply')->>'ok')::boolean;" | head -1 | sed 's/^true$/t/')"
  check "[$PHASE] ... and A cannot see it while it is 'submitted'" "$([ "$PHASE" = BEFORE ] && echo 1 || echo 0)" "$(as $A "select count(*) from public.experience_responses where experience_record_id='$(rec 6)';" | head -1)"
  check "[$PHASE] admin moderates it to published via the RPC" "t" "$(as $ADM "select (public.moderate_experience_response((select id from public.experience_responses where experience_record_id='$(rec 6)'),'published','ok reason')->>'ok')::boolean;" | head -1 | sed 's/^true$/t/')"
  check "[$PHASE] ... and now A sees it (published + published)" "1" "$(as $A "select count(*) from public.experience_responses where experience_record_id='$(rec 6)';" | head -1)"
  check "[$PHASE] S still sees it" "1" "$(as $S "select count(*) from public.experience_responses where experience_record_id='$(rec 6)';" | head -1)"
}

pol() { q "select md5(pg_get_expr(polqual,polrelid))||' '||polname||' '||polcmd::text||' '||polroles::regrole[]::text||' '||polpermissive::text from pg_policy where polrelid='public.experience_responses'::regclass;"; }
polsrc() { q "select pg_get_expr(polqual,polrelid) from pg_policy where polrelid='public.experience_responses'::regclass;" ; }
polsrc_full() { su "select pg_get_expr(polqual,polrelid) from pg_policy where polrelid='public.experience_responses'::regclass;"; }
grants() { su "select grantee||':'||privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='experience_responses' order by 1;" | tr '\n' ','; }
fnmd5() { su "select proname||' '||md5(prosrc)||' '||coalesce(proacl::text,'-') from pg_proc where pronamespace='public'::regnamespace and proname in ('submit_experience_response','moderate_experience_response') order by 1;"; }

echo "=============================================================="; echo " STEP 1 — the live pre-image"; echo "=============================================================="
LIVE_QUAL="((author_profile_id = auth.uid()) OR is_admin() OR (EXISTS ( SELECT 1
   FROM experience_records r
  WHERE ((r.id = experience_responses.experience_record_id) AND (r.author_profile_id = auth.uid()) AND (r.moderation_status = 'published'::text)))))"
check "scratch policy text == the production read-back (pg_get_expr)" "$LIVE_QUAL" "$(polsrc_full)"
check "exactly ONE policy on experience_responses (live: 1)" "1" "$(q "select count(*) from pg_policy where polrelid='public.experience_responses'::regclass;")"
check "policy is SELECT, roles {public}, permissive" "experience_responses_select r {-} true" "$(q "select polname||' '||polcmd::text||' '||polroles::regrole[]::text||' '||polpermissive::text from pg_policy where polrelid='public.experience_responses'::regclass;")"
check "moderation_status is NOT NULL on both tables (a NULL state cannot exist)" "2" "$(q "select count(*) from information_schema.columns where table_schema='public' and table_name in ('experience_responses','experience_records') and column_name='moderation_status' and is_nullable='NO';")"
check "moderation_status is constrained to the four states" "2" "$(q "select count(*) from pg_constraint where conrelid in ('public.experience_responses'::regclass,'public.experience_records'::regclass) and contype='c' and pg_get_constraintdef(oid) like '%submitted%in_moderation%published%rejected%';")"
POL_BEFORE="$(pol)"; GR_BEFORE="$(grants)"; FN_BEFORE="$(fnmd5)"
echo "    grants: $GR_BEFORE"

echo ""; echo "=============================================================="; echo " STEP 2 — BEFORE (live policy): the exposure"; echo "=============================================================="
PHASE=BEFORE; suite

echo ""; echo "=============================================================="; echo " STEP 3 — apply the migration"; echo "=============================================================="
$PSQL -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1 || { echo "MIGRATION FAILED"; exit 1; }
check "migration applies cleanly" ok ok
echo "    new policy text:"; polsrc_full | sed 's/^/    /'
check "still exactly ONE policy, same name / command / roles / permissive" "experience_responses_select r {-} true" "$(q "select polname||' '||polcmd::text||' '||polroles::regrole[]::text||' '||polpermissive::text from pg_policy where polrelid='public.experience_responses'::regclass;")"
check "policy count unchanged (1)" "1" "$(q "select count(*) from pg_policy where polrelid='public.experience_responses'::regclass;")"
check "grants on the table unchanged" "$GR_BEFORE" "$(grants)"
check "the two write RPCs (bodies + ACL) untouched" "$FN_BEFORE" "$(fnmd5)"
check "policies on experience_records untouched" "1" "$(q "select count(*) from pg_policy where polrelid='public.experience_records'::regclass;")"

echo ""; echo "=============================================================="; echo " STEP 4 — AFTER"; echo "=============================================================="
PHASE=AFTER; suite
$PSQL -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1
check "re-applying the migration is idempotent (one policy)" "1" "$(q "select count(*) from pg_policy where polrelid='public.experience_responses'::regclass;")"
POL_AFTER="$(pol)"

echo ""; echo "=============================================================="; echo " STEP 5 — rollback restores the live pre-image"; echo "=============================================================="
$PSQL -v ON_ERROR_STOP=1 -f "$DOWN" >/dev/null 2>&1 || { echo "ROLLBACK FAILED"; exit 1; }
check "rollback restores the stored expression (md5 of the deparsed expression) and name/cmd/roles identically" "$POL_BEFORE" "$(pol)"
check "rollback text == production read-back" "$LIVE_QUAL" "$(polsrc_full)"
check "grants / RPCs unchanged by the rollback" "$GR_BEFORE|$FN_BEFORE" "$(grants)|$(fnmd5)"
PHASE=BEFORE; echo "    (rollback deliberately reintroduces the defect:)"
reset_state; check "[after rollback] A reads reply 1 (submitted) again" "1" "$(seen $A 1)"
$PSQL -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1
check "forward migration re-applies after rollback (same policy as AFTER)" "$POL_AFTER" "$(pol)"

echo ""; echo "=============================================================="
printf " RESULT: %d passed, %d failed\n" "$pass" "$fail"
echo "=============================================================="
[ "$fail" -eq 0 ]
