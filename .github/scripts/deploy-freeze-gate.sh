#!/usr/bin/env bash
# DEPLOY FREEZE GATE (owner P0 2026-11-24). The first job of deploy-vps.yml,
# before anything is built or shipped.
#
#   - An open issue with the `deploy-freeze` label, or with the regression
#     issue's exact title (its label removed by hand still freezes; opened by
#     post-deploy-regression-issue.sh when a post-deploy check genuinely
#     FAILED) refuses the deploy: BLOCKED, red, with the issue link. Closing
#     the issue lifts the freeze.
#   - Emergency security fix: a manual dispatch with emergency=true goes
#     through the freeze only when the actor is the repository owner's ACCOUNT
#     and a reason is given. It is logged on the freeze issue, and the deploy's
#     checks still run in the same run.
#     HONEST LIMIT: agent sessions act through that same account, so this check
#     cannot tell an agent from the owner. That agents never dispatch an
#     emergency is a binding policy (AGENTS.md / CLAUDE.md "Deploy freeze
#     emergency"), not something this script can enforce.
#   - An emergency request that fails either condition is refused, frozen or
#     not: the flag is never silently ignored.
#
# Inputs (env): EMERGENCY (true|false), REASON, ACTOR, OWNER, RUN_URL, GH_TOKEN,
# GH_REPO. Test hook: DEPLOY_FREEZE_OPEN stands in for the issue lookup
# ("" = none, else "<number> <url>"), and DEPLOY_FREEZE_DRY_RUN=1 prints the
# emergency log instead of posting it (lib/guards/deploy-queue.test.ts).
set -euo pipefail

LABEL="deploy-freeze"
TITLE="Post-deploy smoke is failing on production"
note() { echo "$1"; if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then echo "$1" >> "$GITHUB_STEP_SUMMARY"; fi; }

emergency=false
if [ "${EMERGENCY:-false}" = "true" ]; then
  if [ -z "${ACTOR:-}" ] || [ "${ACTOR}" != "${OWNER:-}" ]; then
    note "::error::REFUSED: an emergency deploy may be started only from the repository owner's account (${OWNER:-unknown}); actor: ${ACTOR:-unknown}."
    exit 1
  fi
  if [ -z "$(printf '%s' "${REASON:-}" | tr -d '[:space:]')" ]; then
    note "::error::REFUSED: an emergency deploy needs a reason."
    exit 1
  fi
  emergency=true
fi

if [ -n "${DEPLOY_FREEZE_OPEN+x}" ]; then
  open="$DEPLOY_FREEZE_OPEN"
else
  open="$(gh issue list --state open --label "$LABEL" --limit 1 --json number,url --jq '.[0] | select(. != null) | "\(.number) \(.url)"')"
  # The report job finds the issue by its title: an open one whose label was removed still freezes.
  if [ -z "$open" ]; then
    open="$(gh issue list --state open --search "in:title \"${TITLE}\"" --json number,url,title \
      --jq "[.[] | select(.title == \"${TITLE}\")][0] | select(. != null) | \"\(.number) \(.url)\"")"
  fi
fi

if [ -z "$open" ]; then
  note "deploy freeze: none open; the deploy may start"
  exit 0
fi

num="${open%% *}"; url="${open#* }"
if [ "$emergency" != true ]; then
  note "::error::BLOCKED: deploy freeze #${num} is open (${url}). A post-deploy check failed; normal deploys start again when that issue is closed. To ship the fix: the owner closes that issue once the fix is merged, or the owner in person dispatches emergency=true with a reason (never an agent: AGENTS.md, Deploy freeze emergency)."
  exit 1
fi

msg="Emergency deploy through the freeze, dispatched from the ${ACTOR} account: ${REASON}. Run: ${RUN_URL}. The post-deploy checks run in that same run."
if [ "${DEPLOY_FREEZE_DRY_RUN:-0}" = "1" ]; then
  echo "LOG #${num}: ${msg}"
else
  gh issue comment "$num" --body "$msg"
fi
note "EMERGENCY: deploy freeze #${num} bypassed from the owner's account (${url}); the checks still run."
