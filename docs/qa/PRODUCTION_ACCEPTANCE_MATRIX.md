# Production acceptance matrix

This is deliverable F of the owner P0 brief #3679, owned by Lane L. It evolves `LAUNCH_MATRIX_2026-11-23.md`, which was moved here with `git mv`; there is no second matrix.

It is a SUPPORTING document under `docs/OWNER_TARGET_ARCHITECTURE_V1.md` and is not an architecture.

Every row is one chain step, with:
- the newest production walk (`.github/workflows/prod-qa-walk.yml`, synthetic QA accounts only);
- its run id;
- the build it ran on;
- the distance from the deployed build.

**Deployed build:** `125e21827`, from `deploy-vps` run 45115249287 on 2026-11-23 at 05:01 UTC. It is four commits after `97bd4d4dc` (#3678); those four commits are #3667, #3671, #3672 and #3673. "Behind" is `git rev-list --count <run build>..125e21827`.

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
| Registration and onboarding | PASS | role-routes desktop · 44899143018 · eed72052 · 86<br>role-routes phone · 44900081769 · eed72052 · 86<br>fresh-activation desktop · 44901160408 · eed72052 · 86 | fresh-activation onboards a brand-new worker on a 390 px phone. `signup-form` has not run on a device since 11-15. |
| CV (profile, sections, Living CV) | PASS | profile-cv-history phone-375 · 45091874326 · ee29a3b7 · 6<br>profile-cv-history phone · 45097071365 · 8bcda5be · 5<br>profile-cv-history desktop · 45094839877 · 8bcda5be · 5 | Full P-* sequence on all three devices. These runs follow the P-13/P-15/P-26 task (G leads the product fixes, L owns test stability). |
| Search | PASS | jobs-search desktop · 44902071507 · eed72052 · 86<br>jobs-search phone · 44902549477 · eed72052 · 86 | |
| Apply | PASS | company-chain desktop · 44858511879 · d447a639 · 88 (C-1, C-2)<br>orders-bookings phone · 45052181467 · ed4ecf85 · 33 (O-2) | |
| Message | PASS | company-chain desktop · 44858511879 (C-3, C-4)<br>chat-continuity phone · 44903881953 · eed72052 · 86<br>notifications-inapp phone · 44904905556 · eed72052 · 86 | A third party cannot read the thread. This is LOCAL: `journeys-coverage-isolated` (#3578). |
| Offer (booking accepted) | PASS | orders-bookings phone · 45052181467 · ed4ecf85 · 33 (O-5) | |
| Hire visible to both sides | PASS | orders-bookings desktop · 45049554634 · ed4ecf85 · 33 (O-9 to O-11)<br>orders-bookings phone · 45052181467 · ed4ecf85 · 33 (O-9 to O-11) | #3628: the company sees the booked person and the engagement, the worker sees it, and an unrelated organization sees neither. |
| History (journal → Living CV) | PASS | journal-confirm desktop · 44902949287 · eed72052 · 86<br>journal-confirm phone · 44903366199 · eed72052 · 86 | fresh-activation also proves the first entry reaching the Living CV. |
| Phone surfaces | FAIL | mobile-surfaces phone · 45098478024 · 8bcda5be · 5 · FAIL (M-6) | #3678 changed M-6 so it allows only the organisation doors row on a phone, checked positively. It is in the deployed build and waits for a re-run. |
| Invited worker | BLOCKED | invited-worker phone · 45001807853 · 397710f1 · 76 · FAIL | The synthetic invited account does not exist; the owner creates it with `prod-qa-invited-provision.yml`. |

## Employer — Lane C

Chain: company sign-up → need → candidate and brigade offers → agreement → hire or order → project → work accounting.

Lane C supplied this section for #3679 on 2026-11-23 at about 05:20 UTC, read from GitHub Actions.

**No single production run covers the whole employer chain end to end.** Each step is covered by the walk named in its row.

| Step | Status | Production runs (spec device · run · build · behind) | Notes |
|---|---|---|---|
| Company sign-up | PASS / LOCAL | fresh-activation desktop · 44901160408 · eed72052 · 86 | LOCAL: `employer-journey-isolated` E-1 and E-2 (sign-up, company profile) at 1440 and 390, signup-isolated runs 45077346479 (#3675) and 45086260914 (#3647). |
| Need | PASS | company-chain desktop · 44858511879 · d447a639 · 88 (C-0b)<br>company-chain phone · 44859165488 · d447a639 · 88<br>company-chain phone-375 · 44882509064 · eed72052 · 86 | An earlier phone-375 run, 44859841951, failed and is superseded by 44882509064. The public form `need-intake` last completed on 11-20 (desktop 44642526482, phone 44643169770, phone-375 44643949860, all 104 behind). It does not appear among the 60 most recent dispatches, so re-dispatch it before claiming the current build. |
| Candidate offers (hand-raiser, contact) | PASS | company-chain (C-1 to C-4, H-1, H-2) | |
| Shortlist | PASS | company-talent-history desktop · 44975633092 · eed72052 · 86 (K-1 to K-5) | The note is internal; the worker and other organizations see nothing. |
| Brigade offers | PASS | brigade-formation desktop · 44906216102 · eed72052 · 86 | A brigade is formed and the B2B need intake goes through. |
| Agreement | PASS | orders-bookings desktop · 45049554634 · ed4ecf85 · 33 (O-1 to O-6)<br>orders-bookings phone · 45052181467 · ed4ecf85 · 33 | The booking is proposed, withdrawn and re-dated, then the worker accepts and the conversation continues. The PR-only flow is RED and not applied: the company offer, both parties confirming terms, then the crew and the project (#3649). |
| Hire | PASS | orders-bookings (O-9 to O-11) | A direct hire opens no employer `engagement_context` (`20260928220000`). Its day is accepted by the company as the client, at `/dashboard/inbox/counterparty`. |
| Order (buyer workspace) | PASS | buyer-workspace desktop · 45094390854 · ee29a3b7 · 6 | Two earlier failures are superseded. 44971584269 failed because the walk never chose the required country (fixed by #3589). 45003241107 was stopped by the deploy-quiet brake, and no test ran. |
| Project | PASS / LOCAL | project-execution desktop · 44906961206 · eed72052 · 86 (E-1 to E-6)<br>project-context desktop · 44907816401 · eed72052 · 86 | E-1 to E-6 create the project, stages and tasks, assign a worker and issue the clash receipt. LOCAL: `employer-journey-isolated` E-9 (project and assignment); `hiring-chain-isolated` (direct hire → project, #3611). |
| Work accounting | PASS / LOCAL | journal-confirm desktop · 44902949287 · eed72052 · 86<br>journal-confirm phone · 44903366199 · eed72052 · 86<br>org-roster desktop · 44905313755 · 86<br>org-roster phone · 44905801746 · 86 | journal-confirm: the worker records the day, the employer approves it, and the worker sees it confirmed. org-roster: roster import, on- and offboarding, instruction, asset and isolation. LOCAL: `employer-journey-isolated` E-10 (a journal day accepted by the company as the client). |

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

**Runs:** desktop 44644887648, phone 44645924736 and phone-375 44646951459. All three ran on 7e517e32, 104 behind; there has been no production run since 11-20. Earlier runs: 44241546296, 43965333204 and 43884747629 passed. 43810187731 and 43724558463 failed; the 43724558463 failure ("too many open booking proposals") was fixed by the walk's own withdraw in `afterAll`.

| Step | Status | Production runs | Notes |
|---|---|---|---|
| Sign-up | PASS | agency-chain desktop · 44644887648 · 7e517e32 · 104<br>agency-chain phone · 44645924736 · 104<br>agency-chain phone-375 · 44646951459 · 104 | |
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
| Order view | PASS | marketplace desktop · 44971191106 · eed72052 · 86<br>marketplace-goods-services desktop · 44967795943 · 86<br>marketplace-goods-services phone · 44968374455 · 86<br>buyer-workspace desktop · 45094390854 · ee29a3b7 · 6 | |
| Offer | PASS | brigade-formation desktop · 44906216102 · eed72052 · 86 (B2B-2, B2B-4)<br>marketplace-goods-services (S-1 to S-3) | |
| Terms (versioned, agreed) | PASS (desktop) / LOCAL (390 px) | brigade-formation (B2B-4 to B2B-7) | 390 px: `subcontractor-chain-isolated` (#3670). |
| Execution (crew on the client's project) | PASS (team path) / BLOCKED (service path) | brigade-formation (B2B-7 to B2B-9) | No product door leads from an accepted service request to a project. |
| Reports: entries submitted, client accepts or disputes | LOCAL | `subcontractor-chain-isolated` (#3670, not on main): 13/13 with the PR's fix | Before the fix, the 390 px step failed: the client's "Assign team to project" button was 40 px. The PR's CI run 45074123691 (head fc6831a) passed the walk step. The run on head 2bb90eb (45116196998) also passed, with subcontractor-chain and free-paths in it. In production, the buyer sees the journaled hours (B2B-9), but the accept and dispute step has not been walked there. |
| Personal services lane | PASS / LOCAL | marketplace-goods-services (S-1 to S-5) | LOCAL: `journeys-coverage-isolated` SC-1 to SC-6, 26/26 at 1440 and 390 px (#3578). |

## Student — Lane L

Chain: profile → learning history → practice → worker profile that keeps the history.

| Step | Status | Evidence | Notes |
|---|---|---|---|
| Profile and student sign-up | PASS | learning-practice phone · 44883030318 · eed72052 · 86 (L-3, L-5, L-11)<br>learning-practice phone-375 · 44883485138 · 86 | LOCAL as well: `signup-isolated` ST-1 and `phone-journeys` S-1. |
| Learning history | PASS | profile-cv-history (P-9, an education row shown on the Living CV) on all three devices: 45091874326 · 6, 45097071365 · 5, 45094839877 · 5 | |
| Find a practice | PASS / LOCAL | learning-practice (L-11, the board narrowed to internships) | An internship-typed need being found and applied to is LOCAL: `journeys-coverage-isolated` (#3578). |
| Practice record and sign-off | LOCAL | learning-practice (L-6, L-7) shows the practice review and the sign-off pick; production must not write sign-offs | `recognition-chain-isolated` I-9 to I-13b: intern link, practice day, employer confirmation, CV practice history. |
| Worker profile keeps the history | LOCAL | — | `signup-isolated` E-3 (the study period stays after studies end); `recognition-chain-isolated` I-13 |

## Education institution — Lane L

Chain: programmes → cohorts → invites → practice → results.

| Step | Status | Production runs | Notes |
|---|---|---|---|
| Programmes | PASS | learning-practice desktop · 44860184317 · d447a639 · 88 (L-1)<br>learning-practice phone · 44883030318 · 86 (L-12) | |
| Cohorts | PASS | learning-practice (L-4) | The cohort join request (`cohort-join-request`) is dispatch-only and has not run in production. Status BLOCKED until it is dispatched. |
| Invites | PASS | learning-practice (L-2, L-3, L-12) | |
| Practice | PASS (review) / BLOCKED (arranged placement) | learning-practice (L-6, L-7) | No institution-arranged placement door exists: the employer invites the intern directly. This is an owner decision. |
| Results | PASS | learning-practice (L-9: outcomes counted, never naming one person; L-10: programme report CSV) | |
| Access separation | PASS / LOCAL | learning-practice | `signup-isolated` E-4 (access ends with the link, records kept); `recognition-chain-isolated` I-14 |

## Cross-cutting

| Item | Status | Evidence |
|---|---|---|
| Synthetic needs never left open | PASS | Since #3619, every walk that posts a need closes it in `afterAll` and the workflow sweeps again in `always()`. `[need-sweep] workflow: sessions=5 open-synthetic=0 closed=0 failed=0` on orders-bookings 45049554634 and 45052181467 and on profile-cv-history 45051053618. |
| Tablet (768 px) | LOCAL | `acceptance-matrix-isolated` (#3582). The production walk has no tablet device. |
| AI acts on intent | PASS | chat-confirm-once desktop · 44972019714 · 86<br>manager-chat desktop · 44972421825 · 86<br>mcp-chain desktop · 44972915546 · 86<br>mcp-agents desktop · 44973332549 · 86 |
| Free paths and payments | LOCAL / BLOCKED | `free-paths-isolated` 4/4: needs posted free at 1440 and 390 px; `/pricing` shows both plans, the paid plan cannot be bought, and no Stripe request is made. `billing-isolated` 5/5: Stripe TEST state. Both walks passed again in CI run 45116196998 (#3670, head 2bb90eb). Stripe hosted Checkout and the Customer Portal are BLOCKED, because there is no Stripe TEST key. Source: Lane D. |
| Admin and privacy | PASS | company-governance desktop · 44856477733 · 88<br>documents-approvals desktop · 44974276075 · 86<br>search-support-privacy desktop · 44974866504 · 86<br>worker-records-exports desktop · 44904394732 · 86 |

## To dispatch before claiming the deployed build

1. `mobile-surfaces:phone` (#3678 is deployed).
2. `invited-worker:phone`, after the owner creates the account.
3. Rows 33 or more commits behind, if the report must claim `125e21827`:
   - orders-bookings (33);
   - the eed72052 / d447a639 set (86–88);
   - agency-chain and need-intake (104). Lane H asks for agency-chain on desktop, phone and phone-375; H cannot dispatch it.
4. `cohort-join-request:desktop`, to clear the BLOCKED cohort join row.
