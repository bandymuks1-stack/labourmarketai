#!/bin/sh
# Installs variant B on the VPS: users lmwatch and lmseo, the watchdog and SEO watch as systemd timers, group read
# on the encrypted backups, and the receiver's group-read lines. Run once as root, only after the owner's separate
# approval of the install:
#   sh install-backup-watchdog.sh <owner-approved alert address>
#
# It stops until the pins below are filled in by a separate reviewed PR (merging this file changes nothing live;
# nothing on the VPS updates itself from this repository).
#
# Takes no secret. The owner puts the alerts-only credential (LM_SMTP_* lines, never the main mailbox's) in
# /var/lib/lm-watch/env and /var/lib/lm-seo/env, owner the service user, mode 600, before this runs.
# Sends no mail. The mail test is separate: test-backup-watchdog-mail.sh.
# Removal: VPS_PRODUCTION_RUNBOOK section 9.1.0b.
set -eu
umask 077
PIN=UNSET
RECEIVER_BEFORE=UNSET
RECEIVER_AFTER=UNSET
WATCHDOG=UNSET
WATCHDOG_TEST=UNSET
SEO=UNSET
WATCHDOG_UNIT=UNSET
WATCHDOG_TIMER=UNSET
SEO_UNIT=UNSET
SEO_TIMER=UNSET
# The newest stored pair, from its run's log, when the receiver has kept no record yet.
SEED_RUN=UNSET
SEED_STAMP=UNSET
SEED_DB_BYTES=UNSET
SEED_DB_SHA=UNSET
SEED_FILES_BYTES=UNSET
SEED_FILES_SHA=UNSET

stop() { echo "STOP: $1"; exit 1; }
TO="${1:-}"
[ "$PIN" != "UNSET" ] || stop "not pinned: installing needs the owner's separate approval and a reviewed PR that sets the pins"
[ "$(id -u)" = "0" ] || stop "run as root"
case "$TO" in ?*@?*.?*) ;; *) stop "usage: sh install-backup-watchdog.sh <owner-approved alert address>";; esac
case "$TO" in *[!A-Za-z0-9.@_+-]*) stop "the address has characters it should not have";; esac
systemctl --version >/dev/null 2>&1 || stop "this host has no systemd"

