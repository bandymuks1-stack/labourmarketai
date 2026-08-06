# SEQUENTIAL W EXECUTION TRAIN — canonical next-window command

State: `W1_W22_MATRIX_UPDATED_NEXT_INCOMPLETE_W_IDENTIFIED`
Source of truth for per-W state: `docs/program/W1_W22_CURRENT_STATE_MATRIX.md`
(updated 2026-08-07 against main `779357aa` + PR #1048 `3115747a` — refresh the
matrix row you touch before AND after every slice).

**W6 is CLOSED** (`W6_FIT_NOT_RATING_SURFACE_SHIPPED_AND_PRODUCTION_PROVEN`).
The queue below starts at **W7**.

## Execution doctrine (owner directive 2026-08-06 §11 — BINDING)

1. Take EXACTLY ONE W.
2. Audit current truth first (read code + migrations + ledger on CURRENT
   main — never trust an old W report; the 08-03 baseline was already wrong
   about W2/W6/W8/W10/W11/W12 three days later).
3. Define the remaining slices for that W in its audit/baseline doc.
4. Implement ONE coherent slice.
5. Test locally (unit + guards; db-proof for schema).
6. Browser-prove (local stack; 1440 + 375; zero console errors / hydration
   warnings / overflow; keyboard).
7. Production preflight where schema is involved (read-only, classified
   counts, fingerprints — the M-P0 train's procedure is the template).
8. Draft PR (RED + `needs-human-gate` when a migration rides along).
9. Owner gate where required (migrations, PROD_QA, anything in §12 of the
   directive). One narrow `@human-gate-approved` marker per recorded
   decision, never self-added.
10. Merge (squash, expected-head protection) / deploy / read-only smoke.
11. Update the W matrix row (state, PRs, proofs, remaining gaps).
12. ONLY THEN advance to the next W.

Concurrency rule: never run two W implementations at once when they share
core files (`employer-company-context.ts`, `result-registry.ts`, demand/
booking chain, billing). Independent READ-ONLY audits may run in parallel.

## The queue (launch-relevant order; skip = recorded reason)

| # | W | Next slice (one coherent unit) | Gate |
|---|---|---|---|
| ~~1~~ | ~~W6~~ | ~~Author-vs-subject identity slice~~ | **DONE** — #1037 merged, schema applied |
| ~~2~~ | ~~W6~~ | ~~Production write proof of the full experience cycle~~ | **DONE** — executed 2026-08-06/07, #1048 |
| **1** | **W7** | Measure `/dashboard/profile` (1007 lines) at 375px + section inventory — audit output only, then slice the split | none |
| 2 | W9 | Migrate the two remaining read/render `getOwnCompany()` sites (dashboard layout fallback, market-map already done — re-verify) | none |
| 3 | W11 | Operations centre real entry point (F7) — routing/UI, no migration | none |
| 4 | W10 | **W10-7 symmetry guard** (one test file; the audit's highest-leverage item) | none |
| 5 | W8 | Employer analytics v1, org-scoped (W14-6; prereqs #1031/#1033 landed) | none |
| 6 | W12 | Engagement bridge: apply #1047 + production replay of the mint | **owner apply gate** |
| 7 | W12 | Calendar source #7: real date columns on `customer_requests` | migration gate |
| 8 | W11 | Exercise the shipped project-completion control in a PROD_QA leg | PROD_QA leg |
| 9 | W13 | Write the W13 baseline FROM the existing 8-signal notification spine (scope definition only) | none |
| 10 | W14 | 90-day `ai_runs` retention policy (REQUIRED before any AI provider enable) | migration gate |
| 11 | W19 | Write the W19 (Mobile/A11y/Perf) baseline from W7's A1–A4 findings — the one seeded undefined number | none |
| — | W2 | Card-count ratchet DOWN (visual polish — interleave opportunistically, never as the "one W") | none |
| — | W4/W5 | FROZEN — reopen only by owner decision | owner |
| — | W15, W17–W22 | UNDEFINED — owner defines or drops the numbers; nothing may be "implemented" against them | owner |
| — | W16 | Runs as M-P0-7 / Stripe TEST v2 (#1035) — owner gates recorded there; Stripe Live NOT AUTHORIZED | owner |

## Standing hard stops (unchanged)

No production QA accounts (until the PROD_QA decision), no second production
company, no real-user/company contact, no Stripe Live, no live keys, no
charges, no LMC flag activation, no paid infrastructure, no #1016/old-#844
migration apply.

## The next window's command (copy-paste)

> Take W7. Re-audit the employee journey on CURRENT main in a PINNED worktree
> (never the shared main tree — that is what produced the false W6 "no shipped
> surface" report). Baseline: `docs/audits/w7-employee-journey-read-only-audit.md`.
> Execute W7 P1-4 as an AUDIT-ONLY slice: measure `/dashboard/profile`
> (1007 lines) at 375px and 1440px in the local browser, produce a complete
> section inventory (~25 sections: name, purpose, data source, render cost,
> 375px behaviour, overflow/console/hydration findings), and identify which
> sections belong on the profile vs. elsewhere. Do NOT split the file in this
> window — the audit forbids a blind fix. Output: an audit document + browser
> evidence + a proposed slice list. Then update the W7 matrix row. Do not touch
> W8+ in the same window. No migration, no owner gate, no production write.
