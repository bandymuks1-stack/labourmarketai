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
| 23 | Register row 2.24 experience records and disputes (mandatory for V2) | C | — | NOT TESTED: state of PR #3301 and its CI requested from the lane, not yet reported | cause, fix, proof; dispute process with roles, audit, abuse protection |
| 24 | Production walks: owner's five | J-2 | — | DONE on `1ab03ffb`: 86 tests, 0 failed (runs 43366745180, 43368073843, 43368883913, 43369620376, 43370312079) | — |
| 25 | Production walks: group 1 (public and search), six walks | J-2 | — | DONE on `1ab03ffb`: 52 tests, 0 failed, 2 skipped (runs 43393371161, 43393766379, 43394904519, 43395374040, 43397026038, 43397628491) | — |
| 26 | Production walks: remaining groups | J-2 | owner approval per group in the J-2 window | BLOCKED: owner decision | PASS / FAIL, run IDs, leftovers per group |
| 27 | Walks needing a separate decision: search-support-privacy, sectors-languages, ai-off-honesty; billing-test-mode stays blocked | J-2 | owner | BLOCKED: owner decision | — |
| 28 | Synthetic leftovers after walks | coordinator, J-2 | — | DONE for the first five (read-only database check; kept-by-design rows explained); NOT TESTED in the database after group 1 | counts only, no open leftovers |
| 29 | Row 4.8 anonymous need in production | coordinator | — | DONE on `1ab03ffb` (one marked row created, verified, deleted) | — |
| 30 | Row 1.1 sign-up through the form in production | F | new walk spec, owner run | IN PROGRESS: draft spec | walk with mailbox confirmation and cleanup in the same job |
| 31 | brigade-formation closes its own need | F | — | NOT STARTED | test-only draft PR |
| 32 | Synthetic rows invisible to an ordinary signed-in user | — | owner decision (a non-synthetic test account) | NOT TESTED: no account exists; code guards only | browser proof |
| 33 | Worker CV shows real history; new worker's CV honest | G | 12 | IN PROGRESS: audit started 2026-11-13 | two example CVs on synthetic accounts; four evidence kinds visibly apart |
| 34 | Invited former worker: CV readiness before first sign-in | coordinator (audit), H (RED draft PR), R2 (review) | the fix; which organization record is the former employer | IN PROGRESS: audit done 2026-11-13 (read-only, counts only): NOT READY, see "Audit 34" below | on first sign-in the person sees his own organization-supplied history, as a past role, with provenance; no duplicates; phone and desktop; view / edit / export |
| 35 | Public profiles of the two operating organizations | V1 | rows 6.21 / 8.9 (blocked), publishing rights | IN PROGRESS: audit started 2026-11-13 | only publishable facts; sources named; nothing invented |
| 36 | #3256 public needs of unconfirmed companies | V1, R2 | two P2 | IN PROGRESS | P2 fixed; re-review; owner decision |
| 37 | #3231, #3232, #3295 (RED queue) | R2 | owner | BLOCKED: owner decision | — |
| 38 | Function register update, PR #3282; design assessment of unassessed rows | register lane | — | IN PROGRESS | seven team / project rows added; counts recomputed |
| 39 | Activity measurement (employers, active workers, needs, contacts, agreements, hires) | S | 1, 3 deployed | NOT STARTED (after V2) | definitions and a first reading |
| 40 | Forty-person usability test | owner, coordinator | V2 stable | NOT STARTED (after V2) | real results only |
| 41 | Future modules P14 / P15 | — | owner | NOT STARTED (specification only) | — |

## Audit 34 — invited former worker, CV readiness (2026-11-13, production build `1ab03ffb`)

Read-only; states and counts only; no account was opened and nobody was impersonated.

How the product links a person to organization-supplied history today (code on `main`): an invitation
is matched by its token and the invited e-mail address only; accepting it never links a roster person;
the history becomes visible to the person only when a manager offers a link on the roster row and the
person accepts it; the database admits that offer only for a profile that already has an ACTIVE
engagement or membership in that organization; a roster row of kind `former_employee` cannot be invited
from the roster screen at all.

What production holds for this case:

| Check | Result |
|---|---|
| Pending invitation | 1, type "join the platform" (no organization, no relationship), not expired, 13 days left |
| Account for the invited address | none yet |
| Roster row for the former employee | 1, kind `former_employee`, state `unlinked` |
| Organization-supplied records on that row | 62, all in one year, state "organization reported" |
| Duplicate roster rows with the same name | 0 |
| Path from this invitation to that roster row | none: the invitation carries no organization, so acceptance creates an account only |

Verdict: **NOT READY.** If the person signs in today he gets an empty new-worker CV; the 62 records stay
invisible to him, and no control in the product can link a former employee who has no active relationship
with the organization. Sending an "employee" invitation instead would link him but would show the
organization as his CURRENT job, which is false.

Confirmed by the owner on 2026-11-13: the invitation and the roster row are the same person.

Not verified: how the CV looks with these records (no linked account exists to look
at); view / edit / export for this person.

Smallest fix, for decision (RED: it changes who may be linked and an access rule; draft PR only after the
owner's choice): let an authorised manager offer a link from a `former_employee` roster row to a person
identified by an invitation addressed to that row, creating an ENDED relationship (past role, with its
period) and no active engagement; the person still accepts the link himself. Acceptance: isolated e2e of
the whole route on synthetic people; RLS proof that he reads only his own row's records; no change for
current employees.

Open point found on 2026-11-13 (read-only): the roster row and its 62 records belong to an organization
whose name does not contain the employer name the owner expects to see in the CV; the two organizations
that carry that name hold no roster people and no records. Which organization record is the real former
employer, and under which name it should appear, is an owner question; no data was changed.

Fix in progress: Lane H, RED draft PR "former worker to organization history link" (general function:
manager offers from a former-employee roster row; the person confirms; ended relationship with its period;
no active engagement; no linking on a name or e-mail match; safe claim for a different e-mail or Google
sign-in; reversal with audit trail). Review: Lane R2. No merge, migration or deploy without the owner.
