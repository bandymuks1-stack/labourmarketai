#!/usr/bin/env bash
# ============================================================================
# B3 — oauth_product_grants_v1: per-role proof on a THROWAWAY local PG16.
#
# initdb's a scratch cluster, loads the prelude (stubs documented there), a
# synthetic seed (no real identifiers), then runs the REAL migration and
# rollback files VERBATIM and measures, under real roles (`set local role
# authenticated|anon`) with real `request.jwt.claims`:
#   owner grant / change / revoke / re-grant; legacy revoke marker;
#   an OAuth-token caller cannot grant, revoke, read, or touch the table;
#   RLS isolation between two people; anon has nothing;
#   rollback refuses while active grants exist; re-apply works.
#
# Never point this at production or a shared stack.
# Usage: PGBIN="/c/Program Files/PostgreSQL/16/bin" bash oauth-product-grants-v1.sh
# ============================================================================
set -uo pipefail

PGBIN=${PGBIN:-"/c/Program Files/PostgreSQL/16/bin"}
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRAFT="$(cd "$HERE/../.." && pwd)"
MIGRATION="$DRAFT/supabase/migrations/20261026080400_oauth_product_grants_v1.sql"
ROLLBACK="$DRAFT/supabase/rollbacks/20261026080400_oauth_product_grants_v1.down.sql"
PRELUDE="$HERE/oauth-product-grants-v1.prelude.sql"
WORK=${WORK:-"$DRAFT/.tmp/pg16-b3"}
PORT=${PORT:-55433}

rm -rf "$WORK"; mkdir -p "$WORK"
"$PGBIN/initdb" -D "$WORK/data" -U postgres -A trust -E UTF8 >/dev/null || exit 2
"$PGBIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -c listen_addresses=127.0.0.1" -l "$WORK/pg.log" -w start >/dev/null || exit 2
cleanup() { "$PGBIN/pg_ctl" -D "$WORK/data" -m fast stop >/dev/null 2>&1; [ "${KEEP:-0}" = "1" ] || rm -rf "$WORK"; }
trap cleanup EXIT

