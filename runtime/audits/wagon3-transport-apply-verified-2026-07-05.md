# Wagon 3 — transport production apply VERIFIED (2026-07-05)

Owner approval: "APPROVED — apply Wagon 3 pending production migration."
Applied: `20260705200000_worker_demand_transport` via Supabase MCP `apply_migration`
ONLY (no db push; no other migration; zero code changes). Ledger entry present.

Pre-apply state check (important): production was running the `20260705130000`
location-label body (confirmed in the applied ledger + live projection), so the
recreate = live body + ONE transport column — previous behavior preserved exactly.

Read-only verification (owner's 8 points):
1. RPC exists (recreated) ✅
2. Previous 20260705130000 behavior intact ✅ — same worker gate, Model-A verified
   join, accommodation whitelist, location_label subselect; behavioral run as a real
   worker returns the SAME 9 approved rows as before the apply
3. company_name + route_status still present ✅ (9/9 rows carry both)
4. transport column present in the worker-visible projection ✅
5. Whitelist-only ✅ — structural CASE whitelist (provided|compensated|not_provided|
   unknown → else NULL); live check: 0 values outside the whitelist (currently 0
   demands state transport — honest unknown default)
6. No address/contact/private fields ✅ — projection is structurally the 11 curated
   columns; address_text/locality/contacts/profile ids not projectable
7. Loader no longer degrades ✅ — column exists; board renders enum label or "—"
   per data (merged #610 UI, live via auto-deploy of 30f039c)
8. Rollback ⚠️ PARTIAL — the rollback file restores the Model-A definition
   (20260702170000) VERBATIM, which is safe (loader tolerates missing columns,
   graceful degradation, per the rollback's own note) but is ONE STEP EARLIER than
   the immediately-previous applied definition (20260705130000, incl.
   location_label). Exact-restore path if ever needed: re-apply the 20260705130000
   migration body (present in repo). Documented here; not an apply blocker.

TRAIN REPORT UPDATE: branch 15 transport production apply = VERIFIED.
Transport is now live end-to-end for verified-company demand; values appear as
companies state transport conditions on new/updated demands.

## ROLLBACK CAVEAT LOCK (owner, 2026-07-05) — status: CLOSED by PR #611 (dc45bad → merged) — all four requirements diff-verified

Point 8 stays PARTIAL/YELLOW — NOT green — until structurally corrected. Owner-locked
closure requirements, injected into the running Wagon 4 (equipment) agent, which
touches the same RPC:
1. Wagon 4's rollback must restore the CURRENT repo-latest RPC definition verbatim
   (full 20260705200000 body incl. location_label + transport + company_name +
   route_status + all curated fields).
2. Same PR corrects 20260705200000's down file to restore its true predecessor
   (20260705130000 body), not Model-A.
3. New guard fails if any worker-demand-RPC rollback restores an older
   Model-A-only body.
4. Wagon 4 report must state "Wagon 3 rollback caveat CLOSED" or carry it
   explicitly as YELLOW debt.
This section gets a CLOSED stamp only when the merged PR satisfies all four.
