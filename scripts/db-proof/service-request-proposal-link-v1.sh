#!/usr/bin/env bash
# RED-1 (J-13): an accepted service request becomes a DRAFT proposal — REAL
# PostgreSQL proof on a THROWAWAY local PG16 (no Docker, no Supabase).
# Schema = the REAL 20260627121713 + 20260627145318 + 20260718190000 migrations
# (pre-image) + the forward migration; the prelude carries only external bits.
#   initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#   pg_ctl -D $DIR/data -o "-p 54301 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=54301 bash scripts/db-proof/service-request-proposal-link-v1.sh
# Uses database `srpl` (dropped and rebuilt). Refuses non-local hosts.
set -uo pipefail
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; REPO="$(cd "$HERE/../.." && pwd)"
NAME=20261102154500_service_request_proposal_link_v1
BASE="20260627121713_service_offerings 20260627145318_service_offering_requests 20260718190000_commercial_crm"
LFD="$(mktemp -d)"
for b in $BASE $NAME; do tr -d '\r' < "$REPO/supabase/migrations/$b.sql" > "$LFD/$b.sql"; done
tr -d '\r' < "$REPO/supabase/rollbacks/$NAME.down.sql" > "$LFD/$NAME.down.sql"
PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}; PGPROOF_PORT=${PGPROOF_PORT:-54301}
case "$PGPROOF_HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host"; exit 2;; esac
ADMINP="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d srpl -tA -q"
$ADMINP -c "drop database if exists srpl" -c "create database srpl" >/dev/null 2>&1
$PSQL -v ON_ERROR_STOP=1 -f "$HERE/service-request-proposal-link-v1.prelude.sql" >/dev/null 2>"$LFD/err" || { echo "BASELINE FAILED: prelude"; cat "$LFD/err"; exit 1; }
for b in $BASE; do
  $PSQL -v ON_ERROR_STOP=1 -f "$LFD/$b.sql" >/dev/null 2>"$LFD/err" || { echo "BASELINE FAILED: $b"; cat "$LFD/err"; exit 1; }
done
PR=a0000000-0000-0000-0000-000000000001  # provider (owns the offering)
BU=a0000000-0000-0000-0000-000000000002  # buyer
P2=a0000000-0000-0000-0000-000000000003  # another provider
UX=a0000000-0000-0000-0000-000000000004  # unrelated signed-in person
OF=b0000000-0000-0000-0000-000000000001
RA=c0000000-0000-0000-0000-00000000000a  # accepted request
RS=c0000000-0000-0000-0000-00000000000b  # still 'sent'
RD=c0000000-0000-0000-0000-00000000000d  # declined
RN=c0000000-0000-0000-0000-0000000000ff  # does not exist
reset_state() {
  $PSQL -v ON_ERROR_STOP=1 >/dev/null <<SQL || { echo "seed FAILED"; exit 1; }
truncate public.contracts, public.proposals, public.service_offering_requests, public.service_offerings, public.profiles cascade;
insert into profiles (id) values ('$PR'),('$BU'),('$P2'),('$UX');
insert into service_offerings (id, provider_id, title, status) values ('$OF','$PR','Facade works','active');
insert into service_offering_requests (id, offering_id, provider_id, buyer_id, status) values
  ('$RA','$OF','$PR','$BU','accepted'), ('$RS','$OF','$PR','$BU','sent'), ('$RD','$OF','$PR','$BU','declined');
SQL
}
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi; }
as() { local who="$1"; shift
  case "$who" in anon) pre="set role anon;";; none) pre="set role authenticated;";; *) pre="set role authenticated; set request.jwt.claim.sub='$who';";; esac
  printf '%s\n' "$pre $*" | $PSQL -f - 2>&1 | tr -d '\r' | sed 's/^psql:<stdin>:[0-9]*: //' | head -1; }
q() { $PSQL -c "$1" | tr -d '\r' | head -1; }
# outcome: ok | the raised error word
mk() { local r; r="$(as "$1" "select public.create_proposal_from_service_request_v1('$2', ${3:-'Offer'}, ${4:-150000});")"
  case "$r" in *ERROR*) printf '%s' "$r" | grep -oE 'request not found|request not accepted|title required|invalid amount|Not authenticated|permission denied|does not exist' | head -1;;
    *) printf 'ok';; esac; }
