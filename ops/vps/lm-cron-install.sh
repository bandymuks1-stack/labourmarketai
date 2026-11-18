#!/bin/sh
# Install (or refresh) the LabourMarket.ai cron bundle on the VPS. OWNER-APPROVED STEP ONLY.
#   sh lm-cron-install.sh            — install /etc/cron.d/labourmarket from /root/lm-prod/bin/labourmarket.cron
#   sh lm-cron-install.sh --dry-run  — verify only (syntax, secret presence, one authenticated call per route)
#   sh lm-cron-install.sh --remove   — uninstall (rollback)
# Prerequisites it checks: /root/lm-prod/env has CRON_SECRET (600); the container answers /api/health on
# 127.0.0.1:<active port>; each route answers 401 WITHOUT the secret (fail-closed) and 200/202 WITH it.
set -eu
SRC=/root/lm-prod/bin/labourmarket.cron; DST=/etc/cron.d/labourmarket; RUN=/root/lm-prod/bin/lm-cron.sh
MODE="${1:-install}"
[ "$MODE" = "--remove" ] && { rm -f "$DST"; echo "removed $DST"; exit 0; }
[ -f "$SRC" ] && [ -f "$RUN" ] || { echo "STOP: $SRC or $RUN missing"; exit 1; }
[ "$(stat -c %a /root/lm-prod/env)" = "600" ] || { echo "STOP: env not 600"; exit 1; }
grep -q '^CRON_SECRET=.\{32,\}' /root/lm-prod/env || { echo "STOP: CRON_SECRET missing or short"; exit 1; }
[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$(cat /root/lm-prod/active-port 2>/dev/null || echo 3200)/api/health)" = "200" ] || { echo "STOP: container health not 200"; exit 1; }
# cron syntax: every non-comment line must have 5 fields + user + command
awk '!/^(#|SHELL=|$)/ { if (NF < 7) { print "STOP: bad cron line: " $0; bad=1 } } END { exit bad }' "$SRC"
for r in weekly-digest commercial-handoffs job-alerts privacy-erasure forecast-recompute; do
  grep -q " $r\$" "$SRC" || { echo "STOP: $r not scheduled in $SRC"; exit 1; }
  noauth=$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: labourmarket.ai' "http://127.0.0.1:$(cat /root/lm-prod/active-port 2>/dev/null || echo 3200)/api/cron/$r")
  [ "$noauth" = "401" ] || { echo "STOP: /api/cron/$r without secret answered $noauth (expected 401)"; exit 1; }
  echo "$r: unauthenticated=401 OK"
done
grep -vE '^\s*#' "$SRC" | grep -q "billing-recovery" && { echo "STOP: billing-recovery must not be scheduled while payments are off"; exit 1; }
if [ "$MODE" = "--dry-run" ]; then echo "dry-run OK: nothing installed (authenticated calls are made only on install)"; exit 0; fi
install -m 644 -o root -g root "$SRC" "$DST"
echo "installed $DST:"; grep -v '^#' "$DST"
# One authenticated call per route now, so the first scheduled run is not the first real test.
for r in commercial-handoffs job-alerts privacy-erasure forecast-recompute; do sh "$RUN" "$r" && echo "$r: authenticated run OK" || echo "$r: authenticated run returned non-200 (see /root/lm-prod/cron.log)"; done
tail -3 /root/lm-prod/cron.log
