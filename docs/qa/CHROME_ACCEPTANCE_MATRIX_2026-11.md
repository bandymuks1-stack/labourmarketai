# Chrome acceptance matrix — 2026-11-21

**Owner directive 2026-11-21. Owner: Lane L.**

This is the final browser acceptance matrix: eight scenarios, each checked against nine criteria on three screens.

**Proof so far:** a local production build (`next build` + `next start`) in Playwright Chromium, against a throwaway local Supabase stack. That stack is `.github/workflows/signup-isolated.yml` replayed locally, with synthetic people only.

**Still to come:** production walks are the final proof. The coordinator dispatches them under the daily cap; see "Ready for production dispatch" below.

## Screens

| Screen | Viewport | Input |
|---|---|---|
| desktop | 1440 × 900 | mouse |
| tablet | 768 × 1024 | touch, `isMobile` |
| phone | 390 × 844 | touch, `isMobile` |

## The runner

`apps/web/tests/e2e/acceptance-matrix-isolated.spec.ts` walks each scenario's core path on all three screens: M-1..M-8 × 3 = 24 tests. On every surface it checks:
- the page renders inside `<main>`;
- no client error;
- no leftover hidden streamed copy (`div[hidden][id^="S:"]`);
- no sideways scroll;
- the primary action is visible, and is ≥ 44 px on a touch screen.

Per scenario it also proves:
- one thing saved through the page and present again after a reload, with its stored row read back;
- the wrong person refused, both by route redirect and by a read with their own session, where row-level security decides.

Measurements go to `MATRIX_REPORT` (JSON lines) and screenshots to `MATRIX_SHOTS`. Neither is committed.

