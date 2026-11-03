#!/usr/bin/env bash
# agency_pool_docs_readiness() on the live agency roster — REAL PostgreSQL
# proof on a THROWAWAY local PG16 (no Docker, no Supabase).
# Schema = the REAL s6 migration (pre-image) + the forward migration; the
# prelude carries only external bits and the canonical agency gate.
#   initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#   pg_ctl -D $DIR/data -o "-p 54301 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#   PGPROOF_HOST=127.0.0.1 PGPROOF_PORT=54301 bash scripts/db-proof/agency-pool-docs-readiness-live-roster-v1.sh
# Uses database `apdr` (dropped and rebuilt). Refuses non-local hosts.
set -uo pipefail
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; REPO="$(cd "$HERE/../.." && pwd)"
NAME=20261103130000_agency_pool_docs_readiness_live_roster_v1
LFD="$(mktemp -d)"
for f in supabase/migrations/20260611170000_s6_worker_docs_consent.sql supabase/migrations/$NAME.sql supabase/rollbacks/$NAME.down.sql; do tr -d '\r' < "$REPO/$f" > "$LFD/$(basename "$f")"; done
PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}; PGPROOF_PORT=${PGPROOF_PORT:-54301}
case "$PGPROOF_HOST" in 127.0.0.1|localhost|/*) ;; *) echo "refusing non-local host"; exit 2;; esac
ADMINP="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d apdr -tA -q"
$ADMINP -c "drop database if exists apdr" -c "create database apdr" >/dev/null 2>&1
for f in "$HERE/agency-pool-docs-readiness-live-roster-v1.prelude.sql" "$LFD/20260611170000_s6_worker_docs_consent.sql"; do
  $PSQL -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>"$LFD/err" || { echo "BASELINE FAILED: $f"; cat "$LFD/err"; exit 1; }
done
OA=a0000000-0000-0000-0000-000000000001  # owner of agency A (by type)
OB=a0000000-0000-0000-0000-000000000002  # owner of agency B (by declared capability)
MA=a0000000-0000-0000-0000-000000000003  # active ADMIN member of agency A (not the profile owner)
MM=a0000000-0000-0000-0000-000000000004  # active MANAGER member of agency A
OE=a0000000-0000-0000-0000-000000000005  # owner of a plain employer (not an agency)
UX=a0000000-0000-0000-0000-000000000006  # unrelated signed-in person
OL=a0000000-0000-0000-0000-000000000007  # legacy Model A agency owner
CA=b0000000-0000-0000-0000-00000000000a; CB=b0000000-0000-0000-0000-00000000000b; CE=b0000000-0000-0000-0000-00000000000e
GA=c0000000-0000-0000-0000-00000000000a; GB=c0000000-0000-0000-0000-00000000000b; GE=c0000000-0000-0000-0000-00000000000e
LA=d0000000-0000-0000-0000-00000000000a
W1=e0000000-0000-0000-0000-000000000001; W2=e0000000-0000-0000-0000-000000000002; W3=e0000000-0000-0000-0000-000000000003
W4=e0000000-0000-0000-0000-000000000004; W5=e0000000-0000-0000-0000-000000000005; W6=e0000000-0000-0000-0000-000000000006
$PSQL -v ON_ERROR_STOP=1 >/dev/null <<SQL || { echo "seed FAILED"; exit 1; }
insert into companies (id, profile_id, company_type) values ('$CA','$OA','staffing_agency'),('$CB','$OB','construction'),('$CE','$OE','construction');
insert into organizations (id, legacy_company_id) values ('$GA','$CA'),('$GB','$CB'),('$GE','$CE');
insert into organization_roles values ('$GB','workforce_provider'),('$GE','employer');
insert into company_memberships values ('$GA','$MA','active','admin',now()),('$GA','$MM','active','manager',now());
insert into workers (id) values ('$W1'),('$W2'),('$W3'),('$W4'),('$W5'),('$W6');
update workers set docs_aggregate_consent = true where id in ('$W1','$W3','$W4','$W5','$W6');
insert into company_workers values ('$CA','$W1','active'),('$CA','$W2','active'),('$CA','$W3','paused'),('$CB','$W4','active'),('$CE','$W5','active');
insert into agencies values ('$LA','$OL');
insert into agency_workers values ('$LA','$W6','active');
insert into worker_documents (worker_id, valid_until) values
  ('$W1', now() + interval '90 days'), ('$W1', now() + interval '10 days'), ('$W1', null),
  ('$W2', now() + interval '90 days'), ('$W4', now() + interval '90 days'), ('$W5', now() + interval '90 days'), ('$W6', now() - interval '1 day');
SQL
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi; }
has() { if printf '%s' "$3" | grep -qE "$2"; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (wanted /$2/, got [$3])"; fail=$((fail+1)); fi; }
as() { local who="$1"; shift
  case "$who" in anon) pre="set role anon;";; none) pre="set role authenticated;";; *) pre="set role authenticated; set request.jwt.claim.sub='$who';";; esac
  printf '%s\n' "$pre $*" | $PSQL -f - 2>&1 | tr -d '\r' | sed 's/^psql:<stdin>:[0-9]*: //'; }
# worker:total/valid/expiring/attention, keyed by the worker id's last digit
pool() { as "$1" "select coalesce(string_agg(right(worker_id::text, 1) || ':' || docs_total || '/' || docs_valid || '/' || docs_expiring || '/' || docs_attention, ',' order by worker_id), '') from public.agency_pool_docs_readiness();" | head -1; }
q() { $PSQL -c "$1" | tr -d '\r' | head -1; }
fnsig() { q "select pg_get_function_result(p.oid)||'|'||p.prosecdef||'|'||p.provolatile::text||'|'||p.proconfig::text||'|'||coalesce(p.proacl::text,'-') from pg_proc p where p.proname='agency_pool_docs_readiness';"; }
fnmd5() { q "select md5(replace(prosrc, chr(13), '')) from pg_proc where proname='agency_pool_docs_readiness';"; }
PHASE=BEFORE
# exp <label> <expect-BEFORE> <expect-AFTER> <actual>
exp() { local want="$3"; [ "$PHASE" = BEFORE ] && want="$2"; check "[$PHASE] $1" "$want" "$4"; }
suite() {
  exp "agency A (by type) owner: consented ACTIVE roster worker counted" "" "1:3/1/1/1" "$(pool $OA)"
  exp "agency B (by capability) owner: its own roster only" "" "4:1/1/0/0" "$(pool $OB)"
  exp "active ADMIN member of agency A sees agency A's pool" "" "1:3/1/1/1" "$(pool $MA)"
  exp "MANAGER member (not owner/admin) gets nothing (owns_company rule)" "" "" "$(pool $MM)"
  exp "plain employer (not an agency) gets nothing" "" "" "$(pool $OE)"
  exp "unrelated signed-in person gets nothing" "" "" "$(pool $UX)"
  exp "legacy Model A pool still counted (nothing narrows)" "6:1/0/0/1" "6:1/0/0/1" "$(pool $OL)"
  exp "NOT consented roster worker (W2) never appears" "0" "0" "$(pool $OA | grep -c '2:')"
  exp "paused roster worker (W3) not counted" "0" "0" "$(pool $OA | grep -c '3:')"
  exp "no cross-tenant: agency B never sees agency A's worker" "0" "0" "$(pool $OB | grep -c '1:')"
  has "[$PHASE] no auth.uid(): 42501 Not authenticated" 'Not authenticated' "$(as none "select * from public.agency_pool_docs_readiness();")"
  has "[$PHASE] anon cannot execute" 'permission denied' "$(as anon "select * from public.agency_pool_docs_readiness();")"
}
SIG0="$(fnsig)"; MD50="$(fnmd5)"
echo "BEFORE — s6 pre-image (retired pool only)"; suite
echo "APPLY"
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/$NAME.sql" >/dev/null 2>"$LFD/err" && { echo "  PASS  migration applies"; pass=$((pass+1)); } || { echo "  FAIL  migration"; cat "$LFD/err"; fail=$((fail+1)); }
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/$NAME.sql" >/dev/null 2>&1 && { echo "  PASS  re-applies idempotently"; pass=$((pass+1)); }
check "return columns / SECURITY DEFINER / STABLE / search_path / ACL unchanged" "$SIG0" "$(fnsig)"
check "exactly one overload" 1 "$(q "select count(*) from pg_proc where proname='agency_pool_docs_readiness';")"
PHASE=AFTER; echo "AFTER — live roster"; suite
echo "ROLLBACK"
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/$NAME.down.sql" >/dev/null 2>"$LFD/err" && { echo "  PASS  rollback applies"; pass=$((pass+1)); } || { echo "  FAIL  rollback"; cat "$LFD/err"; fail=$((fail+1)); }
check "rollback restores the s6 body (md5) and signature/ACL" "$MD50|$SIG0" "$(fnmd5)|$(fnsig)"
$PSQL -v ON_ERROR_STOP=1 -f "$LFD/$NAME.sql" >/dev/null 2>&1; check "forward re-applies after rollback" "1:3/1/1/1" "$(pool $OA)"
rm -rf "$LFD"
echo; echo "RESULT: $pass pass, $fail fail"; [ $fail -eq 0 ]
