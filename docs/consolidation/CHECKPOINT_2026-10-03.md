# Consolidation checkpoint — 2026-10-03

Docs only. Nothing here changes code, schema or any PR. Detail lives in the sibling files:
[PR_TABLE](PR_TABLE.md) · [CAPABILITY_RECONCILIATION](CAPABILITY_RECONCILIATION.md) ·
[ARCHITECTURE_MATRIX_APPS_DESIGN](ARCHITECTURE_MATRIX_APPS_DESIGN.md) ·
[LMC_BILLING_MODEL](LMC_BILLING_MODEL.md) · [SECURITY_PRIVACY_VERDICTS](SECURITY_PRIVACY_VERDICTS.md) ·
[billing-option-b.patch.txt](billing-option-b.patch.txt)

## A–C. Snapshot
- main `df5caa089` (2026-10-03). 54 open PRs (37 draft, 34 `needs-human-gate`).
- Production ledger max version `20261003071338`; read-only SELECT checks only.

## G. Launch blockers
| # | Item | State | Evidence |
|---|---|---|---|
| P0 | EVID-6 reply visible to record author before moderation | LIVE in prod (1 unpublished reply of 1). Fix = #2131, not applied; needs owner approval sentence | policy qual compares `r.moderation_status` (record's), read back 2026-10-03 |
| P0 | MCP demand confirm refused under enforced billing | main defect; fix = #2010 | LMC_BILLING_MODEL §gates (prod env not re-measured) |
| P0 | #2126 merging without Option B | `BILLING_RECOVERY_ENABLED` absent; CRON_SECRET alone can write | patch file |
| P1 | #1815 agency revocation | v2 RPC has no share gate, v1 has | prod `pg_get_functiondef` read-back |
| P1 | #1266 `ai_runs.profile_id` kept forever | repo/ledger only |
| P1 | PER-12 export incomplete | 17 relations unclassified/mislabeled, storage content, `*_by` ids | verdicts §2 |
| P1 | Webhook `payload.refs` missing | patch file |

## D/H. PR actions (counts, sum 54)
MERGE_AS_IS 5 · REBASE_AND_MERGE 10 · FIX_THEN_MERGE 9 · SECURITY_FIX_FIRST 3 ·
OWNER_GATE_REQUIRED 13 · SUPERSEDED_CLOSE 4 (#1426 #1430 #1436 #1646, each with a named
canonical home) · ABSORB 3 · DEFER_POST_LAUNCH 5 · INVESTIGATE_PRODUCTION_FIRST 2.
Closing #1641 requires a fresh EVID-2 PR first (EVID-2 not covered by #2131).

## F. Capabilities (108): BEFORE → VERIFIED
BUILT_AND_USABLE 34→34 · PARTIAL 65→66 · BUILT_NOT_CONNECTED 2→1 · BLOCKED 2→2 ·
ARCHITECTURE_ONLY 2→2 · MISSING 3→2 · RETIRED 0→1. Open PRs earn no credit.

## K. LMC
One append-only ledger, derived balances, SECURITY DEFINER writes only, no second wallet.
Built but unarmed: 0 rows, all flags false, no spend/top-up caller, no price table on main.
Three plan catalogues (code, DB, Stripe env) can drift; EUR 99 held twice.

## L. Design
Practical baseline #2110 (contained in superset #2125); frozen contract in
`docs/design/final/` still wins. No `DESIGN_BASELINE_FOR_FINAL_PASS` file exists — this
section defines it. No visual lock; owner pass pending.

## M. Train
T0 no-gate (#2080 #2082 dependabot #1835) → T1 security (#2131, #2010, #1815, #1266, EVID-2)
→ T2 billing (#2122, Option B patch, #2126, #2127) → T3 work/planning one at a time
(#2079 #2123 #2086 #2124) → T4 evidence → T5 owner-gated DB → T6 design/SEO → T7 post-launch.
Guard counters collide across #2131/#2079/#2123/#2124/#2086, so merge serially.

## Owner decisions needed
1. Approve applying #2131 (RED, apply via MCP `apply_migration` only).
2. Should #2127 sit behind `BILLING_RECOVERY_ENABLED`?
3. Approve closing #1430, #1436, #1646 (superseded).
4. Existing open: ORG-2, EVID-2, MKT-7, GOV-1.
