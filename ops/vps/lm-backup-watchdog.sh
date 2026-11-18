#!/bin/sh
# LabourMarket.ai - backup watchdog on the VPS. Independent of GitHub. Read-only on the backups.
# Hourly from lm-backup-watchdog.timer, as the unprivileged user lmwatch (variant B, not installed until the
# owner approves it separately). The clock runs it, not an arriving file, so a backup that never starts alerts.
#
# Success is NOT a file's date. It is the newest pair (database + Storage files, same stamp) that the
# receiver recorded in backups/verified.log after it verified them, which this script checks again:
# the file exists, has the recorded size and sha256, and starts as an age file. Older than 26 h, or
# failing any check, is one incident: one alert when it starts, one message when it clears.
# It also alerts on a pair left half-way, a transfer left behind, a file with no record, and on access that
# is wider than intended: a symlink, wider modes, an ACL, or being able to read a secret it must not read.
# A gap in its own runs and a weekly "still alive" are told once each, so that silence can be noticed.
#
# Mail: LM_SMTP_* in <root>/env by curl: a credential only for alerts, never the main mailbox's. The password
# stays in a 0600 file and never reaches argv or a log. The address is in <root>/backup-watchdog.conf:
# ALERT_TO=<address the owner approved>. Without it nothing is sent and the run exits 2.
#
#   sh lm-backup-watchdog.sh --root /var/lib/lm-watch
#   ... [--now <epoch>] [--mail-file <file>] [--skip-access-check]   (tests only)
#
# One status line goes to stdout: never the address or a secret. Exit 0 healthy, 1 problem, 2 mail failed.
set -eu
umask 077
ROOT=/var/lib/lm-watch; NOW=$(date -u +%s); MAIL_FILE=""; MAX_AGE_S=$((26 * 3600)); ACCESS_CHECK=1
GRACE_S=3600; GAP_S=$((6 * 3600)); HEARTBEAT_S=$((7 * 86400))
while [ $# -gt 0 ]; do
  case "$1" in
    --root) ROOT="$2"; shift 2;;
    --now) NOW="$2"; shift 2;;
    --mail-file) MAIL_FILE="$2"; shift 2;;
    --skip-access-check) ACCESS_CHECK=0; shift;;
    *) echo "unknown argument"; exit 64;;
  esac
done
BK="$ROOT/backups"; REC="$BK/verified.log"; STATE="$ROOT/backup-watchdog.state"; CONF="$ROOT/backup-watchdog.conf"
LASTRUN="$ROOT/backup-watchdog.lastrun"; ALIVE="$ROOT/backup-watchdog.alive"

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
  [ ! -L "$p" ] || { echo symlink; return 0; }
  [ -f "$p" ] || { echo missing_file; return 0; }
  [ -r "$p" ] || { echo unreadable; return 0; }
  [ "$(stat -c %s "$p")" = "$3" ] || { echo size_mismatch; return 0; }
  [ "$(sha256sum "$p" | cut -d' ' -f1)" = "$4" ] || { echo sha256_mismatch; return 0; }
  [ "$(head -c 8 "$p")" = "age-encr" ] || { echo not_age; return 0; }
}

# Access this account must not have. Reading any of these means the account or its sandbox is wrong.
check_access() {
  [ "$(id -u)" != "0" ] || { echo runs_as_root; return 0; }
  case " $(id -nG 2>/dev/null) " in *" docker "*|*" sudo "*|*" adm "*) echo access_too_wide; return 0;; esac
  for p in /root/lm-prod/env /root/lm-prod/backup.age.key /etc/shadow /var/lib/docker/containers; do
    [ ! -r "$p" ] || { echo access_too_wide; return 0; }
  done
}

