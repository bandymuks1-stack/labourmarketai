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

| Step | Status | Production runs | Notes |
|---|---|---|---|
| Sign-up and connection | PASS | agency-chain desktop · 44644887648 · 7e517e32 · 104 (A-1 to A-3)<br>agency-chain phone · 44645924736 · 104<br>agency-chain phone-375 · 44646951459 · 104 | |
| Permitted needs | PASS | agency-chain (A-4, A-5) | |
| Submit candidates | PASS | agency-chain (A-5, A-6) | |
| Agreement | PASS | agency-chain (A-6, A-6b, A-7) | |
| Authorised placement with a new client | BLOCKED | — | The agency's QA client already employs the worker. A placement with a new client needs a cast change, which is an owner decision. |

Lane H's own chain detail replaces this section where it differs.

## Subcontractor — Lane D

Chain: order view → offer → terms → execution → reports.

| Step | Status | Production runs | Notes |
|---|---|---|---|
| Order view | PASS | marketplace desktop · 44971191106 · eed72052 · 86<br>marketplace-goods-services desktop · 44967795943 · 86<br>marketplace-goods-services phone · 44968374455 · 86<br>buyer-workspace desktop · 45094390854 · ee29a3b7 · 6 | |
| Offer | PASS | marketplace-goods-services (S-1 to S-3); brigade-formation (B2B-2, B2B-4) | |
| Terms | PASS | brigade-formation (B2B-4, B2B-5); marketplace-goods-services (S-3, accept with a note) | |
| Execution | PASS (team path) / BLOCKED (service path) | brigade-formation (B2B-7 to B2B-9) | No product door leads from an accepted service request to a project. |
| Reports | PASS (team path) | brigade-formation (B2B-9, the buyer sees the journaled hours) | |

Lane D's own chain detail replaces this section where it differs.

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
| Admin and privacy | PASS | company-governance desktop · 44856477733 · 88<br>documents-approvals desktop · 44974276075 · 86<br>search-support-privacy desktop · 44974866504 · 86<br>worker-records-exports desktop · 44904394732 · 86 |

## To dispatch before claiming the deployed build

1. `mobile-surfaces:phone` (#3678 is deployed).
2. `invited-worker:phone`, after the owner creates the account.
3. Rows 33 or more commits behind, if the report must claim `125e21827`:
   - orders-bookings (33);
   - the eed72052 / d447a639 set (86–88);
   - agency-chain and need-intake (104).
4. `cohort-join-request:desktop`, to clear the BLOCKED cohort join row.
