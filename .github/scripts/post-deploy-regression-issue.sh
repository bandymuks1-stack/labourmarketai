#!/usr/bin/env bash
# ONE REGRESSION ISSUE PER FAILING DEPLOY STREAK (owner order 2026-11-23).
#
# Run by post-deploy-smoke.yml (job `report`) after the public and signed-in
# smoke. It reads only GitHub: the smoke results, this repository's history
# and the workflow's earlier runs. It never touches production data and never
# rolls anything back; a code rollback is a human decision.
#
#   - smoke red (FAIL): open the issue with the `deploy-freeze` label, or add
#     a comment to the one already open (and make sure it carries the label),
#     naming the deploy SHA, the build production served, the run, and the
#     pull requests merged since the last green smoke. While an open issue
#     carries `deploy-freeze`, deploy-vps.yml refuses normal deploys;
#   - smoke green: if that issue is open, say which deploy is green and
#     close it, which lifts the freeze.
#
#   - production moved to another build during the run (SMOKE_WINDOW or
#     SIGNED_IN_WINDOW = changed): the run proves nothing about either build,
#     so the issue is left exactly as it is;
#   - the public half was BLOCKED (SMOKE_STATE = blocked: production never
#     settled on the deploy's build): nothing ran, the issue is left exactly
#     as it is;
#   - the walk brakes refused (SIGNED_IN_BRAKE = refused): the signed-in
#     journeys did NOT run. That is not a failure. With a green public half
#     the issue is left exactly as it is (no regression claimed, nothing
#     closed); with a red public half the issue names the public failure and
#     says the signed-in half did not run.
#
# The baseline is the BUILD a green run verified, kept as that run's
# `verified-build` artifact. A run's own head SHA is the newest main commit
# when it started (workflow_run), not what it tested (Codex review on #3271).
#
# Inputs (env): SMOKE, SIGNED_IN (job results), SMOKE_WINDOW, SIGNED_IN_WINDOW,
# SMOKE_STATE (ran | blocked), SIGNED_IN_BRAKE (clear | refused),
# BUILD, DEPLOY_SHA, RUN_URL, GH_TOKEN. Test hooks: REGRESSION_ISSUE_DRY_RUN=1
# prints the issue body instead of calling GitHub, and LAST_GREEN_SHA stands in
# for the artifact lookup (lib/guards/post-deploy-regression-issue.test.ts).
set -euo pipefail

TITLE="Post-deploy smoke is failing on production"
FREEZE_LABEL="deploy-freeze"
# The checks run inside deploy-vps.yml (the one deploy queue); a manual re-check
# runs post-deploy-smoke.yml on its own. A green run of either keeps the build.
WORKFLOW_FILES="deploy-vps.yml post-deploy-smoke.yml"
short() { printf '%s' "${1:0:8}"; }

say() { if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "$1" >> "$GITHUB_OUTPUT"; fi; }
note() { echo "$1"; if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then echo "$1" >> "$GITHUB_STEP_SUMMARY"; fi; }

if [ "${SMOKE_STATE:-}" = "blocked" ]; then
  note "BLOCKED / NOT RUN: production never settled on the deploy's build, so no check ran; the regression issue is left unchanged."
  say "green=false"
  exit 0
fi

if [ "${SMOKE_WINDOW:-}" = "changed" ] || [ "${SIGNED_IN_WINDOW:-}" = "changed" ]; then
  echo "WINDOW CHANGED: production moved to another build during the smoke; the regression issue is left unchanged."
  say "green=false"
  exit 0
fi

# A refused brake is NOT RUN, never a failure and never a pass.
if [ "${SIGNED_IN_BRAKE:-}" = "refused" ]; then
  SIGNED_IN="not run (the walk brakes refused)"
  if [ "${SMOKE:-}" = "success" ]; then
    note "NOT RUN: the walk brakes refused, so the signed-in smoke did not run; the regression issue is left unchanged."
    say "green=false"
    exit 0
  fi
fi

green=false
if [ "${SMOKE:-}" = "success" ] && [ "${SIGNED_IN:-}" = "success" ]; then green=true; fi

# The commit production served, resolved from the build id /api/health gave;
# the deploy run's head SHA when the build id cannot be resolved here.
tested_sha() {
  local full=""
  if [ -n "${BUILD:-}" ]; then full="$(git rev-parse --verify --quiet "${BUILD}^{commit}" 2>/dev/null || true)"; fi
  printf '%s' "${full:-$DEPLOY_SHA}"
}

