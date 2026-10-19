#!/bin/sh
# STAGE 2B — nginx cutover for labourmarket.ai (OWNER-GATED; do not run without explicit approval).
#   sh lm-cutover.sh activate   : backs up labma.conf, installs the new vhost, nginx -t, reload, local TLS test
#   sh lm-cutover.sh rollback   : removes the new vhost, restores labma.conf, nginx -t, reload
# DNS and cron are NOT touched by this script. Agentai OS vhosts are not touched (only the LabourMarket files).
set -eu
MODE="${1:?usage: lm-cutover.sh activate|rollback}"
SSL=/etc/ssl/labourmarket; NEW=/etc/nginx/conf.d/domains/labourmarket.conf; OLD=/etc/nginx/conf.d/domains/labma.conf
BK=/root/labma-decommission-backup-20261016; SRC=/root/lm-prod/staged/labourmarket.ai.nginx.conf
agentai_ok() { docker ps --format '{{.Names}} {{.Status}}' | grep -ci 'agentai.*healthy'; }
case "$MODE" in
activate)
  [ -f "$SSL/origin.pem" ] && [ -f "$SSL/origin.key" ] || { echo "STOP: origin cert/key missing"; exit 1; }
  [ "$(openssl x509 -in "$SSL/origin.pem" -noout -pubkey)" = "$(openssl rsa -in "$SSL/origin.key" -pubout 2>/dev/null)" ] || { echo "STOP: cert/key mismatch"; exit 1; }
  [ "$(docker inspect --format '{{.State.Health.Status}}' labourmarket-prod)" = "healthy" ] || { echo "STOP: container not healthy"; exit 1; }
  echo "agentai healthy before: $(agentai_ok)"
  mkdir -p "$BK"; [ -f "$OLD" ] && mv "$OLD" "$BK/labma.conf.nginx.$(date -u +%Y%m%dT%H%M%SZ)" && echo "labma.conf moved to $BK"
  install -m 644 "$SRC" "$NEW"
  if nginx -t 2>&1 | sed 's/^/   /' && nginx -t >/dev/null 2>&1; then systemctl reload nginx; echo "nginx reloaded"; else
    echo "nginx -t FAILED: restoring"; rm -f "$NEW"; mv "$(ls -t "$BK"/labma.conf.nginx.* | head -1)" "$OLD"; nginx -t && systemctl reload nginx; exit 1; fi
  sleep 2
  echo "local TLS test (origin, before DNS):"
  for p in /api/health /lt /.well-known/oauth-protected-resource; do printf '   %s -> ' "$p"; curl -s -k --resolve labourmarket.ai:443:127.0.0.1 -o /dev/null -w '%{http_code} tls=%{ssl_verify_result}\n' "https://labourmarket.ai$p"; done
  echo "   prm: $(curl -s -k --resolve labourmarket.ai:443:127.0.0.1 https://labourmarket.ai/.well-known/oauth-protected-resource | grep -oE '"resource":"[^"]*"')"
  echo "   http->https: $(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --resolve labourmarket.ai:80:127.0.0.1 http://labourmarket.ai/lt)"
  echo "   cron blocked from outside: $(curl -s -k --resolve labourmarket.ai:443:127.0.0.1 -o /dev/null -w '%{http_code}' https://labourmarket.ai/api/cron/job-alerts)"
  echo "   cert served: $(echo | openssl s_client -connect 127.0.0.1:443 -servername labourmarket.ai 2>/dev/null | openssl x509 -noout -issuer -enddate | tr '\n' ' ')"
  echo "agentai healthy after: $(agentai_ok)"; echo "ACTIVATED (DNS still on Vercel; nothing public changed yet)";;
rollback)
  rm -f "$NEW"; L=$(ls -t "$BK"/labma.conf.nginx.* 2>/dev/null | head -1); [ -n "$L" ] && cp "$L" "$OLD" && echo "labma.conf restored from $L"
  nginx -t && systemctl reload nginx && echo "ROLLED BACK: nginx reloaded with legacy config"; echo "agentai healthy: $(agentai_ok)";;
*) echo "usage: lm-cutover.sh activate|rollback"; exit 1;;
esac
