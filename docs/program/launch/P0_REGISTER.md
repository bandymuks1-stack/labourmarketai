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

## Audit 35a — attribution of the imported work history (2026-11-13, read-only, counts only)

Owner's rule (2026-11-13, replaces the earlier work-country reading): workers from one country belong to
one of the two operating organizations, workers from other countries to the other.

What production holds: all imported people (43) and all imported records (3,096, years 2022–2026, about
31,000 hours, every record "organization reported", supplier role "employer", 6 source files, 180 work
objects, no project link) sit under ONE organization record; the other operating organization holds none.
Roster kinds: 35 "other", 7 "employee" (1 linked, 1 link offered), 1 "former employee". 675 records of 16
people carry an employer party label that names a THIRD legal entity; the other 2,421 records carry no
employer party.

Cannot be verified from platform data: the owner's rule itself. A roster person has no nationality,
citizenship or country-of-origin attribute, and names are not a lawful or reliable basis. The split needs a
source the owner supplies (payroll or contract lists per legal employer).

Former-worker case: 62 records, 2024-08-19 to 2024-11-15, 520 hours, all "organization reported", no
corrections, no disputes; 46 of them carry the third-entity employer label, 16 carry none.

Nothing was moved, renamed or merged. Any re-attribution is a data change that needs: the owner's list per
legal employer, a preview with counts per person, preserved provenance (original supplier, file, hash
chain), and a separate approval.

## Launch coordination register — 2026-11-13 16:15 UTC

Production build `59b1c759` (= `main`). Sources: lane entries on issue #3265, open-PR list (158 open), lane session transcripts, read-only production checks. Counts and states only; no personal data. Nothing below is merged or deployed unless the row says so. Merges, deploys, migrations and commercial e-mails need a separate owner approval.

State words: LIVE (in production, checked) · READY (PR green, waits for owner merge decision) · IN PROGRESS · NOT STARTED · BLOCKED (named blocker) · NOT TESTED.

### P0 — needed for the first commercial launch

