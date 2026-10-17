#!/bin/sh
# Calls one LabourMarket.ai cron route on the local container (the former Vercel Cron / GitHub cadence).
#   sh lm-cron.sh weekly-digest | commercial-handoffs | job-alerts | billing-recovery
# CRON_SECRET is read from /root/lm-prod/env into a 0600 header file under a 0700 dir and passed with
# `curl -H @file`, so it never appears in argv (ps), logs or output. Only the HTTP status is logged.
set -eu
case "$1" in weekly-digest|commercial-handoffs|job-alerts|billing-recovery) ;; *) echo "unknown cron"; exit 2;; esac
umask 077
D=$(mktemp -d /root/lm-prod/.cron.XXXXXX)
trap 'rm -rf "$D"' EXIT INT TERM
printf 'Authorization: Bearer %s\n' "$(sed -n 's/^CRON_SECRET=//p' /root/lm-prod/env)" > "$D/h"
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 300 -H @"$D/h" \
  -H 'Host: labourmarket.ai' -H 'X-Forwarded-Proto: https' "http://127.0.0.1:3200/api/cron/$1")
echo "$(date -u +%FT%TZ) $1 http=$CODE" >> /root/lm-prod/cron.log
[ "$CODE" = "200" ]
