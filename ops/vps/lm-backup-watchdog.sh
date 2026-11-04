#!/bin/sh
# LabourMarket.ai - backup watchdog on the VPS (owner approval 2026-11-04). Independent of GitHub.
# Hourly from /etc/cron.d/labourmarket-backup-watchdog. Read-only on the backups.
#
# Success is NOT a file's date. It is the newest pair (database + Storage files, same stamp) that the
# receiver recorded in backups/verified.log after it verified them, which this script checks again:
# the file exists, has the recorded size and sha256, and starts as an age file. Older than 26 h, or
# failing any check, is one incident: one alert when it starts, one message when it clears.
#
# Mail: the existing mailbox (LM_SMTP_* in /root/lm-prod/env) by curl; the password stays in a 0600
# file and never reaches argv or a log. The address is in /root/lm-prod/backup-watchdog.conf
# (root, 600): ALERT_TO=<address the owner approved>. Without it nothing is sent and the run exits 2.
#
#   sh lm-backup-watchdog.sh
#   sh lm-backup-watchdog.sh --root <test dir> [--now <epoch>] [--mail-file <file>]   (tests only)
#
# One status line goes to stdout: never the address or a secret. Exit 0 healthy, 1 problem, 2 mail failed.
set -eu
umask 077
ROOT=/root/lm-prod; NOW=$(date -u +%s); MAIL_FILE=""; MAX_AGE_S=$((26 * 3600))
while [ $# -gt 0 ]; do
  case "$1" in
    --root) ROOT="$2"; shift 2;;
    --now) NOW="$2"; shift 2;;
    --mail-file) MAIL_FILE="$2"; shift 2;;
    *) echo "unknown argument"; exit 64;;
  esac
done
BK="$ROOT/backups"; REC="$BK/verified.log"; STATE="$ROOT/backup-watchdog.state"; CONF="$ROOT/backup-watchdog.conf"

iso() { date -u -d "@$1" +%FT%TZ; }

# Prints the two record lines of the newest complete pair.
newest_pair() {
  [ -s "$REC" ] || return 0
  awk 'NF >= 4 && $1 ~ /^[0-9]+$/ && $3 ~ /^[0-9]+$/ {
    n = $2; s = n
    if (n ~ /^lm-db-.*\.dump\.age$/) { sub(/^lm-db-/, "", s); sub(/\.dump\.age$/, "", s); d[s] = $0; if (s in f) last = s }
    else if (n ~ /^lm-files-.*\.tar\.age$/) { sub(/^lm-files-/, "", s); sub(/\.tar\.age$/, "", s); f[s] = $0; if (s in d) last = s }
  } END { if (last != "") { print d[last]; print f[last] } }' "$REC"
}

# One recorded file against the disk. Prints the reason, or nothing.
check_file() {
  p="$BK/$2"
  [ -f "$p" ] || { echo missing_file; return 0; }
  [ "$(stat -c %s "$p")" = "$3" ] || { echo size_mismatch; return 0; }
  [ "$(sha256sum "$p" | cut -d' ' -f1)" = "$4" ] || { echo sha256_mismatch; return 0; }
  [ "$(head -c 8 "$p")" = "age-encr" ] || { echo not_age; return 0; }
}

REASON=""; LAST=0; STAMP=none; AGE_H=-
PAIR=$(newest_pair)
if [ -z "$PAIR" ]; then
  REASON=no_record
else
  LAST=$(printf '%s\n' "$PAIR" | sed -n 1p | cut -d' ' -f1)
  STAMP=$(printf '%s\n' "$PAIR" | sed -n 1p | cut -d' ' -f2 | sed 's/^lm-db-//; s/\.dump\.age$//')
  AGE=$((NOW - LAST)); AGE_H=$((AGE / 3600))
  while read -r _t name size sum _rest; do
    r=$(check_file x "$name" "$size" "$sum")
    [ -z "$r" ] || { REASON="$r"; break; }
  done <<EOF
$PAIR
EOF
  if [ -z "$REASON" ]; then
    if [ "$AGE" -lt 0 ]; then REASON=future_record
    elif [ "$AGE" -gt "$MAX_AGE_S" ]; then REASON=stale
    fi
  fi
fi

reason_text() {
  case "$1" in
    no_record) echo "Nera nei vienos patvirtintos kopijos irasu.";;
    stale) echo "Paskutine patvirtinta kopija senesne nei 26 valandos.";;
    missing_file) echo "Patvirtintos kopijos failo nera diske.";;
    size_mismatch|sha256_mismatch|not_age) echo "Patvirtintos kopijos failas diske nebesutampa su patvirtintu ($1).";;
    future_record) echo "Kopijos irasas turi ateities data.";;
    *) echo "$1";;
  esac
}

# Sends one message. Returns non-zero when it was not handed over.
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
  dir=$(mktemp -d "$ROOT/.watchdog.XXXXXX")
  esc=$(printf '%s:%s' "$user" "$pass" | sed 's/\\/\\\\/g; s/"/\\"/g')
  printf 'user = "%s"\n' "$esc" > "$dir/c"
  {
    printf 'From: %s\r\nTo: %s\r\nSubject: %s\r\nDate: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n' \
      "$from" "$to" "$subject" "$(date -u -R)"
    printf '%s\r\n' "$body"
  } > "$dir/m"
  rc=0
  curl -sS --ssl-reqd --max-time 60 --url "smtps://$host:465" --mail-from "$addr" --mail-rcpt "$to" \
    --upload-file "$dir/m" -K "$dir/c" >/dev/null 2>&1 || rc=$?
  rm -rf "$dir"
  return "$rc"
}

PREV=$(cut -d' ' -f1 "$STATE" 2>/dev/null || true); [ -n "$PREV" ] || PREV=ok
ACTION=none; MAIL=none; RC=0
if [ -n "$REASON" ]; then
  RC=1
  if [ "$PREV" = "ok" ]; then
    ACTION=alert
    last_txt="nera"; [ "$LAST" = "0" ] || last_txt="$(iso "$LAST") (kopija $STAMP)"
    if send_mail "[LabourMarket] Backup problem" "$(reason_text "$REASON")
Paskutine patvirtinta kopija: $last_txt.
Kitas pranesimas bus tik kai problema issispres.
Kur ziureti: GitHub Actions, DB backup; VPS_PRODUCTION_RUNBOOK 9.1.0a."; then
      MAIL=sent; printf 'alert %s %s\n' "$NOW" "$REASON" > "$STATE"
    else
      MAIL="failed:$?"; RC=2
    fi
  fi
else
  if [ "$PREV" = "alert" ]; then
    ACTION=recovery
    if send_mail "[LabourMarket] Backup recovered" "Problema issispresta.
Paskutine patvirtinta kopija: $(iso "$LAST") (kopija $STAMP), patikrinta diske."; then
      MAIL=sent; echo ok > "$STATE"
    else
      MAIL="failed:$?"; RC=2
    fi
  elif [ ! -s "$STATE" ]; then
    echo ok > "$STATE"
  fi
fi
echo "$(iso "$NOW") status=${REASON:-ok} age_h=$AGE_H stamp=$STAMP was=$PREV action=$ACTION mail=$MAIL"
exit "$RC"
