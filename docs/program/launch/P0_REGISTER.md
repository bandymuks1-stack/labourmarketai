# P0 register — one list of everything owed for the V2 launch

State of 2026-11-13 10:00 UTC. Production build `1ab03ffb` = `main` `1ab03ffbf`. This is a derived
coordination view: function status lives only in [`../FUNCTION_REGISTER.md`](../FUNCTION_REGISTER.md);
lane detail lives in issue #3265. Nothing here is merged, migrated or deployed without a separate owner
approval. Statuses: DONE (with evidence) · IN PROGRESS · BLOCKED · NOT TESTED · NOT STARTED.

| # | Work | Owner lane | Depends on | Status | Acceptance |
|---|---|---|---|---|---|
| 1 | V2 landing, PR #3266 (`a647dc0416`) | A | 2 | IN PROGRESS | review bound to final head; CI green; production-build walk; speed gates; owner's final approval |
| 2 | #3266 response-time regression (controls respond 3,549 → 4,287 ms; early tap about 4.1 s) | A, S | — | IN PROGRESS: cause not yet stated | cause named from a trace; controls respond no later than `main`; re-measured by S with the same method |
| 3 | V2 signed-in home, PR #3270 (`43988e26`) | A2 | 1, 4, 5 | IN PROGRESS | final head contains the final #3266 head; walk green; review of new commits |
| 4 | #3270: "open items could not be read" on the worker home | A2 | — | IN PROGRESS: cause not yet stated | cause found; fixed if possible in production; a test; the message is never just hidden |
| 5 | #3270: full original logo in both headers | A2 | — | IN PROGRESS | same logo component as the public header; screenshots 320 / 375 / 1440 |
| 6 | Return to the chosen function after sign-in | A2 | 3 | NOT TESTED: test N-12 added, result not yet read | test passes on the final head |
| 7 | Role goals decided by server rights; proportional card layout | A2 | 3 | IN PROGRESS | file-level proof of the server gate; no empty area on desktop |
| 8 | Goal bar on signed-in inner pages | A2 | 3 merged | NOT STARTED (owed after launch, mandatory) | one bar component, public and signed-in |
| 9 | Seven visual defects of the signed-in home (phone first: cut cards, carousel in carousel, unclear horizontal navigation) | A2 | 3 merged | NOT STARTED (owed, mandatory) | screenshots 375 / 1440, light and dark |
| 10 | V2 presentation fixes, PR #3306 (desktop second block, audience and price line, neutral examples, education entry, inner-page headings) | A | 1 merged | IN PROGRESS | before / after screenshots; review |
| 11 | Always-visible assistant input (`feat/cc/assistant-ask`, no PR) | A | owner decision | BLOCKED: owner decision | effect on design, speed and usability stated; one owner question |
| 12 | Whole-product minimal, unified UX/UI; key functions in 1–3 actions | A (system), G, H | 1, 3 | IN PROGRESS: plan owed | one component set on every P0 screen; action counts per function |
| 13 | Audience pages (workers, companies, agencies, education, service providers), PR #3307 | B | 10 | IN PROGRESS | every claim maps to a working register row |
| 14 | Education institutions: real capability statement | B | — | IN PROGRESS | what works, what was production-verified, what is planned |
| 15 | Languages: active locales, no mixed text, same pricing logic | E | — | IN PROGRESS | findings per page and locale; catalog-only fixes |
| 16 | Pricing page and Nonstop Group separation, PR #3302 / #3305 | D | owner decisions | IN PROGRESS | true price, limits, functions per plan; recruitment service outside platform pricing |
| 17 | EUR 99 plan end to end in Stripe TEST | D | TEST keys, VAT path | BLOCKED: no TEST keys | full purchase incl. negative cases |
| 18 | VAT path (Stripe Tax state, OSS) | D | owner / accountant facts | BLOCKED | written recommendation, accountant-confirmed |
| 19 | Actual costs, plan margins, final commercial table | D | — | IN PROGRESS: delivered privately, not yet read by the coordinator | one table for owner approval; unknowns named with their source |
| 20 | FREE limit transition (30 days, nothing paused) | D | owner activation | IN PROGRESS: impact measured (3 organizations above the limit) | notice, date and usage line built; tests pin each rule |
| 21 | Billing PRs #3284, #3250, #3252 (decision cards), #2441, #2685 (rebase) | D, R2 | owner per-PR decision | BLOCKED: owner decision | one card per PR, then a recommendation |
| 22 | PR #3214 company search (`3f463af0eb`) | coordinator | owner window approval | BLOCKED: owner decision | merge → deploy → search check → migration → final checks |
| 23 | Register row 2.24 experience records and disputes (mandatory for V2) | C | — | NOT STARTED: no report from the lane yet | cause, fix, proof; dispute process with roles, audit, abuse protection |
| 24 | Production walks: owner's five | J-2 | — | DONE on `1ab03ffb`: 86 tests, 0 failed (runs 43366745180, 43368073843, 43368883913, 43369620376, 43370312079) | — |
| 25 | Production walks: group 1 (public and search), six walks | J-2 | — | DONE on `1ab03ffb`: 52 tests, 0 failed, 2 skipped (runs 43393371161, 43393766379, 43394904519, 43395374040, 43397026038, 43397628491) | — |
| 26 | Production walks: remaining groups | J-2 | owner approval per group in the J-2 window | BLOCKED: owner decision | PASS / FAIL, run IDs, leftovers per group |
| 27 | Walks needing a separate decision: search-support-privacy, sectors-languages, ai-off-honesty; billing-test-mode stays blocked | J-2 | owner | BLOCKED: owner decision | — |
| 28 | Synthetic leftovers after walks | coordinator, J-2 | — | DONE for the first five (read-only database check; kept-by-design rows explained); NOT TESTED in the database after group 1 | counts only, no open leftovers |
| 29 | Row 4.8 anonymous need in production | coordinator | — | DONE on `1ab03ffb` (one marked row created, verified, deleted) | — |
| 30 | Row 1.1 sign-up through the form in production | F | new walk spec, owner run | IN PROGRESS: draft spec | walk with mailbox confirmation and cleanup in the same job |
| 31 | brigade-formation closes its own need | F | — | NOT STARTED | test-only draft PR |
| 32 | Synthetic rows invisible to an ordinary signed-in user | — | owner decision (a non-synthetic test account) | NOT TESTED: no account exists; code guards only | browser proof |
| 33 | Worker CV shows real history; new worker's CV honest | not yet assigned | 12 | NOT STARTED | two example CVs on synthetic accounts; four evidence kinds visibly apart |
| 34 | Invited former worker: CV readiness before first sign-in | not yet assigned | 33 | NOT STARTED | linking, own history only, no duplicates, phone and desktop, view / edit / export; no private data in reports |
| 35 | Public profiles of the two operating organizations | not yet assigned | rows 6.21 / 8.9 (blocked), publishing rights | NOT STARTED | only publishable facts; sources named; nothing invented |
| 36 | #3256 public needs of unconfirmed companies | V1, R2 | two P2 | IN PROGRESS | P2 fixed; re-review; owner decision |
| 37 | #3231, #3232, #3295 (RED queue) | R2 | owner | BLOCKED: owner decision | — |
| 38 | Function register update, PR #3282; design assessment of unassessed rows | register lane | — | IN PROGRESS | seven team / project rows added; counts recomputed |
| 39 | Activity measurement (employers, active workers, needs, contacts, agreements, hires) | S | 1, 3 deployed | NOT STARTED (after V2) | definitions and a first reading |
| 40 | Forty-person usability test | owner, coordinator | V2 stable | NOT STARTED (after V2) | real results only |
| 41 | Future modules P14 / P15 | — | owner | NOT STARTED (specification only) | — |
