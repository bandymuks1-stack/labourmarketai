#!/usr/bin/env bash
# ============================================================================
# B1b door gate — REAL PostgreSQL proof on a throwaway local PG16 cluster.
# No Docker, no Supabase, no production. Applies the real migration
# 20261026090000_oauth_door_gate_v1.sql (+ stub prelude) and simulates
# PostgREST's per-request transaction exactly:
#   BEGIN [READ ONLY]; SET LOCAL ROLE <jwt role>;
#   set_config('request.jwt.claims'|'request.headers'|'request.method'|'request.path', …, true);
#   SELECT door_gate.pre_request();     -- what pgrst.db_pre_request does
#
#   initdb -D $DIR/data -U postgres --auth=trust -E UTF8
#   pg_ctl -D $DIR/data -o "-p 54321 -c listen_addresses=127.0.0.1" -l $DIR/pg.log start
#   PGPROOF_PORT=54321 PGPROOF_LOG=$DIR/pg.log bash scripts/db-proof/oauth-door-gate.sh
# Uses database `doorgate` (dropped and rebuilt). Refuses non-local hosts.
# ============================================================================
set -uo pipefail
export PGCLIENTENCODING=UTF8
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
NAME=20261026090000_oauth_door_gate_v1
MIG="$REPO/supabase/migrations/$NAME.sql"; DOWN="$REPO/supabase/rollbacks/$NAME.down.sql"
PGPROOF_HOST=${PGPROOF_HOST:-127.0.0.1}; PGPROOF_PORT=${PGPROOF_PORT:-54321}; PGPROOF_LOG=${PGPROOF_LOG:-}
case "$PGPROOF_HOST" in 127.0.0.1|localhost) ;; *) echo "refusing non-local host $PGPROOF_HOST"; exit 2;; esac
ADMIN="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d postgres -tA -q"
PSQL="psql -h $PGPROOF_HOST -p $PGPROOF_PORT -U postgres -d doorgate -tA -q"

T="${TMPDIR:-/tmp}"
$ADMIN -c "drop database if exists doorgate" >/dev/null 2>&1
$ADMIN -c "drop role if exists authenticator" -c "drop role if exists anon" -c "drop role if exists authenticated" -c "drop role if exists service_role" >/dev/null 2>&1
$ADMIN -c "create database doorgate" >/dev/null
out=$($PSQL -v ON_ERROR_STOP=1 -f "$HERE/oauth-door-gate.prelude.sql" 2>&1 | tr -d '
')
[ -z "$out" ] || { echo "PRELUDE FAILED: $out"; exit 1; }

pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected [$2], got [$3])"; fail=$((fail+1)); fi; }
su() { $PSQL -c "$1" 2>&1 | tr -d '\r'; }

# ── migration ───────────────────────────────────────────────────────────────
out=$($PSQL -v ON_ERROR_STOP=1 -f "$MIG" 2>&1 | tr -d '\r')
check "migration applies cleanly" "" "$out"
check "authenticator wired to door_gate.pre_request" "pgrst.db_pre_request=door_gate.pre_request" \
  "$(su "select c from pg_db_role_setting s join pg_roles r on r.oid=s.setrole, unnest(s.setconfig) c where r.rolname='authenticator' and c like 'pgrst.%'")"
check "shipped mode is off" "off" "$(su "select mode from door_gate_private.settings")"
check "API roles cannot read door_gate_private" "false|false|false" \
  "$(su "select has_schema_privilege('anon','door_gate_private','USAGE')||'|'||has_schema_privilege('authenticated','door_gate_private','USAGE')||'|'||has_schema_privilege('service_role','door_gate_private','USAGE')")"
check "pre_request: invoker, no proconfig; oauth_gate: definer, search_path=''" "false|-|true|{\"search_path=\\\"\\\"\"}" \
  "$(su "select (select prosecdef||'|'||coalesce(proconfig::text,'-') from pg_proc where oid='door_gate.pre_request()'::regprocedure)||'|'||(select prosecdef||'|'||proconfig::text from pg_proc where oid='door_gate.oauth_gate()'::regprocedure)")"
