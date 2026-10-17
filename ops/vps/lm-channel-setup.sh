#!/bin/sh
# One-time setup of the LIMITED deploy/backup channel on the VPS (owner GO 2026-10-17).
#   sh lm-channel-setup.sh /path/to/deploy_key.pub     # the GitHub deploy key's PUBLIC half (scp'd here first)
# Creates: user lmdeploy (no password, shell /bin/sh, no sudo except the receiver), forced-command
# authorized_keys (deploy|status|rollback|backup only), sudoers line, /root/lm-prod/bin/lm-deploy-receive.sh (700),
# the age backup key pair (/root/lm-prod/backup.age.key 600; public half printed for ops/vps/backup.age.pub),
# /root/lm-prod/backups (700). Prints public values only. Idempotent.
set -eu
PUB="${1:?usage: lm-channel-setup.sh <deploy_key.pub>}"
[ -f "$PUB" ] && grep -qE '^ssh-ed25519 AAAA' "$PUB" || { echo "STOP: $PUB is not an ed25519 public key"; exit 1; }
D=/root/lm-prod; BIN=$D/bin; RCV=$BIN/lm-deploy-receive.sh
[ -f "$RCV" ] || { echo "STOP: $RCV missing (scp ops/vps/lm-deploy-receive.sh first)"; exit 1; }
chmod 700 "$RCV"; chown root:root "$RCV"
id lmdeploy >/dev/null 2>&1 || useradd -r -m -s /bin/sh -c "LabourMarket deploy channel (forced command only)" lmdeploy
passwd -l lmdeploy >/dev/null 2>&1 || true
install -d -m 700 -o lmdeploy -g lmdeploy /home/lmdeploy/.ssh
printf 'command="sudo %s",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty,restrict %s\n' "$RCV" "$(cut -d' ' -f1,2 "$PUB") deploy@github" > /home/lmdeploy/.ssh/authorized_keys
chmod 600 /home/lmdeploy/.ssh/authorized_keys; chown lmdeploy:lmdeploy /home/lmdeploy/.ssh/authorized_keys
printf 'lmdeploy ALL=(root) NOPASSWD: %s\n' "$RCV" > /etc/sudoers.d/lmdeploy; chmod 440 /etc/sudoers.d/lmdeploy
visudo -cf /etc/sudoers.d/lmdeploy >/dev/null || { echo "STOP: sudoers invalid"; rm -f /etc/sudoers.d/lmdeploy; exit 1; }
# sshd must allow public-key auth for the user (HestiaCP default: yes). Password auth is irrelevant: the account is locked.
sshd -T 2>/dev/null | grep -iE '^(pubkeyauthentication|permitrootlogin)' | sed 's/^/sshd: /'
command -v age >/dev/null 2>&1 || { apt-get install -y -qq age >/dev/null 2>&1 || { echo "STOP: could not install age"; exit 1; }; }
umask 077; install -d -m 700 "$D/backups"
if [ ! -f "$D/backup.age.key" ]; then age-keygen -o "$D/backup.age.key" 2>/dev/null; fi
chmod 600 "$D/backup.age.key"
echo "lmdeploy: $(id lmdeploy)"
echo "authorized_keys: $(wc -l < /home/lmdeploy/.ssh/authorized_keys) line(s), forced command $RCV"
echo "sudoers: /etc/sudoers.d/lmdeploy OK"
echo "age public key (commit as ops/vps/backup.age.pub):"
grep -o 'age1[a-z0-9]*' "$D/backup.age.key"
echo "age private key: $D/backup.age.key (600) — the owner takes an OFFLINE copy; without it no backup can be decrypted"
echo "host key for VPS_DEPLOY_KNOWN_HOSTS:"; ssh-keyscan -t ed25519 127.0.0.1 2>/dev/null | sed 's/^127\.0\.0\.1/76.13.77.40/'
echo "SETUP_OK"
