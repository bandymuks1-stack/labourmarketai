# Wagon 5 — teams/brigades production apply VERIFIED (2026-07-05)

Owner approval: "APPROVED — apply Wagon 5 pending production migration."
Applied: 20260705220000_team_brigade_org_spine via Supabase MCP apply_migration
ONLY (no db push; nothing unrelated; zero code changes; no RLS touched).
Ledger entry present.

Read-only verification (owner's 10 points):
1.  organization_type accepts 'team' — constraint now
    (company|agency|team|other) ✅
2.  Existing types still work ✅ — constraint ADD validated every existing row
3.  create_team_v1 exists; SECURITY DEFINER, pinned search_path; anon execute
    FALSE, authenticated TRUE; behavioral: non-org user → 'not_allowed',
    org owner → 'created' ✅
4.  add_org_member NOT duplicated — exactly 1 function in pg_proc ✅
5.  0035 trigger intact — probe team creation provisioned the creator's
    'owner' engagement and manages_organization(team) = true ✅
6.  get_team_capability_summary_v1 exists ✅
7.  Projection = (skill_slug, members_declared, members_confirmed) ONLY;
    behavioral: non-manager outsider gets 0 rows ✅
8.  Honest degradation — panel renders the existing empty state when no teams
    exist (guard-pinned in the merged suite) ✅
9.  Rollback discipline — diff-verified at the pre-merge six-point gate:
    zero function creation, deletes scoped to feature-created 'team' rows,
    original 0013 constraint restored verbatim, drops only the two new
    functions ✅
10. Guards green after apply — team-brigades-layer.test.ts re-run locally
    post-apply: PASS; full suite green on main (7333/7333, CI) ✅

ALL probe writes rolled back: 0 team rows, 0 create_team_v1 audit rows persist.

TRAIN REPORT UPDATE: branch 13 teams/brigades production apply = VERIFIED.
Live: org owners can create brigades, manage membership through the existing
spine, and see the honest capability summary.