check "EXECUTE grants (pre_request: 3 API roles; oauth_gate: authenticated only)" "true|true|true|false|true|false" \
  "$(su "select has_function_privilege('anon','door_gate.pre_request()','EXECUTE')||'|'||has_function_privilege('authenticated','door_gate.pre_request()','EXECUTE')||'|'||has_function_privilege('service_role','door_gate.pre_request()','EXECUTE')||'|'||has_function_privilege('anon','door_gate.oauth_gate()','EXECUTE')||'|'||has_function_privilege('authenticated','door_gate.oauth_gate()','EXECUTE')||'|'||has_function_privilege('anon','door_gate_private.set_mode(text)','EXECUTE')")"

# ── request simulator ───────────────────────────────────────────────────────
# req <role> <claims-json|-> <headers-json> <method> <path> <ro:1|0>
req() {
  local role="$1" claims="$2" headers="$3" method="$4" path="$5" ro="$6" begin="begin;"
  [ "$ro" = 1 ] && begin="begin read only;"
  local cset="select set_config('request.jwt.claims', \$c\$$claims\$c\$, true);"
  [ "$claims" = "-" ] && cset=""
  printf '%s\n' "\\set VERBOSITY default" "$begin" "set local role $role;" "$cset" \
    "select set_config('request.headers', \$h\$$headers\$h\$, true), set_config('request.method', '$method', true), set_config('request.path', '$path', true);" \
    "select door_gate.pre_request();" "select 'ALLOWED';" "commit;" \
    | $PSQL -f - 2>&1 | tr -d '\r' | grep -v '^$' | grep -E 'ALLOWED|ERROR' | head -1 \
    | sed -e 's/^psql:<stdin>:[0-9]*: //' -e 's/^ERROR:  {"code":"LM_OAUTH_DOOR".*/REFUSED_403/' -e 's/^ERROR: .*permission denied.*/PERMISSION_DENIED/'
}
hits() { su "select coalesce(string_agg(outcome||':'||method||':'||target||':'||hits, ',' order by outcome, method, target), '') from door_gate_private.oauth_direct_hits"; }

# ── vector shared with apps/web/lib/api/door-proof.test.ts ─────────────────
KEYHEX=000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f
CID=9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d; SUB=11111111-2222-4333-8444-555555555555
SID=aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee; IAT=1735815600; EXP=1735819200
PROOF_A=v1.k1.751b74fc5462511e16655b582730336feea30903556869573bb81d95192e7cd6   # node:crypto (door-proof.ts)
META='"app_metadata":{"provider":"email","providers":["email"]},"aal":"aal1","amr":[{"method":"password","timestamp":1735815600}],"is_anonymous":false'
OAUTH_A="{\"aud\":\"authenticated\",\"exp\":$EXP,\"iat\":$IAT,\"iss\":\"https://x.supabase.co/auth/v1\",\"sub\":\"$SUB\",\"email\":\"u@example.invalid\",\"phone\":\"\",$META,\"role\":\"authenticated\",\"user_metadata\":{},\"session_id\":\"$SID\",\"client_id\":\"$CID\"}"
# same session, refreshed token (new iat/exp) — replay target
OAUTH_REFRESHED="${OAUTH_A//$IAT,\"iss/$((IAT+3600)),\"iss}"; OAUTH_REFRESHED="${OAUTH_REFRESHED//\"exp\":$EXP/\"exp\":$((EXP+3600))}"
OAUTH_OTHER_SESSION="${OAUTH_A//$SID/bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee}"
OAUTH_NO_SESSION="${OAUTH_A//,\"session_id\":\"$SID\"/}"
OAUTH_NUM_CLIENT="${OAUTH_A//\"client_id\":\"$CID\"/\"client_id\":42}"
FIRST="{\"aud\":\"authenticated\",\"exp\":$EXP,\"iat\":$IAT,\"sub\":\"$SUB\",\"email\":\"u@example.invalid\",$META,\"role\":\"authenticated\",\"user_metadata\":{},\"session_id\":\"$SID\"}"
FIRST_META_TRAP="{\"aud\":\"authenticated\",\"exp\":$EXP,\"iat\":$IAT,\"sub\":\"$SUB\",$META,\"role\":\"authenticated\",\"user_metadata\":{\"client_id\":\"$CID\"},\"session_id\":\"$SID\"}"
ANON='{"iss":"supabase","ref":"x","role":"anon","iat":1700000000,"exp":2000000000}'
SERVICE='{"iss":"supabase","ref":"x","role":"service_role","iat":1700000000,"exp":2000000000}'
H0='{"user-agent":"curl/8","accept":"*/*"}'
hdr() { printf '{"user-agent":"node","x-lm-door":"%s"}' "$1"; }
FORGED="v1.k1.$(printf '%064d' 0)"

