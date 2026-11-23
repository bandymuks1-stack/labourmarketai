# Production acceptance matrix

This is deliverable F of the owner P0 brief #3679, owned by Lane L. It evolves `LAUNCH_MATRIX_2026-11-23.md`, which was moved here with `git mv`; there is no second matrix.

It is a SUPPORTING document under `docs/OWNER_TARGET_ARCHITECTURE_V1.md` and is not an architecture.

Every row is one chain step, with:
- the newest production walk (`.github/workflows/prod-qa-walk.yml`, synthetic QA accounts only);
- its run id;
- the build it ran on;
- the distance from the deployed build.

**Deployed build:** `b83341215`, from `deploy-vps` run 45150805080 on 2026-11-23 at 09:51 UTC. It is five commits after `f04248335`: #3684, #3686, #3687 and #3693 are docs, and #3689 is the ux-metrics walk. "Behind" is `git rev-list --count <run build>..b83341215`.

**Status:**

| Status | Meaning |
|---|---|
| PASS | The step passed in a completed production run. |
| FAIL | The step failed in production; the cause is named. |
| BLOCKED | The step cannot run in production, waiting on the owner or on a product door. |
| LOCAL | The step is proven only on the isolated local stack, named by spec and test id, because production may not or cannot write it. |

No PASS appears without a completed production run. A row that is many commits behind proves an earlier build, so re-dispatch it before claiming the current one.

## Worker — Lane L

Chain: registration → CV → search → apply → message → offer → hire → history.

