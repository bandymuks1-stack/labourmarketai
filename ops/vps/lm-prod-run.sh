#!/bin/sh
# LabourMarket.ai production container on the Agentai VPS. PREPARED 2026-10-17 — NOT RUN.
# Running this starts production; it needs the owner's launch approval.
#   sh lm-prod-run.sh <release-sha>      e.g. c3cf5b799ad8477f9111fc254d616107bcd6444c
# Release layout: /root/lm-prod/releases/<sha>/  (extracted standalone tgz, owned 1000:1000)
#                 /root/lm-prod/current -> releases/<sha>   (symlink; rollback = repoint + rerun)
#                 /root/lm-prod/env       (chmod 600, written by lm-prod-env-transfer.mjs, never printed)
# Port 3200, NOT 3000: the legacy /etc/nginx/conf.d/domains/labma.conf still proxies labourmarket.ai to
# 127.0.0.1:3000, so a container on :3000 would go live through it before the owner approves routing.
set -eu
SHA="${1:?usage: lm-prod-run.sh <release-sha>}"
case "$SHA" in *[!0-9a-f]*|"") echo "bad sha"; exit 1;; esac
REL="/root/lm-prod/releases/$SHA"
[ -f "$REL/apps/web/server.js" ] || { echo "release $SHA missing"; exit 1; }
[ "$(stat -c %a /root/lm-prod/env)" = "600" ] || { echo "env must be chmod 600"; exit 1; }
for k in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY CRON_SECRET CONVERSATION_TOKEN_SECRET VERCEL_ENV; do
  grep -q "^$k=." /root/lm-prod/env || { echo "env lacks $k"; exit 1; }
done
ln -sfn "releases/$SHA" /root/lm-prod/current
docker rm -f labourmarket-prod >/dev/null 2>&1 || true
docker run -d --name labourmarket-prod \
  --memory=768m --memory-swap=768m --cpus=0.5 --pids-limit=256 \
  --user 1000:1000 --cap-drop ALL --security-opt no-new-privileges \
  -p 127.0.0.1:3200:3000 \
  --restart=unless-stopped \
  --log-opt max-size=10m --log-opt max-file=3 \
  --env-file /root/lm-prod/env \
  -e VERCEL_GIT_COMMIT_SHA="$SHA" \
  -e NODE_OPTIONS=--max-old-space-size=512 \
  -v "$REL:/app" -w /app \
  --health-cmd 'node -e "fetch(\"http://127.0.0.1:3000/api/health\").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"' \
  --health-interval=30s --health-timeout=10s --health-retries=3 --health-start-period=60s \
  node:22-bookworm-slim node apps/web/server.js
echo "started labourmarket-prod @ $SHA on 127.0.0.1:3200"
