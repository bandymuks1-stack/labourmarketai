# Wagon 4 — equipment/tools production apply VERIFIED (2026-07-05)

Owner approval: "APPROVED — apply Wagon 4 pending production migration."
Applied: `20260705210000_worker_demand_required_tools` via Supabase MCP
`apply_migration` ONLY (no db push; no unrelated migrations; zero code changes).
Ledger entry present.

Read-only verification (owner's 10 points):
1. RPC exists (recreated) ✅
2. Previous transport behavior intact ✅ — a real worker identity gets the SAME
   9 approved rows as pre-apply; transport whitelist CASE unchanged in body
3. company_name / route_status / location_label / transport all present ✅
   (12-column projection; 0 rows with regressed company/route values)
4. required_tools text[] present in the worker-visible projection ✅
5. Whitelist-only ✅ — element-by-element filter over the 10 canonical taxonomy
   slugs, guard-pinned equal to app-side REQUIRED_TOOL_SLUGS
6. No free-text leak ✅ — controlled probe: poisoned payload array
   ["hand-tools","FREE TEXT injection","scaffolding","phone: +370"] projected as
   exactly {hand-tools,scaffolding}; probe FULLY ROLLED BACK (0 rows carry a
   required_tools payload key after the test)
7. No address/contact/private fields ✅ — projection structurally curated;
   profile_id only as caller gate + join key, never projected
8. Board rendering ✅ — merged #611 UI renders localized tool names via the
   existing skillNames catalogues or the honest "not stated" fallback; column
   now live (auto-deploy of 3f34708)
9. Rollback restores the transport body verbatim ✅ — guard-pinned executable-SQL
   equality with the 20260705200000 begin→commit block (diff-verified at merge)
10. Rollback-chain guard green ✅ — part of the merged suite (7313/7313; sweeps
    every *worker_demand*.down.sql for the pinned column history)

TRAIN REPORT UPDATE: branch 16 equipment/tools production apply = VERIFIED.
Live end-to-end: verified companies can state required tools on new demands;
workers see whitelisted, localized tool requirements on the board.

Owner-apply queue after this: EMPTY for the train's new work (older pre-train
drafts, e.g. 20260610190000 original_language, remain separately queued).
