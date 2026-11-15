# Acceptance matrix for issue #3322 — what a production walk can prove today

Written 2026-11-14 by Lane F from the repository at `main` `b3e877ec` (production served `f0d8306f`).
**Nothing in this document was run.** It is an inventory and a plan: which cell of the owner's
acceptance gate an existing production walk already covers, which needs a new spec, and which
cannot run until the product or the synthetic cast changes. Dispatching is J-2's, on the owner's
approval. A CI pass is not production proof, and a walk listed here as "covers" proves only the
last build it ran on.

## 1. The dimensions, as the code defines them

| dimension | values | source |
|---|---|---|
| journeys | **J-A** new employer → need → candidate → decision → closed need · **J-B** agency → consented workers → match → offer → decision · **J-C** worker → search → contact → journal → employer confirmation | #3322, acceptance gates |
| routed languages | 6: `lt` `en` `ru` `nl` `de` `pl` (5 more message files exist and are not routed: `lv` `et` `da` `no` `sv`) | `lib/i18n/config.ts` `activeLocales` |
| supported countries | 17 active markets: LT LV EE PL DE NL DK NO SE FI GE BE FR ES AT CH US (the country picker offers all 249 ISO countries, these first) | `lib/taxonomy/work-categories.ts` `ACTIVE_MARKETS` |
| devices | phone 390×844 (touch) · desktop 1280×720 | `playwright.config.ts` |
| professions | 15 sectors, 49 catalogue professions; non-construction examples stored today: `warehouse_worker`, `forklift_operator`, `truck_driver_ce`, `cleaner`, `cook`, `care_assistant`, `customer_service_specialist`, `software_developer` | `WORK_CATEGORIES`, `messages/en/professions.json` |

Three "supported country" lists disagree and the matrix uses the widest: labour-market evidence
pages exist for 6 countries (LT LV EE PL DE NL), the document-requirement matrix for 9
(+ DK NO SE), the active markets are 17. That gap is a product fact, not a test gap.

The full cross product is 3 journeys × 6 languages × 17 countries × 2 devices = 612 cells. The
owner's gate asks for less: every country and every language at least once, both devices,
professions beyond construction. Section 4 proposes 17 cells per journey that meet it.

## 2. What exists today, step by step

Legend: **RUN** = an existing production walk exercises the step · **NEW** = the product has the
step, no production walk exercises it · **PRODUCT** = the step cannot be walked until the product
changes · **CAST** = the step cannot be walked until the owner provisions synthetic accounts.

Every existing write walk runs in **`lt` only** and every need posted on production is a
**construction** role (mūrininkai, suvirintojai, plytelių klojėjas). The need intake has no
country field: a need's country is its company's country, and all three synthetic companies and
the agency are Lithuanian.

### J-A — new employer → need → candidate → decision → closed need

