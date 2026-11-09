#!/bin/sh
# LabourMarket.ai - daily check of what a search engine is served (owner order 2026-11-04, register IDX-16).
# Daily from lm-seo-watch.timer, as the unprivileged user lmseo, which has no access to the backups: this script
# parses content from the internet. Independent of GitHub. Signed out and read-only: about 20 public requests
# a day, no database access of its own and no paid service.
#
# It proves stage 1 only (technically ready). What Google discovered, indexed, showed or sent is read
# from Search Console; this script says nothing about it.
#
# A failed check is one incident: one alert when it starts, one message when it clears.
# Mail: an alerts-only credential and address like the backup watchdog's, in its own folder (LM_SMTP_* in
# <root>/env, ALERT_TO in <root>/backup-watchdog.conf). Without them nothing is sent and the run exits 2.
#
#   sh lm-seo-watch.sh --root /var/lib/lm-seo
#   ... [--mail-file <file>] [--skip-access-check]   (tests only)
#
# One status line goes to stdout. Exit 0 healthy, 1 problem, 2 mail failed.
set -eu
umask 077
ROOT=/var/lib/lm-seo; MAIL_FILE=""; ACCESS_CHECK=1; BASE="https://labourmarket.ai"; NOW=$(date -u +%FT%TZ)
UA="Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
MIN_JOB_SHARDS=30
while [ $# -gt 0 ]; do
  case "$1" in
    --root) ROOT="$2"; shift 2;;
    --mail-file) MAIL_FILE="$2"; shift 2;;
    --skip-access-check) ACCESS_CHECK=0; shift;;
    *) echo "unknown argument"; exit 64;;
  esac
done
STATE="$ROOT/seo-watch.state"; CONF="$ROOT/backup-watchdog.conf"
T=$(mktemp -d "$ROOT/.seo-watch.XXXXXX"); trap 'rm -rf "$T"' EXIT INT TERM
PROBLEMS=""
problem() { PROBLEMS="$PROBLEMS $1"; }

# Access this account must not have: it reads the internet, so it must hold nothing worth taking.
if [ "$ACCESS_CHECK" = 1 ]; then
  [ "$(id -u)" != "0" ] || problem runs_as_root
  case " $(id -nG 2>/dev/null) " in *" lmwatch "*|*" docker "*|*" sudo "*|*" adm "*) problem access_too_wide;; esac
  for p in /root/lm-prod/env /root/lm-prod/backup.age.key /root/lm-prod/backups /var/lib/lm-watch /etc/shadow /var/lib/docker/containers; do
    [ ! -r "$p" ] || problem access_too_wide
  done
fi

# Fetches without following redirects: sets CODE and LOCATION, leaves the body in $T/b.
fetch() {
  CODE=$(curl -sS --max-time 30 -A "$UA" -D "$T/h" -o "$T/b" -w '%{http_code}' "$1" 2>/dev/null) || CODE=000
  LOCATION=$(sed -n 's/^[Ll]ocation: *//p' "$T/h" 2>/dev/null | tr -d '\r' | head -n 1)
}

# A public page: 200, in the index, its own canonical in <head>, the full hreflang set.
check_page() {
  name="$2"
  fetch "$1"
  [ "$CODE" = "200" ] || { problem "status:$name:$CODE"; return 0; }
  sed -n '1,/<\/head>/p' "$T/b" | sed 's#</head>.*##' > "$T/head"
  grep -qi 'name="robots"[^>]*noindex' "$T/head" && problem "noindex:$name"
  canon=$(grep -o '<link[^>]*rel="canonical"[^>]*>' "$T/head" | sed -n 's/.*href="\([^"]*\)".*/\1/p' | head -n 1)
  [ "$canon" = "$1" ] || problem "canonical:$name"
  n=$(grep -oi 'hreflang="' "$T/head" | wc -l | tr -d ' ')
  [ "$n" -ge 7 ] || problem "hreflang:$name:$n"
  grep -qi 'hreflang="x-default"' "$T/head" || problem "xdefault:$name"
}

fetch "$BASE/robots.txt"
if [ "$CODE" != "200" ]; then
  problem "robots:$CODE"
else
  n=$(grep -ci '^sitemap:' "$T/b" || true)
  [ "$n" -ge 3 ] || problem "robots_sitemaps:$n"
fi

fetch "$BASE/sitemap.xml"
if [ "$CODE" != "200" ]; then
  problem "sitemap:$CODE"
else
  grep -q "<loc>$BASE/lt</loc>" "$T/b" || problem "sitemap_no_home"
  grep -Eq "<loc>$BASE/[a-z]{2}/(dashboard|onboarding|auth|cv|invite|oauth)" "$T/b" && problem "sitemap_private"
fi

JOB1=""; JOB2=""
fetch "$BASE/jobs-sitemap.xml"
if [ "$CODE" != "200" ]; then
  problem "jobs_index:$CODE"
