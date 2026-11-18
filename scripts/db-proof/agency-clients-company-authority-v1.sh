#!/usr/bin/env bash
# agency_clients write commands resolve the company via owns_company — REAL
# PostgreSQL proof on a THROWAWAY local PG16 (no Docker, no Supabase).
# Schema = the REAL 20260713160000 migration (pre-image) + the forward
# migration; the prelude carries only external bits and the company gate.
#   initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#   pg_ctl -D $DIR/data -o "-p 54301 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=54301 bash scripts/db-proof/agency-clients-company-authority-v1.sh
# Uses database `acca` (dropped and rebuilt). Refuses non-local hosts.
set -uo pipefail
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; REPO="$(cd "$HERE/../.." && pwd)"
NAME=20261103140000_agency_clients_company_authority_v1
LFD="$(mktemp -d)"
for f in supabase/migrations/20260713160000_agency_clients_v1.sql supabase/migrations/$NAME.sql supabase/rollbacks/$NAME.down.sql; do tr -d '\r' < "$REPO/$f" > "$LFD/$(basename "$f")"; done
PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}; PGPROOF_PORT=${PGPROOF_PORT:-54301}
case "$PGPROOF_HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host"; exit 2;; esac
ADMINP="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d acca -tA -q"
$ADMINP -c "drop database if exists acca" -c "create database acca" >/dev/null 2>&1
for f in "$HERE/agency-clients-company-authority-v1.prelude.sql" "$LFD/20260713160000_agency_clients_v1.sql"; do
  $PSQL -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>"$LFD/err" || { echo "BASELINE FAILED: $f"; cat "$LFD/err"; exit 1; }
done
OA=a0000000-0000-0000-0000-000000000001  # profile owner of agency A
MA=a0000000-0000-0000-0000-000000000002  # active ADMIN member of agency A (not the profile owner)
MM=a0000000-0000-0000-0000-000000000003  # active MANAGER member of agency A
MR=a0000000-0000-0000-0000-000000000004  # REVOKED admin member of agency A
OB=a0000000-0000-0000-0000-000000000005  # owner of another organization B
OX=a0000000-0000-0000-0000-000000000006  # owns a plain company X1 (older) AND an agency X2 (newer)
UX=a0000000-0000-0000-0000-000000000007  # unrelated signed-in person
CA=b0000000-0000-0000-0000-00000000000a; CB=b0000000-0000-0000-0000-00000000000b
X1=b0000000-0000-0000-0000-0000000000c1; X2=b0000000-0000-0000-0000-0000000000c2
GA=c0000000-0000-0000-0000-00000000000a; GB=c0000000-0000-0000-0000-00000000000b
RMA=d0000000-0000-0000-0000-000000000002; ROA=d0000000-0000-0000-0000-000000000001; ROB=d0000000-0000-0000-0000-000000000005
K1=e0000000-0000-0000-0000-000000000001
reset_state() {
  $PSQL -v ON_ERROR_STOP=1 >/dev/null <<SQL || { echo "seed FAILED"; exit 1; }
truncate public.agency_clients, public.customer_requests, public.company_memberships, public.organizations, public.companies, public.profiles cascade;
insert into profiles (id) values ('$OA'),('$MA'),('$MM'),('$MR'),('$OB'),('$OX'),('$UX');
insert into companies (id, profile_id, company_type, created_at) values
  ('$CA','$OA','staffing_agency', now() - interval '3 days'), ('$CB','$OB','construction', now() - interval '3 days'),
  ('$X1','$OX','construction', now() - interval '2 days'), ('$X2','$OX','staffing_agency', now() - interval '1 day');
insert into organizations values ('$GA','$CA'),('$GB','$CB');
insert into company_memberships values ('$GA','$MA','active','admin',now()),('$GA','$MM','active','manager',now()),('$GA','$MR','revoked','admin',now());
insert into customer_requests (id, profile_id) values ('$RMA','$MA'),('$ROA','$OA'),('$ROB','$OB');
insert into agency_clients (id, company_id, name, created_by) values ('$K1','$CA','Client one','$OA');
SQL
}
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi; }
as() { local who="$1"; shift
  case "$who" in anon) pre="set role anon;";; none) pre="set role authenticated;";; *) pre="set role authenticated; set request.jwt.claim.sub='$who';";; esac
  printf '%s\n' "$pre $*" | $PSQL -f - 2>&1 | tr -d '\r' | sed 's/^psql:<stdin>:[0-9]*: //' | head -1; }
# outcome: ok:<company of the saved row> | the raised error code word
save() { local r; r="$(as "$1" "select public.save_agency_client_v1('${2:-New client}', null, null, null, ${3:-null});")"
  case "$r" in *ERROR*) printf '%s' "$r" | grep -oE 'not_company_owner|client_not_found|invalid_name|permission denied' | head -1;;
    *) $PSQL -c "select 'ok:'||right(company_id::text,2) from public.agency_clients where id='$r';" | tr -d '\r' | head -1;; esac; }
remove() { as "$1" "select public.remove_agency_client_v1('$K1');"; }
link() { local r; r="$(as "$1" "select public.set_demand_agency_client_v1('$2','$K1');")"
  case "$r" in *ERROR*) printf '%s' "$r" | grep -oE 'client_not_found|request_not_found|Not authenticated|permission denied' | head -1;; *) printf '%s' "$r";; esac; }