echo "--- 1. mode OFF (as shipped): nothing changes"
check "first-party GET"                     ALLOWED "$(req authenticated "$FIRST" "$H0" GET /workers 1)"
check "OAuth without proof GET"             ALLOWED "$(req authenticated "$OAUTH_A" "$H0" GET /workers 1)"
check "OAuth without proof POST rpc"        ALLOWED "$(req authenticated "$OAUTH_A" "$H0" POST /rpc/some_fn 0)"
check "anon / service_role / no claims"     "ALLOWED ALLOWED ALLOWED" "$(req anon "$ANON" "$H0" GET /t 1) $(req service_role "$SERVICE" "$H0" GET /t 1) $(req anon - "$H0" GET /t 1)"
check "no evidence rows in off"             "" "$(hits)"

echo "--- 2. enforce refused while no key exists"
check "set_mode('enforce') without a key fails" "ERROR:  refusing enforce: no active key (the MCP door would be refused)" \
  "$(su "select door_gate_private.set_mode('enforce')" | head -1)"
G=$(su "select door_gate_private.generate_key('k0')")
check "generate_key returns 64 hex once" "64" "$(printf '%s' "$G" | grep -cE '^[0-9a-f]{64}$' | sed 's/1/64/')"
check "key not stored as text anywhere readable by API roles" "f" "$(su "select has_table_privilege('authenticated','door_gate_private.keys','SELECT')")"
su "select door_gate_private.retire_key('k0')" >/dev/null
# test vector key installed directly (TEST ONLY — production uses generate_key)
su "insert into door_gate_private.keys(kid, secret) values ('k1', decode('$KEYHEX','hex'))" >/dev/null

echo "--- 3. mode LOG: nobody refused; evidence recorded"
su "select door_gate_private.set_mode('log')" >/dev/null
check "first-party GET (fast path)"         ALLOWED "$(req authenticated "$FIRST" "$H0" GET /workers 1)"
check "first-party with client_id INSIDE user_metadata (slow path, no log)" ALLOWED "$(req authenticated "$FIRST_META_TRAP" "$H0" POST /rpc/x 0)"
check "OAuth no proof GET (read-only tx) allowed" ALLOWED "$(req authenticated "$OAUTH_A" "$H0" GET /workers 1)"
check "OAuth no proof POST (rw tx) allowed"  ALLOWED "$(req authenticated "$OAUTH_A" "$H0" POST /rpc/accept_booking 0)"
check "OAuth valid proof POST allowed"       ALLOWED "$(req authenticated "$OAUTH_A" "$(hdr $PROOF_A)" POST /rpc/accept_booking 0)"
check "OAuth forged proof POST allowed (log)" ALLOWED "$(req authenticated "$OAUTH_A" "$(hdr $FORGED)" POST /rpc/accept_booking 0)"
check "OAuth no proof POST again (count++)"  ALLOWED "$(req authenticated "$OAUTH_A" "$H0" POST /rpc/accept_booking 0)"
check "evidence: rw only, no read-only row, counted, no user data" \
  "proof_mismatch:POST:/rpc/accept_booking:1,proof_missing:POST:/rpc/accept_booking:2,proof_ok:POST:/rpc/accept_booking:1" "$(hits)"