| Step | Status | Production runs (spec device · run · build · behind) | Notes |
|---|---|---|---|
| Registration and onboarding | PASS | role-routes desktop · 44899143018 · eed72052 · 94<br>role-routes phone · 44900081769 · eed72052 · 94<br>fresh-activation desktop · 44901160408 · eed72052 · 94 | fresh-activation onboards a brand-new worker on a 390 px phone. `signup-form` has not run on a device since 11-15. |
| CV (profile, sections, Living CV) | PASS | profile-cv-history phone-375 · 45091874326 · ee29a3b7 · 14<br>profile-cv-history phone · 45097071365 · 8bcda5be · 13<br>profile-cv-history desktop · 45094839877 · 8bcda5be · 13 | Full P-* sequence on all three devices. These runs follow the P-13/P-15/P-26 task (G leads the product fixes, L owns test stability). |
| Search | PASS | jobs-search desktop · 44902071507 · eed72052 · 94<br>jobs-search phone · 44902549477 · eed72052 · 94 | |
| Apply | PASS | company-chain desktop · 44858511879 · d447a639 · 96 (C-1, C-2)<br>orders-bookings phone · 45052181467 · ed4ecf85 · 41 (O-2) | |
| Message | PASS | company-chain desktop · 44858511879 (C-3, C-4)<br>chat-continuity phone · 44903881953 · eed72052 · 94<br>notifications-inapp phone · 44904905556 · eed72052 · 94 | A third party cannot read the thread. This is LOCAL: `journeys-coverage-isolated` (#3578). |
| Offer (booking accepted) | PASS | orders-bookings phone · 45052181467 · ed4ecf85 · 41 (O-5) | |
| Hire visible to both sides | PASS | orders-bookings desktop · 45049554634 · ed4ecf85 · 41 (O-9 to O-11)<br>orders-bookings phone · 45052181467 · ed4ecf85 · 41 (O-9 to O-11) | #3628: the company sees the booked person and the engagement, the worker sees it, and an unrelated organization sees neither. |
| History (journal → Living CV) | PASS | journal-confirm desktop · 44902949287 · eed72052 · 94<br>journal-confirm phone · 44903366199 · eed72052 · 94 | fresh-activation also proves the first entry reaching the Living CV. |
| Phone surfaces | PASS | mobile-surfaces phone · 45142813658 · f0424833 · 5 | This run confirms the #3678 M-6 change and supersedes 45098478024 (8bcda5be, FAIL on M-6). |
| Invited worker | BLOCKED | invited-worker phone · 45001807853 · 397710f1 · 84 · FAIL | The synthetic invited account is owner-dispatch only (decision 2026-10-28): the owner creates it with `prod-qa-invited-provision.yml`, and no agent may provision it. |

## Employer — Lane C

Chain: company sign-up → need → candidate and brigade offers → agreement → hire or order → project → work accounting.

Lane C supplied this section for #3679 on 2026-11-23 at about 05:20 UTC, read from GitHub Actions.

**No single production run covers the whole employer chain end to end.** Each step is covered by the walk named in its row.

| Step | Status | Production runs (spec device · run · build · behind) | Notes |
|---|---|---|---|
| Company sign-up | PASS / LOCAL | fresh-activation desktop · 44901160408 · eed72052 · 94 | LOCAL: `employer-journey-isolated` E-1 and E-2 (sign-up, company profile) at 1440 and 390, signup-isolated runs 45077346479 (#3675) and 45086260914 (#3647). |
| Need | PASS | company-chain desktop · 44858511879 · d447a639 · 96 (C-0b)<br>company-chain phone · 44859165488 · d447a639 · 96<br>company-chain phone-375 · 45140908370 · f0424833 · 5 | Earlier phone-375 runs are superseded: 44859841951 failed, and 44882509064 passed on eed72052. Two tries on f0424833, 45138442951 and 45139668246, were refused by the deploy brake before walking; they are not failures. The public form `need-intake` last completed on 11-20 (desktop 44642526482, phone 44643169770, phone-375 44643949860, all 104 behind). It does not appear among the 60 most recent dispatches, so re-dispatch it before claiming the current build. |
| Candidate offers (hand-raiser, contact) | PASS | company-chain (C-1 to C-4, H-1, H-2) | |
| Shortlist | PASS | company-talent-history desktop · 44975633092 · eed72052 · 94 (K-1 to K-5) | The note is internal; the worker and other organizations see nothing. |
| Brigade offers | PASS | brigade-formation desktop · 44906216102 · eed72052 · 94 | A brigade is formed and the B2B need intake goes through. |
| Agreement | PASS | orders-bookings desktop · 45049554634 · ed4ecf85 · 41 (O-1 to O-6)<br>orders-bookings phone · 45052181467 · ed4ecf85 · 41 | The booking is proposed, withdrawn and re-dated, then the worker accepts and the conversation continues. The PR-only flow is RED and not applied: the company offer, both parties confirming terms, then the crew and the project (#3649). |
| Hire | PASS | orders-bookings (O-9 to O-11) | A direct hire opens no employer `engagement_context` (`20260928220000`). Its day is accepted by the company as the client, at `/dashboard/inbox/counterparty`. |
| Order (buyer workspace) | PASS | buyer-workspace desktop · 45094390854 · ee29a3b7 · 14 | Two earlier failures are superseded. 44971584269 failed because the walk never chose the required country (fixed by #3589). 45003241107 was stopped by the deploy-quiet brake, and no test ran. |
| Project | PASS / LOCAL | project-execution desktop · 44906961206 · eed72052 · 94 (E-1 to E-6)<br>project-context desktop · 44907816401 · eed72052 · 94 | E-1 to E-6 create the project, stages and tasks, assign a worker and issue the clash receipt. LOCAL: `employer-journey-isolated` E-9 (project and assignment); `hiring-chain-isolated` (direct hire → project, #3611). |
| Work accounting | PASS / LOCAL | journal-confirm desktop · 44902949287 · eed72052 · 94<br>journal-confirm phone · 44903366199 · eed72052 · 94<br>org-roster desktop · 44905313755 · 94<br>org-roster phone · 44905801746 · 94 | journal-confirm: the worker records the day, the employer approves it, and the worker sees it confirmed. org-roster: roster import, on- and offboarding, instruction, asset and isolation. LOCAL: `employer-journey-isolated` E-10 (a journal day accepted by the company as the client). |
| Work instruction to the hired worker | FAIL (fixed in #3704, not merged) | none: no production walk sends an instruction | A new company's direct hire is on the project but not on the roster, so `/dashboard/instructions` showed no assigned workers. Instructions also raised no new-message notification (MSG-3). #3704 (draft, app code only) fixes both. LOCAL: `employer-journey-isolated` E-1 to E-10 and E-9b at 1440 and 390 px, 22/22; E-9b checks the `message_received` notification. Source: Lane C, 2026-11-23. |

Also in open PRs, RED and not applied: agency named candidates (#3651), messaging on an open need (#3647) and provider pseudonyms (#3657).

## Agency — Lane H

Chain: sign-up → permitted needs → submit candidates → agreement → authorised placement.

Lane H supplied this section for #3679. The production walk is `agency-chain`, which proves the connection route:
1. the agency sets up its organization;
2. it adds a roster worker;
3. it connects to the client;
4. the client shares a need;
5. the agency offers its roster worker;
6. the client accepts, and a booking is proposed;
7. the outcome and the conversation follow.

**Runs:** desktop 44644887648, phone 44645924736 and phone-375 44646951459. All three ran on 7e517e32, 112 behind; there has been no production run since 11-20. Earlier runs: 44241546296, 43965333204 and 43884747629 passed. 43810187731 and 43724558463 failed; the 43724558463 failure ("too many open booking proposals") was fixed by the walk's own withdraw in `afterAll`.

| Step | Status | Production runs | Notes |
|---|---|---|---|
| Sign-up | PASS | agency-chain desktop · 44644887648 · 7e517e32 · 112<br>agency-chain phone · 44645924736 · 112<br>agency-chain phone-375 · 44646951459 · 112 | |
| Permitted needs, connection route | PASS | agency-chain (A-3 to A-5) | |
| Permitted needs, open board without the client's identity | BLOCKED | — | Open PR #3630, RED and not applied. Production still returns the company name on the open board. |
| Submit candidates, connection route | PASS | agency-chain (A-5, A-6) | |
| Submit candidates, open board | LOCAL | — | #3651: e2e 7/7 plus a local journey walk on build 2611491f3. RED, not applied. |
| Agreement: the client accepts, then a booking | PASS | agency-chain (A-6) | |
| Agreement: both parties confirm the terms (company offer) | LOCAL | — | #3649 e2e 8/8. RED, not applied. |
| Authorised placement: the worker accepts, then an engagement | PASS (booked-hire path) / BLOCKED (new client) | orders-bookings (O-9 to O-11) for the engagement; the agency's worker-accept step A-6b is J-2's #3460 | A client that does not already employ the worker needs a cast change, which is an owner decision. |

## Subcontractor — Lane D

Chain: order view → offer → terms → execution → reports.

Lane D supplied the LOCAL and CI evidence for this section for #3679. There are two lanes:
- **Organization lane:** the client posts a need → a crew offer with versioned terms → the client agrees to a version → the crew works on the client's project → crew journal entries are submitted to the client → the client accepts or disputes them.
- **Personal services lane:** offering → discovery → request → accept.

Lane D confirmed that `brigade-formation` desktop run 44906216102 walks the organization lane in production:
- B2B-1: the need;
- B2B-2: the crew offer;
- B2B-4: terms v1;
- B2B-5: the buyer's counter v2, which the buyer cannot accept itself;
- B2B-6: the supplier agrees;
- B2B-7: the buyer agrees and assigns the crew to its project;
- B2B-8: members journal on that project;
- B2B-9: the buyer sees the hours after a reload;
- B2B-9b: a third organization and an anonymous visitor read nothing.

That run is **desktop only**. The 390 px path is LOCAL: `subcontractor-chain-isolated` (#3670), where a 40 px button defect was found and fixed.

The formal work report is LOCAL only: the worker submits to the client as counterparty, and the client accepts, requests a correction or disputes.

| Step | Status | Production runs · LOCAL evidence | Notes |
|---|---|---|---|
| Order view | PASS | marketplace desktop · 44971191106 · eed72052 · 94<br>marketplace-goods-services desktop · 44967795943 · 94<br>marketplace-goods-services phone · 44968374455 · 94<br>buyer-workspace desktop · 45094390854 · ee29a3b7 · 14 | |
| Offer | PASS | brigade-formation desktop · 44906216102 · eed72052 · 94 (B2B-2, B2B-4)<br>marketplace-goods-services (S-1 to S-3) | |
| Terms (versioned, agreed) | PASS (desktop) / LOCAL (390 px) | brigade-formation (B2B-4 to B2B-7) | 390 px: `subcontractor-chain-isolated` (#3670). |
| Execution (crew on the client's project) | PASS (team path) / BLOCKED (service path) | brigade-formation (B2B-7 to B2B-9) | No product door leads from an accepted service request to a project. |
| Reports: entries submitted, client accepts or disputes | LOCAL | `subcontractor-chain-isolated` (#3670, not on main): 13/13 with the PR's fix | Before the fix, the 390 px step failed: the client's "Assign team to project" button was 40 px. The PR's CI run 45074123691 (head fc6831a) passed the walk step. The run on head 2bb90eb (45116196998) also passed, with subcontractor-chain and free-paths in it. In production, the buyer sees the journaled hours (B2B-9), but the accept and dispute step has not been walked there. |
| Personal services lane | PASS / LOCAL | marketplace-goods-services (S-1 to S-5) | LOCAL: `journeys-coverage-isolated` SC-1 to SC-6, 26/26 at 1440 and 390 px (#3578). |

## Student — Lane L

Chain: profile → learning history → practice → worker profile that keeps the history.

| Step | Status | Evidence | Notes |
|---|---|---|---|
| Profile and student sign-up | PASS | learning-practice phone · 45141893755 · f0424833 · 5<br>learning-practice phone · 44883030318 · eed72052 · 94 (L-3, L-5, L-11)<br>learning-practice phone-375 · 44883485138 · 94 | LOCAL as well: `signup-isolated` ST-1 and `phone-journeys` S-1. |
| Learning history | PASS | profile-cv-history (P-9, an education row shown on the Living CV) on all three devices: 45091874326 · 14, 45097071365 · 13, 45094839877 · 13 | |
| Find a practice | PASS / LOCAL | learning-practice (L-11, the board narrowed to internships) | An internship-typed need being found and applied to is LOCAL: `journeys-coverage-isolated` (#3578). |
| Practice record and sign-off | LOCAL | learning-practice (L-6, L-7) shows the practice review and the sign-off pick; production must not write sign-offs | `recognition-chain-isolated` I-9 to I-13b: intern link, practice day, employer confirmation, CV practice history. |
| Worker profile keeps the history | LOCAL | — | `signup-isolated` E-3 (the study period stays after studies end); `recognition-chain-isolated` I-13 |

## Education institution — Lane L

Chain: programmes → cohorts → invites → practice → results.

| Step | Status | Production runs | Notes |
|---|---|---|---|
| Programmes | PASS | learning-practice desktop · 44860184317 · d447a639 · 96 (L-1)<br>learning-practice phone · 45141893755 · f0424833 · 5 (L-12) | |
| Cohorts | PASS | learning-practice (L-4) | The cohort join request (`cohort-join-request`) is dispatch-only and has not run in production. Status BLOCKED until it is dispatched. |
| Invites | PASS | learning-practice (L-2, L-3, L-12) | |
| Practice | PASS (review) / BLOCKED (arranged placement) | learning-practice (L-6, L-7) | No institution-arranged placement door exists: the employer invites the intern directly. This is an owner decision. |
| Results | PASS | learning-practice (L-9: outcomes counted, never naming one person; L-10: programme report CSV) | |
| Access separation | PASS / LOCAL | learning-practice | `signup-isolated` E-4 (access ends with the link, records kept); `recognition-chain-isolated` I-14 |

## Owner's seven steps per group

Each cell is the newest production run for that step: spec · run · behind. GAP means no production walk covers the step; it is not a PASS. STALE means the walk exists but its newest run is from an old build (more than 200 behind) or older than the last 400 walk runs.

| Group | 1. Register | 2. Understand the offer | 3. Find the function | 4. Main action | 5. Save | 6. Return and continue | 7. Clear answer, no technical error |
|---|---|---|---|---|---|---|---|
| Worker | fresh-activation (first visit, fresh worker) · 44901160408 · 94<br>signup-form S-1 to S-3 · STALE (43680057090, 293) | GAP (request-doors and public-market-direction exist; STALE) | role-routes · 44899143018, 44900081769 · 94<br>jobs-search · 44902071507 · 94 | journal-confirm 1 · 44902949287 · 94<br>company-chain C-1 (raise a hand) · 44858511879 · 96 | profile-cv-history P-3, P-5, P-22 · 45094839877 · 13 | fresh-activation (onboarding keeps its place) · 94<br>profile-cv-history P-2, P-3 (reload) · 13<br>chat-continuity · 44903881953 · 94 | Each walk fails on a page error. Per-page console, raw-key and broken-image checks: ux-metrics, not yet run on this build. |
| Employer | fresh-activation (fresh company) · 44901160408 · 94 | GAP | role-routes · 94 | company-chain C-0b, C-2, C-3 · 44858511879 · 96<br>company-chain phone-375 · 45140908370 · 5 | orders-bookings O-1 to O-6 · 45049554634 · 41 | brigade-formation 14 (new owner session) · 44906216102 · 94 | as for Worker |
| Agency | GAP (A-1 uses an existing synthetic account; agency sign-up is not walked) | GAP | agency-chain A-1b (offer found on home) · 44644887648 · 112 | agency-chain A-2 to A-7 · 112 | agency-chain A-1b, A-2c · 112 | agency-chain A-1b · 112 | as for Worker |
| Subcontractor | GAP (the brigade owner is an existing synthetic account) | GAP | brigade-formation 1-2 · 44906216102 · 94 | brigade-formation B2B-2 to B2B-7 · 94 | brigade-formation B2B-6 (history kept) · 94 | brigade-formation 14 · 94 | as for Worker |
| Student | learning-practice L-3 (joins by link) · 45141893755 · 5 | GAP | learning-practice L-11 (board narrowed to internships) · 5 | learning-practice L-5, L-11 · 5 | GAP (no student write in production; LOCAL: `recognition-chain-isolated`) | GAP | as for Worker |
| Institution | GAP (L-1 declares training on an existing organization) | GAP | learning-practice L-12 (education home on a phone) · 5 | learning-practice L-1, L-2, L-4 · 44860184317 · 96 | learning-practice L-1, L-4 · 96 | GAP | as for Worker |

Gaps to close: step 2 for every group (dispatch request-doors and public-market-direction); step 1 for agency, subcontractor and institution; step 6 for student and institution; step 5 for student. Step 7 is partly covered until ux-metrics runs on this build.

Further gaps from Lane D (2026-11-23):

- The personal service lane has nothing after a request is accepted: no terms, execution or report. #3697 (draft) states this under accepted requests.
- No production walk moves a learner into a worker profile with the learning history kept. This adds to the student's step 6 gap.
- The education sign-up choice promised that the institution connects learners to internships and jobs, but no such door exists. #3700 corrects the line in every locale.

D's result files also confirm two per-step counts: marketplace-goods-services desktop 44967795943 passed 14/14 (G-1 to G-9, S-1 to S-5), and buyer-workspace desktop 45094390854 passed 10/10 (B-0 to B-8).

## Chain — owner addendum 2026-11-23

The owner's chain, the same for every role:

1. identity
2. historical experience
3. competencies
4. opportunities
5. agreements and projects
6. work, time and results
7. confirmation
8. Living CV, automatically
9. reuse

For each step, the table gives:
- **Recorded:** whether the fact is recorded.
- **Next step:** whether the following step shows it.
- **Living CV:** whether it shows there.

A fact that is recorded but not shown is FAIL. GAP means no walk checks it; it is not a PASS.

**Sources:**
- Production runs are named by spec · run; their build and "behind" count are in the sections above.
- LOCAL means the isolated local stack: `signup-isolated` run 45116196998 (#3670 head 2bb90eb, main plus #3670) runs every isolated spec named here.

**Run ids:**

| Run id | Walk |
|---|---|
| 45094839877 | profile-cv-history desktop |
| 44901160408 | fresh-activation desktop |
| 44902949287, 44903366199 | journal-confirm desktop, phone |
| 45052181467 | orders-bookings phone |
| 44858511879 | company-chain desktop |
| 44644887648 | agency-chain desktop |
| 44906216102 | brigade-formation desktop |
| 45141893755 | learning-practice phone |
| 44860184317 | learning-practice desktop |

### Worker

| Step | Recorded | Next step | Living CV |
|---|---|---|---|
| 1. Identity | PASS: fresh-activation (first visit, onboarding) 44901160408 | PASS: profile-cv-history P-2 (not sent back into onboarding) 45094839877 | PASS: the Living CV opens as the person (P-7) |
| 2. Historical experience | PASS: profile-cv-history P-7, P-9, P-24 (employment, education; save, reload, remove) | PASS: P-18 (one total, every hour once) | PASS: P-7, P-9, P-25 |
| 3. Competencies | PASS: P-11, P-13 (catalogue and own skills) | LOCAL: `job-fit-evidence-isolated` F-5 (fit band on the board comes from the work) | PASS: P-12, P-13 (evidence tiers; self-declared kept apart)<br>LOCAL: `skills-chain-isolated` K-3, K-6 |
| 4. Opportunities | PASS: jobs-search 44902071507<br>PASS: company-chain C-1 (raise a hand) 44858511879 | PASS: C-2 (the company sees the person who raised a hand) | GAP: no walk checks that an application leaves a trace on the CV |
| 5. Agreements and projects | PASS: orders-bookings O-5 (accepts the booking) 45052181467 | PASS: O-7, O-10 (the booking and the engagement in Personal space)<br>LOCAL: `hiring-chain-isolated` H-5 (the worker sees the project) | GAP: no walk checks the engagement on the Living CV |
| 6. Work, time and results | PASS: journal-confirm 1 (records the day) 44902949287 | PASS: journal-confirm 2 (the employer finds it in the queue) | PASS: fresh-activation (the first journal entry reaches the Living CV) 44901160408 |
| 7. Confirmation | PASS: journal-confirm 2 (employer approves) | PASS: journal-confirm 3 (the worker sees it confirmed) 44903366199 | PASS: journal-confirm 3 (trust rises, hours do not) |
| 8. Living CV, automatically | PASS: P-18 (one continuous history) | n/a | PASS: P-18<br>LOCAL: `cv-shown-twice-isolated` CV2-2 (each skill and job once; #3690) |
| 9. Reuse | STALE: cv-readonly R-1, R-2 43833613507 (240 behind) | LOCAL: `job-fit-evidence-isolated` F-5 (the history scores new needs) | as for Recorded |

### Employer

| Step | Recorded | Next step | Living CV (of the people it hires) |
|---|---|---|---|
| 1. Identity | PASS: fresh-activation (fresh company) 44901160408<br>LOCAL: `employer-journey-isolated` E-1, E-2 | PASS: fresh-activation (the described need is visible where the company lands) | n/a |
| 2. Historical experience | PASS: profile-cv-history P-20 (the company history) 45094839877 | STALE: cv-readonly R-3 (people link to their page only on a confirmed link) 43833613507 | GAP |
| 3. Competencies | PASS: marketplace-goods-services S-1 to S-5 (service offered, findable) 44967795943 | PASS: S-1 to S-5 (the buyer finds it) | n/a |
| 4. Opportunities | PASS: company-chain C-0b (posts a need) | PASS: C-2, C-3 (sees the hand-raiser, opens a thread) | n/a |
| 5. Agreements and projects | PASS: orders-bookings O-1 to O-6<br>PASS: project-execution E-1 to E-6 44906961206 | PASS: O-9 (the booked worker on its people page and in engagements) | GAP on main: a direct hire's day is accepted only through client review (`employer-journey-isolated` E-10, 45077346479)<br>LOCAL with #3722 (RED, migration not applied): E-10 goes from hire to project to 8 h confirmed by the company, shown on the project's operations page and on the worker's Living CV; 20/20 at 1440 and 390 px (Lane C) |
| 6. Work, time and results | PASS: company-chain H-1, H-2 (hours recorded against a site) | **FAIL (LOCAL fix #3704, not merged):** a new company's direct hire is on the project but not on the roster, so `/dashboard/instructions` shows no workers; an instruction raises no notification | as for Worker step 6 |
| 7. Confirmation | PASS: journal-confirm 2 44902949287 | PASS: journal-confirm 3 | PASS: journal-confirm 3 |
| 8. Living CV, automatically | PASS: journal-confirm 3 (the confirmed entry on the worker's side) | n/a | PASS |
| 9. Reuse | PASS: company-talent-history K-1 to K-5 (shortlist) 44975633092<br>PASS: P-21 (company report exported) | PASS: K-1 to K-5 | n/a |

### Agency

| Step | Recorded | Next step | Living CV (of the placed worker) |
|---|---|---|---|
| 1. Identity | GAP in production (A-1 uses an existing account)<br>LOCAL: `agency-roles-isolated` A-1 (signs up, recorded as a staffing agency)<br>LOCAL: Lane H's new-agency run N1 (sign-up, 1440 and 390 px) | LOCAL: A-2, A-5 | n/a |
| 2. Historical experience | GAP | GAP | GAP |
| 3. Competencies | PASS: agency-chain A-1b (saves an offer) 44644887648 | PASS: A-1b (finds it on its home) | n/a |
| 4. Opportunities | PASS: A-4, A-5 (sees the shared need, offers its person) | PASS: A-6 (the client answers) | n/a |
| 5. Agreements and projects | PASS: A-6, A-6b (the worker accepts)<br>LOCAL: Lane H N3 (connect, share, propose, client accepts, worker accepts, engagement; the worker is not named to the client before accepting) | PASS: A-7 (the decision and one thread) | GAP |
| 6. Work, time and results | GAP: no walk records the placed worker's work<br>BLOCKED: after a client accepts a company offer, starting the work is not available (#3649, RED); #3715 says so to both sides | GAP | GAP |
| 7. Confirmation | GAP | GAP | GAP |
| 8. Living CV, automatically | GAP | n/a | GAP |
| 9. Reuse | PASS: A-2b (reads its people) | PASS: A-5 (offers a roster person) | n/a |

All agency production runs are on 7e517e32, 112 behind.

### Subcontractor

| Step | Recorded | Next step | Living CV (of brigade members) |
|---|---|---|---|
| 1. Identity | GAP in production (the brigade owner is an existing account) | GAP | n/a |
| 2. Historical experience | GAP | GAP | GAP |
| 3. Competencies | PASS: brigade-formation 1-9 (brigade formed, members joined) 44906216102<br>LOCAL: `journeys-coverage-isolated` SC-1, SC-2 (public profile, findable service) | PASS: B2B-2 (offers against the need) | n/a |
| 4. Opportunities | PASS: B2B-1, B2B-2 | PASS: B2B-3 (the buyer sees the offer) | n/a |
| 5. Agreements and projects | PASS: B2B-4 to B2B-7 (terms v1, v2, agreed; one team assignment)<br>BLOCKED: the personal service lane has nothing after acceptance (#3697) | PASS: B2B-8, B2B-9 (each side sees the other) | GAP |
| 6. Work, time and results | PASS: B2B-9, B2B-9b (the buyer reads the same hours) | PASS: B2B-9 | GAP |
| 7. Confirmation | LOCAL: `subcontractor-chain-isolated` (reports accepted or disputed; #3670, not on main) | LOCAL | GAP |
| 8. Living CV, automatically | GAP | n/a | GAP |
| 9. Reuse | PASS: brigade-formation 14 (a new owner session still shows the brigade) | GAP: no walk offers the same brigade to a second need | n/a |

### Student

| Step | Recorded | Next step | Living CV |
|---|---|---|---|
| 1. Identity | PASS: learning-practice L-3 (joins by link) 45141893755 | PASS: L-5 (sees the cohort on the learning compass) | n/a |
| 2. Historical experience | PASS: profile-cv-history P-9, P-22 (education row) 45094839877 | PASS: P-22 (save, reload) | PASS: P-9 |
| 3. Competencies | LOCAL: `recognition-chain-isolated` I-6, I-7 (a recognition citing a signed-off day) | LOCAL: I-7 | LOCAL: I-7 |
| 4. Opportunities | PASS: L-11 (board narrowed to internships) 45141893755<br>LOCAL: `journeys-coverage-isolated` ST-2 (applies) | LOCAL: ST-4 (the company sees the hand-raiser) | GAP |
| 5. Agreements and projects | LOCAL: `recognition-chain-isolated` I-9 (the employer invites the intern; accepted) | LOCAL: I-10 | LOCAL: I-13 |
| 6. Work, time and results | LOCAL: I-4, I-11 (practice days; production must not write them) | LOCAL: I-5, I-12 | LOCAL: I-13 |
| 7. Confirmation | LOCAL: I-12 (the employer confirms the intern) | LOCAL: I-13 | LOCAL: I-13b |
| 8. Living CV, automatically | LOCAL: I-13b (the practice period stands as confirmed) | n/a | LOCAL: I-13b |
| 9. Reuse | GAP: no walk turns a learner into a worker profile with the history kept. `recognition-chain-isolated` I-16 (#3716, CI pending) adds it. | GAP | GAP |

### Education institution

| Step | Recorded | Next step | Living CV (of its learners) |
|---|---|---|---|
| 1. Identity | GAP in production (L-1 uses an existing organization)<br>LOCAL: `recognition-chain-isolated` I-1 (signs up through its own door) | PASS: L-12 (the education home on a phone) 45141893755 | n/a |
| 2. Historical experience | GAP | GAP | n/a |
| 3. Competencies | PASS: L-1 (declares it trains; runs a programme) 44860184317 | PASS: L-2 (invites a learner) | n/a |
| 4. Opportunities | PASS: L-2, L-3 (invite and join by link) | PASS: L-4 (sees the joined learner) | n/a |
| 5. Agreements and projects | PASS: L-4 (cohort placement)<br>BLOCKED: no institution-arranged placement door (owner decision) | PASS: L-5 (the learner sees the cohort) | GAP |
| 6. Work, time and results | PASS: L-9 (outcomes counted, never naming one person) | PASS: L-10 (programme report) | n/a |
| 7. Confirmation | PASS (review): L-6, L-7<br>LOCAL (sign-off): I-5 | LOCAL: I-6 (recognition cites the signed-off day) | LOCAL: I-7 |
| 8. Living CV, automatically | LOCAL: I-7 (the recognition among the learner's own) | n/a | LOCAL: I-7 |
| 9. Reuse | PASS: L-10 (programme report CSV)<br>LOCAL: `signup-isolated` E-4 (access ends with the link; records kept) | LOCAL: E-4 | n/a |

**Chain breaks to close:**

| Kind | Where |
|---|---|
| FAIL | Employer step 6, a new company's hire is missing from instructions (#3704) |
| BLOCKED | Personal service lane after acceptance (#3697)<br>Institution-arranged placement (owner decision) |
| GAP | Worker and employer steps 4 to 5: the CV trace of an application or engagement<br>Agency steps 6 to 8<br>Subcontractor steps 8 and 9, and identity<br>Student step 9 (learner to worker)<br>Identity in production for agency, subcontractor and institution<br>History for organizations |

## Walk plan for today

The daily budget is 24 walks in a rolling 24 h. At 10:30 UTC about 14 have reached production in the window, so about 10 are free now. Four more free up after 17:56 UTC, and six after 02:10 UTC tomorrow. Each window starts only after the coordinator confirms no merge batch is deploying (brake e).

| Window | Walks |
|---|---|
| Now (10) | journal-confirm desktop, phone (#3685 is deployed)<br>ux-metrics tablet-768 light, tablet-768 dark, phone dark (#3689 is deployed)<br>agency-chain desktop, phone<br>fresh-activation desktop<br>request-doors desktop, public-market-direction desktop (seven-step gap 2) |
| After #3690 deploys | profile-cv-history desktop, phone, phone-375 |
| After 17:56 UTC (4) | agency-chain phone-375, need-intake desktop, marketplace-goods-services desktop, phone |
| After 02:10 UTC | need-intake phone, phone-375; ux-metrics desktop-1440 dark; signup-form; cohort-join-request desktop |

## Cross-cutting

| Item | Status | Evidence |
|---|---|---|
| Synthetic needs never left open | PASS | Since #3619, every walk that posts a need closes it in `afterAll` and the workflow sweeps again in `always()`. `[need-sweep] workflow: sessions=5 open-synthetic=0 closed=0 failed=0` on orders-bookings 45049554634 and 45052181467 and on profile-cv-history 45051053618. |
| Tablet (768 px) | LOCAL | `acceptance-matrix-isolated` (#3582). The production walk has no tablet device. |
| AI acts on intent | PASS | chat-confirm-once desktop · 44972019714 · 94<br>manager-chat desktop · 44972421825 · 94<br>mcp-chain desktop · 44972915546 · 94<br>mcp-agents desktop · 44973332549 · 94 |
| Free paths and payments | LOCAL / BLOCKED | `free-paths-isolated` 4/4: needs posted free at 1440 and 390 px; `/pricing` shows both plans, the paid plan cannot be bought, and no Stripe request is made. `billing-isolated` 5/5: Stripe TEST state. `free-paths-isolated` passed again in CI run 45116196998 (#3670, head 2bb90eb). Stripe hosted Checkout and the Customer Portal are BLOCKED, because there is no Stripe TEST key. Source: Lane D. |
| Admin and privacy | PASS | company-governance desktop · 44856477733 · 96<br>documents-approvals desktop · 44974276075 · 94<br>search-support-privacy desktop · 44974866504 · 94<br>worker-records-exports desktop · 44904394732 · 94 |

## To dispatch before claiming the deployed build

1. `invited-worker:phone`, after the owner creates the account.
2. Rows 41 or more commits behind, if the report must claim `b83341215`:
   - orders-bookings (41);
   - the eed72052 / d447a639 set (94–96);
   - agency-chain and need-intake (112). Lane H asks for agency-chain on desktop, phone and phone-375; H cannot dispatch it.
3. `cohort-join-request:desktop`, to clear the BLOCKED cohort join row.
