#!/bin/sh
# LabourMarket.ai VPS stage 1 (owner-approved 2026-10-17): private container start + RUNBOOK smoke tests.
# Touches nothing else: no DNS, nginx, SSL, cron. Prints no secret values.
SHA=c3cf5b799ad8477f9111fc254d616107bcd6444c
H=http://127.0.0.1:3200
echo "== 0. pre: agentai os =="
docker ps --format '{{.Names}} {{.Status}}' | grep -i agentai
echo "== 0. pre: config present (names only) =="
[ -f /root/lm-prod/env ] && echo "env: present mode=$(stat -c %a /root/lm-prod/env) lines=$(wc -l < /root/lm-prod/env)" || echo "env: MISSING"
[ -f /root/lm-prod/releases/$SHA/apps/web/server.js ] && echo "release: present" || echo "release: MISSING"
docker image inspect node:22-bookworm-slim >/dev/null 2>&1 && echo "image: present" || echo "image: MISSING"
echo "== 1. start =="
sh /root/lm-prod/bin/lm-prod-run.sh $SHA || { echo "START FAILED"; exit 1; }
echo "== 2. inspect =="
docker inspect labourmarket-prod --format 'cpus={{.HostConfig.NanoCpus}} mem={{.HostConfig.Memory}} swap={{.HostConfig.MemorySwap}} pids={{.HostConfig.PidsLimit}} capdrop={{.HostConfig.CapDrop}} secopt={{.HostConfig.SecurityOpt}} user={{.Config.User}} ports={{json .HostConfig.PortBindings}}'
ss -ltnp | grep ':3200 '
echo "== 3. wait for health (max 120 s) =="
i=0; while [ $i -lt 24 ]; do s=$(docker inspect --format '{{.State.Health.Status}}' labourmarket-prod 2>/dev/null); r=$(docker inspect --format '{{.State.Status}}' labourmarket-prod 2>/dev/null); echo "t=$((i*5))s state=$r health=$s"; [ "$s" = "healthy" ] && break; [ "$r" != "running" ] && break; i=$((i+1)); sleep 5; done
echo "== 4. smoke =="
curl -s -o /tmp/lm-h.json -w 'health http=%{http_code}\n' $H/api/health
grep -oE '"(build|deployEnv|status|ok|supabase[a-zA-Z]*)":("[^"]*"|[a-z0-9.]+)' /tmp/lm-h.json | head -8; rm -f /tmp/lm-h.json
for p in /lt /en /lt/login /lt/signup /lt/foo.bar /lt/dashboard/journal /lt/dashboard /api/cron/job-alerts; do printf '%s -> ' "$p"; curl -s -o /dev/null -w '%{http_code} redirect=%{redirect_url} %{time_total}s\n' $H$p; done
echo "== 5. oauth prm =="
curl -s $H/.well-known/oauth-protected-resource | grep -oE '"(resource|authorization_servers)":("[^"]*"|\[[^]]*\])'
echo "== 6. mcp without token =="
curl -s -o /dev/null -D - -X POST -H 'content-type: application/json' $H/api/mcp | grep -iE '^HTTP|^www-authenticate'
echo "== 7. resources =="
docker stats --no-stream --format '{{.Name}} cpu={{.CPUPerc}} mem={{.MemUsage}} pids={{.PIDs}}' labourmarket-prod
echo "log lines matching error/fatal/unhandled (last 300): $(docker logs --tail 300 labourmarket-prod 2>&1 | grep -ciE 'error|fatal|unhandled|ECONN' || true)"
docker logs --tail 300 labourmarket-prod 2>&1 | grep -iE 'error|fatal|unhandled|ECONN' | cut -c1-160 | head -5
echo "== 8. agentai os after =="
docker ps --format '{{.Names}} {{.Status}}' | grep -i agentai
head -1 /proc/pressure/cpu
free -m | sed -n '2p'
echo "== done =="
