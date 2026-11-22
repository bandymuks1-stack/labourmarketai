# Launch matrix — 2026-11-23

This matrix is for the owner's final report. It covers each journey step with the newest production walk (`prod-qa-walk.yml`), using synthetic QA accounts only, plus the local Chrome proof where production cannot reach.

**Deployed production build:** `c6789db6b`, from `deploy-vps` run 45064141767 on 2026-11-22 at 20:02 UTC.

**"Behind"** counts the commits between a walk's build and that deployed build:
- **0–3 behind:** the run proves the current product.
- **Many behind:** the run proves an earlier build. Re-dispatch it before the report claims the current build.

**Status values:**
- **PASS:** the step passed in production.
- **FAIL:** the step failed in production; the cause is named.
- **BLOCKED:** the step cannot run, waiting on the owner or on a product decision.
- **LOCAL:** proven only on a local isolated stack, because production walks cannot reach it.

## Worker — Lane L

| Step | Status | Production runs (device · run · build · behind) | Notes |
|---|---|---|---|
| Sign-up / onboarding | PASS | role-routes desktop · 44899143018 · eed72052 · 56<br>role-routes phone · 44900081769 · eed72052 · 56<br>fresh-activation desktop · 44901160408 · eed72052 · 56 | The fresh worker onboards on a 390 px phone. `signup-form` has not run on a device since 11-15. |
| Profile → CV → save | PASS desktop and phone; **FAIL phone-375** | profile-cv-history desktop · 44632628432 · 7e517e32 · 74<br>profile-cv-history phone · 44634343495 · 7e517e32 · 74<br>profile-cv-history phone-375 · 45051053618 · ed4ecf85 · 3 · **FAIL** | phone-375 fails at P-15. It is a product race, reproduced locally 20/20 when the tap lands inside a window of about 3 s: the experiences sheet closes itself once its code finishes loading. Lane G owns the fix. P-13, P-15 and P-26 are one task (G leads). Re-run all three devices after G's deploy. |
| Job search | PASS | jobs-search desktop · 44902071507 · eed72052 · 56<br>jobs-search phone · 44902549477 · eed72052 · 56 | |
| Apply | PASS | company-chain desktop · 44858511879 · d447a639 · 58 (C-1, C-2)<br>orders-bookings phone · 45052181467 · ed4ecf85 · 3 (O-2) | |
| Messaging | PASS | company-chain desktop · 44858511879 (C-3, C-4)<br>chat-continuity phone · 44903881953 · eed72052 · 56<br>notifications-inapp phone · 44904905556 · eed72052 · 56 | A third party cannot read the thread. This is proven locally (journeys-coverage, #3578). |
| Accept an offer | PASS | orders-bookings phone · 45052181467 · ed4ecf85 · 3 (O-5) | |
| Hire visible to both sides | PASS | orders-bookings desktop · 45049554634 · ed4ecf85 · 3 (O-9 to O-11)<br>orders-bookings phone · 45052181467 · ed4ecf85 · 3 (O-9 to O-11) | New with #3628. The company sees the booked person and the engagement, the worker sees it, and an unrelated organization sees neither. |
| Journal | PASS | journal-confirm desktop · 44902949287 · eed72052 · 56<br>journal-confirm phone · 44903366199 · eed72052 · 56 | fresh-activation also proves the first entry reaching the Living CV. |
| Phone layout (worker and manager surfaces) | FAIL, fix deployed and not yet re-run | mobile-surfaces phone · 44977749659 · eed72052 · 56 · FAIL (M-6) | Fixed by #3599 (header at 1280), which is in production. Re-dispatch `mobile-surfaces:phone`. |
| Invited worker | BLOCKED | invited-worker phone · 45001807853 · 397710f1 · 46 · FAIL | The synthetic invited account has not been created. The owner creates it with `prod-qa-invited-provision.yml`. |

## Students and education institutions — Lane L

| Feature | Status | Production runs | Local proof |
|---|---|---|---|
| The institution declares itself and runs a programme and cohort | PASS | learning-practice desktop · 44860184317 · d447a639 · 58<br>learning-practice phone · 44883030318 · eed72052 · 56<br>learning-practice phone-375 · 44883485138 · eed72052 · 56 | `recognition-chain-isolated` I-1 and I-8; `signup-isolated` E-1 |
| Learner invitation and acceptance | PASS | learning-practice (L-2, L-3) | `signup-isolated` E-1; `phone-journeys` T-3 |
| Student sign-up and internship board | PASS | learning-practice phone · 44883030318 (L-11) | journeys-coverage (#3578): an internship-typed need is found and applied to |
| Cohort join request | BLOCKED (never dispatched) | not run; dispatch-only spec `cohort-join-request` | local only |
| Continuous work-history saving | LOCAL | production must not write sign-offs, so prod `recognition-chain` is read-only | `recognition-chain-isolated` I-11 to I-13b (practice day, employer confirmation, CV practice history); `signup-isolated` E-3 (the study period stays after studies end) |
| Access separation | PASS / LOCAL | learning-practice production rights checks | `signup-isolated` E-4 (access ends with the link, records kept); `recognition-chain` I-14; acceptance matrix M-6 (#3582) |
| Institution-arranged placement with an employer | BLOCKED (product) | — | No product door: the employer invites the intern directly. This is an owner decision. |

## Other lanes, from the same production data

These rows are taken from the walk results. Each owning lane confirms or corrects them in its own report, and its report is authoritative where the two differ.

| Journey (lane) | Status | Production runs (device · run · build · behind) |
|---|---|---|
| Employer (C) | PASS | company-chain desktop · 44858511879 · d447a639 · 58<br>company-chain phone · 44859165488 · d447a639 · 58<br>company-chain phone-375 · 44882509064 · eed72052 · 56<br>org-roster desktop and phone · 44905313755 / 44905801746 · 56<br>brigade-formation desktop · 44906216102 · 56<br>project-execution desktop · 44906961206 · 56<br>need-intake desktop, phone and phone-375 · 44642526482 / 44643169770 / 44643949860 · 74 |
| Agency (H) | PASS | agency-chain desktop · 44644887648 · 7e517e32 · 74<br>agency-chain phone · 44645924736 · 74<br>agency-chain phone-375 · 44646951459 · 74 |
| Subcontractor (D) | PASS, except buyer-workspace not yet re-run | marketplace desktop · 44971191106 · 56<br>marketplace-goods-services desktop and phone · 44967795943 / 44968374455 · 56<br>buyer-workspace desktop · 45003241107 · 9f587dd6 · 43 · FAIL |
| AI (G) | PASS | chat-confirm-once desktop · 44972019714 · 56<br>manager-chat desktop · 44972421825 · 56<br>mcp-chain desktop · 44972915546 · 56<br>mcp-agents desktop · 44973332549 · 56<br>ai-off-honesty desktop · 44973720651 · 56 |
| Admin / governance (F) | PASS | company-governance desktop · 44856477733 · 58<br>documents-approvals desktop · 44974276075 · 56<br>search-support-privacy desktop · 44974866504 · 56<br>worker-records-exports desktop · 44904394732 · 56 |
| Design (M, A, A2) and technical (S) | not received | — |

buyer-workspace failed at B-2 because the walk never chose the required country. #3589 fixed the walk and is in production; the walk has not run since.

## Commercial chain (employer need → hire / project)

| Link | Status | Evidence |
|---|---|---|
| Need → candidates → contact | PASS | company-chain 44858511879 |
| Need → agency → offer → accept | PASS | agency-chain 44644887648 |
| Booking offer → worker accepts → hire visible to both sides | PASS | orders-bookings 45049554634 (desktop) and 45052181467 (phone), at ed4ecf85, 3 behind |
| Service request → accept | PASS | marketplace-goods-services 44967795943 |
| Team offer → project → hours | PASS | brigade-formation 44906216102 |
| Direct hire → project → hours | LOCAL | lane C's `hiring-chain-isolated` (#3611) |
| Agency placement with a client that does not already employ the worker | BLOCKED (cast) | The agency's QA client already employs the worker. Changing the cast is an owner decision. |
| Contract or proposal visible to the counterparty; accepted service request → project | BLOCKED (product) | No product door exists. |

## Synthetic data hygiene

Since #3619, every walk that posts a need closes it in `afterAll`, and the workflow sweeps again in an `always()` step. On the newest runs:
- orders-bookings 45049554634 and 45052181467, and profile-cv-history 45051053618, each log `[need-sweep] workflow: sessions=5 open-synthetic=0 closed=0 failed=0`;
- so no synthetic need is left open.

## Answers for the owner

- **Can a NEW employer post a real need and receive offers?**
  - **Posting:** yes, in production. fresh-activation 44901160408 takes a brand-new company from onboarding through a described need, and the need is visible where the company lands.
  - **Receiving offers:** proven in production for an established synthetic employer:
    - hand-raisers and contact (company-chain);
    - an agency offer (agency-chain);
    - booking acceptance and hire (orders-bookings).
  - **Why not for a new account:** a QA account's need is kept off real boards by design, so no production walk can show offers reaching a brand-new account. Locally, newly created employers receive them: journeys-coverage (#3578), role-journeys and phone-journeys.
- **Can a user do the core actions alone on a phone?**
  - **Yes for every role:**
    - worker: job search, journal, messaging, booking accept and hire;
    - employer: company-chain on phone and phone-375;
    - agency: phone and phone-375;
    - subcontractor: goods and services on a phone;
    - student and institution: learning-practice on phone and phone-375.
  - **Open items:**
    - profile-cv-history phone-375 at P-15 (product race, G);
    - mobile-surfaces, whose fix is deployed but not yet re-run.
  - **Tablet:** proven locally only (#3582), because the production walk has no tablet device.

## To dispatch before the report (within the daily cap)

1. `mobile-surfaces:phone` — #3599 is in production.
2. `buyer-workspace:desktop` — #3589 is in production.
3. `profile-cv-history:phone-375`, `:phone` and `:desktop` — after G's P-15 fix deploys.
4. `invited-worker:phone` — after the owner creates the account.
5. Refresh the walks that are many commits behind, if the report must claim the current build:
   - agency-chain and need-intake (74 behind);
   - company-chain and learning-practice (56–58 behind).
