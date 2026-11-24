# Wagon 6 — handover passport production apply VERIFIED (2026-07-05)

Owner approval: "APPROVED — apply Wagon 6 pending production migration."
Applied: 20260705230000_project_handover_passport via Supabase MCP apply_migration
ONLY (no db push; nothing unrelated; zero code changes; no external notifications;
no project/assignment/manager RLS weakened — only the NEW table got its own policy).
Ledger entry present.

Read-only verification (owner's 14 points):
1.  Table exists ✅
2.  RLS enabled ✅
3.  SELECT = (can_manage_project(project_id) OR is_admin()) — the ONLY policy ✅
4.  add_project_handover_entry_v1 exists ✅
5.  SECURITY DEFINER + search_path=public ✅
6.  Writes RPC-only ✅ — authenticated direct INSERT/UPDATE/DELETE all FALSE;
    behavioral: non-manager RPC write → 'not_allowed'
7.  Status enum = preparation|in_progress|handover_declared|closed (DB CHECK) ✅
8.  Fake statuses impossible ✅ — CHECK excludes them; behavioral probe:
    'completed' → 'invalid_entry'
9.  Caps enforced ✅ — 1001-char body → 'invalid_entry' (+ DB CHECK ≤1000);
    500-entry cap in RPC body
10. Read service exposes no author ids ✅ — handover-passport.ts never selects
    created_by (guard-pinned in the merged suite)
11. Responsible parties = real active project_worker_assignments only ✅
    (read path guard-pinned; names only)
12. Honest empty-state degradation ✅ (guard-pinned; pre-apply 42P01 probe path
    now naturally inactive)
13. Rollback drops ONLY the new function + new table ✅ (diff-verified at the
    pre-merge six-point gate; zero function creation)
14. No photos/defects/warranty/payment/legal automation ✅ (scope diff-verified;
    honestly documented as out of scope)

Behavioral probe residue: ZERO — all writes rolled back (valid manager write,
fake-status, oversize, non-manager attempts all inside the aborted transaction).
Non-manager RLS read check: 0 rows under `set local role authenticated`.

TRAIN REPORT UPDATE: branch 19 handover passport production apply = VERIFIED.
Live: project managers can maintain the append-only handover passport on the
operations page; workers/outsiders cannot read it.