| # | Work | Lane | State | Evidence / PR | Depends on | Done when |
|---|---|---|---|---|---|---|
| 1 | V2 first-visitor navigation | A | LIVE | #3266, build `59b1c759`; live checks 375/1440 PASS | — | closed |
| 2 | V3 landing (design, D1 variant A, approved LT–EN copy, six locales) | A | IN PROGRESS | built locally, final spec run and speed comparison running; no PR yet; copy source `evidence/landing-v3-preview` `d23570a8e` | — | one draft PR, CI green, screenshots 375/1440 light/dark × 6 locales, speed vs `59b1c759`, Lane R verdict on final head |
| 3 | Legal wording: cookie sentence (1.1), data-visibility sentence (8.9) | owner + lawyer | BLOCKED | owner-approved variant A texts implemented in #2; server-side usage events are recorded without consent | lawyer | written confirmation of both sentences |
| 4 | Sign-up faults: re-sent confirmation link, Google sign-in in in-app browsers, provider errors that never succeed on retry | F | NOT STARTED (found in code audit) | Lane F entry 11-13 | owner go-ahead in Lane F scope | fixes in PR, isolated sign-up run green, one production sign-up walk |
| 5 | Onboarding on a phone: Continue 1.7–2.1 screens down, submit 2.7–3.4 screens down | F / A2 | NOT STARTED (measured, #3312 measures only) | #3312 `c1d08a4` | — | primary button visible without scrolling at 375 px |
| 6 | 43 signed-in people stopped at role choice (30-day audit) | F | NOT STARTED | trust audit | #4, #5 | role step completion measured after fix |
| 7 | Company activation: 27 companies, 0 with description, 0 invitations | B | BLOCKED | welcome + notification e-mails not started: Lane B waits for the owner's direct "tvirtinu" in its own window | owner | both e-mails in PR, six locales, send recorded |
| 8 | Request intake control: same alert from both forms, send ledger, unhandled count and age for the admin | B | BLOCKED | same as #7; 7 non-test requests all `new`, oldest 123 days, no delivery evidence | owner (may be RED: additive columns) | PR green; admin sees count/age; alert send recorded |
| 9 | Seven old requests answered or rejected | owner | BLOCKED | reply draft prepared, not sent | owner decisions (read texts, who sends, mark rejected) | every row has a final status |
| 10 | Needs set to `in_review` are hidden from workers with no exit for the employer; 4 rows waiting 3–19 days | F / owner | NOT STARTED | Lane F entry | owner: who reviews | reviewer named; rows decided |
| 11 | €99 Organization plan cannot be bought | D | BLOCKED | #3284 `768dbeb`, #3305, #3302, #3252 green, RED | `STRIPE_TEST_SECRET_KEY` (owner, secrets manager only); per-PR owner decisions; Stripe Tax decision | TEST-mode checkout, portal, refund, failed payment pass 4 of 4 |
| 12 | Public pricing copy shows only what works | D | READY (RED) | #3302 `9e8581e` (instead of #3250) | owner decision | merged + live check in six locales |
| 13 | Function 2.24 experience disputes | C | READY | #3301 `19f9ab9`, CI green, no migration, no review yet | Lane R review; owner merge decision | merged + walk |
| 14 | Former worker can claim imported history | H | BLOCKED (RED) | #3311 `fe30e06`: `quality` red (undeclared surface, needs owner ruling), `signup-isolated` red; migration unapplied | owner ruling, R2 review | CI green, R2 no blocking, owner SQL approval |
| 15 | Signed-in home on goal navigator | A2 | READY with 9 owed visual items | #3270 `416e5c0`, CI green, walk 79/0/1; Lane R verdict is on an older head (void) | rebase on main, Lane R re-review | owner visual approval |
| 16 | Language errors on live pages (154 findings in six locales) | E | READY | #3304 `2f5aeec`, CI green, review owed | Lane R | merged + re-check |
| 17 | CV shows what was measured (project line, five overstated places) | G | READY | #3309 `b03f386`, #3310 `a5088dd`, CI green | Lane R | merged |
| 18 | Post-deploy smoke of the main journeys | F | READY | #3263 `3149a24` then #3271 `46a9ab1`, #3293 `393335f` | owner (#3271 is outside substitute review) | runs after every deploy |
| 19 | Production walks on build `59b1c759` | J-2 | BLOCKED | six public walks proposed again; dispatch needs the owner's approval typed in the J-2 window | owner | six walks 0 failed |

### P1 — after launch or not blocking it

| # | Work | Lane | State | PR |
|---|---|---|---|---|
| 20 | Audience pages for education and service providers | B | READY | #3307 `d23afa3` (1 answered thread to resolve) |
| 21 | Chat reads: work history, plan, search | B | READY | #3254 `d6a977d` |
| 22 | Swedish locale | E | READY | #3261 `5fc1445` |
| 23 | Unconfirmed-company needs by consent | V1 | BLOCKED | #3256 `1b1d15a`, 2 × P2 open, ON HOLD |
| 24 | Public organization profiles; anon grant on business services (P1 security) | V1 | NOT STARTED | owner decisions per organization |
| 25 | Company search for signed-in users | — | READY (RED) | #3214 `3f463af`; needs a new deploy-window approval |
| 26 | RED chain: #2946, #3231, #3232, #3248 | C / UX | READY (RED) | each needs its own owner decision |
| 27 | Font preload, login form in server HTML, real-visitor speed sample | S / A | READY, not measured | #3308, #3294, #3296, #3300 |
| 28 | Shared UI primitives rollout (G and H refactors) | G / H | READY | #3273 and dependants |
| 29 | Flaky forecast test | — | READY | #3313 `ca8c854` (unblocks `quality` on #3297) |
| 30 | Imported history attribution per legal employer; #2362 dates | owner | BLOCKED | owner list per employer |
| 31 | Inner-page goal bar; seven visual defects; 40-person test; activity measurement | A / A2 | NOT STARTED | post-launch by owner decision |

### Not tested on the current build

- Signed-in journeys on `59b1c759` (last full signed-in walks were on `1ab03ffb`: profile-cv 28/0, company-chain 17/0, journal-confirm 4/0, brigade-formation 19/0, project-execution 18/0).
- Any real phone; real-visitor speed.
- Payments in TEST mode (0 of 4).
- E-mail delivery of sign-up confirmation in ru/pl/de/nl (one LT/EN template).

## Anonymous request queue — owner-approved clean-up, 2026-11-13

Table `company_need_public_intakes`, 15 rows. The table has no reason or note column, so the reasons are recorded here. Rows are numbered by arrival order; no row was deleted and no content was changed, only `status`. No personal data below.

| Row | Arrived | Classification | Reason | Status now |
|---|---|---|---|---|
| 1 | 2026-07-13 | test | company name carries an end-to-end test marker; contact domain is not deliverable | rejected |
| 2 | 2026-08-10 | likely genuine | a small company asks for a design and marketing-visuals subcontractor, ongoing, EN/LT | new (reply held by the owner) |
| 3 | 2026-09-24 | advertising | sells a business-contacts database, with a link; no labour or service need | rejected |
| 4 | 2026-10-04 | advertising | same product, lifetime-access offer | rejected |
| 5 | 2026-10-10 | advertising | same product, affiliate programme and browser extension | rejected |
| 6 | 2026-10-12 | advertising | company-data scraping tool, download link | rejected |
| 7 | 2026-11-04 | advertising | same tool; the text itself says it is unsolicited | rejected |
| 8–15 | 2026-11-07 … 11-10 | test | `QA-SYNTHETIC` marker, reserved test e-mail domain | rejected |

Rows 3–7 all arrived through the German version of the older company-need form with an implausible country and a random profession: its spam screen lets advertising through (noted for Lane B).

### Reply draft for row 2 — NOT SENT, waits for the owner

> Hello,
>
> Thank you for your enquiry to LabourMarket.ai about design and marketing visuals, and please accept our apologies for the late reply — your message reached us on 10 August.
>
> Is this still something you need? If so, could you tell us a little more: the kind of work (brand, social media, print), the expected volume per month and your preferred way of working (freelancer or agency)? With that we can help you post the request on the platform, where registration and basic request posting are free.
>
> Kind regards,
> LabourMarket.ai team
> info@labourmarket.ai
