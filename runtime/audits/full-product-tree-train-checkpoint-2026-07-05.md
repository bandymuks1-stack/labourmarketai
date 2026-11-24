# Full Product Tree Train — CHECKPOINT (2026-07-05)

`main` @ `8ede6cd`. Mapped queue (#607 rows 1-8) COMPLETE. Wording per the owner's
FINAL CLAIM LOCK (final-claim-lock-parked-branches-2026-07-05.md):

**"Mapped queue complete; no RED branches remain; agency and billing readiness are
explicitly owner-decision-gated."**

## Wagons delivered this train (all merged green + six-point gated; applies verified)

| Wagon | PR | Branch closed | Prod apply |
|---|---|---|---|
| RM reality map | #607 | — (30-branch map) | n/a |
| 1 contact permission | #608 | 20 (part) | 20260705170000 VERIFIED |
| 2 messaging minimum | #609 | 20 CLOSED | none |
| 3 transport | #610 | 15 | 20260705200000 VERIFIED |
| 4 equipment | #611 | 16 (was RED) | 20260705210000 VERIFIED |
| 5 teams/brigades | #612 | 13 | 20260705220000 VERIFIED |
| 6 handover passport | #613 | 19 | 20260705230000 VERIFIED |
| 7 follow-up queue | #614 | 24 (last RED) | 20260705235000 VERIFIED |
| 8 sales intake panel | #615 | 23 (app-side) | none needed |

Every apply: MCP-only, read-only verified with rolled-back probes, zero residue,
rollback chain guard-enforced (wagon-3 caveat CLOSED by #611).

## Tree position (per reality map taxonomy + this train)

- RED remaining: **0**
- Owner-decision-gated YELLOW (NOT payments, NOT green — see claim lock table):
  **21 agency/recruiter consolidation** (decision: fold into company workspace vs
  keep persona) · **29 billing readiness** (billing sprint + pricing decisions;
  scaffold real, live hard-blocked)
- Deliberate minimum-scope residues (documented per wagon, non-blocking):
  team availability/matching visibility (13), match-explanation transport dim (15),
  waitlist admin-read policy decision (23), user-facing notification feed (24 —
  internal queue only by owner rule)
- **30 payments/provider: OWNER PAYMENT GATE** — untouched, structurally blocked.

## Validation at checkpoint
typecheck / lint / build / constitution / pilot+fit+pricing honesty / i18n-debt /
route-smoke: PASS · tests 7389/7389 (486 files) · ratchets = migrations = 109 ·
9 PRs merged, 5 prod applies verified, 0 manual deploys, push-lock honoured on
every wagon.

## What unparks the last two branches
- Branch 21: owner picks consolidation direction (A: typed view in company
  workspace / B: separate persona) → one wagon implements it.
- Branch 29: owner green-lights the billing sprint with pricing/plan decisions
  (still NO provider connection) → readiness closure wagon.