seen() { as "$1" "select count(*) from public.agency_clients where company_id='$CA';"; }
q() { $PSQL -c "$1" | tr -d '\r' | head -1; }
fnmd5() { q "select string_agg(proname||':'||md5(replace(prosrc, chr(13), ''))||':'||coalesce(proacl::text,'-')||':'||prosecdef, ',' order by proname) from pg_proc where proname in ('save_agency_client_v1','remove_agency_client_v1','set_demand_agency_client_v1');"; }
PHASE=BEFORE
# exp <label> <expect-BEFORE> <expect-AFTER> <actual>
exp() { local want="$3"; [ "$PHASE" = BEFORE ] && want="$2"; check "[$PHASE] $1" "$want" "$4"; }
suite() {
  reset_state
  exp "profile owner saves to their agency" "ok:0a" "ok:0a" "$(save $OA)"
  exp "ADMIN member saves to the agency they govern (the defect)" "not_company_owner" "ok:0a" "$(save $MA)"
  exp "MANAGER member still refused" "not_company_owner" "not_company_owner" "$(save $MM)"
  exp "REVOKED admin still refused" "not_company_owner" "not_company_owner" "$(save $MR)"
  exp "unrelated person still refused" "not_company_owner" "not_company_owner" "$(save $UX)"
  exp "no auth.uid() refused" "not_company_owner" "not_company_owner" "$(save none)"
  exp "anon cannot execute" "permission denied" "permission denied" "$(save anon)"
  exp "validation unchanged (owner, 1-char name)" "invalid_name" "invalid_name" "$(save $OA x)"
  exp "ADMIN member updates the agency's client" "not_company_owner" "ok:0a" "$(save $MA 'Renamed' "'$K1'")"
  exp "OTHER org owner cannot update agency A's client" "client_not_found" "client_not_found" "$(save $OB 'Hijack' "'$K1'")"
  exp "MANAGER cannot update agency A's client" "not_company_owner" "not_company_owner" "$(save $MM 'Renamed' "'$K1'")"
  ALL="$(q "select count(*) from public.agency_clients where company_id='$CA';")"
  exp "ADMIN member reads every agency client row (RLS, unchanged)" "$ALL" "$ALL" "$(seen $MA)"
  exp "OTHER org owner reads none (RLS, unchanged)" "0" "0" "$(seen $OB)"
  exp "OTHER org owner links own demand to agency A's client: refused" "client_not_found" "client_not_found" "$(link $OB $ROB)"
  exp "ADMIN member links THEIR demand to the agency's client" "client_not_found" "t" "$(link $MA $RMA)"
  exp "ADMIN member cannot link the OWNER's demand (demand stays profile-owned)" "client_not_found" "request_not_found" "$(link $MA $ROA)"
  exp "MANAGER cannot link" "client_not_found" "client_not_found" "$(link $MM $RMA)"
  exp "OTHER org owner cannot remove agency A's client" "f" "f" "$(remove $OB)"
  exp "MANAGER cannot remove" "f" "f" "$(remove $MM)"
  exp "ADMIN member removes the agency's client" "f" "t" "$(remove $MA)"
  reset_state
  exp "profile owner removes" "t" "t" "$(remove $OA)"
  if [ "$PHASE" = AFTER ]; then
    reset_state
    check "[AFTER] multi-company owner: new client goes to the AGENCY company (deterministic)" "ok:c2" "$(save $OX)"
    check "[AFTER] … every time" "ok:c2" "$(save $OX 'Second client')"
  fi
}
MD50="$(fnmd5)"
echo "BEFORE — 20260713160000 pre-image (profile owner only)"; suite
echo "APPLY"
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/$NAME.sql" >/dev/null 2>"$LFD/err" && { echo "  PASS  migration applies"; pass=$((pass+1)); } || { echo "  FAIL  migration"; cat "$LFD/err"; fail=$((fail+1)); }
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/$NAME.sql" >/dev/null 2>&1 && { echo "  PASS  re-applies idempotently"; pass=$((pass+1)); }
check "exactly one overload each" "1,1,1" "$(q "select string_agg(n::text, ',' order by p) from (select proname p, count(*) n from pg_proc where proname in ('save_agency_client_v1','remove_agency_client_v1','set_demand_agency_client_v1') group by 1) x;")"
check "ACL authenticated only, SECURITY DEFINER kept" "3" "$(q "select count(*) from pg_proc where proname in ('save_agency_client_v1','remove_agency_client_v1','set_demand_agency_client_v1') and prosecdef and proacl::text ~ 'authenticated=X' and proacl::text !~ 'anon=' and proacl::text !~ '(^|[{,])=X';")"
PHASE=AFTER; echo "AFTER — owns_company"; suite
echo "ROLLBACK"
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/$NAME.down.sql" >/dev/null 2>"$LFD/err" && { echo "  PASS  rollback applies"; pass=$((pass+1)); } || { echo "  FAIL  rollback"; cat "$LFD/err"; fail=$((fail+1)); }
check "rollback restores all three bodies (md5) and ACLs" "$MD50" "$(fnmd5)"
reset_state; check "pre-image behaviour back: admin member refused" "not_company_owner" "$(save $MA)"
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/$NAME.sql" >/dev/null 2>&1; check "forward re-applies after rollback" "ok:0a" "$(save $MA)"
rm -rf "$LFD"
echo; echo "RESULT: $pass pass, $fail fail"; [ $fail -eq 0 ]