# The newest earlier run of this workflow that passed on a deploy or a dispatch.
# The run in progress is not "success" yet, so it is never its own baseline.
last_green_sha() {
  if [ -n "${LAST_GREEN_SHA+x}" ]; then printf '%s' "$LAST_GREEN_SHA"; return; fi
  local ids id dir b full wf
  ids=""
  for wf in $WORKFLOW_FILES; do
    ids="$ids $(gh run list --workflow "$wf" --status success --limit 30 \
      --json databaseId,event,createdAt \
      --jq '.[] | select(.event == "workflow_run" or .event == "workflow_dispatch") | "\(.createdAt) \(.databaseId)"' || true)"
  done
  # Newest first across both workflows.
  ids="$(printf '%s\n' $ids | paste -d' ' - - | sort -r | awk '{print $2}')"
  for id in $ids; do
    dir="$(mktemp -d)"
    if gh run download "$id" -n verified-build -D "$dir" >/dev/null 2>&1 && [ -s "$dir/verified-build.txt" ]; then
      b="$(tr -dc '0-9a-f' < "$dir/verified-build.txt")"
      full="$(git rev-parse --verify --quiet "${b}^{commit}" 2>/dev/null || true)"
      if [ -n "$full" ]; then printf '%s' "$full"; return; fi
    fi
  done
}

# Merged pull requests between the last green deploy and this one, newest first.
# A squash merge carries "(#n)" at the end of its subject.
merged_since() {
  local from="$1" to="$2"
  if [ -n "$from" ] && git cat-file -e "${from}^{commit}" 2>/dev/null && git cat-file -e "${to}^{commit}" 2>/dev/null; then
    git log --format='%s' "${from}..${to}"
  else
    git log --format='%s' -20 "$to" 2>/dev/null || true
  fi | grep -E '\(#[0-9]+\)$' | sed -E 's/^(.*) \((#[0-9]+)\)$/- \2 \1/' || true
}

body_for_failure() {
  local last prs since
  last="$(last_green_sha || true)"
  prs="$(merged_since "$last" "$(tested_sha)")"
  if [ -n "$last" ]; then
    since="since the last green smoke on \`$(short "$last")\`"
  else
    since="(no earlier green smoke found; the last 20 commits)"
  fi
  cat <<EOF
**Deploy:** \`$(short "$DEPLOY_SHA")\` (production build \`${BUILD:-unread}\`)
**Smoke:** public \`${SMOKE:-unknown}\` · signed-in \`${SIGNED_IN:-unknown}\`
**Run:** ${RUN_URL}

**Pull requests merged ${since}:**
${prs:-- none found in that range}

The regression is in one of these changes. No data was rolled back; a code rollback is a human decision.
EOF
}

if [ "$green" = true ]; then
  printf '%s\n' "$(tested_sha)" > verified-build.txt
fi
say "green=$green"

if [ "${REGRESSION_ISSUE_DRY_RUN:-0}" = "1" ]; then
  if [ "$green" = true ]; then echo "GREEN $(short "$DEPLOY_SHA")"; else body_for_failure; fi
  exit 0
fi

open="$(gh issue list --state open --search "in:title \"${TITLE}\"" --json number,title \
  --jq "[.[] | select(.title == \"${TITLE}\")][0].number // \"\"")"

if [ "$green" = true ]; then
  if [ -n "$open" ]; then
    gh issue comment "$open" --body "Green again on deploy \`$(short "$DEPLOY_SHA")\` (build \`${BUILD:-unread}\`): ${RUN_URL}"
    gh issue close "$open"
    echo "closed #${open}: the smoke is green on $(short "$DEPLOY_SHA")"
  else
    echo "smoke green on $(short "$DEPLOY_SHA"); no regression issue open"
  fi
  exit 0
fi

body="$(body_for_failure)
**Deploy freeze:** while this issue is open with the \`${FREEZE_LABEL}\` label, deploy-vps.yml refuses normal deploys. Closing it lifts the freeze; the next deploy and its checks must pass. An owner-only emergency deploy (\`emergency=true\` with a reason) still runs the checks and is logged here."
gh label create "$FREEZE_LABEL" --color B60205 --description "A post-deploy check failed: normal deploys are refused until this issue is closed" >/dev/null 2>&1 || true
if [ -n "$open" ]; then
  gh issue comment "$open" --body "$body"
  gh issue edit "$open" --add-label "$FREEZE_LABEL"
  echo "updated #${open} (${FREEZE_LABEL})"
else
  gh issue create --title "$TITLE" --label "$FREEZE_LABEL" --body "$body"
fi
