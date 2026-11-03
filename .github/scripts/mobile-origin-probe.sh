#!/usr/bin/env bash
# ORIGIN PROBE — can THIS runner reach the API origin the mobile app talks to?
#
# Used by the signed-in mobile journeys (ios-signed-in.yml, android.yml) before
# the journey and again after a failed attempt, so "the app never reached the
# server" can be told apart from "the runner's network never reached it".
#
# Prints ONLY status codes, protocol versions and timings. No body, no header
# value except whether HTTP/3 is advertised, no token: the repository is public
# and both requests are unauthenticated.
#
#   GET  /api/health          expect 200
#   POST /api/mcp (no bearer) expect a fast 401 (identity refusal, JSON)
#
# Usage: mobile-origin-probe.sh <origin> <label>
# Never fails the job: it is evidence, not a gate.
set -u
ORIGIN="${1:-https://labourmarket.ai}"
LABEL="${2:-probe}"
TRIES="${PROBE_TRIES:-5}"
FMT='code=%{http_code} http=%{http_version} dns=%{time_namelookup}s connect=%{time_connect}s tls=%{time_appconnect}s first_byte=%{time_starttransfer}s total=%{time_total}s'

echo "::group::origin probe (${LABEL}) from $(uname -s) runner"
echo "utc=$(date -u +%Y-%m-%dT%H:%M:%SZ) origin_host=${ORIGIN#https://}"
for i in $(seq 1 "$TRIES"); do
  out=$(curl -sS -o /dev/null --max-time 20 -w "$FMT" "$ORIGIN/api/health" 2>&1)
  echo "health     try=$i rc=$? $out"
  out=$(curl -sS -o /dev/null --max-time 20 -X POST \
    -H 'Content-Type: application/json' -H 'Accept: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"profile_get","arguments":{}}}' \
    -w "$FMT" "$ORIGIN/api/mcp" 2>&1)
  echo "mcp-unauth try=$i rc=$? $out"
done
# iOS URLSession may move later requests to HTTP/3 (QUIC over UDP) when the
# origin advertises it; Android's OkHttp never does. Record whether it does,
# and whether this runner's curl can try it.
if curl -sSI --max-time 20 "$ORIGIN/api/health" 2>/dev/null | grep -qi '^alt-svc:.*h3'; then
  echo "alt-svc: h3 advertised"
else
  echo "alt-svc: h3 not advertised"
fi
if curl -V 2>/dev/null | grep -qi 'http3'; then
  for i in 1 2 3; do
    out=$(curl -sS -o /dev/null --max-time 20 --http3-only -w "$FMT" "$ORIGIN/api/health" 2>&1)
    echo "health-h3  try=$i rc=$? $out"
  done
else
  echo "health-h3  (this runner's curl has no HTTP/3)"
fi
echo "::endgroup::"
exit 0
