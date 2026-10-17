#!/bin/sh
# LabourMarket.ai — forced-command deploy receiver on the Agentai VPS.
#
# Installed ONCE by the owner (not by CI) as the only thing the GitHub deploy key may run:
#   useradd -r -m -s /bin/sh lmdeploy            (unprivileged; sudo limited to the two commands below)
#   /etc/sudoers.d/lmdeploy:
#     lmdeploy ALL=(root) NOPASSWD: /root/lm-prod/bin/lm-deploy-receive.sh *
#   /home/lmdeploy/.ssh/authorized_keys (one line):
#     command="sudo /root/lm-prod/bin/lm-deploy-receive.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA... deploy@github
# so `ssh lmdeploy@vps "<anything>"` always runs THIS script, which only honours:
#   deploy <sha> <sha256>   (tarball on stdin)  — extract, start, health, rollback on failure
#   status                  — current release + container health
#   rollback <sha>          — restart a previous release that is still on disk
# It prints names, sizes, http codes and outcomes only; never env values.
set -eu
umask 022
D=/root/lm-prod; REL=$D/releases; BIN=$D/bin; KEEP=3
CMD="${SSH_ORIGINAL_COMMAND:-$*}"
set -- $CMD
ACTION="${1:-}"; SHA="${2:-}"; SUM="${3:-}"
hex40() { case "$1" in *[!0-9a-f]*|"") return 1;; esac; [ "${#1}" -eq 40 ]; }
hex64() { case "$1" in *[!0-9a-f]*|"") return 1;; esac; [ "${#1}" -eq 64 ]; }
current() { readlink "$D/current" 2>/dev/null | sed 's#.*/##'; }
health() { docker inspect --format '{{.State.Health.Status}}' labourmarket-prod 2>/dev/null || echo none; }
wait_healthy() { i=0; while [ $i -lt 36 ]; do s=$(health); [ "$s" = "healthy" ] && return 0; [ "$(docker inspect --format '{{.State.Status}}' labourmarket-prod 2>/dev/null)" != "running" ] && return 1; i=$((i+1)); sleep 5; done; return 1; }
case "$ACTION" in
  status)
    echo "current=$(current) health=$(health) restarts=$(docker inspect --format '{{.RestartCount}}' labourmarket-prod 2>/dev/null || echo -)"
    ls -1 "$REL" 2>/dev/null | sed 's/^/release /';;
  deploy)
    hex40 "$SHA" && hex64 "$SUM" || { echo "DEPLOY_FAIL bad arguments"; exit 1; }
    PREV=$(current); echo "previous=${PREV:-none}"
    umask 077; T=$(mktemp -d "$D/.incoming.XXXXXX"); trap 'rm -rf "$T"' EXIT INT TERM
    cat > "$T/release.tgz"
    echo "received bytes=$(stat -c %s "$T/release.tgz")"
    echo "$SUM  $T/release.tgz" | sha256sum -c - >/dev/null || { echo "DEPLOY_FAIL sha256 mismatch"; exit 1; }
    rm -rf "$REL/$SHA.new"; mkdir -p "$REL/$SHA.new"; tar -C "$REL/$SHA.new" -xzf "$T/release.tgz"
    [ -f "$REL/$SHA.new/apps/web/server.js" ] || { echo "DEPLOY_FAIL artefact lacks apps/web/server.js"; rm -rf "$REL/$SHA.new"; exit 1; }
    chown -R 1000:1000 "$REL/$SHA.new"; chmod -R u+rwX,go+rX "$REL/$SHA.new"
    rm -rf "$REL/$SHA"; mv "$REL/$SHA.new" "$REL/$SHA"
    echo "extracted files=$(find "$REL/$SHA" -type f | wc -l)"
    if sh "$BIN/lm-prod-run.sh" "$SHA" && wait_healthy; then
      code=$(curl -s -o /dev/null -m 20 -w '%{http_code}' -H 'Host: labourmarket.ai' -H 'X-Forwarded-Proto: https' http://127.0.0.1:3200/api/health)
      echo "health=$(health) http=$code"
      if [ "$code" = "200" ]; then
        # keep the newest $KEEP releases (never the one just started, never the previous one)
        ls -1t "$REL" | grep -vE "^($SHA|${PREV:-none})$" | tail -n +$((KEEP-1)) | while read -r old; do rm -rf "$REL/$old" && echo "pruned $old"; done
        echo "DEPLOY_OK $SHA"; exit 0
      fi
    fi
    echo "deploy of $SHA unhealthy: $(docker logs --tail 20 labourmarket-prod 2>&1 | grep -ciE 'error|fatal') error lines in the last 20"
    if [ -n "$PREV" ] && [ -d "$REL/$PREV" ]; then
      sh "$BIN/lm-prod-run.sh" "$PREV" >/dev/null && wait_healthy && echo "ROLLED_BACK to $PREV health=$(health)" || echo "ROLLBACK_FAILED $PREV health=$(health)"
    else
      echo "ROLLBACK_IMPOSSIBLE no previous release"
    fi
    echo "DEPLOY_FAIL $SHA"; exit 1;;
  rollback)
    hex40 "$SHA" && [ -d "$REL/$SHA" ] || { echo "ROLLBACK_FAIL release not on disk"; exit 1; }
    sh "$BIN/lm-prod-run.sh" "$SHA" >/dev/null && wait_healthy && echo "ROLLBACK_OK $SHA health=$(health)" || { echo "ROLLBACK_FAIL $SHA health=$(health)"; exit 1; };;
  *) echo "refused: unknown command"; exit 1;;
esac
