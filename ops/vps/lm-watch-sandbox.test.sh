#!/bin/bash
# Real test of variant B on a throw-away CI machine: real users, real systemd units, the real receiver, invented
# secrets and invented backups. It refuses to run anywhere else, so it can never touch the VPS.
#   sudo -E bash ops/vps/lm-watch-sandbox.test.sh      (GitHub Actions only)
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
[ "${GITHUB_ACTIONS:-}" = "true" ] || { echo "REFUSED: runs only on a throw-away CI machine"; exit 2; }
[ "$(id -u)" = "0" ] || { echo "REFUSED: needs root on the CI machine"; exit 2; }
[ ! -e /root/lm-prod ] || { echo "REFUSED: /root/lm-prod exists here"; exit 2; }
FAILS=0; N=0
ok() { N=$((N + 1)); if [ "$2" = "$3" ]; then echo "ok $N $1"; else echo "FAIL $N $1: got '$2', wanted '$3'"; FAILS=$((FAILS + 1)); fi; }

D=/root/lm-prod; BK=$D/backups; S=/var/lib/lm-watch; Q=/var/lib/lm-seo; OPT=/opt/lm-watch
mkdir -p $D/bin; chmod 700 /root $D
umask 077
echo "invented env secret" > $D/env; echo "invented key" > $D/backup.age.key
PL=/var/lib/planted-docker/containers/x; mkdir -p $PL /opt/planted /srv/planted /var/spool/planted
for f in $PL/config.v2.json /opt/planted/secret /srv/planted/secret /var/spool/planted/secret /etc/planted-secret; do echo "invented secret" > "$f"; chmod 600 "$f"; done
umask 022
install -m 700 "$HERE/lm-deploy-receive.sh" $D/bin/lm-deploy-receive.sh

# Stores one invented backup through the real receiver.
store() { # name
  printf 'age-encryption.org/v1 invented %s %s\n' "$1" "$RANDOM" > /tmp/in
  SSH_ORIGINAL_COMMAND="backup $1 $(sha256sum /tmp/in | cut -d' ' -f1)" sh $D/bin/lm-deploy-receive.sh < /tmp/in 2>&1 | tail -n 1
}
mode() { stat -c '%a %U %G' "$1"; }
st() { date -u +%Y%m%dT%H%M%SZ; }

