#!/usr/bin/env bash
# ============================================================================
# G-01 — walk the operational loop end to end and print the report.
#
#   interest -> booking -> engagement -> assignment -> work object -> hours
#   -> split allocation -> timesheet -> submit -> review -> approve
#
# Runs g01-operational-loop.sql, which walks the loop TWICE (as shipped, then
# with the canonical engagement_contexts row) inside ONE transaction that ends
# in a deliberate `raise exception`. Nothing commits. The residue check runs
# straight afterwards.
#
# Usage:
#   DATABASE_URL='postgresql://...' bash scripts/db-proof/g01-operational-loop.sh
#
# SAFE against production BY CONSTRUCTION -- the probe cannot commit -- but the
# residue check is still run every time and its output must be read, not
# assumed.
#
# ---------------------------------------------------------------------------
# HARNESS RULE (2026-09-01, learned the hard way)
#
# `set -e` is deliberately NOT used. This script's whole job is to run a
# command that EXITS NON-ZERO ON SUCCESS: psql returns non-zero because the
# probe raises P0001 to force its own rollback. Under `set -e` the shell would
# leave before the completion sentinel was written, and any waiter watching
# this log for the sentinel would hang forever -- a harness defect that looks
# exactly like a product hang.
#
# So: `set -uo pipefail` only, the sentinel is emitted from an EXIT trap so it
# is written on every path (success, failure, interrupt), and the real verdict
# travels in the exit code, not in whether the script reached its last line.
# ============================================================================
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROBE="$HERE/g01-operational-loop.sql"
RESIDUE="$HERE/g01-operational-loop.residue.sql"
SENTINEL="G01_RUNNER_COMPLETE"

verdict="UNKNOWN"
# Written on EVERY exit path, including a non-zero psql and a Ctrl-C. A waiter
# may block on this line; nothing below it may be load-bearing.
finish() { echo "${SENTINEL} verdict=${verdict}"; }
trap finish EXIT

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set -- point it at the target database." >&2
  verdict="NO_DATABASE_URL"
  exit 2
fi

echo "=============================================================="
echo " G-01 operational loop probe (rolls itself back)"
echo "=============================================================="

# ON_ERROR_STOP is intentionally OFF: the P0001 rollback IS the success path,
# and stopping on it would hide the report the exception message carries.
out="$(psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -f "$PROBE" 2>&1)"
echo "$out"

if printf '%s' "$out" | grep -q 'G01_REPORT'; then
  verdict="REPORT_EMITTED"
else
  verdict="NO_REPORT"
fi

echo
echo "=============================================================="
echo " Residue check -- every probe_* row must be 0"
echo "=============================================================="
residue="$(psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -tA -f "$RESIDUE" 2>&1)"
echo "$residue"

# A probe_* row above 0 means the rollback did not happen. That outranks
# whether the report was emitted.
if printf '%s' "$residue" | grep -E '^probe_[a-z_]+\|[1-9]' >/dev/null; then
  verdict="RESIDUE_LEFT"
  echo
  echo "RESIDUE LEFT IN THE DATABASE -- remove it before continuing." >&2
  exit 1
fi

[ "$verdict" = "REPORT_EMITTED" ] || exit 1
exit 0
