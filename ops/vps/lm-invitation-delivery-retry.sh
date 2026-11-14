#!/bin/sh
# Invitation delivery: retry CONFIRMED-temporary failures of already-authorised partner referral sends,
# reconcile bounces, report health, alert the owner. Owner P0 2026-11-13 (+ corrections, + 2026-11-14).
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
# OWNER ALERTS — through the EXISTING Agentai OS owner channel (owner 2026-11-14). LabourMarket.ai
# does not send to Telegram itself: it DESCRIBES the event as one agentai-project-event/v1 file in the
# Agentai OS project-event inbox on this host (AGENTAI_PROJECT_EVENT_DIR), which the operator loop
# ingests and delivers with the one Agentai OS bot. Codes and counts only — no ids, no addresses.
#
# ONE NOTIFICATION PER UNIQUE EVENT. The ledger /root/lm-prod/.invitation-delivery-events (0600) holds
# "code count" for every alert currently open:
#   * episode alerts (repeated_failures, configuration_failure, stuck_reservation, low_success_rate,
#     http_NNN, health_unavailable): notified once when they appear; never again while they stay open;
#   * item alerts (dead_letter_present, bounced, unknown_outcome_open): notified when they appear and
#     whenever their count RISES (a new dead-lettered / bounced / unknown invitation is a new event);
#     a falling count is not an event;
#   * an alert that disappears is forgotten (CLEAR logged), so a recurrence is a new event.
# Every run with alerts also writes one ALERT line to /root/lm-prod/invitation-delivery-alerts.log.
set -eu
R="${LM_ROOT:-/root/lm-prod}"
INBOX="${AGENTAI_PROJECT_EVENT_DIR:-/var/lib/docker/volumes/agentai_agentai-runtime/_data/inbox/project-events}"
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
  curl -s -o "$D/$2" -w '%{http_code}' --max-time 300 -X POST -H @"$D/h" \
    -H 'Host: labourmarket.ai' -H 'X-Forwarded-Proto: https' \
    "http://127.0.0.1:$PORT/api/cron/invitation-delivery-retry?mode=$1"
}
CODE=$(call "$1" body)
echo "$(date -u +%FT%TZ) mode=$1 http=$CODE $(cat "$D/body")" >> $R/invitation-delivery.log

# The current alert set + counts: health / retry answers carry them; a bounces run asks health.
SRC="$D/body"; EXTRA=""
if [ "$1" = "bounces" ]; then
  HC=$(call health hbody); SRC="$D/hbody"
  [ "$HC" = "200" ] || EXTRA="health_unavailable"
fi
[ "$CODE" = "200" ] || EXTRA="${EXTRA:+$EXTRA }http_$CODE"
jq -r '
  (.health // {}) as $h
  | (.alerts // [])[]
  | . as $a
  | [$a, ({dead_letter_present: $h.dead_letter, bounced: $h.bounced,
           unknown_outcome_open: $h.unknown_outcome_open}[$a] // 1)] | @tsv' "$SRC" 2>/dev/null \
  | tr '\t' ' ' > "$D/now" || : > "$D/now"
for x in $EXTRA; do echo "$x 1" >> "$D/now"; done

LEDGER=$R/.invitation-delivery-events
touch "$LEDGER"
: > "$D/new"; : > "$D/next"
while read -r code n; do
  [ -n "$code" ] || continue
  case "$code" in *[!a-z0-9_]*) continue;; esac
  case "$n" in ''|*[!0-9]*) n=1;; esac
  prev=$(awk -v c="$code" '$1 == c { print $2 }' "$LEDGER")
  keep=$n
  if [ -z "$prev" ]; then
    echo "$code $n" >> "$D/new"
  elif [ "$n" -gt "$prev" ] && { [ "$code" = dead_letter_present ] || [ "$code" = bounced ] || [ "$code" = unknown_outcome_open ]; }; then
    echo "$code $n" >> "$D/new"
  else
    [ "$prev" -gt "$n" ] && keep=$prev
  fi
  echo "$code $keep" >> "$D/next"
done < "$D/now"

ALERTS=$(awk '{ printf "%s%s", (NR > 1 ? "," : ""), $1 }' "$D/now")
if [ -n "$ALERTS" ]; then
  echo "$(date -u +%FT%TZ) ALERT mode=$1 http=$CODE alerts=[$ALERTS]" >> $R/invitation-delivery-alerts.log
fi
CLEARED=$(awk 'NR == FNR { now[$1] = 1; next } !($1 in now) { printf "%s%s", (c++ ? "," : ""), $1 }' "$D/now" "$LEDGER")
[ -n "$CLEARED" ] && echo "$(date -u +%FT%TZ) CLEAR [$CLEARED]" >> $R/invitation-delivery-alerts.log

if [ -s "$D/new" ]; then
  NEW=$(awk '{ printf "%s%s=%s", (NR > 1 ? ", " : ""), $1, $2 }' "$D/new")
  TS=$(date -u +%FT%TZ)
  if [ -d "$INBOX" ] && [ -w "$INBOX" ]; then
    NAME="$(date -u +%Y-%m-%dT%H-%M-%SZ)-labourmarket-invitation-delivery-$$.json"
    jq -n --arg ts "$TS" --arg new "$NEW" --arg all "$ALERTS" '{
      schemaVersion: "agentai-project-event/v1",
      project: "labourmarketai",
      environment: "production",
      eventType: "OWNER_DECISION_REQUIRED",
      status: "FAILED",
      summary: ("Kvietimų pristatymas: naujas gedimas — " + $new),
      evidence: ("invitation-delivery health, visi atviri signalai: " + $all),
      ownerDecision: "Peržiūrėti kvietimų pristatymo gedimą (runbook INVITATION_DELIVERY_RELIABILITY.md); automatiškai nieko nesiunčiama iš naujo",
      nextStep: "Automatinis pakartojimas tik patvirtintoms laikinoms klaidoms; tas pats signalas nebus kartojamas",
      timestampIso: $ts
    }' > "$INBOX/.$NAME.tmp"
    chmod 0644 "$INBOX/.$NAME.tmp"
    mv "$INBOX/.$NAME.tmp" "$INBOX/$NAME"
    echo "$TS NOTIFY agentai-inbox [$NEW]" >> $R/invitation-delivery-alerts.log
    mv "$D/next" "$LEDGER"
  else
    # No inbox: nothing is marked as notified, so the next run tries again.
    echo "$TS NOTIFY_FAILED inbox_missing [$NEW]" >> $R/invitation-delivery-alerts.log
    awk 'NR == FNR { n[$1] = 1; next } !($1 in n)' "$D/new" "$D/next" > "$D/keep"
    mv "$D/keep" "$LEDGER"
  fi
else
  mv "$D/next" "$LEDGER"
fi
[ "$CODE" = "200" ]
