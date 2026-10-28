#!/bin/sh
# Reprocess unsent partner referrals — the owner runs EACH step by hand on the VPS (never scheduled).
#   sh lm-referral-reprocess.sh dry_run    # counts only: nothing rotated, nothing sent
#   sh lm-referral-reprocess.sh control    # exactly ONE person (the soonest-expiring eligible referral)
#   sh lm-referral-reprocess.sh batch      # at most 20 per run; repeat only after checking the counts
# Calls POST /api/cron/referral-reprocess on the local container. CRON_SECRET is read from /root/lm-prod/env
# into a 0600 header file under a 0700 dir (never in argv, logs or output). The answer is counts and reason
# codes only — no ids, no addresses — and is printed and appended to /root/lm-prod/referral-reprocess.log.
set -eu
case "${1:-}" in dry_run|control|batch) ;; *) echo "usage: sh lm-referral-reprocess.sh dry_run|control|batch"; exit 2;; esac
umask 077
# One run at a time, ever: a second invocation while one is running exits at once (no wait, no queue).
# The database refuses a second mail per address on its own (20261028070000); this lock keeps runs from overlapping.
exec 9>/root/lm-prod/.referral-reprocess.lock
flock -n 9 || { echo "another referral reprocess run is active — nothing done"; exit 3; }
D=$(mktemp -d /root/lm-prod/.reprocess.XXXXXX)
trap 'rm -rf "$D"' EXIT INT TERM
printf 'Authorization: Bearer %s\n' "$(sed -n 's/^CRON_SECRET=//p' /root/lm-prod/env)" > "$D/h"
CODE=$(curl -s -o "$D/body" -w '%{http_code}' --max-time 600 -X POST -H @"$D/h" \
  -H 'Host: labourmarket.ai' -H 'X-Forwarded-Proto: https' \
  "http://127.0.0.1:$(cat /root/lm-prod/active-port 2>/dev/null || echo 3200)/api/cron/referral-reprocess?mode=$1")
LINE="$(date -u +%FT%TZ) mode=$1 http=$CODE $(cat "$D/body")"
echo "$LINE" | tee -a /root/lm-prod/referral-reprocess.log
[ "$CODE" = "200" ]
