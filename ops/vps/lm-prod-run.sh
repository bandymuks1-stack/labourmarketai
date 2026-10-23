#!/bin/sh
# LabourMarket.ai production container on the Agentai VPS — zero-downtime start of a release.
#   sh lm-prod-run.sh <release-sha>
# Release layout: /root/lm-prod/releases/<sha>/  (extracted standalone tgz, owned 1000:1000)
#                 /root/lm-prod/current -> releases/<sha>   (symlink; rollback = rerun with an older sha)
#                 /root/lm-prod/env       (chmod 600, never printed)
#                 /root/lm-prod/active-port  (3200 or 3201: the port nginx serves; scripts read it)
#
# Blue/green (2026-10-19): the old way removed the running container and THEN started the new one,
# so every deploy gave ~10 s of 502s and every page open across the swap failed its next action.
# Now: start the new release on the OTHER port as labourmarket-prod-next, wait until it is healthy,
# point nginx at it (graceful reload: in-flight requests on the old one finish), then remove the
# old container and give the new one the canonical name. If the new release never becomes healthy,
# it is removed and the old one keeps serving — nothing changes for anyone.
# nginx reads the upstream from /etc/nginx/conf.d/domains/labourmarket-upstream.inc (one proxy_pass line).
set -eu
SHA="${1:?usage: lm-prod-run.sh <release-sha>}"
case "$SHA" in *[!0-9a-f]*|"") echo "bad sha"; exit 1;; esac
D=/root/lm-prod
REL="$D/releases/$SHA"
INC=/etc/nginx/conf.d/domains/labourmarket-upstream.inc
[ -f "$REL/apps/web/server.js" ] || { echo "release $SHA missing"; exit 1; }
[ "$(stat -c %a "$D/env")" = "600" ] || { echo "env must be chmod 600"; exit 1; }
for k in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY CRON_SECRET CONVERSATION_TOKEN_SECRET VERCEL_ENV; do
  grep -q "^$k=." "$D/env" || { echo "env lacks $k"; exit 1; }
done

# Keep a container's logs before it is removed: `docker rm` deletes its json log, and with it the only
# record of what the app printed ([perf] lines, request_error, client-error). 2026-10-23: the logs of both
# incident windows were destroyed by the next deploys' swaps. Root-only, gzip, newest 20 kept.
keep_logs() {
  docker inspect "$1" >/dev/null 2>&1 || return 0
  ( umask 077; mkdir -p "$D/logs"
    docker logs --timestamps "$1" 2>&1 | gzip -c > "$D/logs/$1-$(date -u +%Y%m%dT%H%M%SZ)-$2.log.gz" ) || true
  ls -1t "$D/logs"/*.log.gz 2>/dev/null | tail -n +21 | while read -r f; do rm -f "$f"; done
}

CUR_PORT=$(cat "$D/active-port" 2>/dev/null || echo 3200)
case "$CUR_PORT" in 3200) NEW_PORT=3201;; 3201) NEW_PORT=3200;; *) CUR_PORT=3200; NEW_PORT=3201;; esac

keep_logs labourmarket-prod-next leftover
docker rm -f labourmarket-prod-next >/dev/null 2>&1 || true
docker run -d --name labourmarket-prod-next \
  --memory=768m --memory-swap=768m --cpus=0.5 --pids-limit=256 \
  --user 1000:1000 --cap-drop ALL --security-opt no-new-privileges \
  -p "127.0.0.1:$NEW_PORT:3000" \
  --restart=unless-stopped \
  --log-opt max-size=10m --log-opt max-file=3 \
  --env-file "$D/env" \
  -e VERCEL_GIT_COMMIT_SHA="$SHA" \
  -e NODE_OPTIONS=--max-old-space-size=512 \
  -v "$REL:/app" -w /app \
  --health-cmd 'node -e "fetch(\"http://127.0.0.1:3000/api/health\").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"' \
  --health-interval=30s --health-timeout=10s --health-retries=3 --health-start-period=60s \
  node:22-bookworm-slim node apps/web/server.js >/dev/null

# wait until the new release answers (up to 3 minutes); the old one keeps serving meanwhile
i=0; ok=0
while [ $i -lt 36 ]; do
  [ "$(docker inspect --format '{{.State.Status}}' labourmarket-prod-next 2>/dev/null)" = "running" ] || break
  code=$(curl -s -o /dev/null -m 5 -w '%{http_code}' -H 'Host: labourmarket.ai' -H 'X-Forwarded-Proto: https' "http://127.0.0.1:$NEW_PORT/api/health" || true)
  [ "$code" = "200" ] && { ok=1; break; }
  i=$((i+1)); sleep 5
done
if [ "$ok" != 1 ]; then
  echo "new release $SHA did not become healthy on $NEW_PORT; the current one keeps serving"
  keep_logs labourmarket-prod-next unhealthy
  docker rm -f labourmarket-prod-next >/dev/null 2>&1 || true
  exit 1
fi

# switch nginx (graceful) — restore the previous upstream if the config does not validate
[ -f "$INC" ] || printf 'proxy_pass http://127.0.0.1:%s;\n' "$CUR_PORT" > "$INC"
cp "$INC" "$INC.prev" 2>/dev/null || true
printf 'proxy_pass http://127.0.0.1:%s;\n' "$NEW_PORT" > "$INC.new" && mv "$INC.new" "$INC"
if ! nginx -t >/dev/null 2>&1 || ! nginx -s reload; then
  [ -f "$INC.prev" ] && mv "$INC.prev" "$INC"
  docker rm -f labourmarket-prod-next >/dev/null 2>&1 || true
  echo "nginx switch failed; the current one keeps serving"; exit 1
fi
echo "$NEW_PORT" > "$D/active-port"
ln -sfn "releases/$SHA" "$D/current"

# let in-flight requests on the old container finish (MCP / AI / SSE may run up to the vhost's
# 120 s proxy timeout): wait until no connection to the old port is open, at most 125 s
sleep 2
w=0
while [ $w -lt 125 ] && [ "$(ss -Htn state established "( dport = :$CUR_PORT )" 2>/dev/null | wc -l)" -gt 0 ]; do
  sleep 1; w=$((w+1))
done
echo "old port $CUR_PORT drained after ${w}s"
docker stop -t 10 labourmarket-prod >/dev/null 2>&1 || true
keep_logs labourmarket-prod "retired-port$CUR_PORT"
docker rm -f labourmarket-prod >/dev/null 2>&1 || true
docker rename labourmarket-prod-next labourmarket-prod
echo "started labourmarket-prod @ $SHA on 127.0.0.1:$NEW_PORT (previous port $CUR_PORT retired)"
