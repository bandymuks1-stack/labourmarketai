#!/bin/sh
# Sends exactly TWO test mails through the backup watchdog: one alert, one recovery message.
#   sh test-backup-watchdog-mail.sh <address>
# Invented files in a temporary directory; real backups and the real watchdog state are not touched. It
# reads the existing mailbox settings from /root/lm-prod/env through a link, and never prints them.
# "mail=sent" proves only that the mail server accepted it. PASS is someone seeing both mails arrive,
# with the sending mailbox checked for a bounce. Tell whoever reads that mailbox before running this.
set -eu
umask 077
ROOT=/root/lm-prod; W="$ROOT/bin/lm-backup-watchdog.sh"
TO="${1:-}"
case "$TO" in ?*@?*.?*) ;; *) echo "usage: sh test-backup-watchdog-mail.sh <address>"; exit 64;; esac
[ -f "$W" ] || { echo "STOP: install the watchdog first"; exit 1; }
T=$(mktemp -d "$ROOT/.wdtest.XXXXXX"); trap 'rm -rf "$T"' EXIT INT TERM
mkdir "$T/backups"; ln -s "$ROOT/env" "$T/env"
printf 'ALERT_TO=%s\n' "$TO" > "$T/backup-watchdog.conf"

want() { # expected text, then the watchdog's output
  case "$2" in *"$1"*) echo "ok: $2";; *) echo "FAIL, wanted $1: $2"; exit 1;; esac
}
echo "no verified backup in the test directory: one alert"
want "action=alert mail=sent" "$(sh "$W" --root "$T" || true)"
echo "same incident an hour later: no mail"
want "action=none mail=none" "$(sh "$W" --root "$T" || true)"
for s in lm-db-TEST.dump.age lm-files-TEST.tar.age; do
  echo "age-encryption.org/v1 invented test file" > "$T/backups/$s"
  echo "$(date -u +%s) $s $(stat -c %s "$T/backups/$s") $(sha256sum "$T/backups/$s" | cut -d' ' -f1)" >> "$T/backups/verified.log"
done
echo "an invented verified pair appears: one recovery message"
want "action=recovery mail=sent" "$(sh "$W" --root "$T" || true)"
echo "Two mails handed to the server. Not proven until someone sees both arrive; check the sending mailbox for a bounce too."