check "evidence columns hold no sub/session/token" "0" \
  "$(su "select count(*) from door_gate_private.oauth_direct_hits h where row_to_json(h)::text like '%$SUB%' or row_to_json(h)::text like '%$SID%' or row_to_json(h)::text like '%x-lm-door%'")"

echo "--- 4. mode ENFORCE"
su "select door_gate_private.set_mode('enforce')" >/dev/null
check "first-party GET"                      ALLOWED "$(req authenticated "$FIRST" "$H0" GET /workers 1)"
check "first-party POST rpc"                 ALLOWED "$(req authenticated "$FIRST" "$H0" POST /rpc/accept_booking 0)"
check "anon / service_role / no claims"      "ALLOWED ALLOWED ALLOWED" "$(req anon "$ANON" "$H0" GET /t 1) $(req service_role "$SERVICE" "$H0" GET /t 1) $(req anon - "$H0" GET /t 1)"
check "first-party with client_id in user_metadata" ALLOWED "$(req authenticated "$FIRST_META_TRAP" "$H0" GET /t 1)"
check "OAuth WITHOUT proof GET  -> 403"       REFUSED_403 "$(req authenticated "$OAUTH_A" "$H0" GET /workers 1)"
check "OAuth WITHOUT proof RPC  -> 403"       REFUSED_403 "$(req authenticated "$OAUTH_A" "$H0" POST /rpc/accept_booking 0)"
check "OAuth WITH valid proof GET"           ALLOWED "$(req authenticated "$OAUTH_A" "$(hdr $PROOF_A)" GET /workers 1)"
check "OAuth WITH valid proof RPC"           ALLOWED "$(req authenticated "$OAUTH_A" "$(hdr $PROOF_A)" POST /rpc/accept_booking 0)"
check "forged proof (zeros)        -> 403"   REFUSED_403 "$(req authenticated "$OAUTH_A" "$(hdr $FORGED)" GET /workers 1)"
check "replay on refreshed token   -> 403"   REFUSED_403 "$(req authenticated "$OAUTH_REFRESHED" "$(hdr $PROOF_A)" GET /workers 1)"
check "replay on another session   -> 403"   REFUSED_403 "$(req authenticated "$OAUTH_OTHER_SESSION" "$(hdr $PROOF_A)" GET /workers 1)"
check "unknown kid                 -> 403"   REFUSED_403 "$(req authenticated "$OAUTH_A" "$(hdr ${PROOF_A/v1.k1./v1.k9.})" GET /workers 1)"
check "retired kid k0              -> 403"   REFUSED_403 "$(req authenticated "$OAUTH_A" "$(hdr ${PROOF_A/v1.k1./v1.k0.})" GET /workers 1)"
check "uppercase hex / junk header -> 403"   "REFUSED_403 REFUSED_403" "$(req authenticated "$OAUTH_A" "$(hdr ${PROOF_A^^})" GET /w 1) $(req authenticated "$OAUTH_A" "$(hdr garbage)" GET /w 1)"
check "client_id not a string      -> 403"   REFUSED_403 "$(req authenticated "$OAUTH_NUM_CLIENT" "$(hdr $PROOF_A)" GET /w 1)"
check "token without session_id    -> 403"   REFUSED_403 "$(req authenticated "$OAUTH_NO_SESSION" "$(hdr $PROOF_A)" GET /w 1)"
check "client_id token under role anon -> permission denied (fail closed)" PERMISSION_DENIED "$(req anon "$OAUTH_A" "$(hdr $PROOF_A)" GET /w 1)"
check "error carries SQLSTATE PGRST + status 403" "PGRST|{\"status\":403,\"headers\":{}}" \
  "$(printf '%s\n' "begin read only;" "set local role authenticated;" "select set_config('request.jwt.claims', \$c\$$OAUTH_A\$c\$, true), set_config('request.headers','{}',true);" \
     "do \$\$ begin perform door_gate.pre_request(); exception when others then raise notice 'X%|%', sqlstate, (select 1)::text; end \$\$;" "rollback;" | $PSQL -f - 2>&1 | tr -d '\r' | grep -o 'XPGRST' | sed 's/X//')|$(printf '%s\n' "begin read only;" "set local role authenticated;" "select set_config('request.jwt.claims', \$c\$$OAUTH_A\$c\$, true), set_config('request.headers','{}',true);" \
     "do \$\$ declare d text; begin perform door_gate.pre_request(); exception when others then get stacked diagnostics d = pg_exception_detail; raise notice 'D=%', d; end \$\$;" "rollback;" | $PSQL -f - 2>&1 | tr -d '\r' | grep -o 'D=.*' | sed 's/^D=//')"