| step | status | existing walk · what it proves | gap |
|---|---|---|---|
| new employer signs up, sets up the company | RUN (one cell) | `fresh-activation`: `lt`, desktop + a 390 check, country LT | "new" is one owner-provisioned account (`qa.freshcompany+act2`); it is new once. **CAST** for every further cell |
| posts a need | RUN | `fresh-activation`, `company-chain`, `orders-bookings`, `company-talent-history`, `documents-approvals`, `ai-off-honesty` | `lt`, desktop, construction only → NEW for other languages, phone, professions |
| candidate raises a hand | RUN | `company-chain` C-1, `orders-bookings` O-2, `notifications-inapp` N-1 | `lt` only; the public-vacancy interest button (`vacancy-interest-express`) is never pressed → NEW |
| employer sees the candidate, shortlists | RUN (partly) | `company-chain` C-2; `company-talent-history` K-3 ("saved" + internal note) | shortlist marks `interested`, `reviewed`, `not_fit` never walked → NEW |
| employer contacts the candidate | RUN | `company-chain` C-3/C-4 (thread; worker sees it on a phone), `notifications-inapp` N-2 | `lt` only |
| offer | RUN | `orders-bookings` O-3…O-6: booking proposal with dates, withdraw, re-propose, worker accepts on a phone | accept only; a **declined** booking is never walked → NEW |
| decision: hired | **PRODUCT** | an accepted booking creates an engagement; nothing records or shows "hired" as the employer's decision | register rows 4.30 and E-5: NOT VERIFIED; the decision and history screen is not built |
| decision: rejected | **PRODUCT** / NEW | shortlist `not_fit` and a declined booking exist and are unwalked; there is no rejection the candidate is told about | same rows |
| need closed | RUN | `company-chain` U-1, `orders-bookings` O-8, others | `agency-chain` and `brigade-formation` leave their need open (the second is fixed in #3303, unmerged) |
| **whole journey in one run, one build** | **NEW** | no walk goes from sign-up to a closed need; the steps above are spread over six walks | one spec, section 3 |

### J-B — agency → consented workers → match → offer → decision

| step | status | existing walk · what it proves | gap |
|---|---|---|---|
| agency registers independently, sets up the organization | **CAST** | `agency-chain` A-1 set the one synthetic agency up on its first run and reuses it since; a fresh agency sign-up is proven only on the isolated stack (`agency-roles-isolated`, `signup-isolated`) | a fresh agency account per cell needs owner provisioning |
| invites a worker, the worker consents | RUN (skips when linked) | `agency-chain` A-2 | already linked on every run after the first, so the step is skipped → NEW with a worker who can be unlinked afterwards |
| bulk roster / import | NEW | `org-roster` R-2 imports a people file as **company** Alfa; never as an agency | register A-2: NOT VERIFIED |
| connects a client, sees its shared need | RUN | `agency-chain` A-3, A-4 | `lt`, desktop |
| match → offers its person | RUN | `agency-chain` A-5 | welders only |
| client decides | RUN (accept only) | `agency-chain` A-6, A-7 (decision visible, one thread) | **decline** never walked → NEW |
| multi-agency boundary | NEW | no walk has two agencies; `worker-identity-split` proves a found worker is anonymous by API | a second synthetic agency → **CAST** |
| team offer | RUN | `brigade-formation` B2B-2…B2B-10 (terms v1, counter v2, agreement, assignment, day recorded, ended) | company-to-company, not agency |

### J-C — worker → search → contact → journal → employer confirmation

| step | status | existing walk · what it proves | gap |
|---|---|---|---|
| search by word | RUN | `jobs-search` J-1…J-5, J-7; `search-regression` S-1…S-14; `sr1-first-search` | `lt` only. Register rows SR-1, SR-4, SR-10, JS-2, JS-3, JS-4: **FAIL** — the walk exists and reports the defect |
| search by country | **PRODUCT** | the public board has **no country filter** (a `?country=` shows a "not filtered" note); the signed-in board filters by country and profession but has **no keyword** | no single surface offers word + country. A country cell can be walked only on the signed-in board, without a word |
| search by profession beyond construction | RUN (partly) | `alert-mail` (cleaner, SE), `search-regression` (lagerarbetare, undersköterska, personlig assistent) | `lt` interface only |
| worker contacts the employer | NEW | the button `interest-contact-employer` exists (company needs, after the worker's own interest); **no spec presses it** | — |
| journal entry | RUN | `journal-confirm` 1; `sectors-languages` (warehouse, restaurant, manufacturing, accounting, construction in `lt` `en` `ru` `pl`, + `nl` `de` readings); `work-verification` V-1 | the non-construction entries are never sent for confirmation |
| employer confirms | RUN | `journal-confirm` 2–3; `work-verification` V-3…V-5 (asks for changes, confirms one, rejects one); `organization-daily` | `lt` (+`en` reading), masonry text |
| **whole journey in one run** | **NEW** | search → contact → entry → confirmation is spread over four walks | one spec, section 3 |

## 3. New specs proposed (none written yet)

Three parameterised walks, one per journey, reusing the existing page helpers and identities.
Each takes its cell from dispatch inputs instead of hard-coding `lt` and a mason:

| input | values | how the walk uses it |
|---|---|---|
| `locale` | `lt` `en` `ru` `nl` `de` `pl` | every URL and every asserted sentence comes from that language's message file |
| `country` | one of the 17 | the worker's work card (restored afterwards, as `availability-save` already does); the signed-in board's country filter; for a company or agency see the blocker below |
| `profession` | a catalogue slug | the need's role text, the worker's profession, the journal sentence |
| `device` | `phone` `desktop` | viewport and touch |

| spec | journey | steps in one run | writes · clean-up |
|---|---|---|---|
| `accept-employer` | J-A | Gama posts a need for the profession → worker raises a hand → Gama shortlists → contacts → proposes dates → worker accepts (or, second variant, declines; Gama marks `not_fit`) → Gama closes the need | one need (closed in `afterAll`), one interest, one thread, one booking (cancelled in `afterAll`), one shortlist mark (cleared) |
| `accept-agency` | J-B | agency invites the worker (or confirms the link) → client shares a need → agency offers the person → client accepts (variant: declines) → the decision is visible to the agency → client closes the need | one need (closed), one offer (withdrawn if still open) |
| `accept-worker` | J-C | worker filters the signed-in board by country and profession, searches the public board by the profession's word → raises a hand on a synthetic need → presses "contact the employer" → records a day in that profession → the employer confirms it → the worker sees it confirmed | one need (closed), one thread, one journal entry (stays: a confirmed entry has no delete) |

All three use the existing cast only (owner, manager, worker, worker2, agency), mark every row
`QA-SYNTHETIC`, and record per run: build id at start and end (refusing to be cited if it
changed), PASS/FAIL per step, screenshots, console and failed-request lists, and step timings —
the fields #3322 asks for. They are dispatch-only, counted in the daily walk budget, behind every
existing brake.

## 4. The proposed cells — 17 per journey

One row per supported country, cycling languages, devices and professions so that each language
appears at least twice, each device at least eight times, and construction once.

| # | country | language | device | profession |
|---|---|---|---|---|
| 1 | LT | lt | phone | `warehouse_worker` |
| 2 | LV | ru | desktop | `cleaner` |
| 3 | EE | en | phone | `cook` |
| 4 | PL | pl | desktop | `truck_driver_ce` |
| 5 | DE | de | phone | `care_assistant` |
| 6 | NL | nl | desktop | `forklift_operator` |
| 7 | DK | en | phone | `customer_service_specialist` |
| 8 | NO | lt | desktop | `software_developer` |
| 9 | SE | ru | phone | `care_assistant` |
| 10 | FI | pl | desktop | `warehouse_worker` |
| 11 | GE | de | phone | `cook` |
| 12 | BE | nl | desktop | `cleaner` |
| 13 | FR | en | phone | `truck_driver_ce` |
| 14 | ES | lt | desktop | `forklift_operator` |
| 15 | AT | de | phone | `software_developer` |
| 16 | CH | pl | desktop | a construction role (one cell, on purpose) |
| 17 | US | en | phone | `customer_service_specialist` |

3 journeys × 17 cells = 51 walks. At one walk at a time, three minutes apart, and a daily budget of
48, that is more than one day unless the owner raises the budget for the acceptance run — and all
51 must be on **one** build, so no deploy may land while they run.

## 5. What cannot run, and what would unblock it

| blocker | cells affected | kind | what unblocks it |
|---|---|---|---|
| The employer's and the agency's **country** is fixed: all synthetic organizations are Lithuanian, and a need has no country of its own | J-A and J-B in 16 of 17 countries | CAST | the owner provisions a synthetic company and agency per country, or approves one that the walk moves between countries and restores. Until then only the **worker's** country varies (J-C, and the worker side of J-A/J-B) |
| A **new** employer or agency per cell | "new employer" in J-A, "independent registration" in J-B | CAST | a fresh owner-provisioned account per cell (the walk never creates accounts), or accept that sign-up is proven once in production (`fresh-activation`) and per language on the isolated stack |
| No "hired" or "rejected" **decision** | the decision step of J-A | PRODUCT | register 4.30 / E-5. The walk can prove the nearest facts: an accepted booking creates an engagement; a declined booking and a `not_fit` mark exist |
| No search surface with **word + country** | J-C search in every country | PRODUCT | register SR/JS rows. The walk uses the signed-in board for country and the public board for the word, and says so |
| **Multi-agency** boundaries | part of J-B | CAST | a second synthetic agency |
| Languages `lv` `et` `da` `no` `sv` | none of the 17 cells | not routed | these five are not routed languages; a visitor from LV, EE, DK, NO, SE gets one of the six. If "every supported language" means these too, that is a product decision |
| Real **phones** | every phone cell | method | the walks emulate a 390 px touch screen in Chromium; iOS Safari and Android Chrome on a device are a person's check |
| Firefox / WebKit | all | method | the production walk runs Chromium only |

## 6. Honest reading of readiness from this inventory

- No journey is proven end to end on one build today; each is proven in pieces, in Lithuanian, on a
  desktop, for construction roles, for Lithuanian organizations.
- Two of the owner's steps do not exist as product: an explicit hire / reject decision, and a
  search by word and country together.
- Six search rows the owner names are recorded as FAIL in the function register; the walks that
  show it exist.
- The agency journey passes in production for one agency and one client (register A-1: PASS);
  bulk import as an agency is NOT VERIFIED (A-2).
