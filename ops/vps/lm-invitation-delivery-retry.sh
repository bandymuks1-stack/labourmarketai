#!/bin/sh
# Invitation delivery: retry CONFIRMED-temporary failures of already-authorised partner referral sends,
# reconcile bounces, report health, alert the owner. Owner P0 2026-11-13 (+ corrections).
#   sh lm-invitation-delivery-retry.sh health   # counters + alerts only: nothing rotated, nothing sent
#   sh lm-invitation-delivery-retry.sh retry    # at most 10 due rows, backoff 10 min / 1 h / 6 h
#   sh lm-invitation-delivery-retry.sh bounces  # read-only mailbox scan; marks BOUNCED / DELIVERED_CONFIRMED
# Installed at /root/lm-prod/bin/ and scheduled by /etc/cron.d/labourmarket-invitation-delivery ONLY
# through ops/vps/lm-invitation-delivery-cron.sh after the owner approves (runbook:
# docs/runbooks/INVITATION_DELIVERY_RELIABILITY.md).
#
# CRON_SECRET is read from /root/lm-prod/env into a 0600 header file under a 0700 dir (never in argv,
# logs or output). Answers are counts, reason codes and alert codes only — no ids, no addresses — and
# are appended to /root/lm-prod/invitation-delivery.log.
#
# OWNER ALERTS: after every run the alert codes are compared with the last notified set
# (/root/lm-prod/.invitation-delivery-alert-state, 0600). The owner is notified (?mode=notify, the app
# computes the alerts itself and sends to its configured channels) when the set CHANGED, or the same
# non-empty set is older than 6 h. Every alert is also written as one ALERT line to
# /root/lm-prod/invitation-delivery-alerts.log.
set -eu
R="${LM_ROOT:-/root/lm-prod}"
case "${1:-}" in health|retry|bounces) ;; *) echo "usage: sh lm-invitation-delivery-retry.sh health|retry|bounces"; exit 2;; esac
umask 077
# One send run at a time, shared with the manual referral reprocess (both reissue tokens and send).
exec 9>$R/.referral-reprocess.lock
flock -n 9 || { echo "another referral send run is active — nothing done"; exit 3; }
D=$(mktemp -d $R/.delivery.XXXXXX)
trap 'rm -rf "$D"' EXIT INT TERM
printf 'Authorization: Bearer %s\n' "$(sed -n 's/^CRON_SECRET=//p' $R/env)" > "$D/h"
PORT=$(cat $R/active-port 2>/dev/null || echo 3200)
call() {
  curl -s -o "$D/body" -w '%{http_code}' --max-time 300 -X POST -H @"$D/h" \
    -H 'Host: labourmarket.ai' -H 'X-Forwarded-Proto: https' \
    "http://127.0.0.1:$PORT/api/cron/invitation-delivery-retry?mode=$1"
}
CODE=$(call "$1")
echo "$(date -u +%FT%TZ) mode=$1 http=$CODE $(cat "$D/body")" >> $R/invitation-delivery.log

# Alerts: from this answer (health / retry carry them); a bounces run asks health for the current set.
if [ "$1" = "bounces" ]; then
  HC=$(call health)
  [ "$HC" = "200" ] || HC_FAIL=1
fi
ALERTS=$(sed -n 's/.*"alerts":\[\([^]]*\)\].*/\1/p' "$D/body" | tr -d '"')
[ "$CODE" = "200" ] || ALERTS="${ALERTS:+$ALERTS,}http_$CODE"
[ "${HC_FAIL:-0}" = "1" ] && ALERTS="${ALERTS:+$ALERTS,}health_unavailable"
NOW=$(date -u +%s)
STATE=$R/.invitation-delivery-alert-state
LAST_SET=$(sed -n 1p "$STATE" 2>/dev/null || true)
LAST_AT=$(sed -n 2p "$STATE" 2>/dev/null || echo 0)
if [ -n "$ALERTS" ]; then
  echo "$(date -u +%FT%TZ) ALERT mode=$1 http=$CODE alerts=[$ALERTS]" >> $R/invitation-delivery-alerts.log
  if [ "$ALERTS" != "$LAST_SET" ] || [ $((NOW - ${LAST_AT:-0})) -ge 21600 ]; then
    NC=$(call notify)
    echo "$(date -u +%FT%TZ) NOTIFY http=$NC $(cat "$D/body")" >> $R/invitation-delivery-alerts.log
    [ "$NC" = "200" ] && printf '%s\n%s\n' "$ALERTS" "$NOW" > "$STATE"
  fi
elif [ -n "$LAST_SET" ]; then
  # All clear: forget the last set so a recurrence is notified at once.
  echo "$(date -u +%FT%TZ) CLEAR (was [$LAST_SET])" >> $R/invitation-delivery-alerts.log
  rm -f "$STATE"
fi
[ "$CODE" = "200" ]