check "enforce leaves no evidence rows (403 rolls back)" "proof_mismatch:POST:/rpc/accept_booking:1,proof_missing:POST:/rpc/accept_booking:2,proof_ok:POST:/rpc/accept_booking:1" "$(hits)"

echo "--- 5. rotation"
G2=$(su "select door_gate_private.generate_key('k2')")
P2="v1.k2.$(node -e 'const c=require("crypto");process.stdout.write(c.createHmac("sha256",Buffer.from(process.argv[1],"hex")).update(process.argv[2],"utf8").digest("hex"))' "$G2" "lm-door/v1|$CID|$SUB|$SID|$IAT|$EXP")"
check "new key k2 accepted"                  ALLOWED "$(req authenticated "$OAUTH_A" "$(hdr $P2)" GET /w 1)"
check "old key k1 still accepted during overlap" ALLOWED "$(req authenticated "$OAUTH_A" "$(hdr $PROOF_A)" GET /w 1)"
check "third active key refused"             "ERROR:  two keys are already active; retire one first" "$(su "select door_gate_private.generate_key('k3')" | head -1)"
su "select door_gate_private.retire_key('k1')" >/dev/null
check "k1 refused after retire"              REFUSED_403 "$(req authenticated "$OAUTH_A" "$(hdr $PROOF_A)" GET /w 1)"
check "retired secret overwritten"           "f" "$(su "select secret = decode('$KEYHEX','hex') from door_gate_private.keys where kid='k1'")"

echo "--- 6. kill switch"
su "select door_gate_private.set_mode('off')" >/dev/null
check "mode off: OAuth without proof allowed again" ALLOWED "$(req authenticated "$OAUTH_A" "$H0" GET /w 1)"

echo "--- 7. retention + cap"
su "insert into door_gate_private.oauth_direct_hits(bucket,client_id,outcome,method,target,mode) values (now()-interval '31 days','$CID','proof_missing','GET','/old','log')" >/dev/null
check "prune_hits removes >30 day rows"      1 "$(su "select door_gate_private.prune_hits()")"
su "insert into door_gate_private.oauth_direct_hits(bucket,client_id,outcome,method,target,mode) select date_trunc('hour',now()),'$CID','proof_missing','POST','/t'||g,'log' from generate_series(1,1000) g" >/dev/null
su "select door_gate_private.set_mode('log')" >/dev/null
req authenticated "$OAUTH_A" "$H0" POST /rpc/new_target_beyond_cap 0 >/dev/null
check "per-hour cap: new key beyond 1000 rows not inserted" 0 "$(su "select count(*) from door_gate_private.oauth_direct_hits where target='/rpc/new_target_beyond_cap'")"
req authenticated "$OAUTH_A" "$H0" POST /t7 0 >/dev/null
check "per-hour cap: existing row still counted" 2 "$(su "select hits from door_gate_private.oauth_direct_hits where target='/t7' and bucket=date_trunc('hour',now())")"
su "delete from door_gate_private.oauth_direct_hits where target like '/t%'" >/dev/null
su "select door_gate_private.set_mode('off')" >/dev/null