mkid() { as "$1" "select public.create_proposal_from_service_request_v1('$2', 'Offer', 150000);"; }
premd5() { q "select string_agg(proname||':'||md5(replace(prosrc, chr(13), ''))||':'||coalesce(proacl::text,'-'), ',' order by proname, oid) from pg_proc where pronamespace='public'::regnamespace and proname <> 'create_proposal_from_service_request_v1';"; }
polmd5() { q "select md5(string_agg(tablename||policyname||cmd||coalesce(qual,'')||coalesce(with_check,'')||roles::text, ',' order by tablename, policyname)) from pg_policies where schemaname='public';"; }
colmd5() { q "select md5(string_agg(table_name||column_name||data_type||is_nullable, ',' order by table_name, ordinal_position)) from information_schema.columns where table_schema='public';"; }
reset_state
F0="$(premd5)"; P0="$(polmd5)"; C0="$(colmd5)"
echo "BEFORE — no link exists"
check "the door does not exist" "does not exist" "$(mk $PR $RA)"
check "proposals has no link column" "0" "$(q "select count(*) from information_schema.columns where table_name='proposals' and column_name='service_offering_request_id';")"
echo "APPLY"
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/$NAME.sql" >/dev/null 2>"$LFD/err" && { echo "  PASS  migration applies"; pass=$((pass+1)); } || { echo "  FAIL  migration"; cat "$LFD/err"; fail=$((fail+1)); }
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/$NAME.sql" >/dev/null 2>&1 && { echo "  PASS  re-applies idempotently"; pass=$((pass+1)); } || { echo "  FAIL  re-apply"; fail=$((fail+1)); }
check "every pre-existing function body and ACL unchanged" "$F0" "$(premd5)"
check "every policy unchanged (none added, altered or dropped)" "$P0" "$(polmd5)"
check "exactly one overload" "1" "$(q "select count(*) from pg_proc where proname='create_proposal_from_service_request_v1';")"
check "ACL authenticated only, SECURITY DEFINER, pinned search_path" "1" "$(q "select count(*) from pg_proc where proname='create_proposal_from_service_request_v1' and prosecdef and proacl::text ~ 'authenticated=X' and proacl::text !~ 'anon=' and proacl::text !~ '(^|[{,])=X' and proconfig::text ~ 'search_path=public, pg_temp';")"
check "link column is nullable uuid" "uuid:YES" "$(q "select data_type||':'||is_nullable from information_schema.columns where table_name='proposals' and column_name='service_offering_request_id';")"
echo "AFTER — provider-only, accepted-only, draft, no duplicate"
check "anon cannot execute" "permission denied" "$(mk anon $RA)"
check "no auth.uid() refused" "Not authenticated" "$(mk none $RA)"
check "buyer refused (same answer as a missing request)" "request not found" "$(mk $BU $RA)"
check "another provider refused" "request not found" "$(mk $P2 $RA)"
check "unrelated person refused" "request not found" "$(mk $UX $RA)"
check "missing request: same answer (no existence oracle)" "request not found" "$(mk $PR $RN)"
check "request still 'sent' refused" "request not accepted" "$(mk $PR $RS)"
check "declined request refused" "request not accepted" "$(mk $PR $RD)"
check "blank title refused" "title required" "$(mk $PR $RA "'  '")"
check "negative amount refused" "invalid amount" "$(mk $PR $RA "'Offer'" -1)"
check "nothing written by any refusal" "0" "$(q "select count(*) from public.proposals;")"
check "provider of the accepted request: created" "ok" "$(mk $PR $RA)"
ID1="$(q "select id from public.proposals;")"
check "the row is a DRAFT owned by the provider, linked, EUR, amount kept" "draft:$PR:$RA:EUR:150000" "$(q "select status||':'||owner_id||':'||service_offering_request_id||':'||currency||':'||amount_cents from public.proposals where id='$ID1';")"
check "second call returns the SAME proposal (no duplicate)" "$ID1" "$(mkid $PR $RA)"
check "still one proposal" "1" "$(q "select count(*) from public.proposals;")"
check "provider reads their proposal (RLS, unchanged)" "1" "$(as $PR "select count(*) from public.proposals;")"
check "buyer does NOT see the proposal (RLS, unchanged)" "0" "$(as $BU "select count(*) from public.proposals;")"
check "the request itself is untouched" "accepted" "$(q "select status from public.service_offering_requests where id='$RA';")"
check "existing door still works without a link (create_proposal_v1)" "t" "$(as $PR "select public.create_proposal_v1('Plain offer', 100) is not null;")"
check "plain proposal carries no link" "1" "$(q "select count(*) from public.proposals where service_offering_request_id is null;")"
as $PR "select public.set_proposal_status_v1('$ID1','sent');" >/dev/null
check "open 'sent' proposal still returned, not duplicated" "$ID1" "$(mkid $PR $RA)"
as $PR "select public.set_proposal_status_v1('$ID1','withdrawn');" >/dev/null
check "after withdrawal a NEW draft may be made" "ok" "$(mk $PR $RA)"
check "… and it is a different row" "2" "$(q "select count(*) from public.proposals where service_offering_request_id='$RA';")"
LAST="$(q "select id from public.proposals where service_offering_request_id='$RA' and status='draft';")"
CT="$(as $PR "select public.create_contract_v1('Contract', 150000, '$LAST');")"
check "a contract made from the proposal reaches the request through proposal_id" "$RA" "$(q "select p.service_offering_request_id from public.contracts c join public.proposals p on p.id=c.proposal_id where c.id='$CT';")"
reset_state
( printf '%s\n' "set role authenticated; set request.jwt.claim.sub='$PR'; begin; select public.create_proposal_from_service_request_v1('$RA','Offer',1); select pg_sleep(1.5); commit;" | $PSQL -f - >/dev/null 2>&1 ) &
sleep 0.4; mkid $PR $RA >/dev/null; wait
check "two CONCURRENT calls still make one proposal (row lock)" "1" "$(q "select count(*) from public.proposals where service_offering_request_id='$RA';")"
reset_state; mk $PR $RA >/dev/null
$PSQL -c "delete from public.service_offering_requests where id='$RA';" >/dev/null
check "deleting the request keeps the proposal and clears the link (on delete set null)" "1:0" "$(q "select count(*)||':'||count(service_offering_request_id) from public.proposals;")"
echo "ROLLBACK"
reset_state; mk $PR $RA >/dev/null
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/$NAME.down.sql" >/dev/null 2>"$LFD/err"; RC=$?
check "rollback REFUSES while a proposal is linked" "refused" "$([ $RC -ne 0 ] && grep -q 'refusing to drop the link column' "$LFD/err" && echo refused || echo ran)"
check "the refused rollback changed nothing (function and column still there)" "1:1" "$(q "select (select count(*) from pg_proc where proname='create_proposal_from_service_request_v1')||':'||(select count(*) from information_schema.columns where table_name='proposals' and column_name='service_offering_request_id');")"
$PSQL -c "update public.proposals set service_offering_request_id = null;" >/dev/null
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/$NAME.down.sql" >/dev/null 2>"$LFD/err" && { echo "  PASS  rollback applies once unlinked"; pass=$((pass+1)); } || { echo "  FAIL  rollback"; cat "$LFD/err"; fail=$((fail+1)); }
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/$NAME.down.sql" >/dev/null 2>"$LFD/err" && { echo "  PASS  rollback re-runs cleanly (column already gone)"; pass=$((pass+1)); } || { echo "  FAIL  rollback re-run"; cat "$LFD/err"; fail=$((fail+1)); }
check "rollback restores the exact column set" "$C0" "$(colmd5)"
check "rollback leaves every other function and ACL as before" "$F0" "$(premd5)"
check "rollback leaves every policy as before" "$P0" "$(polmd5)"
check "the unlinked proposal survived the rollback" "1" "$(q "select count(*) from public.proposals;")"
check "the door is gone" "does not exist" "$(mk $PR $RA)"
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/$NAME.sql" >/dev/null 2>&1; check "forward re-applies after rollback" "ok" "$(mk $PR $RA)"
echo; echo "RESULT: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
