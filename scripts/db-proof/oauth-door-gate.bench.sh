#!/usr/bin/env bash
# Per-call cost of the pre-request (run after oauth-door-gate.sh). Local only.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=${PGPROOF_PORT:-54321}; N=${BENCH_N:-200000}
PSQL="psql -h 127.0.0.1 -p $PORT -U postgres -d doorgate -tA -q"
$PSQL -f "$HERE/oauth-door-gate.bench.sql" >/dev/null
CID=9a8b7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d; SUB=11111111-2222-4333-8444-555555555555; SID=aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee
META='"app_metadata":{"provider":"email","providers":["email"]},"aal":"aal1","amr":[{"method":"password","timestamp":1735815600}],"is_anonymous":false'
FIRST="{\"aud\":\"authenticated\",\"exp\":1735819200,\"iat\":1735815600,\"iss\":\"https://x.supabase.co/auth/v1\",\"sub\":\"$SUB\",\"email\":\"u@example.invalid\",\"phone\":\"\",$META,\"role\":\"authenticated\",\"user_metadata\":{\"full_name\":\"Example Person\",\"locale\":\"lt\"},\"session_id\":\"$SID\"}"
OAUTH="${FIRST%\}},\"client_id\":\"$CID\"}"
ANON='{"iss":"supabase","ref":"x","role":"anon","iat":1700000000,"exp":2000000000}'
H0='{"user-agent":"curl/8","accept":"*/*","x-forwarded-for":"203.0.113.9"}'
HP='{"user-agent":"node","accept":"*/*","x-lm-door":"v1.k1.751b74fc5462511e16655b582730336feea30903556869573bb81d95192e7cd6"}'
run() { $PSQL -c "set role authenticated; select public.bench(\$l\$$1\$l\$, \$c\$$2\$c\$, \$h\$$3\$h\$, '$4', $N, ${5:-false});" | tr -d '\r'; }
mode() { $PSQL -c "select door_gate_private.set_mode('$1')" >/dev/null; }
echo "claims sizes: first-party $(printf '%s' "$FIRST" | wc -c) B, oauth $(printf '%s' "$OAUTH" | wc -c) B; N=$N per case"
mode off
run "reference: empty plpgsql function call" "$FIRST" "$H0" noop
run "FAST PATH first-party JWT (any mode)" "$FIRST" "$H0" gate
run "FAST PATH anon key JWT (any mode)" "$ANON" "$H0" gate
run "comparison: same fast path as one SECDEF+SET fn" "$FIRST" "$H0" secdef
run "OAuth token, mode off" "$OAUTH" "$H0" gate
mode enforce
run "OAuth token + valid proof, mode enforce (allowed)" "$OAUTH" "$HP" gate
run "OAuth token, no proof, mode enforce (403 + LOG line)" "$OAUTH" "$H0" gate true
mode off
