# Full Product Tree Train — FINAL CLOSURE (2026-07-05, re-issued after residual closure)

`main` @ `e423534`; production ledger through `20260705240000_agency_legacy_retype`.
All locks satisfied (FINAL CLAIM LOCK wording #3 conditions met; AGENCY LEGACY
RESIDUAL LOCK: CLOSED with proof).

**"Full product tree minus payments is source-proven. Remaining major gate:
payment provider / billing connection."**

## Production applies — LEDGER-RECONCILED (not from memory)
2026-07-05 ledger entries, in order:
1. 20260705150000 customer_requests_status_transition_guard — PR15 (pre-train)
2. 20260705170000 conversation_counterpart_identity — wagon 1
3. 20260705200000 worker_demand_transport — wagon 3
4. 20260705210000 worker_demand_required_tools — wagon 4
5. 20260705220000 team_brigade_org_spine — wagon 5
6. 20260705230000 project_handover_passport — wagon 6
7. 20260705235000 follow_up_tasks — wagon 7
8. 20260705240000 agency_legacy_retype — branch-21 residual closure
= TRAIN applies: 6 wagon migrations + 1 residual data retype = 7 (earlier "5" was
an undercount — corrected per owner instruction); PR15's apply preceded the train.
Every apply: MCP-only, read-only verified, probes rolled back, zero residue.

## Train totals
11 PRs merged green (#607–#617) + the retype apply; six-point gate on every
wagon; push-lock honoured; 0 manual deploys; tests 7214 → 7413 (488 files);
ratchets = repo migrations = 109 (the retype is a ledger-recorded data apply,
fully documented with rollback tuples in agency-legacy-residual-plan; no schema
change); drift cap 7 → 4.

## Final states
- RED: 0 · unclassified: 0 (route-truth-map CI-enforced)
- Branch 21: GREEN — Direction A live AND legacy residual CLOSED (3 companies
  retyped; agencies/agency_workers preserved as archive; agency mode now lights
  up for the 3 legacy owners)
- Branch 29: GREEN (scoped) — capture-impossible guard-proven (24 assertions);
  pricing state = draft_pricing, an owner-editable config flip to
  owner_confirmed when prices are final (separate, non-blocking, never enables
  payments)
- Branch 30: **BLOCKED / OWNER PAYMENT GATE** — structurally blocked AND
  guard-proven capture-impossible. Not connected. Not to be connected without
  separate owner approval.
- Documented minimum-scope residues per wagon remain honest YELLOW notes,
  non-blocking (team availability/matching dims, waitlist admin-read policy,
  user-facing notification feed by owner rule, i18n da/de ratchet).
