#!/usr/bin/env bash
# When did the last database backup actually reach the VPS? Prints the time of the
# newest `db-backup.yml` run whose "Ship to the VPS" step succeeded (ISO 8601 UTC),
# or nothing when none of the recent runs shipped.
#
# A green run is not enough: a scheduled run the guard skipped and a
# `restore_drill_only` run are both green and ship nothing.
#
# Exits non-zero when the GitHub API cannot be read, so a caller can tell "unknown"
# from "none". Needs GH_TOKEN + GH_REPO (or GITHUB_REPOSITORY) and `actions: read`.
set -euo pipefail

repo="${GH_REPO:-$GITHUB_REPOSITORY}"
runs=$(gh api "repos/$repo/actions/workflows/db-backup.yml/runs?status=success&per_page=40" \
  --jq '.workflow_runs[] | "\(.id) \(.updated_at)"')

while read -r id finished; do
  [ -n "$id" ] || continue
  shipped=$(gh api "repos/$repo/actions/runs/$id/jobs" \
    --jq '[.jobs[].steps[]? | select((.name | startswith("Ship to the VPS")) and .conclusion == "success")] | length')
  if [ "$shipped" -gt 0 ]; then
    echo "$finished"
    exit 0
  fi
done <<<"$runs"
