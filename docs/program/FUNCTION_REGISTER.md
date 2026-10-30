# FUNCTION REGISTER — every LabourMarket.ai function, one status

The ONE canonical per-function register (owner order 2026-10-28). Every session and sub-agent reads it
BEFORE starting a task and updates it after a merged PR, a deploy or a test result. Coordination (who does
what, lanes, owner items) lives in [`COORDINATION_REGISTER.md`](COORDINATION_REGISTER.md); the public area
summary in [`../master/LABOURMARKET-FUNCTIONAL-AUDIT.md`](../master/LABOURMARKET-FUNCTIONAL-AUDIT.md) is a view of
this file. **This repository is public:** no personal data, no secrets, and no exploitable security detail —
a security/permission row says only that an item is open.

## Rules (binding)

1. **Check this file before every new task.** A `LIVE_VERIFIED` function is not re-tested or re-built without a
   concrete regression, a new change that can affect it, or a named defect.
2. A new defect in a verified function is recorded as **`REGRESSION`** in the issue column with its evidence;
   the earlier proof stays in the evidence column (never deleted).
3. An unknown result is never written as a pass. A green CI run alone is `PASS_CI_ONLY`.
4. The Stripe LIVE payment chain (row 7.5) and the optional Stripe TEST walk (row 7.4) are different scenarios.

| Status | Meaning |
|---|---|
| `LIVE_VERIFIED` | proven in production: a production walk, a recorded owner/real-user action, or real production use |
| `PASS_CI_ONLY` | passes automated tests, no production proof |
| `FAIL` | does not work (the issue column says what) |
| `BLOCKED` | built; waits for a named owner decision, account or configuration |
| `NOT_VERIFIED` | not checked yet |
| `NOT_IMPLEMENTED` | not built |
| `OPTIONAL_TEST` | an extra test scenario that does not block launch |

## Totals (277 functions, 2026-10-30)

| LIVE_VERIFIED | PASS_CI_ONLY | FAIL | BLOCKED | NOT_VERIFIED | NOT_IMPLEMENTED | OPTIONAL_TEST |
|---|---|---|---|---|---|---|
| 191 | 10 | 8 | 40 | 12 | 15 | 1 |

Seeded 2026-10-28 from the 275-row QA matrix of 2026-10-23…28 plus the 2026-10-28 production results; a `PASS` row
whose evidence names a production run or production use became `LIVE_VERIFIED`, any other `PASS` became `PASS_CI_ONLY`.

## Identity, sign-up & organizations