else
  sed -n 's#.*<loc>\([^<]*jobs-sitemap/[0-9]*\.xml\)</loc>.*#\1#p' "$T/b" > "$T/shards"
  [ -s "$T/shards" ] || tr '>' '>\n' < "$T/b" | sed -n 's#^\(.*jobs-sitemap/[0-9]*\.xml\)</loc$#\1#p' > "$T/shards"
  n=$(wc -l < "$T/shards" | tr -d ' ')
  [ "$n" -ge "$MIN_JOB_SHARDS" ] || problem "jobs_shards:$n"
  last=$(tail -n 1 "$T/shards")
  if [ -n "$last" ]; then
    fetch "$last"
    if [ "$CODE" = "200" ]; then
      grep -o '<loc>[^<]*/jobs/[^<]*</loc>' "$T/b" | sed 's#</*loc>##g' > "$T/jobs"
      JOB1=$(head -n 1 "$T/jobs"); JOB2=$(tail -n 1 "$T/jobs")
      [ -n "$JOB1" ] || problem "jobs_shard_empty"
    else
      problem "jobs_shard:$CODE"
    fi
  fi
fi

for p in /lt /en /en/jobs /en/about /en/labour-market/lt; do check_page "$BASE$p" "$p"; done
[ -z "$JOB1" ] || check_page "$JOB1" job_first
[ -z "$JOB2" ] || [ "$JOB2" = "$JOB1" ] || check_page "$JOB2" job_last

# Bare root with no language: permanent, or Google folds /lt into / again (IDX-19).
fetch "$BASE/"
[ "$CODE" = "301" ] && [ "$LOCATION" = "$BASE/lt" -o "$LOCATION" = "/lt" ] || problem "root:$CODE"

# Private pages stay out of reach.
fetch "$BASE/en/dashboard"
[ "$CODE" = "307" ] || [ "$CODE" = "302" ] || problem "dashboard:$CODE"
fetch "$BASE/en/oauth/consent"
grep -qi 'name="robots"[^>]*noindex' "$T/b" || problem "oauth_indexable"
fetch "https://www.labourmarket.ai/en"
case "$CODE" in 301|308) ;; *) problem "www:$CODE";; esac

# Told, not alerted: the old host answers 402 until the Cloudflare redirect exists (IDX-7).
fetch "https://app.labourmarket.ai/en"
APP="$CODE"

send_mail() {
  subject="$1"; body="$2"
  if [ -n "$MAIL_FILE" ]; then
    { printf 'Subject: %s\n%s\n--\n' "$subject" "$body"; } >> "$MAIL_FILE" 2>/dev/null || return 3
    return 0
  fi
  to=$(sed -n 's/^ALERT_TO=//p' "$CONF" 2>/dev/null | head -n 1 | tr -d '\r')
  case "$to" in ?*@?*.?*) ;; *) return 4;; esac
  case "$to" in *[!A-Za-z0-9.@_+-]*) return 4;; esac
  v() { sed -n "s/^$1=//p" "$ROOT/env" 2>/dev/null | head -n 1 | tr -d '\r'; }
  host=$(v LM_SMTP_HOST); port=$(v LM_SMTP_PORT); user=$(v LM_SMTP_USER); pass=$(v LM_SMTP_PASS); from=$(v LM_SMTP_FROM)
  [ -n "$host" ] && [ -n "$user" ] && [ -n "$pass" ] && [ -n "$from" ] && [ "${port:-465}" = "465" ] || return 5
  addr=$(printf '%s' "$from" | sed -n 's/.*<\([^>]*\)>.*/\1/p'); [ -n "$addr" ] || addr="$from"
  esc=$(printf '%s:%s' "$user" "$pass" | sed 's/\\/\\\\/g; s/"/\\"/g')
  printf 'user = "%s"\n' "$esc" > "$T/c"
  {
    printf 'From: %s\r\nTo: %s\r\nSubject: %s\r\nDate: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n' \
      "$from" "$to" "$subject" "$(date -u -R)"
    printf '%s\r\n' "$body"
  } > "$T/m"
  curl -sS --ssl-reqd --max-time 60 --url "smtps://$host:465" --mail-from "$addr" --mail-rcpt "$to" \
    --upload-file "$T/m" -K "$T/c" >/dev/null 2>&1
}

PREV=$(cut -d' ' -f1 "$STATE" 2>/dev/null || true); [ -n "$PREV" ] || PREV=ok
ACTION=none; MAIL=none; RC=0
if [ -n "$PROBLEMS" ]; then
  RC=1
  if [ "$PREV" = "ok" ]; then
    ACTION=alert
    if send_mail "[LabourMarket] SEO problem" "Paieskos robotui atiduodami puslapiai neatitinka patikros:$PROBLEMS
Kitas pranesimas bus tik kai problema issispres.
Kur ziureti: docs/program/FUNCTION_REGISTER.md, IDX-16."; then
      MAIL=sent; printf 'alert %s\n' "$NOW" > "$STATE"
    else
      MAIL="failed:$?"; RC=2
    fi
  fi
else
  if [ "$PREV" = "alert" ]; then
    ACTION=recovery
    if send_mail "[LabourMarket] SEO recovered" "Visos paieskos robotu patikros vel praeina."; then
      MAIL=sent; echo ok > "$STATE"
    else
      MAIL="failed:$?"; RC=2
    fi
  elif [ ! -s "$STATE" ]; then
    echo ok > "$STATE"
  fi
fi
echo "$NOW status=${PROBLEMS:- ok} app_host=$APP was=$PREV action=$ACTION mail=$MAIL"
exit "$RC"
