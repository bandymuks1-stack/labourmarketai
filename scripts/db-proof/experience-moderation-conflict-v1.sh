#!/usr/bin/env bash
# ============================================================================
# Register 2.24 — a moderator who is a PARTY to an experience is refused by
# the DATABASE (20261114070000_experience_moderation_conflict_v1).
# REAL PostgreSQL proof (no Docker, no Supabase) on a throwaway local PG16.
#
# Schema = the REAL 20260802120000 + 20260806230000 + 20261002143000
# migrations (pre-image) + the forward migration; the prelude is the EVID-6
# one (external bits only: roles, auth.uid(), is_admin / manages_organization
# copied from production).
#
#   BEFORE  a party administrator moderates, reviews, decides and publishes
#           by calling the RPC directly (the hole, reproduced);
#   AFTER   refused with conflict_of_interest, nothing changed, one audit row;
#           an independent administrator is unaffected; a non-administrator
#           is refused exactly as before;
#   ROLLBACK restores the five bodies byte for byte and drops the helper.
#
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=54301 bash scripts/db-proof/experience-moderation-conflict-v1.sh
# Uses database `expconf` (dropped and rebuilt). Refuses non-local hosts.
# ============================================================================
set -uo pipefail
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; REPO="$(cd "$HERE/../.." && pwd)"
M="$REPO/supabase/migrations"; NAME=20261114070000_experience_moderation_conflict_v1
PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}; PGPROOF_PORT=${PGPROOF_PORT:-54301}
case "$PGPROOF_HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host"; exit 2;; esac
ADMINP="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d expconf -tA -q"
LFD="$(mktemp -d)"
tr -d '\r' < "$M/$NAME.sql" > "$LFD/up.sql"; tr -d '\r' < "$REPO/supabase/rollbacks/$NAME.down.sql" > "$LFD/down.sql"
$ADMINP -c "drop database if exists expconf" -c "create database expconf" >/dev/null 2>&1
for f in "$HERE/evid6-experience-responses.prelude.sql" "$M/20260802120000_experience_records_v1.sql" \
         "$M/20260806230000_experience_author_subject_v1.sql" "$M/20261002143000_experience_responses_select_reply_status_v1.sql"; do
  tr -d '\r' < "$f" > "$LFD/f.sql"
  $PSQL -v ON_ERROR_STOP=1 -f "$LFD/f.sql" >/dev/null 2>"$LFD/err" || { echo "BASELINE FAILED: $f"; cat "$LFD/err"; exit 1; }
done
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi; }
as() { local who="$1"; shift
  case "$who" in anon) pre="set role anon;";; *) pre="set role authenticated; set request.jwt.claim.sub='$who';";; esac
  printf '%s\n' "$pre $*" | $PSQL -f - 2>&1 | tr -d '\r' | sed 's/^psql:<stdin>:[0-9]*: //' | head -1; }