**Runs on the final build (with fixes #A and #B below):**
- 3 full runs in a row, each 24/24 passed in about 2.2 min.
- Regression: the 14 isolated specs mapped to the scenarios had 195 passed, 0 failed, 5 skipped by their own gates (16.6 min). Those specs are `signup`, `agency-roles`, `role-journeys`, `recognition-chain`, `phone-journeys`, `sv-journey`, `public-need`, `audit-trail`, `skills-chain`, `teams-projects`, `journal-template`, `client-review`, `training-groups` and `former-employer-access`.
- `journeys-coverage-isolated` (#3578): 26/26 passed.
- Not run: `notifications-isolated-web-a`, which needs the CI mail catcher.

## The matrix

**Legend**
- **PASS:** proven on the local build.
- **PASS\*:** proven, with an observation that follows the table.
- **PROD:** this criterion can only be proven by the production walk named for the scenario.
- **N/A:** the criterion does not apply here, for the reason given.

**Criteria (column headers)**
1. Clear what to do
2. Each button does what it says
3. No excess text (decision 0032)
4. Data saved after reload
5. AI really acts
6. Rights correct
7. No leaks
8. Phone / tablet / desktop
9. Finishes without help

| # | Scenario | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Sign-up / invitation | PASS | PASS | PASS | PASS | N/A (no AI in sign-up) | PASS | PASS | PASS (after fix #A) | PASS |
| 2 | Worker | PASS* | PASS | PASS* | PASS | PROD | PASS | PASS | PASS | PASS |
| 3 | Employer | PASS | PASS | PASS | PASS | PROD | PASS | PASS | PASS* | PASS |
| 4 | Agency | PASS | PASS | PASS | PASS (A-1..A-6) | PROD | PASS | PASS | PASS | PASS |
| 5 | Subcontractor | PASS | PASS | PASS | PASS | N/A (no AI step) | PASS | PASS | PASS (after fix #B) | PASS |
| 6 | Student / education | PASS | PASS | PASS | PASS | N/A (no AI step) | PASS | PASS | PASS | PASS |
| 7 | AI | PASS (surface) | PROD | PASS | PROD | **PROD** | PROD | PROD | PASS (surface) | PROD |
| 8 | Admin | PASS | PASS | PASS | PASS (governance: PROD) | N/A | PASS | PASS | PASS | PASS |

### Evidence per scenario

**1. Sign-up / invitation.** Matrix M-1 on all three screens:
- **Sign-ups:** each person signs up through the public form and onboarding, using five doors: worker, employer, agency, student, and the institution door `?capability=training_provider`.
- **Stored rows:** the worker profile is onboarded with `active_role=worker`; the agency's company has `company_type=staffing_agency`.
- **Invitation:** the employer's invitation panel (preset line, link mode) hands out a link. A stranger opens it and sees `invite-register`.
- **Fit:** no overflow. The Finish button and `invite-register` are ≥ 44 px on touch.
- **Deep proof elsewhere:** `signup-isolated` S-1..S-7, ST-1, E-1..E-4 and A-1..A-2; `agency-roles` A-2; prod `signup-form`, `invited-worker` and `role-routes`.

**2. Worker.** Matrix M-2:
- **Surfaces:** the profile, the work board, the journal and messages.
- **Saved after reload:** a journal entry saved through the journal flow is shown again after a reload, and is stored exactly once (`journal_entries`).
- **Rights:** an unrelated employer's own-session read of that worker's `journal_entries` returns 0 rows, and the worker is sent away from `/dashboard/company/settings`.
- **Deep proof elsewhere:**
  - local: `phone-journeys` M-1..M-8 and `journeys-coverage` WM (a third party cannot open a thread);
  - prod: `jobs-search`, `profile-cv-history`, `journal-confirm` and `chat-continuity`.
- **Observations (PASS\*):**
  - The worker's home (`/dashboard`, "Today") stacks three explanatory blocks above the conversation: the e-mail-verification card, "Visible to employers · Off", and "Waiting on you". The verification card's paragraph is about 40 words and restates what the button does. This is flagged for the decision-0032 owner; it was not changed here, because it explains a privacy rule.
  - The home composer sits just below the first screen on all three sizes (desktop top 901 of 900, tablet 1025 of 1024, phone 897 of 844). Measured page height = screen + 65 px, which is exactly the cookie-consent banner. With the banner answered, the composer is on the first screen. Not a defect.

**3. Employer.** Matrix M-3:
- **Surfaces:** company home (`company-model-primary`, 44 px), need intake and people.
- **Saved after reload:** a need published through the intake is listed again after a reload.
- **Rights:** another organization's own-session read of the employer's `company_memberships` returns 0 rows.
- **Deep proof elsewhere:**
  - local: `role-journeys` J-*, `teams-projects` and `journeys-coverage` ST;
  - prod: `need-intake`, `company-chain`, `org-roster` and `brigade-formation`.
- **Observation (PASS\*):** on the phone, the intake's first field (`demand-role`) starts at y = 870, just below an 844 px screen, even with the cookie banner counted. It is reached by one short scroll.

**4. Agency.** Matrix M-4:
- **Surfaces:** the agency home, clients (`/dashboard/company/partners`) and people.
- **Rights:** a worker is sent away from the clients page.
- **Deep proof elsewhere:** `agency-roles` A-1..A-6 (seats, owner-only surfaces, isolation from another organization, each section rendered once on repeated loads at phone and desktop), and prod `agency-chain`.

**5. Subcontractor.** Matrix M-5:
- **Saved after reload:** a service offering is created through `/dashboard/services` and listed again after a reload; it is stored once (`service_offerings`).
- **Rights:** another company's services page does not list it as its own.
- **Surfaces:** service requests open.
- **Deep proof elsewhere:**
  - local: `journeys-coverage` SC, 26/26 on this build. It covers the public business page (404 before publishing), discovery with filters, request → accept with note → answer seen by the buyer, messages both ways, and a third company refused both on the page and by its own-session read.
  - prod: `marketplace`, `marketplace-goods-services` and `orders-bookings`.
- **Commercial safety:** no payment exists in this flow, by design.

**6. Student / education.** Matrix M-6:
- **Student:** the learning compass with `compass-open-internships` at 44 px, and the internship board; the student is sent away from the institution's education home.
- **Institution:** the education home leads with "Invite students" (44 px). A programme created through the form is listed again after a reload and stored (`education_programs`). Another organization's own-session read of the institution's programmes returns 0 rows.
- **Deep proof elsewhere:**
  - local: `recognition-chain` I-1..I-15, `signup-isolated` E-1..E-4 and ST-1, `phone-journeys` S-*/T-*, and `journeys-coverage` ST (internship need → filtered board → apply → company sees the student; a second student cannot see the interest);
  - prod: `learning-practice` and `cohort-join-request`.
- **Product gap:** no door exists for an institution to arrange a placement with an employer; the employer invites the intern directly. This is an owner decision, not built.

**7. AI.** The local stack runs with `AI_PROVIDER_MODE=disabled`, so no AI is faked here. Matrix M-7 proves only the surface: the conversation opens with a 52 px composer on all three screens, with no client error and no overflow. Everything the AI does is the production walks' proof: `chat-continuity`, `chat-confirm-once`, `manager-chat` and `mcp-chain`. Lane G adds the intent → action cases.

**8. Admin.** Matrix M-8:
- **Surfaces:** organization settings (the members invite form) and documents.
- **Rights:** a worker is sent away from the settings page.
- **Deep proof elsewhere:** `agency-roles` A-2..A-3 (member refused owner-only surfaces) and `audit-trail` U-1..U-3; prod `company-governance`, `documents-approvals`, `org-roster` and `search-support-privacy`. Lane F adds the permission and export cases.

## Defects found and fixed

| # | Scenario | Defect (evidence) | Root cause | Fix | PR |
|---|---|---|---|---|---|
| A | 1, 6, 8 | The invitation panel's send button measured **40 px** on the touch tablet and the phone (M-1). | `invite-submit` carried `min-h-10` on every screen. #3530 had raised the panel's fields to 44 px but not the button. | `min-h-11`; the guard `invite-preset-line.test.ts` pins it. | #A |
| B | 5 | "Add a service" measured **30 px** on the tablet and **40 px** on the phone (M-5). | The services section's buttons and fields had no height floor. | `min-h-11` on both add buttons, save, cancel and the form's one `inputCls`; the guard `service-offerings-tap.test.ts`. | #B |

After the fixes, M-1..M-8 passed 3 runs in a row on all three screens, and the mapped isolated specs passed (above).

## Ready for production dispatch

**Workflow:** `prod-qa-walk.yml`, `workflow_dispatch`. The `spec` and `device` input values below are exact.

**Prerequisite:** dispatch phone runs that touch the invitation panel or the services page only after #A and #B are deployed.

**Tablet:** the production walk has no tablet device; the tablet is proven by the local matrix above.

| Scenario | spec:device pairs |
|---|---|
| 1 Sign-up / invitation | `signup-form:desktop`, `signup-form:phone`, `invited-worker:phone`, `role-routes:desktop` |
| 2 Worker | `jobs-search:phone`, `profile-cv-history:desktop`, `journal-confirm:phone`, `chat-continuity:desktop` |
| 3 Employer | `company-chain:desktop`, `org-roster:desktop`, `brigade-formation:desktop`, `need-intake:phone` (raises a real internal intake alert and adds intake rows; dispatch only deliberately) |
| 4 Agency | `agency-chain:desktop`, `agency-chain:phone` |
| 5 Subcontractor | `marketplace:desktop`, `marketplace-goods-services:phone`, `orders-bookings:desktop` (after #B for phone) |
| 6 Student / education | `learning-practice:phone`, `cohort-join-request:desktop` (after #A for phone) |
| 7 AI | `chat-continuity:phone`, `chat-confirm-once:desktop`, `manager-chat:desktop`, `mcp-chain:desktop` |
| 8 Admin | `company-governance:desktop`, `documents-approvals:desktop`, `search-support-privacy:desktop` |

None of these makes a real commercial commitment: the marketplace has no payment, and proposal and contract amounts are records only. Keep `billing-test-mode` and the e-mail invite path out of this round. Production must not write journal sign-offs or recognitions; `recognition-chain` is read-only there.

## Not covered here

- **Mail:** e-mail delivery is proven by the `notifications-isolated-web-a` CI job with its local mail catcher, not by this matrix.
- **Lanes F and G:** permission/export cases (Lane F) and AI intent → action cases (Lane G) belong to those lanes.