PSQL=("$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -X -q -tA -v ON_ERROR_STOP=0)
q()    { "${PSQL[@]}" -c "$1" 2>&1; }
file() { "${PSQL[@]}" -v ON_ERROR_STOP=1 -f "$1" 2>&1; }

A='aaaaaaaa-0000-4000-8000-00000000000a'   # person A
B='bbbbbbbb-0000-4000-8000-00000000000b'   # person B
C='cccccccc-0000-4000-8000-00000000000c'   # person C (only a revoked consent)
X='11111111-1111-4111-8111-111111111111'   # client X (new connection)
Y='22222222-2222-4222-8222-222222222222'   # client Y (legacy consent of A)
Z='33333333-3333-4333-8333-333333333333'   # client Z (deleted)

own()   { echo "{\"sub\":\"$1\",\"role\":\"authenticated\",\"aud\":\"authenticated\"}"; }
oauth() { echo "{\"sub\":\"$1\",\"role\":\"authenticated\",\"aud\":\"authenticated\",\"client_id\":\"$2\"}"; }

# as ROLE CLAIMS SQL — one transaction under a real role with real claims.
as() {
  "${PSQL[@]}" 2>&1 <<SQL
begin;
set local role $1;
set local request.jwt.claims = '$2';
$3
commit;
SQL
}

PASS=0; FAIL=0
check() { # name, actual, expected-regex
  if printf '%s' "$2" | grep -Eq -- "$3"; then PASS=$((PASS+1)); printf 'PASS  %s\n' "$1";
  else FAIL=$((FAIL+1)); printf 'FAIL  %s\n      expected /%s/\n      got: %s\n' "$1" "$3" "$(printf '%s' "$2" | tr '\n' ' ' | cut -c1-300)"; fi
}

echo "== prelude"; file "$PRELUDE" || exit 3
echo "== seed"
q "insert into auth.users values ('$A'),('$B'),('$C');
   insert into public.profiles values ('$A'),('$B'),('$C');
   insert into auth.oauth_clients (id, client_name, deleted_at) values ('$X','Client X',null),('$Y','Client Y',null),('$Z','Client Z',now());
   insert into auth.oauth_consents (user_id, client_id, scopes, revoked_at) values
     ('$A','$Y','openid email offline_access',null),
     ('$C','$X','openid email',now());
   insert into auth.oauth_authorizations (authorization_id, client_id, user_id, redirect_uri, scope, status, expires_at) values
     ('authz-A-X-live','$X','$A','https://x.example/cb','openid email offline_access','pending', now()+interval '10 minutes'),
     ('authz-A-X-old', '$X','$A','https://x.example/cb','openid','pending', now()-interval '1 minute'),
     ('authz-B-X-live','$X','$B','https://x.example/cb','openid read:journal','pending', now()+interval '10 minutes'),
     ('authz-A-Y-auto','$Y','$A','https://y.example/cb','openid email','approved', now()+interval '10 minutes'),
     ('authz-A-Z-live','$Z','$A','https://z.example/cb','openid','pending', now()+interval '10 minutes');" >/dev/null

echo "== apply migration (as supa_postgres, verbatim)"
OUT=$("${PSQL[@]}" -v ON_ERROR_STOP=1 -c "set role supa_postgres" -f "$MIGRATION" 2>&1); RC=$?
check "migration applies cleanly" "rc=$RC $OUT" "^rc=0"

echo "== catalog"
check "table owned by supa_postgres, RLS on, not forced" \
  "$(q "select relowner::regrole, relrowsecurity, relforcerowsecurity from pg_class where oid='public.oauth_product_grants'::regclass")" \
  "^supa_postgres\|t\|f$"
check "authenticated has SELECT only on the table" \
  "$(q "select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants where table_name='oauth_product_grants' and grantee='authenticated'")" \
  "^SELECT$"
check "anon has no table privilege" \
  "$(q "select count(*) from information_schema.role_table_grants where table_name='oauth_product_grants' and grantee in ('anon','PUBLIC')")" "^0$"
check "no function is executable by anon or PUBLIC" \
  "$(q "select count(*) from pg_proc p where p.proname in ('grant_oauth_product_scopes_v1','revoke_oauth_product_grant_v1','read_oauth_product_grant_v1','oauth_door_product_grant_v1') and (has_function_privilege('anon', p.oid, 'execute'))")" "^0$"
check "all four are SECURITY DEFINER with pinned search_path, executable by authenticated" \
  "$(q "select count(*) from pg_proc p where p.proname in ('grant_oauth_product_scopes_v1','revoke_oauth_product_grant_v1','read_oauth_product_grant_v1','oauth_door_product_grant_v1') and p.prosecdef and array_to_string(p.proconfig, ',') like 'search_path=%' and has_function_privilege('authenticated', p.oid, 'execute')")" "^4$"
check "erasure registry row present" \
  "$(q "select treatment from public.privacy_erasure_registry_v3 where table_name='oauth_product_grants'")" "^allow_cascade$"

echo "== owner: first consent (consent screen, live authorization)"
check "A grants X read:profile + read:journal (dup + out of order normalised)" \
  "$(as authenticated "$(own $A)" "select public.grant_oauth_product_scopes_v1('$X', array['read:journal','read:profile','read:journal'], 'b3-2026-10', 'authz-A-X-live');")" \
  '"change": "granted".*"scopes": \["read:profile", "read:journal"\]'
check "A reads own grant through RLS" \
  "$(as authenticated "$(own $A)" "select client_id || ' ' || array_to_string(scopes, ',') from public.oauth_product_grants;")" \
  "^$X read:profile,read:journal$"
check "read function returns the registered client name" \
  "$(as authenticated "$(own $A)" "select client_name from public.read_oauth_product_grant_v1('$X');")" "^Client X$"
check "A read function: one active grant" \
  "$(as authenticated "$(own $A)" "select client_id || ' ' || has_grant from public.read_oauth_product_grant_v1('$X');")" "^$X true$"
check "A read function resolves the client of an auto-approved authorization (auto-skip path) and its requested scope" \
  "$(as authenticated "$(own $A)" "select client_id || '|' || has_grant || '|' || has_active_consent || '|' || requested_scope from public.read_oauth_product_grant_v1(null, 'authz-A-Y-auto');")" \
  "^$Y\|false\|true\|openid email$"
check "receipt written to audit_logs" \
  "$(q "select action || ' ' || (payload->>'change') || ' ' || (payload->>'via') from public.audit_logs where entity_id='$X' order by occurred_at")" \
  "^oauth_product_grant granted consent$"

echo "== owner: refusals on bad input / wrong context"
check "unknown scope refused" \
  "$(as authenticated "$(own $A)" "select public.grant_oauth_product_scopes_v1('$X', array['admin:all'], 'b3-2026-10', 'authz-A-X-live');")" "unknown_scope"
check "billing-shaped scope refused" \
  "$(as authenticated "$(own $A)" "select public.grant_oauth_product_scopes_v1('$X', array['billing'], 'b3-2026-10', 'authz-A-X-live');")" "unknown_scope"
check "null element refused" \
  "$(as authenticated "$(own $A)" "select public.grant_oauth_product_scopes_v1('$X', array[null]::text[], 'b3-2026-10', 'authz-A-X-live');")" "unknown_scope"
check "bad copy version refused" \
  "$(as authenticated "$(own $A)" "select public.grant_oauth_product_scopes_v1('$X', array['messages'], 'X;drop', 'authz-A-X-live');")" "invalid_copy_version"
check "expired authorization refused" \
  "$(as authenticated "$(own $A)" "select public.grant_oauth_product_scopes_v1('$X', array['messages'], 'b3-2026-10', 'authz-A-X-old');")" "no_consent_context"
check "B cannot use A's authorization" \
  "$(as authenticated "$(own $B)" "select public.grant_oauth_product_scopes_v1('$X', array['messages'], 'b3-2026-10', 'authz-A-X-live');")" "no_consent_context"
check "authorization for another client refused" \
  "$(as authenticated "$(own $A)" "select public.grant_oauth_product_scopes_v1('$Y', array['messages'], 'b3-2026-10', 'authz-A-X-live');")" "no_consent_context"
check "deleted client refused" \
  "$(as authenticated "$(own $A)" "select public.grant_oauth_product_scopes_v1('$Z', array['messages'], 'b3-2026-10', 'authz-A-Z-live');")" "unknown_client"
check "C (revoked GoTrue consent only) cannot 'change permissions' without a live authorization" \
  "$(as authenticated "$(own $C)" "select public.grant_oauth_product_scopes_v1('$X', array['messages'], 'b3-2026-10');")" "no_consent_context"
check "no session at all refused" \
  "$(as authenticated '{}' "select public.grant_oauth_product_scopes_v1('$X', array['messages'], 'b3-2026-10', 'authz-A-X-live');")" "not_authenticated"

echo "== OAuth-token caller (JWT carries client_id)"
check "OAuth caller cannot grant (even its own client, even for the same person)" \
  "$(as authenticated "$(oauth $A $X)" "select public.grant_oauth_product_scopes_v1('$X', array['write:journal'], 'b3-2026-10', 'authz-A-X-live');")" "oauth_client_caller_refused"
check "OAuth caller with an EMPTY client_id is still refused (presence, fail closed)" \
  "$(as authenticated "{\"sub\":\"$A\",\"role\":\"authenticated\",\"client_id\":\"\"}" "select public.grant_oauth_product_scopes_v1('$X', array['write:journal'], 'b3-2026-10', 'authz-A-X-live');")" "oauth_client_caller_refused"
check "OAuth caller cannot revoke" \
  "$(as authenticated "$(oauth $A $X)" "select public.revoke_oauth_product_grant_v1('$X');")" "oauth_client_caller_refused"
check "OAuth caller cannot use the read function" \
  "$(as authenticated "$(oauth $A $X)" "select count(*) from public.read_oauth_product_grant_v1();")" "oauth_client_caller_refused"
check "OAuth caller sees 0 rows of the table, even the person's own" \
  "$(as authenticated "$(oauth $A $Y)" "select count(*) from public.oauth_product_grants;")" "^0$"
check "OAuth caller cannot insert" \
  "$(as authenticated "$(oauth $A $X)" "insert into public.oauth_product_grants (user_id, client_id, scopes, consent_copy_version) values ('$A','$X',array['write:journal'],'x');")" "permission denied"
check "OAuth caller cannot update" \
  "$(as authenticated "$(oauth $A $X)" "update public.oauth_product_grants set scopes = array['write:journal'];")" "permission denied"
check "OAuth caller cannot delete" \
  "$(as authenticated "$(oauth $A $X)" "delete from public.oauth_product_grants;")" "permission denied"
check "door read: X token for A sees exactly A's grant for X" \
  "$(as authenticated "$(oauth $A $X)" "select public.oauth_door_product_grant_v1();")" \
  '"state": "granted".*"read:profile", "read:journal"'
check "door read: Y token for A (legacy, no row) = none" \
  "$(as authenticated "$(oauth $A $Y)" "select public.oauth_door_product_grant_v1();")" '"state": "none"'
check "door read: X token for B = none (B never granted X)" \
  "$(as authenticated "$(oauth $B $X)" "select public.oauth_door_product_grant_v1();")" '"state": "none"'
check "door read refuses a first-party session" \
  "$(as authenticated "$(own $A)" "select public.oauth_door_product_grant_v1();")" "not_an_oauth_caller"
check "door read refuses a malformed client_id" \
  "$(as authenticated "{\"sub\":\"$A\",\"role\":\"authenticated\",\"client_id\":\"not-a-uuid\"}" "select public.oauth_door_product_grant_v1();")" "not_an_oauth_caller"

echo "== RLS isolation between people"
as authenticated "$(own $B)" "select public.grant_oauth_product_scopes_v1('$X', array['messages'], 'b3-2026-10', 'authz-B-X-live');" >/dev/null
check "B sees only B's row" \
  "$(as authenticated "$(own $B)" "select string_agg(user_id::text, ',') from public.oauth_product_grants;")" "^$B$"
check "A sees only A's row" \
  "$(as authenticated "$(own $A)" "select string_agg(user_id::text, ',') from public.oauth_product_grants;")" "^$A$"
check "B's read function lists only B" \
  "$(as authenticated "$(own $B)" "select count(*) || ' ' || string_agg(array_to_string(scopes, ','), ';') from public.read_oauth_product_grant_v1();")" "^1 messages$"
check "B cannot read A's authorization through the read function (no oracle)" \
  "$(as authenticated "$(own $B)" "select count(*) from public.read_oauth_product_grant_v1(null, 'authz-A-Y-auto');")" "^0$"
check "B revoking a client B never consented to: no_such_grant" \
  "$(as authenticated "$(own $B)" "select public.revoke_oauth_product_grant_v1('$Y');")" "no_such_grant"
check "B cannot update A's row directly" \
  "$(as authenticated "$(own $B)" "update public.oauth_product_grants set revoked_at = now() where user_id = '$A';")" "permission denied"
check "anon: no table" \
  "$(as anon '{}' "select count(*) from public.oauth_product_grants;")" "permission denied"
check "anon: no function" \
  "$(as anon '{}' "select public.oauth_door_product_grant_v1();")" "permission denied"

echo "== Change permissions (Connected apps, needs an ACTIVE GoTrue consent)"
check "A cannot change X yet: GoTrue consent not recorded until approve" \
  "$(as authenticated "$(own $A)" "select public.grant_oauth_product_scopes_v1('$X', array['write:journal'], 'b3-2026-10');")" "no_consent_context"
q "insert into auth.oauth_consents (user_id, client_id, scopes) values ('$A','$X','openid email offline_access');" >/dev/null  # GoTrue's approve
check "after approve, A widens X to write:journal" \
  "$(as authenticated "$(own $A)" "select public.grant_oauth_product_scopes_v1('$X', array['write:journal','read:profile'], 'b3-2026-10');")" \
  '"change": "changed".*"read:profile", "write:journal"'
check "door sees the change on the next request (no new token)" \
  "$(as authenticated "$(oauth $A $X)" "select public.oauth_door_product_grant_v1();")" '"write:journal"'
check "A narrows X to nothing (allowed in DB: scoped to no action)" \
  "$(as authenticated "$(own $A)" "select public.grant_oauth_product_scopes_v1('$X', array[]::text[], 'b3-2026-10');")" '"scopes": \[\]'
check "door: granted with empty scopes" \
  "$(as authenticated "$(oauth $A $X)" "select public.oauth_door_product_grant_v1();")" '"state": "granted", "scopes": \[\]'

echo "== Revoke, idempotence, re-grant, legacy marker"
check "A revokes X" "$(as authenticated "$(own $A)" "select public.revoke_oauth_product_grant_v1('$X');")" '"change": "revoked"'
check "door: revoked (fails closed, never legacy)" \
  "$(as authenticated "$(oauth $A $X)" "select public.oauth_door_product_grant_v1();")" '"state": "revoked"'
check "second revoke is idempotent" "$(as authenticated "$(own $A)" "select public.revoke_oauth_product_grant_v1('$X');")" '"change": "already_revoked"'
check "re-grant through a live authorization = regranted" \
  "$(as authenticated "$(own $A)" "select public.grant_oauth_product_scopes_v1('$X', array['read:demand'], 'b3-2026-10', 'authz-A-X-live');")" '"change": "regranted"'
check "A revokes legacy client Y (no row): revoked marker written" \
  "$(as authenticated "$(own $A)" "select public.revoke_oauth_product_grant_v1('$Y');")" '"change": "revoked_legacy"'
check "door: Y is now revoked, not legacy" \
  "$(as authenticated "$(oauth $A $Y)" "select public.oauth_door_product_grant_v1();")" '"state": "revoked"'
check "every change left a receipt (X: granted, changed, changed, revoked, regranted; Y: revoked_legacy)" \
  "$(q "select string_agg(payload->>'change', ',' order by occurred_at, id) from public.audit_logs where actor_id='$A'")" \
  "^granted,changed,changed,revoked,regranted,revoked_legacy$"
check "receipts are immutable" \
  "$(q "update public.audit_logs set action='x' where actor_id='$A'")" "audit_log_immutable"

echo "== rollback (verbatim) and re-apply"
OUT=$(file "$ROLLBACK"); check "rollback REFUSES while active grants exist (widening guard)" "$OUT" "rollback refused"
check "table still there after refused rollback" "$(q "select to_regclass('public.oauth_product_grants') is not null")" "^t$"
OUT=$("${PSQL[@]}" -v ON_ERROR_STOP=1 -c "set lm.b3_rollback_ack = 'widening-accepted'" -f "$ROLLBACK" 2>&1); RC=$?
check "rollback with explicit acknowledgement succeeds" "rc=$RC" "^rc=0$"
check "objects gone" \
  "$(q "select (to_regclass('public.oauth_product_grants') is null) and not exists (select 1 from pg_proc where proname like '%oauth_product%' or proname = 'oauth_door_product_grant_v1')")" "^t$"
check "registry row removed" "$(q "select count(*) from public.privacy_erasure_registry_v3 where table_name='oauth_product_grants'")" "^0$"
check "receipts survive rollback" "$(q "select count(*) > 0 from public.audit_logs where action='oauth_product_grant'")" "^t$"
OUT=$("${PSQL[@]}" -v ON_ERROR_STOP=1 -c "set role supa_postgres" -f "$MIGRATION" 2>&1); RC=$?
check "re-apply after rollback" "rc=$RC $OUT" "^rc=0"
OUT=$(file "$ROLLBACK"); RC=$?
check "rollback on an empty table needs no acknowledgement" "rc=$RC $OUT" "^rc=0"

echo
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