q() { $PSQL -c "$1" 2>&1 | tr -d '\r' | head -1; }
u() { echo "a0000000-0000-0000-0000-0000000000$1"; }
AUT=$(u 01)   # plain author
SUB=$(u 02)   # plain subject
ADM=$(u 04)   # INDEPENDENT administrator
PA=$(u 11)    # administrator who WROTE the experience
PS=$(u 12)    # administrator the experience is ABOUT
PM=$(u 13)    # administrator who manages the SUBJECT organization
PO=$(u 14)    # administrator who manages the AUTHOR organization
PR=$(u 15)    # administrator who wrote the REPLY
USR=$(u 16)   # signed-in non-administrator
ORGX=b0b0b0b0-0000-0000-0000-00000000000b; ORGY=b0b0b0b0-0000-0000-0000-00000000000c
r() { echo "d0000000-0000-0000-0000-0000000000$1"; }
p() { echo "c0000000-0000-0000-0000-0000000000$1"; }
FNS="'start_experience_moderation','decide_experience_moderation','moderate_experience_response','review_experience_dispute','resolve_experience_dispute'"
md5s() { q "select string_agg(proname||':'||md5(prosrc)||':'||coalesce(proacl::text,'-')||':'||prosecdef, ',' order by proname) from pg_proc where pronamespace='public'::regnamespace and proname in ($FNS);"; }
others() { q "select md5(string_agg(proname||':'||md5(prosrc)||':'||coalesce(proacl::text,'-'), ',' order by proname, oid)) from pg_proc where pronamespace='public'::regnamespace and proname not in ($FNS,'experience_moderator_is_party');"; }
pols() { q "select md5(string_agg(tablename||policyname||cmd||coalesce(qual,'')||roles::text, ',' order by tablename, policyname)) from pg_policies where schemaname='public';"; }
reset_state() {
  $PSQL -v ON_ERROR_STOP=1 >/dev/null <<SQL || { echo "seed FAILED"; exit 1; }
truncate public.experience_responses, public.experience_records, public.audit_logs, public.engagement_contexts, public.profile_roles, public.organizations, public.profiles cascade;
insert into public.profiles (id, active_role) values ('$AUT','worker'),('$SUB','worker'),('$ADM','worker'),('$PA','worker'),('$PS','worker'),('$PM','company'),('$PO','company'),('$PR','worker'),('$USR','worker');
insert into public.profile_roles (profile_id, role) values ('$ADM','admin'),('$PA','admin'),('$PS','admin'),('$PM','admin'),('$PO','admin'),('$PR','admin');
insert into public.organizations (id) values ('$ORGX'),('$ORGY');
insert into public.engagement_contexts (profile_id, organization_id, status, relationship_slug) values ('$PM','$ORGX','active','manager'),('$PO','$ORGY','active','manager');
-- one record per party case, each in every state the five steps need
insert into public.experience_records (id, author_profile_id, author_side, author_organization_id, subject_type, subject_profile_id, subject_organization_id, interaction_kind, interaction_id, sentiment, body, moderation_status, published_at, dispute_status, dispute_reason) values
 -- moderation steps (submitted): written by PA / about PS / about ORGX / written for ORGY / independent
 ('$(r 11)','$PA','person',null,'worker','$SUB',null,'completed_engagement','e0000000-0000-0000-0000-000000000011','negative','x','submitted',null,'none',null),
 ('$(r 12)','$AUT','person',null,'worker','$PS',null,'completed_engagement','e0000000-0000-0000-0000-000000000012','negative','x','submitted',null,'none',null),
 ('$(r 13)','$AUT','person',null,'organization',null,'$ORGX','completed_engagement','e0000000-0000-0000-0000-000000000013','negative','x','submitted',null,'none',null),
 ('$(r 14)','$AUT','organization','$ORGY','worker','$SUB',null,'completed_engagement','e0000000-0000-0000-0000-000000000014','negative','x','submitted',null,'none',null),
 ('$(r 18)','$AUT','person',null,'worker','$SUB',null,'completed_engagement','e0000000-0000-0000-0000-000000000018','negative','x','submitted',null,'none',null),
 ('$(r 19)','$AUT','person',null,'worker','$SUB',null,'completed_engagement','e0000000-0000-0000-0000-000000000019','negative','x','submitted',null,'none',null),
 -- dispute steps (published + opened)
 ('$(r 21)','$PA','person',null,'worker','$SUB',null,'completed_engagement','e0000000-0000-0000-0000-000000000021','negative','x','published',now(),'opened','why'),
 ('$(r 22)','$AUT','person',null,'worker','$PS',null,'completed_engagement','e0000000-0000-0000-0000-000000000022','negative','x','published',now(),'opened','why'),
 ('$(r 23)','$AUT','person',null,'organization',null,'$ORGX','completed_engagement','e0000000-0000-0000-0000-000000000023','negative','x','published',now(),'opened','why'),
 ('$(r 24)','$AUT','organization','$ORGY','worker','$SUB',null,'completed_engagement','e0000000-0000-0000-0000-000000000024','negative','x','published',now(),'opened','why'),
 ('$(r 26)','$AUT','person',null,'worker','$SUB',null,'completed_engagement','e0000000-0000-0000-0000-000000000026','negative','x','published',now(),'opened','why'),
 ('$(r 27)','$AUT','person',null,'worker','$SUB',null,'completed_engagement','e0000000-0000-0000-0000-000000000027','negative','x','published',now(),'opened','why'),
 ('$(r 28)','$AUT','person',null,'worker','$SUB',null,'completed_engagement','e0000000-0000-0000-0000-000000000028','negative','x','published',now(),'opened','why'),
 ('$(r 29)','$AUT','person',null,'worker','$SUB',null,'completed_engagement','e0000000-0000-0000-0000-000000000029','negative','x','published',now(),'opened','why'),
 -- reply steps (published): reply written by PR; reply on a record PA wrote; independent
 ('$(r 31)','$AUT','person',null,'worker','$PR',null,'completed_engagement','e0000000-0000-0000-0000-000000000031','negative','x','published',now(),'none',null),
 ('$(r 32)','$PA','person',null,'worker','$SUB',null,'completed_engagement','e0000000-0000-0000-0000-000000000032','negative','x','published',now(),'none',null),
 ('$(r 39)','$AUT','person',null,'worker','$SUB',null,'completed_engagement','e0000000-0000-0000-0000-000000000039','negative','x','published',now(),'none',null);
insert into public.experience_responses (id, experience_record_id, author_profile_id, body, moderation_status) values
 ('$(p 31)','$(r 31)','$PR','reply','submitted'),('$(p 32)','$(r 32)','$SUB','reply','submitted'),('$(p 39)','$(r 39)','$SUB','reply','submitted');
SQL
}
res() { case "$1" in *'"ok": true'*|*'"ok":true'*) echo ok;; *) printf '%s' "$1" | grep -oE '"code": ?"[a-z_]+"' | grep -oE '[a-z_]+"$' | tr -d '"';; esac; }
start()   { res "$(as "$1" "select public.start_experience_moderation('$2');")"; }
decide()  { res "$(as "$1" "select public.decide_experience_moderation('$2','published','ok');")"; }
review()  { res "$(as "$1" "select public.review_experience_dispute('$2');")"; }
resolve() { res "$(as "$1" "select public.resolve_experience_dispute('$2','${3:-upheld}','checked');")"; }
modrep()  { res "$(as "$1" "select public.moderate_experience_response('$2','published','ok');")"; }
PHASE=BEFORE
exp() { local want="$3"; [ "$PHASE" = BEFORE ] && want="$2"; check "[$PHASE] $1" "$want" "$4"; }
suite() {
  reset_state
  echo "--- record moderation"
  exp "the experience's AUTHOR, as administrator, takes it into moderation" ok conflict_of_interest "$(start $PA $(r 11))"
  exp "the person it is ABOUT, as administrator, takes it into moderation" ok conflict_of_interest "$(start $PS $(r 12))"
  exp "a manager of the SUBJECT organization, as administrator" ok conflict_of_interest "$(start $PM $(r 13))"
  exp "a manager of the AUTHOR organization, as administrator" ok conflict_of_interest "$(start $PO $(r 14))"
  $PSQL -c "update public.experience_records set moderation_status='in_moderation' where id in ('$(r 11)','$(r 19)');" >/dev/null
  exp "the author, as administrator, PUBLISHES their own experience" ok conflict_of_interest "$(decide $PA $(r 11))"
  echo "--- dispute"
  exp "the author, as administrator, starts the review of the dispute against them" ok conflict_of_interest "$(review $PA $(r 21))"
  exp "the subject, as administrator, reviews their own dispute" ok conflict_of_interest "$(review $PS $(r 22))"
  exp "the subject organization's manager, as administrator, reviews it" ok conflict_of_interest "$(review $PM $(r 23))"
  exp "the author organization's manager, as administrator, reviews it" ok conflict_of_interest "$(review $PO $(r 24))"
  $PSQL -c "update public.experience_records set dispute_status='under_review' where id in ('$(r 21)','$(r 22)','$(r 27)','$(r 29)');" >/dev/null
  exp "the author, as administrator, DECIDES the dispute against them" ok conflict_of_interest "$(resolve $PA $(r 21))"
  exp "the subject, as administrator, has their own record REMOVED" ok conflict_of_interest "$(resolve $PS $(r 22) removed)"
  echo "--- reply"
  exp "the reply's own author, as administrator, publishes it" ok conflict_of_interest "$(modrep $PR $(p 31))"
  exp "the experience's author, as administrator, publishes the reply to it" ok conflict_of_interest "$(modrep $PA $(p 32))"
  if [ "$PHASE" = AFTER ]; then
    check "[AFTER] every refusal changed nothing: states as seeded" "submitted:in_moderation:opened:under_review:under_review:submitted:submitted" "$(q "select (select moderation_status from public.experience_records where id='$(r 12)')||':'||(select moderation_status from public.experience_records where id='$(r 11)')||':'||(select dispute_status from public.experience_records where id='$(r 23)')||':'||(select dispute_status from public.experience_records where id='$(r 21)')||':'||(select dispute_status from public.experience_records where id='$(r 22)')||':'||(select moderation_status from public.experience_responses where id='$(p 31)')||':'||(select moderation_status from public.experience_responses where id='$(p 32)');")"
    check "[AFTER] each refusal left ONE audit row with its actor (13 refusals)" "13:13" "$(q "select count(*)||':'||count(actor_id) from public.audit_logs where action='moderator_conflict_refused';")"
    check "[AFTER] a refusal on a reply is recorded against the reply" "2" "$(q "select count(*) from public.audit_logs where action='moderator_conflict_refused' and entity='experience_response';")"
    check "[AFTER] no other audit row was written by the refusals" "13" "$(q "select count(*) from public.audit_logs;")"
  fi
  echo "--- an INDEPENDENT administrator is unaffected"
  exp "takes an experience into moderation" ok ok "$(start $ADM $(r 18))"
  exp "publishes one" ok ok "$(decide $ADM $(r 19))"
  exp "starts a dispute review" ok ok "$(review $ADM $(r 28))"
  exp "decides a dispute: upheld" ok ok "$(resolve $ADM $(r 29))"
  exp "publishes a reply" ok ok "$(modrep $ADM $(p 39))"
  exp "an administrator who manages an UNRELATED organization is not a party" ok ok "$(review $PO $(r 26))"
  echo "--- 'changed' and non-administrators"
  exp "'changed' as a dispute decision" ok invalid_resolution "$(resolve $ADM $(r 27) changed)"
  exp "a signed-in non-administrator is refused as before" not_authorized not_authorized "$(review $USR $(r 24))"
  exp "the plain subject cannot decide their own dispute, as before" not_authorized not_authorized "$(resolve $SUB $(r 21))"
  exp "anon cannot execute" 1 1 "$(as anon "select public.review_experience_dispute('$(r 24)');" | grep -c 'permission denied')"
}
M0="$(md5s)"; O0="$(others)"; P0="$(pols)"
check "pre-image of review_experience_dispute equals production (md5 read 2026-11-13)" "11f2b41ab345e3fda68c05b79257cf9b" "$(q "select md5(prosrc) from pg_proc where proname='review_experience_dispute';")"
check "pre-image of resolve_experience_dispute equals production" "e80304a4a0650d8edcb157dac83d7fa9" "$(q "select md5(prosrc) from pg_proc where proname='resolve_experience_dispute';")"
check "pre-image of moderate_experience_response equals production" "58016606e70cead83d15865ddabd4ee1" "$(q "select md5(prosrc) from pg_proc where proname='moderate_experience_response';")"
echo "BEFORE — the database lets a party administrator act"; suite
echo "APPLY"
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/up.sql" >/dev/null 2>"$LFD/err" && { echo "  PASS  migration applies"; pass=$((pass+1)); } || { echo "  FAIL  migration"; cat "$LFD/err"; fail=$((fail+1)); }
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/up.sql" >/dev/null 2>&1 && { echo "  PASS  re-applies idempotently"; pass=$((pass+1)); } || { echo "  FAIL  re-apply"; fail=$((fail+1)); }
check "exactly one overload of each of the five" "5" "$(q "select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ($FNS);")"
check "the five keep SECURITY DEFINER and their ACL (authenticated only)" "5" "$(q "select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ($FNS) and prosecdef and proacl::text ~ 'authenticated=X' and proacl::text !~ 'anon=' and proacl::text !~ '(^|[{,])=X';")"
check "the helper is internal: no client role may execute it" "f:f:f" "$(q "select has_function_privilege('anon','public.experience_moderator_is_party(uuid)','execute')||':'||has_function_privilege('authenticated','public.experience_moderator_is_party(uuid)','execute')||':'||(proacl::text ~ '(^|[{,])=X') from pg_proc where proname='experience_moderator_is_party';" | sed 's/false/f/g')"
check "a client calling the helper directly is refused" "1" "$(as $ADM "select public.experience_moderator_is_party('$(r 11)');" | grep -c 'permission denied')"
check "every other function body and ACL unchanged" "$O0" "$(others)"
check "every policy unchanged" "$P0" "$(pols)"
PHASE=AFTER; echo "AFTER — a party administrator is refused by the database"; suite
echo "ROLLBACK"
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/down.sql" >/dev/null 2>"$LFD/err" && { echo "  PASS  rollback applies"; pass=$((pass+1)); } || { echo "  FAIL  rollback"; cat "$LFD/err"; fail=$((fail+1)); }
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/down.sql" >/dev/null 2>&1 && { echo "  PASS  rollback re-runs cleanly"; pass=$((pass+1)); } || { echo "  FAIL  rollback re-run"; fail=$((fail+1)); }
check "rollback restores the five bodies (md5) and ACLs" "$M0" "$(md5s)"
check "the helper is gone" "0" "$(q "select count(*) from pg_proc where proname='experience_moderator_is_party';")"
check "audit rows written by refusals survive the rollback" "13" "$(q "select count(*) from public.audit_logs where action='moderator_conflict_refused';")"
reset_state; check "pre-image behaviour back: the party administrator acts again" "ok" "$(review $PA $(r 21))"
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/up.sql" >/dev/null 2>&1; reset_state
check "forward re-applies after rollback" "conflict_of_interest" "$(review $PA $(r 21))"
echo; echo "RESULT: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
