#!/usr/bin/env bash
# ONE REGRESSION ISSUE PER FAILING DEPLOY STREAK (owner order 2026-11-23).
#
# Run by post-deploy-smoke.yml (job `report`) after the public and signed-in
# smoke. It reads only GitHub: the smoke results, this repository's history
# and the workflow's earlier runs. It never touches production data and never
# rolls anything back; a code rollback is a human decision.
#
#   - smoke red: open the issue, or add a comment to the one already open,
#     naming the deploy SHA, the build production served, the run, and the
#     pull requests merged since the last green smoke;
#   - smoke green: if that issue is open, say which deploy is green and
#     close it.
#
# Inputs (env): SMOKE, SIGNED_IN (job results), BUILD, DEPLOY_SHA, RUN_URL,
# GH_TOKEN. Test hook: REGRESSION_ISSUE_DRY_RUN=1 prints the issue body
# instead of calling GitHub (lib/guards/post-deploy-regression-issue.test.ts).
set -euo pipefail

TITLE="Post-deploy smoke is failing on production"
WORKFLOW_FILE="post-deploy-smoke.yml"
short() { printf '%s' "${1:0:8}"; }

green=false
if [ "${SMOKE:-}" = "success" ] && [ "${SIGNED_IN:-}" = "success" ]; then green=true; fi

# The newest earlier run of this workflow that passed on a deploy or a dispatch.
# The run in progress is not "success" yet, so it is never its own baseline.
last_green_sha() {
  if [ -n "${LAST_GREEN_SHA+x}" ]; then printf '%s' "$LAST_GREEN_SHA"; return; fi
  gh run list --workflow "$WORKFLOW_FILE" --status success --limit 30 \
    --json headSha,event \
    --jq '[.[] | select(.event == "workflow_run" or .event == "workflow_dispatch")][0].headSha // ""'
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
  prs="$(merged_since "$last" "$DEPLOY_SHA")"
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

body="$(body_for_failure)"
if [ -n "$open" ]; then
  gh issue comment "$open" --body "$body"
  echo "updated #${open}"
else
  gh issue create --title "$TITLE" --body "$body"
fi