| ID | Function | Status | Last checked | Evidence (PR / commit / run) | In production | Remaining issue |
|---|---|---|---|---|---|---|
| 1.1 | E-mail+password sign-up / sign-in | LIVE_VERIFIED | 2026-10-28 | isolated CI walk signup-isolated (#2861/#2864/#2865, local Supabase, Chromium) 9/9 2026-10-28: S-1..S-3 form sign-up worker/company/agency, S-4 existing address → sign-in, S-5 sign-out/sign-in; role-routes 39849107061; #2854 deployed f5c0e88f (sign-up skeleton LIVE; closed-invite / existing-address  | yes | self-serve sign-up through the form proven in CI only (no synthetic production accounts, owner rule) |
| 1.2 | Google OAuth | LIVE_VERIFIED | 2026-10-18 | owner Google sign-in 10-18/19; buttons x6 live | yes |  |
| 1.3 | Password reset | PASS_CI_ONLY | 2026-10-28 | isolated CI walk signup-isolated (#2861/#2864/#2865, local Supabase, Chromium) 9/9 2026-10-28: S-6 reset mail → link → new password works, old refused (HTTP 400); profile-cv-history P-1 run 40166272659 10-25: reset form renders; mail delivery still unproven (SMTP) | unproven | production reset-mail delivery not walked |
| 1.4 | Onboarding + setup hub | LIVE_VERIFIED | — | fresh-activation walks (owner-created accounts) PASS; invited-worker path: onboarding finds the invitation without the link (#2845, live 2e4ae2b4b), server settles the role and accepts after it (#2846, live 51a35183, mig… | yes |  |
| 1.5 | Multi-role identity | LIVE_VERIFIED | 2026-10-22 | role-routes run 39783147517 (green) 10-22; 5 roles | yes |  |
| 1.6 | Organization creation + identity | LIVE_VERIFIED | 2026-10-25 | public-org-locales run 40205429467 10-25 (19 green, 2 skipped): S-[volume withheld] identity page shows Alfa's own record | yes |  |
| 1.7 | Organization verification | LIVE_VERIFIED | 2026-10-25 | public-org-locales run 40205429467 10-25 (19 green, 2 skipped): S-2 verification status shown, honest | yes |  |
| 1.8 | Multi-capability organization | BLOCKED | — | owner decision ORG-2 | unproven |  |
| 1.9 | Memberships, invitations, roles | LIVE_VERIFIED | 2026-10-28 | isolated CI walk signup-isolated (#2861/#2864/#2865, local Supabase, Chromium) 9/9 2026-10-28: S-9 invitation link → sign-up through it → stored accepted by that person; brigade-formation 39795574869 10-22 | yes |  |
| 1.10 | Workspace context + switching | LIVE_VERIFIED | 2026-10-23 | org-roster R-7 workspace switching run 39969976834 10-23 | yes |  |
| 1.11 | Cross-org isolation | LIVE_VERIFIED | 2026-10-28 | #2876 applied (ledger 20261028161106), verified in production 2026-10-28; earlier: worker-identity-split 39602569732 — isolation details in the private record (owner rule) | yes |  |
| 1.12 | Invitation / referral network | LIVE_VERIFIED | 2026-10-28 | #2855 (ledger 20261028081810) + #2858 (20261028091725) applied, verified, deployed a4cbc9b9; send ledger shows no duplicate recipient; earlier: 2026-10-27 production: partner referrals arrive through the referral door (pending join_platform with consent, latest 2026-10-27), are e-mailed (41 sent) an | yes |  |
| 1.13 | Transactional e-mail | LIVE_VERIFIED | 2026-10-28 | partner invitation mails delivered via the ledgered provider path (10-27/28); earlier: 2026-10-27 production: owner configured SMTP (LM_SMTP_PASS + INVITE_EMAIL_PROVIDER=smtp); [volume withheld] e-mails accepted by the provider 20:11-20:13 UTC (email_send_ledger_v1 [volume withheld], delivery_status | yes |  |
| 1.14 | Staff review notice | LIVE_VERIFIED | 2026-10-21 | staff-review-notice 39604913210 10-21 | yes |  |
| 1.15 | Org history before claim + claim | LIVE_VERIFIED | 2026-10-25 | company-talent-history run 40217117255 10-25: H-1 roster holds the unclaimed person card; H-2 offer saved (PATCH 200); H-3 employee accepts on the phone; H-4 roster reads linked (LT+EN); H-5 another org + another worker … | yes |  |

## Worker profile, Work Journal & Living CV

| ID | Function | Status | Last checked | Evidence (PR / commit / run) | In production | Remaining issue |
|---|---|---|---|---|---|---|
| 2.1 | Professional profile + narrative | LIVE_VERIFIED | 2026-10-25 | profile-cv-history run 40182648408 10-25 (21/21 green) | yes |  |
| 2.2 | Work card availability/pay/locations | LIVE_VERIFIED | 2026-10-25 | profile-cv-history run 40182648408 10-25 (21/21 green) | yes |  |
| 2.3 | CV import confirm each fact | LIVE_VERIFIED | 2026-10-25 | ai-off-honesty run 40191899327 10-25 (12/13 green): B-2 a CV file read deterministically into a proposal; nothing saved before confirm | yes |  |
| 2.4 | Living CV / player card / EU export | LIVE_VERIFIED | 2026-10-27 | fresh-activation run 40546035425 2026-10-27 on 429b106bc (after #2837+#2838): worker journal entry -> Living CV exact vs own DB: entries=5 hours=35 m2=30, CV recorded=35 confirmed=0 (unconfirmed separated); 390 px no sid… | yes |  |
| 2.5 | Employment history | LIVE_VERIFIED | 2026-10-25 | profile-cv-history run 40182648408 10-25 (21/21 green) | yes |  |
| 2.6 | Practice / volunteering | LIVE_VERIFIED | 2026-10-25 | profile-cv-history run 40182648408 10-25 (21/21 green) | yes |  |
| 2.7 | Education records | LIVE_VERIFIED | 2026-10-25 | profile-cv-history run 40182648408 10-25 (21/21 green) | yes |  |
| 2.8 | Achievements / declared certificates | LIVE_VERIFIED | 2026-10-25 | profile-cv-history run 40182648408 10-25 (21/21 green) | yes |  |
| 2.9 | Languages | LIVE_VERIFIED | 2026-10-25 | profile-cv-history run 40182648408 10-25 (21/21 green) | yes |  |
| 2.10 | External profile links | BLOCKED | — | RED #2471 | unproven |  |
| 2.11 | Requirement ledger | LIVE_VERIFIED | 2026-10-25 | requirements-countries run 40209522348 10-25 (9/9): R-1/R-2 DE+NL ledger reads have/missing (LT, EN, 390 px), no gate wording; R-3 signed-out + other org see none | yes |  |
| 2.12 | Skill catalogue + professions | LIVE_VERIFIED | 2026-10-25 | profile-cv-history run 40182648408 10-25 (21/21 green) | yes |  |
| 2.13 | Deterministic recognition journal->skill | LIVE_VERIFIED | 2026-10-30 | #2885 merged 88a60b567: isolated skills chain K-1..K-7 (PASS_CI_ONLY); earlier: sectors-languages run 40083930868 10-24 | yes |  |
| 2.14 | Evidence tier ladder | LIVE_VERIFIED | 2026-10-25 | profile-cv-history run 40182648408 10-25 (21/21 green) | yes |  |
| 2.15 | Free-label skill claims | LIVE_VERIFIED | 2026-10-25 | profile-cv-history run 40182648408 10-25 (21/21 green): P-13 claim saved and chip shown in place + on Living CV as self-declared (after #2754) | yes |  |
| 2.16 | Transversal capabilities | LIVE_VERIFIED | 2026-10-25 | profile-cv-history run 40182648408 10-25 (21/21 green): P-14 transversal capabilities read like other skills | yes |  |
| 2.17 | ESCO taxonomy | NOT_VERIFIED | — | quota / RED #2463 | unproven |  |
| 2.18 | Documents / credential validity | LIVE_VERIFIED | 2026-10-25 | documents-approvals 40152566232 10-25 (walk passed) | yes |  |
| 2.19 | Work Journal | BLOCKED | 2026-10-29 | #2884 live 91a1a39c: work-context choice fix, verified on a production draft; earlier: ai-off-honesty run 40191899327 10-25 | unproven | AI provider keys (owner) — honest off-state proven, the AI function itself not |
| 2.20 | Manager review / confirm | LIVE_VERIFIED | 2026-10-22 | journal-confirm run 39788692498 (green) 10-22 | yes |  |
| 2.21 | Work verification 8 states | LIVE_VERIFIED | 2026-10-26 | prod walk work-verification run 40300016332 (2026-10-26): V-1..V-6 6/6 — sent to manager, review queue with authority only, changes requested, correction pending (counted once, correction card names the decision it answe… | yes |  |
| 2.22 | Photos / task evidence | LIVE_VERIFIED | 2026-10-25 | worker-records-exports run 40186822215 10-25 (8/8 green): P-1 a journal entry with a photo saved and shown on fresh load | yes |  |
| 2.23 | Hours metrics/allocations/timesheets | LIVE_VERIFIED | 2026-10-23 | project-execution E-11 run 39968362991 10-23 | yes |  |
| 2.24 | Experience records + disputes | LIVE_VERIFIED | 2026-10-25 | profile-cv-history run 40182648408 10-25 (21/21 green): P-15 experience records open with right of reply | yes |  |
| 2.25 | Work in numbers | LIVE_VERIFIED | 2026-10-25 | profile-cv-history run 40182648408 10-25 (21/21 green): P-17 work in numbers from own recorded work | yes |  |
| 2.26 | One continuous professional history | LIVE_VERIFIED | 2026-10-25 | profile-cv-history run 40182648408 10-25 (21/21 green): P-18 one continuous history: one total, every hour once | yes |  |
| 2.27 | Org historical evidence import | BLOCKED | — | ARCH-5 owner | unproven |  |
| 2.28 | Historical consolidation | BLOCKED | — | owner OK on #2362 | unproven |  |
| 2.29 | Living CV potential capabilities | LIVE_VERIFIED | 2026-10-22 | living-cv-growth run 39791708600 (green) 10-22 | yes |  |
| 2.30 | Voice Work Journal | BLOCKED | — | STT host (owner) | unproven |  |
| 2.31 | Journal hash chain | LIVE_VERIFIED | 2026-10-24 | journal-confirm run 40083466362 10-24 (3/3): worker records entry, employer approves, worker sees it confirmed on Living CV and Work in Numbers; DB: the walk's entries are hash_version 2 (chained); integrity guards prove… | yes |  |
| 2.32 | Counterparty review | LIVE_VERIFIED | 2026-10-25 | profile-cv-history run 40182648408 10-25 (21/21 green): P-16 counterparty review readable on both sides | yes |  |
| 2.33 | Gallery | LIVE_VERIFIED | 2026-10-25 | worker-records-exports run 40186822215 10-25 (8/8 green): G-1/G-2 gallery shows the worker's own photos (390 px), other worker's gallery never carries them | yes |  |
| 2.34 | Journal + hours export | LIVE_VERIFIED | 2026-10-25 | worker-records-exports run 40186822215 10-25 (8/8 green): E-1/E-2 journal + hours CSV export downloads; another worker's export never carries this day; anonymous refused | yes |  |
| 2.35 | Discoverability consent | LIVE_VERIFIED | 2026-10-25 | search-support-privacy run 40215640433 10-25 (20 green, 2 planned skips): P-8 discoverability consent off/on persists | yes |  |

## Company operations & projects

| ID | Function | Status | Last checked | Evidence (PR / commit / run) | In production | Remaining issue |
|---|---|---|---|---|---|---|
| 3.1 | Company home | LIVE_VERIFIED | 2026-10-23 | owner session 10-23 the partner organization 1.6 s; role-routes 39783147517 | yes | large-org timing not measured |
| 3.2 | Projects | LIVE_VERIFIED | 2026-10-22 | project-execution E-1 39798187544 10-22 | yes |  |
| 3.3 | Objects / sites | LIVE_VERIFIED | 2026-10-23 | project-execution E-11 run 39968362991 10-23 | yes |  |
| 3.4 | Stages | LIVE_VERIFIED | 2026-10-24 | project-execution run 40085615921 (green) 10-24 | yes |  |
| 3.5 | Tasks | LIVE_VERIFIED | 2026-10-24 | project-execution run 40081437313 10-24: E-4 the walk starts and completes ITS OWN task (card matched by its own title inside main, after #2724) | yes |  |
| 3.6 | Worker->project assignment | LIVE_VERIFIED | 2026-10-23 | project-execution E-5 run 39968362991 10-23 | yes |  |
| 3.7 | Brigades | LIVE_VERIFIED | 2026-10-22 | brigade-formation 39795574869 10-22 | yes |  |
| 3.8 | Team->project assignment | LIVE_VERIFIED | 2026-10-22 | brigade-formation run 39795574869 (green) 10-22 | yes |  |
| 3.9 | Readiness | LIVE_VERIFIED | 2026-10-23 | project-execution E-7 run 39968362991 10-23 | yes |  |
| 3.10 | Defects / corrections | LIVE_VERIFIED | 2026-10-23 | project-execution E-8 run 39968362991 10-23 | yes |  |
| 3.11 | Handover passport | LIVE_VERIFIED | 2026-10-23 | project-execution E-9 run 39968362991 10-23 | yes |  |
| 3.12 | Project economics | LIVE_VERIFIED | 2026-10-23 | project-execution E-10 run 39968362991 10-23 | yes |  |
| 3.13 | Operations board + export | LIVE_VERIFIED | 2026-10-23 | project-execution E-2 run 39968362991 10-23: owner downloads the operations report | yes | outsider-refusal step E-13 still to re-run (spec fixed #2702) |
| 3.14 | Employer planning / calendar | LIVE_VERIFIED | 2026-10-21 | calendar-planning 39571666417 10-21 | yes |  |
| 3.15 | Absences / leave | LIVE_VERIFIED | 2026-10-23 | calendar-planning run 40007491242 (green) 10-23 | yes |  |
| 3.16 | Capacity / gap timeline | LIVE_VERIFIED | 2026-10-23 | owner session 10-23: workforce planning shows active team 2, capacity [volume withheld]-days, honest partial count | yes |  |
| 3.17 | Capacity reservation | LIVE_VERIFIED | 2026-10-23 | project-execution E-6 run 39968362991 10-23 | yes |  |
| 3.18 | Utilisation | LIVE_VERIFIED | 2026-10-26 | prod walk utilisation-planned-actual run 40295307338 (2026-10-26): U-0..U-3 8/8 — owner commits worker to dated project, committed days move on fresh load; EN + phone; employee and other org refused | yes |  |
| 3.19 | Planned vs actual | LIVE_VERIFIED | 2026-10-26 | prod walk run 40295307338 (2026-10-26): P-1..P-4 — three stages planned 5 days, started+finished; fresh load shows planned vs actual gap; EN + phone; other org + employee refused | yes |  |
| 3.20 | Shifts / rotas | LIVE_VERIFIED | 2026-10-28 | rota-repeat 40659497014; earlier: prod-qa-walk rota-repeat 40018016745 10-23 (5/5): weekly Mon/Wed/Fri + 2-on/1-off saved via Repeat UI, clash WARNS but saves (planned_collides), persists after reload, bands correct on worker calendar, cancel clears; DB:… | yes |  |
| 3.21 | Roster | LIVE_VERIFIED | 2026-10-22 | org-roster R-1 39800182427 10-22 | yes |  |
| 3.22 | People import | LIVE_VERIFIED | 2026-10-24 | org-roster run 40052543761 (green) 10-24 | yes | spec fault fixed #2667 |
| 3.23 | On/offboarding runs | LIVE_VERIFIED | 2026-10-23 | org-roster R-3 run 39969976834 10-23 | yes |  |
| 3.24 | Approvals / workflows | LIVE_VERIFIED | 2026-10-28 | documents-approvals 40663181329; earlier: documents-approvals 40152566232 10-25 (walk passed) | yes |  |
| 3.25 | Management decisions + reviews | LIVE_VERIFIED | 2026-10-28 | company-governance 40687308231 (2026-10-28) D-1..D-5 green; prod walk company-governance run 40296167812 (2026-10-26): D-1..D-5 — decision draft, sent via approval template, approved in inbox, outcome persists RU + phone, employee and other org refused | yes |  |
| 3.26 | Instructions | LIVE_VERIFIED | 2026-10-24 | org-roster run 40052543761 (green) 10-24 | yes |  |
| 3.27 | Company history + data quality | LIVE_VERIFIED | 2026-10-25 | profile-cv-history run 40182648408 10-25 (21/21 green): P-20 company history opens in Alfa workspace | yes |  |
| 3.28 | Manager chat answers | LIVE_VERIFIED | 2026-10-24 | manager-chat run 40054481359 10-24 (5/5) | yes |  |
| 3.29 | Organization documents register | LIVE_VERIFIED | 2026-10-25 | documents-approvals 40152566232 10-25 (walk passed) | yes |  |
| 3.30 | Company settings + help request | LIVE_VERIFIED | 2026-10-24 | org-roster R-4 run 40052543761 10-24 (7/7): settings + help request | yes | 10-23 failure was a walk-spec defect (#2702) |
| 3.31 | Reporting / export | LIVE_VERIFIED | 2026-10-25 | profile-cv-history run 40182648408 10-25 (21/21 green): P-21 company report opens, export downloads | yes |  |
| 3.32 | Assets / tools | LIVE_VERIFIED | 2026-10-23 | org-roster R-6 assets issue/return run 39969976834 10-23 | yes | D-2 fixed |
| 3.33 | Hours page | LIVE_VERIFIED | 2026-10-21 | company-chain 39569833029 10-21; owner #2673 | yes |  |

## Demand, jobs & matching

| ID | Function | Status | Last checked | Evidence (PR / commit / run) | In production | Remaining issue |
|---|---|---|---|---|---|---|
| 4.1 | Canonical demand intake | LIVE_VERIFIED | 2026-10-27 | fresh-activation run 40546035425 2026-10-27 on 429b106bc (after #2837+#2838): brand-new company saves its first need (no plan limit) in 4 clicks; visible on company home 1280+390 px; scouting room for the need opens with… | yes |  |
| 4.2 | Demand != supply direction | LIVE_VERIFIED | 2026-10-25 | public-market-direction run 40186517027 (green) 10-25: demand vs supply direction on public market, LT/EN/RU at 390+1280 px; anon refused from scouting + journal export | yes |  |
| 4.3 | Worker opportunity board + interest | LIVE_VERIFIED | 2026-10-26 | company-chain C-1 run 40315387466 (success; replaces 39960149411, which concluded failure — register D-7) | yes |  |
| 4.4 | Public /jobs board | LIVE_VERIFIED | 2026-10-28 | jobs-search 40645813917 J-1..J-6 6/6 (board, filter, page bounds, job page, signed-in save → saved view → remove); earlier: public-org-locales run 40205429467 10-25 (19 green, 2 skipped): U-4 public job board renders a vacancy count | yes |  |
| 4.5 | Matching engine both directions | LIVE_VERIFIED | 2026-10-30 | #2887 RED applied (ledger 20261029180012) + app e506e98b, verified in production; isolated job-fit 46/46 + compat 2/2; earlier: search-support-privacy run 40215640433 10-25 | yes | older needs await an owner-approved backfill |
| 4.6 | Team matching + team offer | LIVE_VERIFIED | 2026-10-22 | brigade-formation run 39795574869 (green) 10-22 | yes | pricing note fixed #2687 |
| 4.7 | B2B negotiation | LIVE_VERIFIED | 2026-10-22 | brigade-formation run 39795574869 (green) 10-22 | yes |  |
| 4.8 | Anonymous public need intake | PASS_CI_ONLY | 2026-10-30 | isolated public-need walk (signup-isolated 40833394554, #2883): anonymous intake stores one row; earlier: form renders | unproven | not walked in production |
| 4.9 | Saved searches + alerts | PASS_CI_ONLY | 2026-10-30 | isolated saved-search walk (40833394554, #2883): search stored, match notification + alert mail delivered; earlier: worker-records-exports run 40186822215 S-1/S-2: saved searches save + reopen PASS; alert delivery not proven | unproven | not walked in production |
| 4.10 | Organizational supply discovery | LIVE_VERIFIED | 2026-10-25 | search-support-privacy run 40215640433 10-25 (20 green, 2 planned skips): M-2 Gama discovers supply for its need: candidates + available workforce | yes |  |
| 4.11 | Candidates / scouting | LIVE_VERIFIED | 2026-10-27 | fresh-activation run 40546035425 2026-10-27: scouting room for a brand-new company's own need opens, 48 candidates listed; earlier company-chain C-2 + U-1..U-3 run 39960149411 | yes |  |
| 4.12 | Shortlist + notes | LIVE_VERIFIED | 2026-10-25 | company-talent-history run 40187168804 10-25: K-1..K-5 green — need posted, worker raises hand, Gama shortlists with internal note (persists), worker + other org see nothing, note cleared + need closed with history | yes |  |
| 4.13 | Auto-match + receipt | LIVE_VERIFIED | 2026-10-25 | search-support-privacy run 40215640433 10-25 (20 green, 2 planned skips): M-3 the need carries its automatic-matching receipt | yes |  |
| 4.14 | Candidate drafts | LIVE_VERIFIED | 2026-10-25 | search-support-privacy run 40215640433 10-25 (20 green, 2 planned skips): M-5 candidate draft created, seen after reload, deleted | yes |  |
| 4.15 | Agency-client bridge | LIVE_VERIFIED | 2026-10-26 | agency-chain run 40357361254 2026-10-26: 8/8 incl. A-1b (saved offer on the agency home, list one click away) + cleanup: this run's and the earlier run's synthetic offers withdrawn - production check: the synthetic agenc… | yes |  |
| 4.16 | Interested-worker contact | LIVE_VERIFIED | 2026-10-26 | company-chain C-3/C-4 run 40315387466 (success; replaces 39960149411 — register D-7) | yes |  |
| 4.17 | Discoverability consent | LIVE_VERIFIED | 2026-10-25 | search-support-privacy run 40215640433 10-25 (20 green, 2 planned skips): P-8 employer visibility off, persists, back on | yes |  |
| 4.18 | Employer data disclosure grant | BLOCKED | — | owner #2471 | unproven |  |
| 4.19 | Contact disclosure requests | LIVE_VERIFIED | 2026-10-25 | search-support-privacy run 40215640433 10-25 (20 green, 2 planned skips): M-4 contact-details ask pending, then withdrawn | yes |  |
| 4.20 | Discovery identity protection | LIVE_VERIFIED | 2026-10-24 | worker-identity-split run 40046311013 (green) 10-24 | yes |  |
| 4.21 | Person page name gating | LIVE_VERIFIED | 2026-10-25 | search-support-privacy run 40199732022 10-25: P-5 an unrelated organization opens the worker's page and sees no name | yes |  |
| 4.22 | 3 free profile views + VIP | NOT_IMPLEMENTED | — | built only in RED draft #2474, not merged/applied | no | owner approval + figures |
| 4.25 | Admin matching workbench | LIVE_VERIFIED | 2026-10-25 | owner admin session 2026-10-25 12:30 LT, read-only Chromium (Claude in Chrome): /admin/matching workbench renders open needs beside supply (read path; no decision written) | yes |  |
| 4.26 | /match-preview public fit | LIVE_VERIFIED | 2026-10-25 | ai-off-honesty run 40191899327 10-25 (12/13 green): C-1 signed out: match preview computes the fit, says AI explanation not generated (LT+EN, 390+1280) | yes |  |
| 4.28 | First-party supply declaration | LIVE_VERIFIED | 2026-10-25 | search-support-privacy run 40215640433 10-25 (20 green, 2 planned skips): P-[volume withheld] declares own supply, persists after reload, withdraws (data-intent check) | yes |  |
| 4.29 | Interest->vacancy hand-off | LIVE_VERIFIED | 2026-10-23 | prod DB 10-23: 3/3 consented hand-offs delivered ~2 s (partner 201/200); 10 non-consented withheld by design; cron 06:00 call 200 | yes |  |

## Chat & communication

| ID | Function | Status | Last checked | Evidence (PR / commit / run) | In production | Remaining issue |
|---|---|---|---|---|---|---|
| 5.1 | Chat-first home | LIVE_VERIFIED | 2026-10-25 | ai-off-honesty run 40191899327 10-25 (12/13 green): B-3 chat opens the door for a known sentence, says 'not understood' for an unreadable one | yes |  |
| 5.2 | Transcript persistence | LIVE_VERIFIED | 2026-10-28 | chat-continuity 40662743591; earlier: chat-continuity run 40042455002 (green) 10-23 | yes |  |
| 5.3 | Single-use confirmations | LIVE_VERIFIED | 2026-10-21 | chat-confirm-once 39604342494 10-21 | yes |  |
| 5.4 | Conversations / threads | LIVE_VERIFIED | 2026-10-21 | agency-chain 39601269995 10-21 | yes |  |
| 5.5 | Message translation | BLOCKED | 2026-10-26 | ai-off-honesty run 40191899327 10-25: A-4/A-5 original English words shown labelled 'no translation' on phone; outsiders refused; re-proven 2026-10-26 prod walk ai-off-honesty run 40301607964 13/13 (honest off state; #27… | unproven | AI provider keys (owner) — honest off-state proven, the AI function itself not |
| 5.6 | In-app notifications | LIVE_VERIFIED | 2026-10-25 | notifications-inapp runs 40012716741 (10-23) + 40204616787 (10-25), 8/8 green both | yes |  |
| 5.7 | E-mail notifications | PASS_CI_ONLY | 2026-10-30 | isolated notification walk (40833394554, #2883): per-kind e-mail consent stored, invitation_accepted mail delivered; earlier: SMTP live since 2026-10-27 (invitation mails delivered to the provider); a notification e-mail (non-invitation kind) not yet observed in the send ledger | unproven | not walked in production |
| 5.8 | Push | BLOCKED | — | #2712 merged; migration 20261023190255 applied (0 subscriptions, RLS on, no anon grant); channel OFF unless WEB_PUSH_ENABLED=true (code-verified) | unproven | owner: VAPID keys + real delivery test |
| 5.9 | Weekly digest | PASS_CI_ONLY | 2026-10-30 | isolated digest walk (40833394554, #2883): one digest per week, mail delivered; earlier: search-support-privacy run 40215640433 S-4: the weekly digest's in-app channel control exists; a digest itself not seen (email needs SMTP) | unproven | by design a worker who visited that week gets the digest in-app only |
| 5.10 | Attention / activity centre | LIVE_VERIFIED | 2026-10-25 | notifications-inapp run 40204616787 10-25 (8/8 green): N-5 activity centre lists the same stored event as read; N-3/N-4 bell row opens the thread and stays read after reload; N-6 phone 'mark all read'; N-7 no role detour | yes |  |
| 5.11 | Worker calendar | LIVE_VERIFIED | 2026-10-23 | calendar-planning run 40007491242 (green) 10-23 | yes |  |
| 5.12 | Availability | LIVE_VERIFIED | — | owner session write+revert | yes |  |
| 5.13 | Booking request->accept->engagement | LIVE_VERIFIED | 2026-10-26 | orders-bookings run 40361384432 2026-10-26: O-0..O-8 all green - need posted, hand raised, dates proposed, withdrawn + re-proposed, worker ACCEPTS on the phone, company sees it and opens the conversation, booking in the … | yes | the acknowledged-overlap path stays RED #2795 (constraint not relaxed); plain accept works |
| 5.14 | Command finder + voice | LIVE_VERIFIED | — | owner #2673/#2679 (finder only) | yes |  |
| 5.15 | Voice as equal door | NOT_VERIFIED | — | COM-8 corrected to PARTIAL/CODE_PROVEN (#2714): voice capture panel + turn policy exist | unproven | no prod voice walk |
| 5.16 | Owner Telegram alerts | BLOCKED | — | owner bot token | unproven |  |
| 5.17 | Support conversations | LIVE_VERIFIED | 2026-10-25 | search-support-privacy run 40215640433 10-25 (20 green, 2 planned skips): S-[volume withheld] opens a support conversation, finds it in own inbox | yes |  |
| 5.18 | Global dashboard search | LIVE_VERIFIED | 2026-10-25 | search-support-privacy run 40215640433 10-25 (20 green, 2 planned skips): S-2 global dashboard search finds the conversation and opens it | yes |  |
| 5.19 | Inbox report view | LIVE_VERIFIED | 2026-10-25 | search-support-privacy run 40215640433 10-25 (20 green, 2 planned skips): S-5 company review inbox + printable report | yes |  |

## Marketplace

| ID | Function | Status | Last checked | Evidence (PR / commit / run) | In production | Remaining issue |
|---|---|---|---|---|---|---|
| 6.1 | Service offerings + request loop | LIVE_VERIFIED | 2026-10-25 | marketplace-goods-services run 40164310896 10-25: service made discoverable, requested by another org, accepted with a note, requester sees acceptance, both sides message | yes |  |
| 6.2 | Listings goods/rental/wanted | LIVE_VERIFIED | 2026-10-25 | marketplace-goods-services run 40164310896 10-25 (14/14): private sale listing, company rental published as the company, private 'looking for' listing, discovery, cross-org Q&A thread; cleanup closed all synthetic listin… | yes |  |
| 6.3 | One discovery index | LIVE_VERIFIED | 2026-10-25 | marketplace-goods-services run 40164310896 10-25: listings and services found in the one market discovery | yes |  |
| 6.4 | Buyer workspace | LIVE_VERIFIED | 2026-10-26 | buyer-workspace run 40377604733 2026-10-26 (owner-created synthetic buyer): B-0 onboarding via shipped wizard, B-[volume withheld] record saves + reads back, B-2 DRAFT request listed once, B-3 390 px no sideways scroll; … | yes | open security/permission item — details kept out of the public repository (owner rule) |
| 6.6 | Proposals/contracts | LIVE_VERIFIED | 2026-10-25 | documents-approvals 40152566232 10-25 (walk passed) | yes |  |
| 6.7 | Procurement | LIVE_VERIFIED | 2026-10-26 | orders-bookings run 40361384432 2026-10-26 PASS (re-proven) | yes |  |
| 6.8 | Business trips | LIVE_VERIFIED | 2026-10-26 | orders-bookings run 40361384432 2026-10-26 PASS (re-proven) | yes | fixed by #2706 (rpc .catch crash) |
| 6.9 | Finance records | LIVE_VERIFIED | 2026-10-26 | orders-bookings run 40361384432 2026-10-26 PASS (re-proven) | yes |  |
| 6.10 | Project-cost calculator | LIVE_VERIFIED | 2026-10-25 | public-org-locales run 40205429467 10-25 (19 green, 2 skipped): U-7 project-cost calculator computes a result | yes |  |
| 6.11 | Cross-border readiness | LIVE_VERIFIED | 2026-10-23 | live 10-23 public part | yes | copy D-2 |
| 6.12 | Cross-border deals | NOT_IMPLEMENTED | — | registry NOT_BUILT: cross-border deals module | no | owner: decide whether 6.6 contracts + 6.11 cross-border readiness suffice |
| 6.13 | Orders goods purchase | NOT_IMPLEMENTED | — | registry NOT_BUILT: goods purchase order lifecycle | no | depends on payments for goods (only org plans are armed); owner design |
| 6.14 | Logistics | NOT_IMPLEMENTED | — | registry NOT_BUILT: logistics/shipment/freight | no | depends on 6.13 |
| 6.16 | Commercial handoff to the partner organization | LIVE_VERIFIED | 2026-10-24 | prod DB: commercial_handoffs 7 delivered, last 2026-10-24 08:58 UTC | yes |  |
| 6.17 | CRM pipeline | LIVE_VERIFIED | 2026-10-25 | owner admin session 2026-10-25 12:30 LT, read-only Chromium (Claude in Chrome): /admin/pipeline renders all demand sources by stage (read-only by design) | yes |  |
| 6.18 | Waitlist | NOT_VERIFIED | — | modal + validation live; no real submit | unproven |  |
| 6.19 | Team enquiries | LIVE_VERIFIED | 2026-10-25 | public-org-locales run 40205429467 10-25 S-8 PASS (team enquiry inbox renders for the owner) | yes |  |
| 6.20 | Value channels | LIVE_VERIFIED | 2026-10-26 | public-org-locales run 40371836163 2026-10-26: S-9 chat names the value channel for an offer (#2831 fixed the walk's page-offset read; product answered correctly in 40363282539 too) | yes |  |
| 6.21 | /business/[slug] | BLOCKED | — | RED RPC owner | unproven |  |

## Plans, billing & entitlements

| ID | Function | Status | Last checked | Evidence (PR / commit / run) | In production | Remaining issue |
|---|---|---|---|---|---|---|
| 7.1 | Plan catalogue + /pricing | LIVE_VERIFIED | 2026-10-25 | public-org-locales run 40205429467 10-25 (19 green, 2 skipped): U-2 /pricing plan cards honest for the billing state | yes |  |
| 7.2 | Free organization limit 1 open need | PASS_CI_ONLY | 2026-10-23 | brigade walk 10-12; pilot lifted limit 10-23 | unproven |  |
| 7.3 | Entitlement resolver | LIVE_VERIFIED | 2026-10-23 | pilot payment changed effective entitlements live 10-23 | yes |  |
| 7.4 | Stripe TEST checkout/portal/webhook | OPTIONAL_TEST | 2026-10-28 | billing-test-mode never executed: the pilot organization is not armed in Stripe TEST; production stays LIVE (owner 10-28) | — | extra TEST scenario; does not block launch and is not a payment defect |
| 7.5 | Live charging | LIVE_VERIFIED | 2026-10-23 | real Stripe LIVE payment, webhook fired, pilot plan activated (owner-confirmed) | yes |  |
| 7.6 | Billing recovery cron | BLOCKED | — | #2696 removed the GH cadence that hit nginx-404; recovery still needs the VPS cron line + BILLING_RECOVERY_ENABLED | unproven | owner VPS step |
| 7.7 | Manual pilot grant (admin) | BLOCKED | — | no admin session | unproven |  |
| 7.8 | LMC credit ledger | BLOCKED | — | owner design | unproven |  |
| 7.9 | LMC top-ups, VIP, ai_plus, tiers | NOT_IMPLEMENTED | — | registry NOT_BUILT: LMC top-ups, VIP media EUR 24.99, ai_plus, agency tiers, referral rates | no | owner prices; LMC owner-locked |
| 7.10 | 3 profile views + VIP | NOT_IMPLEMENTED | — | built in RED draft #2474 (3 free profile views + org VIP), not merged/applied | no | owner approval + figures |
| 7.11 | Deferred plans | NOT_IMPLEMENTED | — | registry NOT_BUILT: worker_plus, agency_pilot plans | no | owner prices |
| 7.12 | AI cost metering | BLOCKED | — | AI runtime off (10.6) | unproven |  |
| 7.13 | Plan-gated booking_requests | NOT_VERIFIED | 2026-10-25 | public-org-locales run 40205429467 10-25: S-6 PASS - bookings surface renders with no plan gate at rest; the gate at the plan limit itself not exercised | unproven | needs an org at its booking limit (synthetic Gama is on the pilot) |
| 7.14 | Vacancy translation entitlement | BLOCKED | 2026-10-26 | ai-off-honesty run 40191899327 10-25: C-2 failed on a spec locator (two main elements); translation entitlement needs AI; re-proven 2026-10-26 prod walk ai-off-honesty run 40301607964 13/13 (honest off state; #2771 one <… | unproven | AI provider keys (owner) — honest off-state proven, the AI function itself not |
| 7.15 | EUR 99 subscription checkout | BLOCKED | — | EUR 99 order hidden by design while the pilot pass is on; VAT path = RED #2685 (Stripe Tax) awaiting owner approval | unproven | owner: approve #2685 and decide when to show EUR 99 |
| 7.16 | Webhook signature verification | LIVE_VERIFIED | 2026-10-23 | 3 LIVE events verified 10-23 | yes |  |
| 7.17 | No double charge / processing | LIVE_VERIFIED | — | 3 live events, 0 dup event ids, UNIQUE(provider,event_id); 1 subscription row | yes | 2 stale open checkout ops |
| 7.18 | Payment changes rights | NOT_VERIFIED | 2026-10-23 | paid -> rights PASS (pilot 10-23) | unproven | missing evidence: payment failure or expiry -> rights withdrawn (TEST-mode failed payment scenario, or the pilot's own expiry 2026-11-22) |
| 7.19 | Refunds and disputes | BLOCKED | — | refund/dispute recorded only; 0 events in prod | unproven | owner refund policy + TEST walk |
| 7.20 | Invoices inside LM | NOT_IMPLEMENTED | — | in-app invoices/payment history not built (Stripe portal invoice exists; RED draft #2682 adds plan name+amount only) | no | build Stripe invoice read for the org |
| 7.21 | Billing portal for every billing manager | NOT_VERIFIED | 2026-10-23 | payer opened the Stripe portal (10-23) | unproven | missing evidence: a second billing manager of the same org opens the portal |
| 7.22 | Paid-feature rights and limits | NOT_VERIFIED | — | plan limits enforced for needs + bookings (pilot lifted the open-need limit live) | unproven | missing evidence: the other paid-feature limits (profile views #2474, VIP) are not built/applied |
| 7.23 | LMC top-up | NOT_IMPLEMENTED | — | registry NOT_BUILT: LMC one-time top-up (1 LMC = [amount withheld]) | no | owner: packages, VAT, refund; LMC owner-locked |
| 7.24 | LMC granted once per payment | NOT_IMPLEMENTED | — | registry NOT_BUILT: LMC grant tied to one confirmed payment | no | depends on 7.23 |
| 7.25 | LMC balance and history | NOT_VERIFIED | 2026-10-25 | lmc-csrf run 40210854856 10-25: chat 'Kiek turiu LMC?' door opens the balance section (LT/EN, 390 px), signed-out refused; both synthetic accounts read state=no_account honestly — a measured balance/history not yet seen | unproven | open security/permission item — details kept out of the public repository (owner rule) |
| 7.26 | LMC spend + reversal | NOT_IMPLEMENTED | — | registry NOT_BUILT: LMC spend + refund reversal (functions exist, no caller) | no | depends on 7.23 |
| 7.27 | Free VIP for approved employers | FAIL | — | admin grant invisible in live org workspace (registry BROKEN) | no | owner #2474 |
| 7.28 | Payee and terms | FAIL | — | live terms name seller UAB the partner organization but no renewal/cancellation/refund/14-day withdrawal clauses, and say legal info is 'being prepared' while the paid pilot is live; anon pricing says nothing can be boug… | no | owner/legal clauses (RED); meta-text removal in progress |
| 7.29 | VAT Stripe Tax | NOT_VERIFIED | — | RED draft #2685; sandbox scenarios PASS Stripe-side | unproven |  |

## Languages & markets

| ID | Function | Status | Last checked | Evidence (PR / commit / run) | In production | Remaining issue |
|---|---|---|---|---|---|---|
| 8.1 | UI localization | LIVE_VERIFIED | 2026-10-23 | live 6 locales x 25 routes 10-23 after #2686 | yes | D-1 fixed |
| 8.2 | Multilingual work understanding | LIVE_VERIFIED | 2026-10-26 | prod walk sectors-languages run 40300823818 (2026-10-26): 11/11 — 5 sectors understood, saved and listed (lt/en/ru/en/pl); #2779 regression: generic place word names no site and the 6 hours stay with the masonry in lt/en… | yes |  |
| 8.3 | Machine translation | BLOCKED | 2026-10-26 | ai-off-honesty run 40191899327 10-25: A-4 no machine translation, original kept and labelled; re-proven 2026-10-26 prod walk ai-off-honesty run 40301607964 13/13 (honest off state; #2771 one <main> on job pages) | unproven | AI provider keys (owner) — honest off-state proven, the AI function itself not |
| 8.4 | Country labour-market pages | LIVE_VERIFIED | 2026-10-25 | public-org-locales run 40205429467 10-25 (19 green, 2 skipped): U-5 country labour-market page renders | yes |  |
| 8.5 | Nine priority launch markets | BLOCKED | 2026-10-28 | 2026-10-28 catalog audit: active locales lt/en/ru/nl/de/pl complete (15191 strings, 0 '[EN]' placeholders); inactive da/et/lv/no/sv are PARTIAL (5817 of 15191 keys) and 22-44% of their strings are '[EN]' placeholders (da… | unproven | Activating the 5 markets needs ~9400 missing keys per locale plus the [EN] placeholders translated and reviewed (owner: translation source/budget decision; zero paid AI policy) |
| 8.6 | Country requirement matrix | LIVE_VERIFIED | 2026-10-25 | requirements-countries run 40209522348 10-25: C-1/C-2 DE+NL matrices from the country index (LT, EN, 390 px) with europa.eu sources; C-[volume withheld] documents view with sources, no upload; C-4 signed-out refused | yes |  |
| 8.7 | Public answer engine + llms.txt | LIVE_VERIFIED | 2026-10-25 | public-org-locales run 40205429467 10-25 (19 green, 2 skipped): U-8 /llms.txt plain text naming the product | yes |  |
| 8.8 | SEO plumbing | LIVE_VERIFIED | 2026-10-25 | public-org-locales run 40205429467 10-25 (19 green, 2 skipped): U-9 robots, sitemap, canonical + hreflang to the apex | yes |  |
| 8.9 | Public org profile | BLOCKED | 2026-10-26 | public-org-locales run 40205429467 10-25: S-10 skipped honestly - no organization has a published public profile (production count 0, 2026-10-26); publishing the synthetic Alfa profile would put a test object on a public… | unproven | owner: allow a synthetic public profile for the walk, or wait for a real organization to opt in |
| 8.10 | Marketing site | LIVE_VERIFIED | 2026-10-25 | public-org-locales run 40205429467 10-25 (19 green, 2 skipped): U-1 landing + 4 marketing pages LT/EN/RU at 390 and 1280 | yes |  |
| 8.11 | Mobile web | LIVE_VERIFIED | 2026-10-26 | mobile-surfaces run 40195784343 10-25 (5/5 green, after #2751/#2755/#2759): worker + manager at 390 px — 0 boxes past the edge on lt/ru dashboard, nl/de cv, hours, project operations (project-first), planning (notice in … | yes |  |
| 8.12 | PWA installability | LIVE_VERIFIED | 2026-10-25 | public-org-locales run 40205429467 10-25 (19 green, 2 skipped): U-10 every locale home links the manifest; served | yes |  |
| 8.13 | Native app | BLOCKED | 2026-10-30 | shared native client proven per platform in 8.17 (Android) and 8.18 (iOS) on production build 84cc2f85; earlier: ARCH-6 + store accounts | unproven |  |
| 8.14 | App links | BLOCKED | — | store accounts | unproven |  |
| 8.15 | Mobile store release | BLOCKED | 2026-10-30 | apps run against production (8.17 Android, 8.18 iOS); no store listing; earlier: no Play/App Store listing exists | unproven | owner store accounts (Google Play, Apple, EAS) + ARCH-6 |
| 8.16 | Language feedback | LIVE_VERIFIED | 2026-10-26 | public-org-locales run 40371836163 2026-10-26: S-12 the synthetic owner sends a language report from the account menu, sees 'Ačiū — pranešimas užfiksuotas'; DB: exactly 1 language_feedback row of this run (17:54 UTC, QA-… | yes |  |
| 8.17 | Android app (native) | LIVE_VERIFIED | 2026-10-30 | Android signed-in journey on production build 84cc2f85 (run 41014999978): sign-in, Today read, journal entry drafted + confirmed (row in DB), profile, jobs search, job opened (hand-off ok), empty need refused, sign-out; … | yes | not in Google Play (see 8.15) |
| 8.18 | iOS app (native) | LIVE_VERIFIED | 2026-10-30 | iOS signed-in journey on production build 84cc2f85 (run 41015011284, passed on attempt 2 of 2): sign-in, Today read, journal draft + confirm, profile, jobs search, job opened (hand-off ok), empty need refused, sign-out | yes | need submission not tested on iOS (open, owner decision); first attempt can stall on the system Save-Password sheet; not in the App Store (see 8.15) |

## Admin, privacy & security

| ID | Function | Status | Last checked | Evidence (PR / commit / run) | In production | Remaining issue |
|---|---|---|---|---|---|---|
| 9.1 | Superadmin console | LIVE_VERIFIED | 2026-10-28 | admin-console 40688059945 (2026-10-28) green: non-admins refused, operator pages render; owner admin session 2026-10-25 ~13:50 LT on build 3f552e0d (#2761): /lt/dashboard/admin renders all sections (buyer requests, privacy, sales pipeline, moderation, people, launch readiness), no error boundary; be | yes |  |
| 9.2 | Admin pilots/telemetry/league | LIVE_VERIFIED | 2026-10-25 | owner admin session 2026-10-25 12:30 LT, read-only Chromium (Claude in Chrome): /admin/pilots, /admin/telemetry and /admin/league render real data | yes |  |
| 9.3 | Admin user inspect | LIVE_VERIFIED | 2026-10-25 | owner admin session 2026-10-25, read-only: /admin/users/<synthetic QA id> renders role, state, profile text, suggested skills, drafts with honest empty states | yes |  |
| 9.4 | Privacy request intake | LIVE_VERIFIED | 2026-10-19 | prod DB: erasure request received + executed via intake 2026-10-19 (receipt requested_at) | yes |  |
| 9.5 | GDPR export | LIVE_VERIFIED | 2026-10-25 | search-support-privacy run 40199732022 10-25: P-[volume withheld] downloads own data bundle (measured, never read, deleted) | yes |  |
| 9.6 | GDPR erasure executor | LIVE_VERIFIED | 2026-10-19 | prod DB: privacy_erasure_receipts_v3 executed receipt 2026-10-19 15:23 UTC | yes |  |
| 9.7 | Worker row access identity split | LIVE_VERIFIED | 2026-10-21 | worker-identity-split 39602569732 10-21 | yes |  |
| 9.8 | RLS on every table | LIVE_VERIFIED | 2026-10-23 | prod catalog 10-23: 243/243 public tables RLS on; 15 no-policy tables sealed; anon probes 401/404 | yes | cleanup candidate backfill snapshot (RED) |
| 9.9 | Audit trail | PASS_CI_ONLY | 2026-10-30 | isolated walk 40833394554 (#2883) | unproven | open security/permission item — details kept out of the public repository (owner rule) |
| 9.10 | Rate limiting | LIVE_VERIFIED | 2026-10-23 | live 10-23: 6 anon POST /api/waitlist (non-JSON) -> 5x400 then 429 retry-after 600 (5/10 min) | yes | in-memory per instance; real-IP depends on VPS cloudflare.inc |
| 9.11 | Same-origin checks | LIVE_VERIFIED | — | prod build 711745d0 (waitlist 403, logout 303) + lmc-csrf run 40210854856 O-1..O-3: cross-origin transcript POST refused, same-origin validated (LT/EN/390), foreign Server Action POST aborted before lookup | yes |  |
| 9.12 | Legal pages | LIVE_VERIFIED | 2026-10-25 | public-org-locales run 40205429467 10-25 (19 green, 2 skipped): U-6 legal pages render | yes |  |
| 9.13 | Personal location privacy | LIVE_VERIFIED | 2026-10-25 | search-support-privacy run 40199732022 10-25: P-4 a preferred location's visibility changes, persists and is put back | yes |  |
| 9.14 | Telemetry / funnel | LIVE_VERIFIED | 2026-10-25 | owner admin session 2026-10-25 12:30 LT, read-only Chromium (Claude in Chrome): /admin/telemetry funnel renders real counts (90-day, admin + non-prod excluded) | yes |  |
| 9.15 | Search stacks | LIVE_VERIFIED | 2026-10-25 | search-support-privacy run 40215640433 10-25 (20 green, 2 planned skips): S-3 synthetic organization findable in the network directory (directory part) | yes |  |
| 9.16 | External referral API | BLOCKED | — | partner tokens; anon 401 PASS | unproven |  |
| 9.17 | Internal supply feed | PASS_CI_ONLY | 2026-10-23 | 401 anon; edge logs show authorized Agentai pulls 10-23 (readback 05:50, supply feed 06:02/08:32/11:01) | unproven | readback 1x/24 h vs 4/day intended |
| 9.18 | Public JSON APIs | PASS_CI_ONLY | — | /api/health public 200 ok; others authenticated by design | unproven |  |
| 9.19 | Admin import sandbox | BLOCKED | 2026-10-25 | owner admin session 2026-10-25 12:30 LT, read-only Chromium (Claude in Chrome): renders 'disabled — set INTELLIGENCE_SANDBOX_ENABLED=1' (honest off state) | unproven | owner: enable flag if wanted |
| 9.20 | Admin intelligence inspector | BLOCKED | 2026-10-25 | owner admin session 2026-10-25 12:30 LT, read-only Chromium (Claude in Chrome): renders 'disabled — set INTELLIGENCE_INSPECTOR_ENABLED=1' + source activation readiness | unproven | owner: enable flag if wanted |
| 9.22 | Env schema validation | LIVE_VERIFIED | — | zod env validation at load; deploy 39952179926 health=healthy, build 431385cf; rollback on unhealthy | yes | open security/permission item — details kept out of the public repository (owner rule) |
| 9.23 | Security-definer governance | LIVE_VERIFIED | 2026-10-23 | prod 10-23: anon SECURITY DEFINER set = allowlist 9/9; PUBLIC exec 0/589 | yes | 3 functions mutable search_path (RED R-2) |
| 9.24 | Security incident handling | LIVE_VERIFIED | — | live headers HSTS preload, CSP report-only, XFO DENY, nosniff, Referrer/Permissions-Policy; monitor issues + health probe + onRequestError + client-errors | yes | CSP has no report-uri |
| 9.25 | CodeQL / dependency alerts | FAIL | 2026-10-30 | #2879, #2880, #2881 merged | no | open security/permission item — details kept out of the public repository (owner rule) |

## MCP & AI agents

| ID | Function | Status | Last checked | Evidence (PR / commit / run) | In production | Remaining issue |
|---|---|---|---|---|---|---|
| 10.1 | MCP door 229 tools | LIVE_VERIFIED | 2026-10-23 | mcp-chain 39606986334; mcp-agents 10-23; live anon | yes |  |
| 10.2 | Agent scenarios over MCP | LIVE_VERIFIED | 2026-10-23 | mcp-agents 9/9 39885097311 10-23 | yes |  |
| 10.3 | OAuth 2.1 for MCP clients | NOT_VERIFIED | — | discovery live (401 challenge, PRM, DCR, S256); walk #2454 runs without owner creds | unproven | merge or dispatch #2454 |
| 10.4 | MCP scopes | NOT_IMPLEMENTED | — | registry NOT_BUILT: MCP OAuth scope enforcement (bearer has full user scope) | no | auth path = RED; buildable as draft |
| 10.5 | ChatGPT/Claude listings | BLOCKED | — | owner portals | unproven |  |
| 10.6 | AI runtime | BLOCKED | 2026-10-26 | ai-off-honesty run 40191899327 10-25: B-4 provider state shown as off; re-proven 2026-10-26 prod walk ai-off-honesty run 40301607964 13/13 (honest off state; #2771 one <main> on job pages) | unproven | AI provider keys (owner) — honest off-state proven, the AI function itself not |
| 10.7 | Conversation intent LLM | BLOCKED | — | 10.6 | unproven |  |
| 10.8 | CV AI structuring | BLOCKED | — | 10.6 | unproven |  |
| 10.9 | Journal AI suggestions | BLOCKED | — | 10.6 | unproven |  |
| 10.10 | Explanation AI | BLOCKED | — | 10.6 | unproven |  |
| 10.11 | Six agents without call site | LIVE_VERIFIED | — | decision implemented (#2765): country_readiness integrated, 5 duplicates retired, 0 uncalled agents; prod: anon Chromium (not_authenticated) + requirements-countries run 40209522348 C-5 signed-in -> ai_off, requirements … | yes |  |
| 10.13 | /dashboard/assist | LIVE_VERIFIED | 2026-10-25 | ai-off-honesty run 40191899327 10-25 (12/13 green): B-4 assist page states the AI provider state and that no text came from a model (LT+EN) | yes |  |
| 10.14 | Agents OS admin page | LIVE_VERIFIED | 2026-10-25 | owner admin session 2026-10-25 12:30 LT, read-only Chromium (Claude in Chrome): /admin/agent-os renders the agent register | yes |  |
| 10.15 | Agents OS runtime | NOT_IMPLEMENTED | — | registry NOT_BUILT: autonomous internal agents runtime | no | owner AGENT-1..4 decisions; ARCHITECTURE_ONLY |
| 10.16 | AI agents as participants | NOT_IMPLEMENTED | — | registry NOT_BUILT: AI agents as market participants (AI-4) | no | owner AGENT-1..4 decisions |
| 10.17 | External action receipts | LIVE_VERIFIED | 2026-10-23 | mcp-agents run 39885097311 (green) 10-23; audit_logs rows observed | yes |  |
| 10.18 | Vacancy source SE | LIVE_VERIFIED | 2026-10-23 | cursor 06:03 10-23; 49,731 live | yes |  |
| 10.19 | Vacancy source NAV | LIVE_VERIFIED | 2026-10-23 | cursor 07:27 10-23; 9,266 live | yes |  |
| 10.20 | Vacancy retention | FAIL | 2026-10-23 | dry run 39936626534 10-23 fails closed: service_role lacks SELECT on 2 protected-id tables; would purge 110,481/[volume withheld] | no | open security/permission item — details kept out of the public repository (owner rule) |
| 10.21 | Eurostat import | BLOCKED | — | gates on but no scheduler calls runEurostatImport; data from 07-15 | unproven | owner: allow scheduled import |
| 10.22 | the partner organization integration | BLOCKED | — | owner | unproven |  |
| 10.23 | Agentai supply feed | LIVE_VERIFIED | 2026-10-24 | prod edge logs 2026-10-24/25: rpc first_party_supply_feed_v1 200 x4 (last 09:32 UTC) = authorized feed pulls served; anon 401 (earlier probe) | yes |  |
| 10.24 | Self-hosted STT/translate | BLOCKED | — | owner deploy | unproven |  |
| 10.25 | Cloudflare AI adapter | BLOCKED | — | owner key | unproven |  |
| 10.26 | OpenAI apps challenge | BLOCKED | — | owner token | unproven |  |
| 10.27 | Maps | LIVE_VERIFIED | 2026-10-25 | search-support-privacy run 40215640433 10-25 (20 green, 2 planned skips): S-6 map renders markers, no external geocoding call | yes |  |

## Education & learning

| ID | Function | Status | Last checked | Evidence (PR / commit / run) | In production | Remaining issue |
|---|---|---|---|---|---|---|
| 11.1 | Institution + learner link | LIVE_VERIFIED | 2026-10-21 | learning-practice 39601905282 10-21 | yes |  |
| 11.2 | Programmes / cohorts | LIVE_VERIFIED | 2026-10-25 | learning-practice run 40154033299 (green) 10-25 | yes |  |
| 11.3 | Learning compass | LIVE_VERIFIED | 2026-10-25 | learning-practice run 40154033299 (green) 10-25 | yes |  |
| 11.4 | Practice capacity | LIVE_VERIFIED | 2026-10-25 | learning-practice run 40154033299 (green) 10-25 | yes |  |
| 11.5 | Learner outcomes | LIVE_VERIFIED | 2026-10-25 | learning-practice run 40154033299 (green) 10-25 | yes |  |
| 11.6 | Institution reporting + export | LIVE_VERIFIED | 2026-10-25 | learning-practice run 40154033299 (green) 10-25 | yes |  |
| 11.7 | Practice->competency recognition | LIVE_VERIFIED | 2026-10-21 | recognition-chain 39602983862 10-21 | yes |  |
| 11.8 | Training & certification register | FAIL | 2026-10-28 | company-governance 40687308231 (2026-10-28 12:28Z) green incl. T-5 — #2857 workspace scoping LIVE_VERIFIED; course register, assign, complete, see completed, retire all pass | yes | engaged non-member workers cannot be assigned training (owner product decision, RED #2816) |
| 11.9 | Human-in-loop learning review | BLOCKED | — | owner parked nav door | unproven |  |
| 11.10 | RPL equivalence structure | NOT_IMPLEMENTED | — | registry NOT_BUILT: RPL equivalence structure (ARCH-2) | no | owner, RED schema |

## Market intelligence

| ID | Function | Status | Last checked | Evidence (PR / commit / run) | In production | Remaining issue |
|---|---|---|---|---|---|---|
| 12.1 | Market map | LIVE_VERIFIED | 2026-10-23 | owner session 10-23: market map renders Leaflet tiles, markers, radius and location controls | yes |  |
| 12.2 | Labour-market intelligence | LIVE_VERIFIED | 2026-10-23 | live public 10-23 | yes | copy D-2 |
| 12.3 | /dashboard/intelligence | LIVE_VERIFIED | 2026-10-25 | profile-cv-history run 40182648408 10-25 (21/21 green): P-19 intelligence page with method and sources | yes |  |
| 12.4 | Demand recognizer | LIVE_VERIFIED | 2026-10-23 | owner session 10-23 after #2690: LT need sentence recognises role, place (Vilniuje), experience, scope, start (nuo lapkričio) 5/21 | yes | duration-vs-headcount follow-up #2694 (auto-merge after regression tests); re-check after deploy; crews not representable yet (flagged) |
| 12.5 | Public market facts | LIVE_VERIFIED | 2026-10-23 | live 10-23 58,997 = DB | yes |  |
| 12.6 | Admin league / market | LIVE_VERIFIED | 2026-10-25 | owner admin session 2026-10-25 12:30 LT, read-only Chromium (Claude in Chrome): /admin/league + /admin/market render real supply/demand aggregates with n<5 flags | yes |  |

## Infrastructure & operations

| ID | Function | Status | Last checked | Evidence (PR / commit / run) | In production | Remaining issue |
|---|---|---|---|---|---|---|
| 13.1 | VPS hosting + auto-deploy | FAIL | 2026-10-28 | 10-28 recurrence: admin-console 40668817886 (worker page timeout) and company-governance 40678088257 (D-1 chunk load timeout, ChunkLoadError in the app log) while the server answered normally; deploys green; 10-28 intermittent inbound loss from GitHub-hosted networks, host healthy; earlier: external | no | REGRESSION-class infra: GitHub-runner → VPS inbound loss now fails production walks; provider network fault probable, not proven; Hostinger ticket pending owner |
| 13.2 | Health probe + monitor | LIVE_VERIFIED | — | live | yes |  |
| 13.3 | Prod QA walk harness | LIVE_VERIFIED | 2026-10-22 | role-routes run 39783147517 (green) 10-22 | yes |  |
| 13.4 | Supabase capacity | PASS_CI_ONLY | 2026-10-25 | Supabase org plan=pro (get_organization 2026-10-25) | unproven |  |
| 13.5 | Database backup | FAIL | 2026-10-27 | 2026-10-27 read-only: db-backup.yml stops at 'Require secrets' nightly since 10-18 (10-17 drills: permission denied); repo has VPS_DEPLOY_* but neither SUPABASE_ACCESS_TOKEN nor SUPABASE_BACKUP_DB_URL; 0 successful runs … | no | open security/permission item — details kept out of the public repository (owner rule) |
| 13.6 | VPS cron bundle | LIVE_VERIFIED | 2026-10-23 | prod data 10-23: all 4 VPS cron entries ran (handoffs 06:00, job-alerts, weekly digest Mon, erasure every 10 min); pg_cron booking expiry ran | yes | 1 erasure notice queued (no SMTP) |
| 13.7 | Migration safety + parity | LIVE_VERIFIED | 2026-10-23 | parity tool vs prod ledger 10-23 | yes |  |
| 13.8 | Migration ledger parity | LIVE_VERIFIED | 2026-10-23 | prod ledger 10-23: 396 match; all drift documented except ESCO fn applied with file only in open #2410 | yes | record/merge #2410 |
| 13.9 | Supabase GitHub integration | BLOCKED | — | owner | unproven |  |
| 13.10 | Quality gates | LIVE_VERIFIED | 2026-10-25 | Quality Gates on main run 40175733431 success 2026-10-25 | yes |  |
| 13.11 | E2E in CI | LIVE_VERIFIED | — | e2e-smoke 39950760373 on live build 431385cf: 32/32 | yes |  |
| 13.12 | Executable product constitution | LIVE_VERIFIED | — | quality 39950760135 product-truth green (111 caps, 28 nodes, 6 journeys) | yes |  |
| 13.13 | Feature-availability catalogue | NOT_VERIFIED | — | catalog guards green; effect only in signed-in dashboards, no prod walk | unproven |  |
| 13.14 | Owner waivers / product gate | LIVE_VERIFIED | — | product gate + self-test pass; waivers 35/35; live anon secdef gate PASS 589/9 | yes | live parity gate skipped: CI role lacks USAGE on supabase_migrations (owner GOV-1) |
| 13.15 | Old-browser compatibility | LIVE_VERIFIED | — | shim live | yes |  |
| 13.16 | Browser crash reports | NOT_VERIFIED | — | only a registry citation; no primary evidence recoverable | unproven |  |
| 13.17 | Env parity after hosting move | FAIL | 2026-10-27 | 2026-10-27 read-only: last real AI call gemini 2026-10-15 16:07; since then provider=disabled reason=mode_disabled (AI_PROVIDER_MODE not live) - 25 calls to 10-27; lifetime AI spend actual $0.16 (Oct $0.09/234 calls). In… | no | OWNER+LEGAL: AI off coincides with owner 10-15 Gemini personal-data restriction (needs billed key + AI_GEMINI_PAID_TIER_CONFIRMED=1 / DPA). SMTP: LM_SMTP_PASS + INVITE_EMAIL_PROVIDER=smtp via lm-env-set.sh |