echo "--- 8. log lines are privacy-safe"
if [ -n "$PGPROOF_LOG" ] && [ -f "$PGPROOF_LOG" ]; then
  L=$(grep -a 'lm_door_gate outcome=' "$PGPROOF_LOG" | tr -d '\r')
  check "log lines exist (read-only requests covered by RAISE LOG)" "yes" "$( [ -n "$(printf '%s' "$L" | grep 'outcome=proof_missing mode=log client=.* method=GET target=/workers')" ] && echo yes || echo no)"
  check "no sub / session_id / proof / email in log lines" "0" "$(printf '%s' "$L" | grep -c -e "$SUB" -e "$SID" -e "${PROOF_A#v1.k1.}" -e 'example.invalid')"
  echo "  sample: $(printf '%s\n' "$L" | grep -o 'lm_door_gate.*' | sort -u | head -4 | tr '\n' ';')"
else
  echo "  SKIP (PGPROOF_LOG not given)"
fi

echo "--- 9. up-migration refuses to clobber a foreign pre-request"
su "alter role authenticator set pgrst.db_pre_request = 'public.someone_elses'" >/dev/null
check "guard raises" "ERROR:  pgrst.db_pre_request is already set to public.someone_elses; refusing to replace it" \
  "$($PSQL -v ON_ERROR_STOP=1 -f "$MIG" 2>&1 | tr -d '\r' | sed 's/^psql:.*: ERROR:/ERROR:/' | grep -m1 '^ERROR')"
su "alter role authenticator set pgrst.db_pre_request = 'door_gate.pre_request'" >/dev/null

echo "--- 10. rollback (two parts) and re-apply"
PARTB_LINE=$(grep -n '^-- ─── PART B' "$DOWN" | cut -d: -f1)
head -n $((PARTB_LINE-1)) "$DOWN" > "$T/_partA.sql"; tail -n +"$PARTB_LINE" "$DOWN" > "$T/_partB.sql"
check "PART B refuses before PART A" "ERROR:  PART A has not run: PostgREST still calls door_gate.pre_request" \
  "$($PSQL -v ON_ERROR_STOP=1 -f "$T/_partB.sql" 2>&1 | tr -d '\r' | sed 's/^psql:.*: ERROR:/ERROR:/' | grep -m1 '^ERROR' | sed 's/^ERROR:  P/ERROR:  P/')"
check "PART A applies" "" "$($PSQL -v ON_ERROR_STOP=1 -f "$T/_partA.sql" 2>&1 | tr -d '\r')"
check "PART B applies" "" "$($PSQL -v ON_ERROR_STOP=1 -f "$T/_partB.sql" 2>&1 | tr -d '\r' | grep -v 'NOTICE:\|DETAIL:\|^drop cascades\|^$')"
check "authenticator setting removed, schemas gone" "0|0" \
  "$(su "select (select count(*) from pg_db_role_setting s join pg_roles r on r.oid=s.setrole, unnest(s.setconfig) c where r.rolname='authenticator' and c like 'pgrst.%')||'|'||(select count(*) from pg_namespace where nspname like 'door_gate%')")"
check "re-apply after rollback" "" "$($PSQL -v ON_ERROR_STOP=1 -f "$MIG" 2>&1 | tr -d '\r')"
rm -f "$T/_partA.sql" "$T/_partB.sql"

echo
echo "RESULT: $pass passed, $fail failed"
[ "$fail" = 0 ]
