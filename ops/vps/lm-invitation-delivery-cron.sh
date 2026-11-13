#!/bin/sh
# Install / verify / remove the invitation-delivery schedule on the LM VPS. OWNER-APPROVED STEP ONLY
# (runbook: docs/runbooks/INVITATION_DELIVERY_RELIABILITY.md). Its own cron file, so the existing
# /etc/cron.d/labourmarket bundle is never touched and removal cannot affect any other job.
#   sh lm-invitation-delivery-cron.sh --dry-run   verify only: files, secret, health, 401 without secret,
#                                                 one authenticated read-only `health` call; installs nothing
#   sh lm-invitation-delivery-cron.sh install     install /etc/cron.d/labourmarket-invitation-delivery
#   sh lm-invitation-delivery-cron.sh status      show it (changes nothing)
#   sh lm-invitation-delivery-cron.sh --remove    uninstall (rollback); the app and its data stay as they are
set -eu
DST=/etc/cron.d/labourmarket-invitation-delivery
RUN=/root/lm-prod/bin/lm-invitation-delivery-retry.sh
PORT=$(cat /root/lm-prod/active-port 2>/dev/null || echo 3200)
MODE="${1:-}"
case "$MODE" in
  --remove)
    rm -f "$DST"; echo "removed $DST (scheduled retry, bounce scan and owner alerts stopped)"; exit 0 ;;
  status)
    [ -f "$DST" ] && grep -v '^#' "$DST" || echo "not installed"; exit 0 ;;
  --dry-run|install) ;;
  *) echo "usage: sh lm-invitation-delivery-cron.sh --dry-run|install|status|--remove"; exit 2 ;;
esac
[ -f "$RUN" ] || { echo "STOP: $RUN missing (install -m 700 ops/vps/lm-invitation-delivery-retry.sh $RUN)"; exit 1; }
[ "$(stat -c %a /root/lm-prod/env)" = "600" ] || { echo "STOP: env not 600"; exit 1; }
grep -q '^CRON_SECRET=.\{32,\}' /root/lm-prod/env || { echo "STOP: CRON_SECRET missing or short"; exit 1; }
[ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/health")" = "200" ] || { echo "STOP: container health not 200"; exit 1; }
noauth=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Host: labourmarket.ai' "http://127.0.0.1:$PORT/api/cron/invitation-delivery-retry?mode=health")
[ "$noauth" = "401" ] || { echo "STOP: route without secret answered $noauth (expected 401) — is the new release deployed?"; exit 1; }
echo "route: unauthenticated=401 OK"
# One authenticated READ-ONLY call: the migration must be applied (503 needs_migration otherwise).
sh "$RUN" health && echo "health: authenticated 200 OK" || { echo "STOP: health call failed — see /root/lm-prod/invitation-delivery.log (migration applied?)"; exit 1; }
if [ "$MODE" = "--dry-run" ]; then echo "dry-run OK: nothing installed"; exit 0; fi
umask 022
cat > "$DST" <<CRON
# /etc/cron.d/labourmarket-invitation-delivery — installed by ops/vps/lm-invitation-delivery-cron.sh
# Remove with: sh lm-invitation-delivery-cron.sh --remove
SHELL=/bin/sh
*/10 * * * * root sh $RUN retry
7,37 * * * * root sh $RUN bounces
CRON
chmod 644 "$DST"
echo "installed $DST:"; grep -v '^#' "$DST"
