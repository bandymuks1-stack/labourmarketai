#!/bin/sh
# LabourMarket.ai production smoke test — READ-ONLY (2026-11-22).
#
#   sh /root/lm-prod/bin/lm-smoke.sh               # check whatever /root/lm-prod/current points at
#   sh /root/lm-prod/bin/lm-smoke.sh <sha|prefix>  # also assert that this release is the one serving
#
# It never starts, stops, swaps or rolls back a container, and never edits env, nginx, cron or DNS:
# starting a release is lm-prod-run.sh's job alone. (The 2026-10-17 stage-1 version carried a
# hard-coded sha and STARTED it, so running it later as a "smoke test" tried to bring back a
# release that no longer existed.) Prints no secret values. Exit 0 = every check passed.
set -u
D=/root/lm-prod
FAIL=0
fail() { echo "FAIL: $*"; FAIL=1; }

CUR=$(readlink "$D/current" 2>/dev/null | sed 's#.*/##')
PORT=$(cat "$D/active-port" 2>/dev/null || echo 3200)
H=http://127.0.0.1:$PORT
echo "== 0. release =="
echo "current=${CUR:-NONE} active-port=$PORT"
[ -n "$CUR" ] && [ -f "$D/releases/$CUR/apps/web/server.js" ] || fail "current release missing on disk"
if [ $# -ge 1 ]; then
  case "$CUR" in "$1"*) echo "expected release: matches $1";; *) fail "expected release $1, current is ${CUR:-NONE}";; esac
fi

echo "== 1. container =="
S=$(docker inspect --format '{{.State.Status}} health={{.State.Health.Status}} restarts={{.RestartCount}} started={{.State.StartedAt}}' labourmarket-prod 2>/dev/null) || S=""
echo "${S:-labourmarket-prod NOT FOUND}"
case "$S" in "running health=healthy"*) ;; *) fail "container not running+healthy";; esac
docker inspect labourmarket-prod --format 'cpus={{.HostConfig.NanoCpus}} mem={{.HostConfig.Memory}} pids={{.HostConfig.PidsLimit}} capdrop={{.HostConfig.CapDrop}} secopt={{.HostConfig.SecurityOpt}} user={{.Config.User}} ports={{json .HostConfig.PortBindings}}' 2>/dev/null

echo "== 2. health: the serving build is the current release =="
SHORT=$(printf '%s' "$CUR" | cut -c1-8)
for U in "$H/api/health" "https://labourmarket.ai/api/health"; do
  J=$(curl -s -m 15 "$U"); B=$(printf '%s' "$J" | sed -nE 's/.*"build":"([0-9a-f]+)".*/\1/p'); OK=$(printf '%s' "$J" | sed -nE 's/^\{"ok":(true|false).*/\1/p')
  echo "$U ok=${OK:-?} build=${B:-?}"
  [ "$OK" = true ] || fail "$U not ok"
  [ -n "$SHORT" ] && [ "$B" = "$SHORT" ] || fail "$U serves build ${B:-?}, current release is ${SHORT:-?}"
done

echo "== 3. routes (local origin) =="
for p in /lt /en /lt/auth/login /lt/jobs /lt/dashboard /lt/dashboard/journal; do
  c=$(curl -s -o /dev/null -m 20 -w '%{http_code}' "$H$p"); t=$(curl -s -o /dev/null -m 20 -w '%{time_total}' "$H$p")
  echo "$p -> $c ${t}s"
  case "$c" in 200|307|308) ;; *) fail "$p answered $c";; esac
done

echo "== 4. oauth prm + mcp without token =="
curl -s -m 15 "$H/.well-known/oauth-protected-resource" | grep -oE '"(resource|authorization_servers)":("[^"]*"|\[[^]]*\])' || fail "no OAuth PRM"
M=$(curl -s -o /dev/null -m 15 -w '%{http_code}' -X POST -H 'content-type: application/json' "$H/api/mcp")
echo "mcp without token -> $M"; [ "$M" = 401 ] || fail "MCP without token answered $M (expected 401)"

echo "== 5. resources and logs =="
docker stats --no-stream --format '{{.Name}} cpu={{.CPUPerc}} mem={{.MemUsage}} pids={{.PIDs}}' labourmarket-prod
echo "log lines matching error/fatal/unhandled (last 300): $(docker logs --tail 300 labourmarket-prod 2>&1 | grep -ciE 'error|fatal|unhandled|ECONN' || true)"
docker logs --tail 300 labourmarket-prod 2>&1 | grep -iE 'error|fatal|unhandled|ECONN' | cut -c1-160 | head -5

echo "== 6. neighbours (Agentai OS has priority) =="
docker ps --format '{{.Names}} {{.Status}}' | grep -i agentai
U=$(docker ps --format '{{.Names}} {{.Status}}' | grep -i agentai | grep -vc healthy || true)
[ "$U" = 0 ] || fail "$U Agentai container(s) not healthy"
head -1 /proc/pressure/cpu
free -m | sed -n '2p'

[ "$FAIL" = 0 ] && echo "== SMOKE OK ($SHORT) ==" || echo "== SMOKE FAILED =="
exit "$FAIL"