D=/root/lm-prod; BIN="$D/bin"; BK="$D/backups"; REC="$BK/verified.log"; OPT=/opt/lm-watch
RAW="https://raw.githubusercontent.com/bandymuks1-stack/labourmarketai/$PIN/ops/vps"
sha() { sha256sum "$1" | cut -d' ' -f1; }
[ ! -L "$BK" ] && [ -d "$BK" ] || stop "$BK is not a plain folder"
for d in /var/lib/lm-watch /var/lib/lm-seo; do [ -s "$d/env" ] || stop "$d/env is missing: the owner puts the alerts-only credential there first"; done
if ls "$BK"/*.part >/dev/null 2>&1; then stop "a backup is arriving right now; try again in a few minutes"; fi
now_receiver=$(sha "$BIN/lm-deploy-receive.sh")
[ "$now_receiver" = "$RECEIVER_AFTER" ] || [ "$now_receiver" = "$RECEIVER_BEFORE" ] || stop "the installed receiver is neither the expected old version nor the new one"

echo "1. download pinned commit $PIN"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT INT TERM
get() { curl -fsS --max-time 60 -o "$T/$1" "$RAW/$1"; [ "$(sha "$T/$1")" = "$2" ] || stop "$1 does not match its pinned sha256"; echo "   $1 ok"; }
get lm-deploy-receive.sh "$RECEIVER_AFTER"
get lm-backup-watchdog.sh "$WATCHDOG"
get lm-backup-watchdog.test.sh "$WATCHDOG_TEST"
get lm-seo-watch.sh "$SEO"
get lm-backup-watchdog.service "$WATCHDOG_UNIT"
get lm-backup-watchdog.timer "$WATCHDOG_TIMER"
get lm-seo-watch.service "$SEO_UNIT"
get lm-seo-watch.timer "$SEO_TIMER"

echo "2. users with no login and no other group"
getent group lmwatch >/dev/null || groupadd -r lmwatch
id lmwatch >/dev/null 2>&1 || useradd -r -g lmwatch -G "" -d /nonexistent -M -s /usr/sbin/nologin lmwatch
getent group lmseo >/dev/null || groupadd -r lmseo
id lmseo >/dev/null 2>&1 || useradd -r -g lmseo -G "" -d /nonexistent -M -s /usr/sbin/nologin lmseo
[ "$(id -nG lmwatch)" = "lmwatch" ] && [ "$(id -nG lmseo)" = "lmseo" ] || stop "a service user is in another group"

echo "3. scripts and units"
install -d -m 755 -o root -g root "$OPT"
for f in lm-backup-watchdog.sh lm-backup-watchdog.test.sh lm-seo-watch.sh; do install -m 755 -o root -g root "$T/$f" "$OPT/$f"; done
for f in lm-backup-watchdog.service lm-backup-watchdog.timer lm-seo-watch.service lm-seo-watch.timer; do install -m 644 -o root -g root "$T/$f" "/etc/systemd/system/$f"; done
install -d -m 700 -o lmwatch -g lmwatch /var/lib/lm-watch /var/lib/lm-watch/backups
install -d -m 700 -o lmseo -g lmseo /var/lib/lm-seo
chown lmwatch:lmwatch /var/lib/lm-watch/env; chmod 600 /var/lib/lm-watch/env
chown lmseo:lmseo /var/lib/lm-seo/env; chmod 600 /var/lib/lm-seo/env

echo "4. receiver, old copy kept"
if [ "$now_receiver" = "$RECEIVER_BEFORE" ]; then
  mode=$(stat -c %a "$BIN/lm-deploy-receive.sh")
  [ -e "$BIN/lm-deploy-receive.sh.bak-variant-b" ] || cp -p "$BIN/lm-deploy-receive.sh" "$BIN/lm-deploy-receive.sh.bak-variant-b"
  cp "$T/lm-deploy-receive.sh" "$BIN/lm-deploy-receive.sh.new"; chmod "$mode" "$BIN/lm-deploy-receive.sh.new"; mv "$BIN/lm-deploy-receive.sh.new" "$BIN/lm-deploy-receive.sh"
fi

echo "5. record for the newest pair, if none"
if [ ! -s "$REC" ]; then
  db="lm-db-$SEED_STAMP.dump.age"; files="lm-files-$SEED_STAMP.tar.age"
  [ "$(sha "$BK/$db")" = "$SEED_DB_SHA" ] && [ "$(sha "$BK/$files")" = "$SEED_FILES_SHA" ] || stop "the pair does not match its run's sha256"
  {
    printf '%s %s %s %s seeded-run-%s\n' "$(stat -c %Y "$BK/$db")" "$db" "$SEED_DB_BYTES" "$SEED_DB_SHA" "$SEED_RUN"
    printf '%s %s %s %s seeded-run-%s\n' "$(stat -c %Y "$BK/$files")" "$files" "$SEED_FILES_BYTES" "$SEED_FILES_SHA" "$SEED_RUN"
  } >> "$REC"
fi

echo "6. group read: the folder, the backup files and the record only; never a link, no recursion"
chgrp -h lmwatch "$BK"; chmod u=rwx,g=rx,o=,g-s "$BK"
find "$BK" -maxdepth 1 -type f \( -name 'lm-db-*.dump.age' -o -name 'lm-files-*.tar.age' -o -name verified.log \) -exec chgrp -h lmwatch {} + -exec chmod 640 {} +

echo "7. address, then the real check through its unit: it must say ok before any timer starts"
printf 'ALERT_TO=%s\n' "$TO" > /var/lib/lm-watch/backup-watchdog.conf; chown lmwatch:lmwatch /var/lib/lm-watch/backup-watchdog.conf; chmod 600 /var/lib/lm-watch/backup-watchdog.conf
printf 'ALERT_TO=%s\n' "$TO" > /var/lib/lm-seo/backup-watchdog.conf; chown lmseo:lmseo /var/lib/lm-seo/backup-watchdog.conf; chmod 600 /var/lib/lm-seo/backup-watchdog.conf
systemctl daemon-reload
systemctl start lm-backup-watchdog.service
tail -n 1 /var/lib/lm-watch/backup-watchdog.log | grep -q ' status=ok ' || stop "the check did not report ok; timers not started"

echo "8. timers"
systemctl enable --now lm-backup-watchdog.timer lm-seo-watch.timer
systemctl list-timers 'lm-*' --no-pager

cat <<EOF

DONE. Next: runuser -u lmwatch -- sh test-backup-watchdog-mail.sh <address> sends the two test mails; someone must see them arrive.
EOF
