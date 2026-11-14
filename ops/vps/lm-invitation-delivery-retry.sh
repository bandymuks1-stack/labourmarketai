#!/bin/sh
# Retry TEMPORARY invitation delivery failures (already-authorised partner referral sends only) and
# report delivery health. Owner P0 2026-11-13.
#   sh lm-invitation-delivery-retry.sh health   # counters + alerts only: nothing rotated, nothing sent
#   sh lm-invitation-delivery-retry.sh retry    # at most 10 due rows, exponential backoff 10m / 1h / 6h
# Intended schedule (installed ONLY after the owner approves the deploy):
#   */10 * * * * sh /root/lm-prod/ops/lm-invitation-delivery-retry.sh retry >/dev/null 2>&1
# Calls POST /api/cron/invitation-delivery-retry on the local container. CRON_SECRET is read from
# /root/lm-prod/env into a 0600 header file under a 0700 dir (never in argv, logs or output). The answer
# is counts, reason codes and alert codes only — no ids, no addresses — appended to
# /root/lm-prod/invitation-delivery.log. Any alert is ALSO appended as one ALERT line to
# /root/lm-prod/invitation-delivery-alerts.log (the file an owner notifier reads).
set -eu
case "${1:-}" in health|retry) ;; *) echo "usage: sh lm-invitation-delivery-retry.sh health|retry"; exit 2;; esac
umask 077
# One run at a time, shared with the manual referral reprocess: both reissue tokens and send.
exec 9>/root/lm-prod/.referral-reprocess.lock
flock -n 9 || { echo "another referral send run is active — nothing done"; exit 3; }
D=$(mktemp -d /root/lm-prod/.delivery.XXXXXX)
trap 'rm -rf "$D"' EXIT INT TERM
printf 'Authorization: Bearer %s\n' "$(sed -n 's/^CRON_SECRET=//p' /root/lm-prod/env)" > "$D/h"
CODE=$(curl -s -o "$D/body" -w '%{http_code}' --max-time 300 -X POST -H @"$D/h" \
  -H 'Host: labourmarket.ai' -H 'X-Forwarded-Proto: https' \
  "http://127.0.0.1:$(cat /root/lm-prod/active-port 2>/dev/null || echo 3200)/api/cron/invitation-delivery-retry?mode=$1")
LINE="$(date -u +%FT%TZ) mode=$1 http=$CODE $(cat "$D/body")"
echo "$LINE" | tee -a /root/lm-prod/invitation-delivery.log
ALERTS=$(sed -n 's/.*"alerts":\[\([^]]*\)\].*/\1/p' "$D/body")
if [ "$CODE" != "200" ] || [ -n "$ALERTS" ]; then
  echo "$(date -u +%FT%TZ) ALERT mode=$1 http=$CODE alerts=[${ALERTS}]" >> /root/lm-prod/invitation-delivery-alerts.log
fi
[ "$CODE" = "200" ]