# The folder and everything in it: no links, nothing wider than intended, nothing inherited. Never follows a link.
check_folder() {
  [ ! -L "$BK" ] || { echo symlink; return 0; }
  [ -d "$BK" ] || return 0
  case "$(stat -c %a "$BK")" in 700|750) ;; *) echo mode_too_wide; return 0;; esac
  [ -r "$BK" ] && [ -x "$BK" ] || { echo unreadable; return 0; }
  [ ! -e "$REC" ] || [ -r "$REC" ] || { echo unreadable; return 0; }
  [ "$(ls -ld "$BK" | cut -c11)" != "+" ] || { echo acl_present; return 0; }
  owner=$(stat -c %U "$BK"); group=$(stat -c %G "$BK")
  for p in "$BK"/* "$BK"/.[!.]*; do
    [ -e "$p" ] || [ -L "$p" ] || continue
    [ ! -L "$p" ] || { echo symlink; return 0; }
    [ -f "$p" ] || { echo unexpected_entry; return 0; }
    [ "$(ls -ld "$p" | cut -c11)" != "+" ] || { echo acl_present; return 0; }
    [ "$(stat -c %U "$p")" = "$owner" ] || { echo wrong_owner; return 0; }
    case "$(stat -c %a "$p")" in
      600) ;;
      640) [ "$(stat -c %G "$p")" = "$group" ] || { echo wrong_group; return 0; };;
      *) echo mode_too_wide; return 0;;
    esac
    case "$p" in *.part) [ $((NOW - $(stat -c %Y "$p"))) -le "$GRACE_S" ] || { echo failed_transfer; return 0; };; esac
  done
}

# A backup that went half-way: the newest record has no partner, or a stored file has no record.
check_complete() {
  [ -s "$REC" ] || return 0
  set -- $(awk 'NF >= 4 && $1 ~ /^[0-9]+$/ { t = $1; n = $2 } END { print t, n }' "$REC")
  [ $# = 2 ] || return 0
  s="$2"; case "$s" in lm-db-*) other="lm-files-${s#lm-db-}"; other="${other%.dump.age}.tar.age";; *) other="lm-db-${s#lm-files-}"; other="${other%.tar.age}.dump.age";; esac
  if [ $((NOW - $1)) -gt "$GRACE_S" ] && ! grep -q " $other " "$REC"; then echo incomplete_pair; return 0; fi
  for p in "$BK"/lm-db-*.dump.age "$BK"/lm-files-*.tar.age; do
    [ -f "$p" ] || continue
    m=$(stat -c %Y "$p")
    [ "$m" -gt "$LAST" ] && [ $((NOW - m)) -gt "$GRACE_S" ] || continue
    grep -q " $(basename "$p") " "$REC" || { echo unrecorded_file; return 0; }
  done
}

REASON=""; LAST=0; STAMP=none; AGE_H=-
[ "$ACCESS_CHECK" = 0 ] || REASON=$(check_access)
[ -n "$REASON" ] || REASON=$(check_folder)
PAIR=""
[ -n "$REASON" ] || PAIR=$(newest_pair)
if [ -n "$REASON" ]; then
  :
elif [ -z "$PAIR" ]; then
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
  [ -n "$REASON" ] || REASON=$(check_complete)
fi

reason_text() {
  case "$1" in
    no_record) echo "Nera nei vienos patvirtintos kopijos irasu. Iskart po idiegimo tai normalu: irasas atsiras po pirmos kopijos per nauja imtuva.";;
    stale) echo "Paskutine patvirtinta kopija senesne nei 26 valandos.";;
    missing_file) echo "Patvirtintos kopijos failo nera diske.";;
    size_mismatch|sha256_mismatch|not_age) echo "Patvirtintos kopijos failas diske nebesutampa su patvirtintu ($1).";;
    future_record) echo "Kopijos irasas turi ateities data.";;
    incomplete_pair) echo "Paskutine kopija liko pusiaukeleje: yra tik vienas poros failas.";;
    unrecorded_file) echo "Diske yra kopijos failas be patvirtinimo iraso.";;
    failed_transfer) echo "Diske liko nebaigtas kopijos perdavimas.";;
    unreadable) echo "Sargas negali perskaityti kopiju aplanko arba failo.";;
    symlink) echo "Kopiju aplanke yra simboline nuoroda.";;
    unexpected_entry) echo "Kopiju aplanke yra netiketas irasas.";;
    mode_too_wide|wrong_group|wrong_owner|acl_present) echo "Kopiju failu teises platesnes nei numatyta ($1).";;
    access_too_wide|runs_as_root) echo "Sargas turi per daug teisiu ($1).";;
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

# Silence must be noticeable: a gap in this script's own runs, and a weekly sign of life while all is well.
NOTE=none
PREV_RUN=$(cat "$LASTRUN" 2>/dev/null || echo 0)
GAP_DONE=1
if [ "$PREV_RUN" -gt 0 ] && [ $((NOW - PREV_RUN)) -gt "$GAP_S" ]; then
  NOTE=gap
  if send_mail "[LabourMarket] Backup watchdog was not running" "Sargas nebuvo paleistas $(((NOW - PREV_RUN) / 3600)) val. (nuo $(iso "$PREV_RUN")).
Dabartine busena: ${REASON:-gerai}."; then NOTE=gap_sent; else GAP_DONE=0; RC=2; fi
fi
[ "$GAP_DONE" = 0 ] || echo "$NOW" > "$LASTRUN"
if [ -z "$REASON" ]; then
  LIVE=$(cat "$ALIVE" 2>/dev/null || echo 0)
  if [ "$LIVE" = 0 ]; then
    echo "$NOW" > "$ALIVE"
  elif [ $((NOW - LIVE)) -ge "$HEARTBEAT_S" ]; then
    if send_mail "[LabourMarket] Backup watchdog alive" "Savaitinis zenklas: sargas veikia. Paskutine patvirtinta kopija: $(iso "$LAST") (kopija $STAMP).
Jei sis laiskas neatejo, patikrink sarga."; then echo "$NOW" > "$ALIVE"; NOTE=alive_sent; else NOTE=alive_failed; RC=2; fi
  fi
fi
echo "$(iso "$NOW") status=${REASON:-ok} age_h=$AGE_H stamp=$STAMP was=$PREV action=$ACTION mail=$MAIL note=$NOTE"
exit "$RC"