echo "== the receiver with no group lmwatch: exactly as today"
A=$(st)
ok "stores" "$(store lm-db-$A.dump.age)" "BACKUP_OK lm-db-$A.dump.age"
ok "folder 700" "$(mode $BK)" "700 root root"
ok "file 600" "$(mode $BK/lm-db-$A.dump.age)" "600 root root"
rm -f $BK/*

echo "== users"
groupadd -r lmwatch; useradd -r -g lmwatch -d /nonexistent -M -s /usr/sbin/nologin lmwatch
groupadd -r lmseo; useradd -r -g lmseo -d /nonexistent -M -s /usr/sbin/nologin lmseo
ok "lmwatch is in one group" "$(id -nG lmwatch)" "lmwatch"
ok "lmseo is not in lmwatch" "$(id -nG lmseo)" "lmseo"

echo "== the receiver with the group"
chmod g+s $BK
A=$(st)
ok "stores the database" "$(store lm-db-$A.dump.age)" "BACKUP_OK lm-db-$A.dump.age"
ok "stores the files" "$(store lm-files-$A.tar.age)" "BACKUP_OK lm-files-$A.tar.age"
ok "folder 750, setgid cleared" "$(mode $BK)" "750 root lmwatch"
ok "file 640" "$(mode $BK/lm-db-$A.dump.age)" "640 root lmwatch"
ok "record 640" "$(mode $BK/verified.log)" "640 root lmwatch"
ok "the key is untouched" "$(mode $D/backup.age.key)" "600 root root"
ok "env is untouched" "$(mode $D/env)" "600 root root"

echo "== the receiver never follows a planted link"
cp -p $BK/verified.log /tmp/rec; rm $BK/verified.log; ln -s $D/env $BK/verified.log
B=$(st | sed 's/Z$/1Z/')
ok "link as the record: still stores" "$(store lm-db-$B.dump.age)" "BACKUP_OK lm-db-$B.dump.age"
ok "env mode not changed through the link" "$(mode $D/env)" "600 root root"
ok "env content not changed through the link" "$(cat $D/env)" "invented env secret"
rm $BK/verified.log $BK/lm-db-$B.dump.age; cp -p /tmp/rec $BK/verified.log
C=$(st | sed 's/Z$/2Z/')
ln -s $D/backup.age.key $BK/lm-db-$C.dump.age
ok "link as the target name: replaced" "$(store lm-db-$C.dump.age)" "BACKUP_OK lm-db-$C.dump.age"
ok "the key not changed through the link" "$(mode $D/backup.age.key)" "600 root root"
sed -i "/lm-db-$C/d" $BK/verified.log; rm $BK/lm-db-$C.dump.age
mv $BK /tmp/bk-real; ln -s /tmp/bk-real $BK
ok "the folder itself a link: refused" "$(store lm-db-$C.dump.age)" "BACKUP_FAIL the folder is a link"
rm $BK; mv /tmp/bk-real $BK

echo "== units"
install -d -m 755 $OPT
for f in lm-backup-watchdog.sh lm-seo-watch.sh; do install -m 755 "$HERE/$f" $OPT/$f; done
for f in lm-backup-watchdog.service lm-backup-watchdog.timer lm-seo-watch.service lm-seo-watch.timer; do install -m 644 "$HERE/$f" /etc/systemd/system/$f; done
install -d -m 700 -o lmwatch -g lmwatch $S $S/backups
install -d -m 700 -o lmseo -g lmseo $Q
systemctl daemon-reload
for f in lm-backup-watchdog.service lm-backup-watchdog.timer lm-seo-watch.service lm-seo-watch.timer; do
  ok "systemd-analyze verify $f" "$(systemd-analyze verify /etc/systemd/system/$f 2>&1 | grep -c "$f")" 0
done
ok "unit has no test flags" "$(grep -cE 'mail-file|skip-access-check|--now' /etc/systemd/system/lm-backup-watchdog.service /etc/systemd/system/lm-seo-watch.service | awk -F: '{s+=$2} END {print s}')" 0

# The same unit with another ExecStart: the sandbox stays exactly as shipped.
with() { # service, command
  mkdir -p "/etc/systemd/system/$1.d"
  printf '[Service]\nExecStart=\nExecStart=%s\n' "$2" > "/etc/systemd/system/$1.d/t.conf"
  systemctl daemon-reload; systemctl reset-failed "$1" 2>/dev/null
  systemctl start "$1"; echo $?
}
clean() { rm -rf "/etc/systemd/system/$1.d"; systemctl daemon-reload; }

cat > $OPT/probe.sh <<'PROBE'
#!/bin/sh
# One line per path: name=read or name=refused. Writes too.
r() { if cat "$1" >/dev/null 2>&1; then echo "$1=read"; else echo "$1=refused"; fi; }
for p in "$@"; do r "$p"; done
ls /var/lib/planted-docker >/dev/null 2>&1 && echo "ls-docker=listed" || echo "ls-docker=refused"
: >> "$ROOTDIR/backups/verified.log" 2>/dev/null && echo "write-record=written" || echo "write-record=refused"
touch "$ROOTDIR/backups/planted" 2>/dev/null && echo "new-file=written" || echo "new-file=refused"
rm "$ROOTDIR/backups/verified.log" 2>/dev/null && echo "delete=done" || echo "delete=refused"
echo "uid=$(id -u) groups=$(id -nG)"
echo "caps=$(grep -E '^CapEff' /proc/self/status | awk '{print $2}')"
ls /proc | grep -cE '^[0-9]+$' | sed 's/^/procs=/'
PROBE
chmod 755 $OPT/probe.sh
PATHS="$D/env $D/backup.age.key $PL/config.v2.json /opt/planted/secret /srv/planted/secret /var/spool/planted/secret /etc/planted-secret /etc/shadow /var/lib/docker/containers/none"
echo "== inside the watchdog's unit"
ok "probe ran" "$(with lm-backup-watchdog.service "/bin/sh -c 'ROOTDIR=$S exec /bin/sh $OPT/probe.sh $PATHS $S/backups/lm-db-$A.dump.age $S/backups/verified.log /proc/1/environ > $S/probe.out 2>&1'")" 0
cat $S/probe.out
for p in $PATHS /proc/1/environ; do ok "lmwatch can't read $p" "$(grep -c "^$p=refused" $S/probe.out)" 1; done
ok "lmwatch reads the encrypted backup" "$(grep -c "lm-db-$A.dump.age=read" $S/probe.out)" 1
ok "lmwatch reads the record" "$(grep -c "verified.log=read" $S/probe.out)" 1
ok "can't list planted docker" "$(grep -c '^ls-docker=refused' $S/probe.out)" 1
ok "can't write the record" "$(grep -c '^write-record=refused' $S/probe.out)" 1
ok "can't add a file" "$(grep -c '^new-file=refused' $S/probe.out)" 1
ok "can't delete" "$(grep -c '^delete=refused' $S/probe.out)" 1
ok "no capabilities" "$(grep -c '^caps=0000000000000000' $S/probe.out)" 1
ok "not root, one group" "$(grep -c "groups=lmwatch\$" $S/probe.out)" 1
ok "sees only its own processes" "$(awk -F= '/^procs=/ {print ($2 <= 5)}' $S/probe.out)" 1
clean lm-backup-watchdog.service

echo "== inside the SEO watch's unit: no backups at all"
ok "probe ran" "$(with lm-seo-watch.service "/bin/sh -c 'ROOTDIR=$Q exec /bin/sh $OPT/probe.sh $PATHS $BK/lm-db-$A.dump.age $S/backups/lm-db-$A.dump.age $S/env > $Q/probe.out 2>&1'")" 0
cat $Q/probe.out
for p in $PATHS $BK/lm-db-$A.dump.age $S/backups/lm-db-$A.dump.age $S/env; do ok "lmseo can't read $p" "$(grep -c "^$p=refused" $Q/probe.out)" 1; done
ok "no capabilities" "$(grep -c '^caps=0000000000000000' $Q/probe.out)" 1
clean lm-seo-watch.service

echo "== the real watchdog in its real unit"
log=$S/backup-watchdog.log
last() { tail -n 1 $log; }
now=$(date -u +%s); M=$S/mail; rm -f $S/backup-watchdog.state $S/backup-watchdog.lastrun $S/backup-watchdog.alive
run() { # extra arguments
  ok "unit ran" "$(with lm-backup-watchdog.service "/bin/sh $OPT/lm-backup-watchdog.sh --root $S --mail-file $M $*")" 0
}
subjects() { grep -c '^Subject:' $M 2>/dev/null || true; }
run; ok "healthy pair: ok, with the access check on" "$(last | grep -c 'status=ok ')" 1
ok "no mail" "$(subjects)" 0

echo "== a backup that never starts: only the clock changes, no file arrives"
run --now $((now + 25 * 3600)); ok "25 h: still ok" "$(last | grep -c 'status=ok ')" 1
run --now $((now + 27 * 3600)); ok "27 h with no new file: stale" "$(last | grep -c 'status=stale ')" 1
ok "one alert" "$(subjects)" 1
run --now $((now + 28 * 3600)); ok "28 h: still one alert" "$(subjects)" 1
rm -f $M $S/backup-watchdog.state $S/backup-watchdog.lastrun $S/backup-watchdog.alive

echo "== the timer fires with no new file"
mkdir -p /etc/systemd/system/lm-backup-watchdog.timer.d
printf '[Timer]\nOnCalendar=\nOnActiveSec=1s\nAccuracySec=1s\n' > /etc/systemd/system/lm-backup-watchdog.timer.d/t.conf
mkdir -p /etc/systemd/system/lm-backup-watchdog.service.d
printf '[Service]\nExecStart=\nExecStart=/bin/sh %s/lm-backup-watchdog.sh --root %s --mail-file %s --now %s\n' $OPT $S $M $((now + 27 * 3600)) > /etc/systemd/system/lm-backup-watchdog.service.d/t.conf
systemctl daemon-reload; : > /tmp/before; before=$(wc -l < $log); systemctl start lm-backup-watchdog.timer
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do [ "$(wc -l < $log)" -gt "$before" ] && break; sleep 1; done
ok "the timer ran it, and it alerted" "$(last | grep -c 'status=stale ')" 1
ok "the timer's alert" "$(subjects)" 1
systemctl stop lm-backup-watchdog.timer; rm -rf /etc/systemd/system/lm-backup-watchdog.timer.d; clean lm-backup-watchdog.service
rm -f $M $S/backup-watchdog.state $S/backup-watchdog.lastrun $S/backup-watchdog.alive

echo "== alerts for wider access, through the real bind mount"
scenario() { # name, reason
  run; ok "$1: $2" "$(last | grep -c "status=$2 ")" 1; ok "$1: one alert" "$(subjects)" 1
  rm -f $M $S/backup-watchdog.state
}
F=$BK/lm-db-$A.dump.age
chmod 644 $F; scenario "file world-readable" mode_too_wide; chmod 640 $F
chmod 755 $BK; scenario "folder world-readable" mode_too_wide; chmod 750 $BK
chgrp root $F; scenario "file in another group" wrong_group; chgrp lmwatch $F
ln -s $D/env $BK/planted.link; scenario "planted symlink" symlink; rm $BK/planted.link
mkdir $BK/planted.dir; scenario "planted folder" unexpected_entry; rmdir $BK/planted.dir
if command -v setfacl >/dev/null; then
  setfacl -m u:lmseo:r $F; scenario "ACL on a file" acl_present; setfacl -b $F; chmod 640 $F
  setfacl -d -m u:lmseo:r $BK; scenario "default ACL on the folder" acl_present; setfacl -b $BK; chmod 750 $BK
else
  ok "setfacl is installed" missing present
fi
cp -p $F /tmp/keep; rm $F; scenario "file gone" missing_file; cp -p /tmp/keep $F
cp -p $F /tmp/keep; chmod 600 $F; chgrp root $F; scenario "file no longer readable" unreadable; cp -p /tmp/keep $F
: > $BK/lm-db-X.dump.age.part; chmod 600 $BK/lm-db-X.dump.age.part; touch -d '3 hours ago' $BK/lm-db-X.dump.age.part; scenario "transfer left behind" failed_transfer; rm $BK/lm-db-X.dump.age.part

echo "== a wrong account is reported, not trusted"
usermod -a -G adm lmwatch
run; ok "in group adm: access_too_wide" "$(last | grep -c 'status=access_too_wide ')" 1
rm -f $M $S/backup-watchdog.state; gpasswd -q -d lmwatch adm
usermod -a -G lmwatch lmseo
ok "lmseo in lmwatch: reported" "$(with lm-seo-watch.service "/bin/sh $OPT/lm-seo-watch.sh --root $Q --mail-file $Q/mail")" 0
ok "reported as access_too_wide" "$(tail -n 1 $Q/seo-watch.log | grep -c 'access_too_wide')" 1
gpasswd -q -d lmseo lmwatch; clean lm-seo-watch.service

echo "== rollback as in the runbook"
clean lm-backup-watchdog.service
systemctl disable --now lm-backup-watchdog.timer lm-seo-watch.timer 2>/dev/null
rm /etc/systemd/system/lm-seo-watch.* /etc/systemd/system/lm-backup-watchdog.*; systemctl daemon-reload
find $BK -maxdepth 1 -type f \( -name 'lm-db-*.dump.age' -o -name 'lm-files-*.tar.age' -o -name verified.log \) -exec chgrp -h root {} + -exec chmod 600 {} +
chgrp -h root $BK; chmod 700 $BK
ok "folder back to 700" "$(mode $BK)" "700 root root"
ok "file back to 600" "$(mode $F)" "600 root root"
userdel lmwatch; userdel lmseo; groupdel lmseo 2>/dev/null; groupdel lmwatch 2>/dev/null
D2=$(st | sed 's/Z$/9Z/')
ok "the receiver stores as before" "$(store lm-db-$D2.dump.age)" "BACKUP_OK lm-db-$D2.dump.age"
ok "and at 600" "$(mode $BK/lm-db-$D2.dump.age)" "600 root root"

echo "$N checks, $FAILS failed"
[ "$FAILS" = 0 ]
