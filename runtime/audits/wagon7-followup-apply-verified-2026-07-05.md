# Wagon 7 — follow-up queue production apply VERIFIED (2026-07-05)

Owner approval: "APPROVED — apply Wagon 7 pending production migration."
Applied: 20260705235000_follow_up_tasks via Supabase MCP apply_migration ONLY
(no db push; nothing unrelated; zero code changes; no external sending; no
fake header notifications; no admin/RLS boundary weakened).
Ledger entry present.

Read-only verification (owner's 16 points):
1.  follow_up_tasks exists ✅
2.  RLS enabled ✅
3.  RLS admin-only ✅ — single policy fut_select USING is_admin()
4.  Direct writes revoked ✅ — authenticated INSERT/UPDATE/DELETE all FALSE
5.  create_follow_up_task_v1 exists ✅
6.  set_follow_up_task_status_v1 exists ✅
7.  Both SECURITY DEFINER + search_path=public ✅ (both_rpcs_secdef_pinned=2)
8.  is_admin() gate ✅ — behavioral: non-admin create → 'not_allowed'
9.  Statuses pending|done|dismissed only ✅ — DB CHECK; behavioral: 'urgent'
    → 'invalid_task'
10. No urgency/priority/score column ✅ — columns = id, subject_profile_id,
    subject_company_id, note, status, created_by, created_at, resolved_at;
    the only "urgency" token in the migration is the comment prohibiting it
11. Subject refs id-only ✅ — two nullable FK id columns, one-subject CHECK,
    no copied name/email/phone
12. Panel reads real data ✅ — merged #614 read path over follow_up_tasks
    (guard-pinned); live via auto-deploy of 66188da
13. Header NotificationPanel unchanged ✅ — guard pins that no fake feed is
    injected (verified in the merged suite)
14. No external sending ✅ — guard-pinned (no email/SMS/push/Telegram/
    webhook/outbound fetch/new transport dep); the diff's only token hits
    were the module's own prohibition comment
15. Rollback drops only 2 new fns + 1 new table ✅ (diff-verified pre-merge)
16. Guards green ✅ — merged suite 7375/7375; wagon guard 22 pins

Behavioral: admin create → 'created'; done stamps resolved_at; reopen
semantics in RPC; non-admin RLS read = 0 rows. Probe residue ZERO (0 rows
persisted after rollback). Fixture note: the admin identity had to be picked
via the DUAL signal (profile_roles) — first probe run failed on a
NULL-sub fixture, not on the guard; re-run passed fully.

TRAIN REPORT UPDATE: branch 24 follow-up/notifications production apply =
VERIFIED. No RED branches remain; the operator queue is live on the admin
control room.
