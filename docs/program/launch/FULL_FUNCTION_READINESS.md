# FULL FUNCTION READINESS — 288 registered functions (audit of 2026-11-12)

> Derived view. The ONE canonical register stays [`../FUNCTION_REGISTER.md`](../FUNCTION_REGISTER.md); this file
> adds nothing to it and must not be edited as a second register. It was generated on 2026-11-12 from the
> register on `main` at commit `46b7d6e69`, with two unmerged inputs named in the method section. Every PASS
> holds for the date and build recorded in its row, NOT for today's production build, unless the row says so.
> Companion files: [`LAUNCH_EXECUTIVE_STATUS.md`](LAUNCH_EXECUTIVE_STATUS.md),
> [`LAUNCH_COMPLETION_ROADMAP.md`](LAUNCH_COMPLETION_ROADMAP.md).


Generated 2026-11-12 from `docs/program/FUNCTION_REGISTER.md` on `origin/main` (commit 46b7d6e69). Nothing here is a new test result; every status is the register's own.

## 1. Method

- **ID, function, status, evidence, known issue**: the per-section function rows of the register on `origin/main` (columns: ID | Function | Status | Last checked | Evidence | In production | Remaining issue). Evidence and issue cells are shortened (about 80 / 100 characters); the full text stays in the register.
- **Status mapping (never upgraded)**: LIVE_VERIFIED -> "PASS (production proof)" = production proof on the date/build recorded in the row; **not re-run on the current build unless stated**. PASS_CI_ONLY -> "PASS in CI only". FAIL -> FAIL. BLOCKED -> BLOCKED. NOT_VERIFIED -> NOT TESTED. NOT_IMPLEMENTED -> NOT IMPLEMENTED. OPTIONAL_TEST and DUPLICATE are shown as such and are never counted as a pass.
- **For whom**: the `Kam` column of the register's own `Map: functions` table (a draft, translated from Lithuanian); "—" where empty.
- **Plan**: the code-enforced matrix as instructed: "not gated in code (free today)" for every row, except rows about creating/reopening company needs (4.1, 7.2) and billing/Stripe/subscription rows (7.4, 7.5, 7.6, 7.15–7.21, 7.23, 7.24, 7.28–7.30). **Intended tier** is "owner decision pending" for every row.
- **V2 design**: `docs/design/UX_UNIFICATION_STATUS.md` (PR #3272, not merged; a code inventory, not a visual review). That file lists screens, not row IDs; the row-to-screen match is taken from the register lane branch `docs/cc/function-register-launch-state` (commit 11ac4dbb, 2026-11-12, not merged), which adds a per-row launch table (UX/UI, plan as enforced, lane, missing work). It is used here only as an additional input; `origin/main` stays the base. Rows no list names: NOT ASSESSED.
- **Mobile**: NOT TESTED unless the row's evidence cell names a mobile walk or a phone-size step. **Next step**: "none" for PASS rows with an empty issue cell; otherwise the start of the issue cell (or, where that is empty, the register lane's "missing work", marked).

## 2. Totals

Parsed from the 13 section tables of `origin/main` (290 rows = 288 counted + 2 DUPLICATE):

| Register status | Mapped status | Parsed | File states (Totals, "288 planned functions, 2026-11-03") | Difference |
|---|---|---|---|---|
| LIVE_VERIFIED | PASS (production proof) | 197 | 196 | +1 |
| PASS_CI_ONLY | PASS in CI only | 5 | 6 | -1 |
| FAIL | FAIL | 8 | 8 | 0 |
| BLOCKED | BLOCKED | 39 | 39 | 0 |
| NOT_VERIFIED | NOT TESTED | 16 | 16 | 0 |
| NOT_IMPLEMENTED | NOT IMPLEMENTED | 22 | 22 | 0 |
| OPTIONAL_TEST | OPTIONAL TEST (not a pass) | 1 | 1 | 0 |
| **Total counted** | | **288** | **288** | 0 |
| DUPLICATE (4.17, 7.10) | not counted | 2 | 2 (stated in the text, not in the table) | 0 |

Difference: the file's totals table says 196 LIVE_VERIFIED and 6 PASS_CI_ONLY; the rows themselves give 197 and 5 (one row moved from CI-only to production proof without the totals table being updated). The sum is 288 either way. The unmerged register lane branch states 197 + 5, matching the rows. A second, stricter table in the same file ("Combined audit view", 2026-11-03) states 162 PASS / 9 FAIL / 60 BLOCKED / 57 NOT VERIFIED for the same 288 under a different rule; it is not used here.

"In production" column of the rows (parsed): yes: 199, unproven: 61, no: 29, —: 1.

## 3. Every function, by register section

Column "intended tier" is "owner decision pending" for all 290 rows and is therefore carried once per table header rather than argued per row.

### Section 1 — Identity, sign-up & organizations (15 rows)

| ID | Function | For whom | Status | Evidence | Known issue | Plan | Intended tier | V2 design | Mobile | Next step |
|---|---|---|---|---|---|---|---|---|---|---|
| 1.1 | E-mail+password sign-up / sign-in | worker, job seeker, company, agency | PASS (production proof), last checked 2026-10-28 | isolated CI walk signup-isolated (#2861/#2864/#2865, local Supabase, Chromium)… | self-serve sign-up through the form proven in CI only (no synthetic production accounts, owner rule) | not gated in code (free today) | owner decision pending | mixed (A list) | NOT TESTED | self-serve sign-up through the form proven in CI only (no s… |
| 1.2 | Google OAuth | worker, job seeker, company, agency | PASS (production proof), last checked 2026-10-18 | owner Google sign-in 10-18/19; buttons x6 live | — | not gated in code (free today) | owner decision pending | mixed (A list) | NOT TESTED | none |
| 1.3 | Password reset | worker, job seeker, company, agency | PASS (production proof), last checked 2026-11-02 | prod walk mail-reset 41428606490 2026-11-02 2/2 (reset mail read from the real… | no repeatable production walk yet (D-4 mailbox walk #2903 pending the owner) | not gated in code (free today) | owner decision pending | mixed (A list) | NOT TESTED | no repeatable production walk yet (D-4 mailbox walk #2903 p… |
| 1.4 | Onboarding + setup hub | worker, job seeker, company, agency | PASS (production proof), last checked 2026-11-01 | prod walk fresh-activation 41279196446 2026-11-01 on 38bfb9d93: fresh worker +… | open: UF-4 (first real user 2026-11-04) | not gated in code (free today) | owner decision pending | mixed (A list) | NOT TESTED | open: UF-4 (first real user 2026-11-04) |
| 1.5 | Multi-role identity | worker, company, agency | PASS (production proof), last checked 2026-11-01 | prod walk role-routes 41280157502 2026-11-01 on 38bfb9d93 (5/5 roles); earlier:… | — | not gated in code (free today) | owner decision pending | unified (A list) | NOT TESTED | none |
| 1.6 | Organization creation + identity | company, manager, agency | PASS (production proof), last checked 2026-10-25 | public-org-locales run 40205429467 10-25 (19 green, 2 skipped): S-[volume withh… | — | not gated in code (free today) | owner decision pending | mixed (H audit) | NOT TESTED | none |
| 1.7 | Organization verification | company, administrator | PASS (production proof), last checked 2026-10-25 | public-org-locales run 40205429467 10-25 (19 green, 2 skipped): S-2 verificatio… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 1.8 | Multi-capability organization | company | BLOCKED | owner decision ORG-2 | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | Owner: the decision in the Reason column. Then the coordina… [register lane] |
| 1.9 | Memberships, invitations, roles | company, manager | PASS (production proof), last checked 2026-11-02 | prod walk invited-worker 41430482903 2026-11-02 7/7 (the invited person registe… | expired-invitation and project-linked invitation not walked in production | not gated in code (free today) | owner decision pending | mixed (G audit, H audit) | NOT TESTED | expired-invitation and project-linked invitation not walked… |
| 1.10 | Workspace context + switching | worker, company, manager, agency | PASS (production proof), last checked 2026-11-01 | prod walk org-roster 41318490491 2026-11-01 on 681e6678f (7/7) R-7 — details in… | — | not gated in code (free today) | owner decision pending | mixed (A list) | NOT TESTED | none |
| 1.11 | Cross-org isolation | system | PASS (production proof), last checked 2026-11-01 | prod walk worker-identity-split 41318189146 2026-11-01 on 681e6678f (5/5) — det… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 1.12 | Invitation / referral network | worker, company | PASS (production proof), last checked 2026-10-28 | #2855 (ledger 20261028081810) + #2858 (20261028091725) applied, verified, deplo… | — | not gated in code (free today) | owner decision pending | mixed (G audit) | NOT TESTED | none |
| 1.13 | Transactional e-mail | worker, job seeker, company | PASS (production proof), last checked 2026-10-28 | partner invitation mails delivered via the ledgered provider path (10-27/28); e… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 1.14 | Staff review notice | administrator | PASS (production proof), last checked 2026-10-21 | staff-review-notice 39604913210 10-21 | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 1.15 | Org history before claim + claim | company, manager | PASS (production proof), last checked 2026-11-01 | prod walk company-talent-history 41279265278 2026-11-01 on 38bfb9d93 (17/17) H-… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | one phone-size step named in evidence; otherwise NOT TESTED | none |

### Section 2 — Worker profile, Work Journal & Living CV (37 rows)

| ID | Function | For whom | Status | Evidence | Known issue | Plan | Intended tier | V2 design | Mobile | Next step |
|---|---|---|---|---|---|---|---|---|---|---|
| 2.1 | Professional profile + narrative | worker, job seeker, self-employed specialist | PASS (production proof), last checked 2026-11-01 | prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-3; e… | — | not gated in code (free today) | owner decision pending | mixed (A list, G audit) | NOT TESTED | none |
| 2.2 | Work card availability/pay/locations | worker, job seeker, self-employed specialist | PASS (production proof), last checked 2026-11-01 | prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-4; e… | 2026-11-06: Save on a page the browser translates killed the screen, with the row stored (real repo… | not gated in code (free today) | owner decision pending | mixed (A list, G audit) | NOT TESTED | 2026-11-06: Save on a page the browser translates killed th… |
| 2.3 | CV import confirm each fact | worker, job seeker | PASS (production proof), last checked 2026-11-04 | prod walk profile-cv-history 41925521910 2026-11-04 on 5b24826b3 (21/21) P-6: a… | open: UF-3 (first real user 2026-11-04); FAIL 2026-11-05: two tabs confirming the same CV education… | not gated in code (free today) | owner decision pending | mixed (A list, G audit) | NOT TESTED | open: UF-3 (first real user 2026-11-04); FAIL 2026-11-05: t… |
| 2.4 | Living CV / player card / EU export | worker, job seeker, self-employed specialist | PASS (production proof), last checked 2026-11-01 | prod walk fresh-activation 41279196446 2026-11-01 on 38bfb9d93: first journal e… | — | not gated in code (free today) | owner decision pending | mixed (A list, G audit) | NOT TESTED | none |
| 2.5 | Employment history | worker, job seeker | PASS (production proof), last checked 2026-11-04 | prod walk profile-cv-history 41925521910 2026-11-04 on 5b24826b3 (21/21) P-7; e… | — | not gated in code (free today) | owner decision pending | mixed (A list) | NOT TESTED | none |
| 2.6 | Practice / volunteering | job seeker, learner, worker | PASS (production proof), last checked 2026-11-01 | prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-8; e… | — | not gated in code (free today) | owner decision pending | mixed (A list) | NOT TESTED | none |
| 2.7 | Education records | worker, job seeker, learner | PASS (production proof), last checked 2026-11-04 | prod walk profile-cv-history 41925521910 2026-11-04 on 5b24826b3 (21/21) P-9; t… | fixed by #3089 and proven in prod walk profile-cv-history 41994411748 2026-11-05 on a6dd80110 (24/2… | not gated in code (free today) | owner decision pending | mixed (A list, G audit) | NOT TESTED | fixed by #3089 and proven in prod walk profile-cv-history 4… |
| 2.8 | Achievements / declared certificates | worker, job seeker | PASS (production proof), last checked 2026-11-01 | prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-10;… | — | not gated in code (free today) | owner decision pending | mixed (A list, G audit) | NOT TESTED | none |
| 2.9 | Languages | worker, job seeker | PASS (production proof), last checked 2026-11-01 | prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-5; e… | — | not gated in code (free today) | owner decision pending | mixed (A list, G audit) | NOT TESTED | none |
| 2.10 | External profile links | worker, self-employed specialist | BLOCKED | RED #2471 | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | Owner: the decision in the Reason column. Then the coordina… [register lane] |
| 2.11 | Requirement ledger | worker, job seeker | PASS (production proof), last checked 2026-10-25 | requirements-countries run 40209522348 10-25 (9/9): R-1/R-2 DE+NL ledger reads… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 2.12 | Skill catalogue + professions | worker, job seeker, self-employed specialist | PASS (production proof), last checked 2026-11-01 | prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-11;… | — | not gated in code (free today) | owner decision pending | mixed (A list, G audit) | NOT TESTED | none |
| 2.13 | Deterministic recognition journal->skill | worker, job seeker | PASS (production proof), last checked 2026-11-01 | prod walk living-cv-growth 41281984217 2026-11-01 on 38bfb9d93 (3/3, lt/en/ru);… | — | not gated in code (free today) | owner decision pending | old design (G audit) | NOT TESTED | none |
| 2.14 | Evidence tier ladder | worker, job seeker, company | PASS (production proof), last checked 2026-11-01 | prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-12;… | — | not gated in code (free today) | owner decision pending | old design (A list) | NOT TESTED | none |
| 2.15 | Free-label skill claims | worker, job seeker, self-employed specialist | PASS (production proof), last checked 2026-11-01 | prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-13;… | — | not gated in code (free today) | owner decision pending | mixed (A list, G audit) | NOT TESTED | none |
| 2.16 | Transversal capabilities | worker, job seeker | PASS (production proof), last checked 2026-11-01 | prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-14;… | — | not gated in code (free today) | owner decision pending | old design (A list) | NOT TESTED | none |
| 2.17 | ESCO taxonomy | system | NOT TESTED | quota / RED #2463 | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | Owner: RED #2463 and quota [register lane] |
| 2.18 | Documents / credential validity | worker, job seeker, company | PASS (production proof), last checked 2026-11-03 | prod walk documents-approvals 41716118134 2026-11-03 on a10b6c47d (passed); ear… | — | not gated in code (free today) | owner decision pending | mixed (G audit) | NOT TESTED | none |
| 2.19 | Work Journal | worker, self-employed specialist | PASS (production proof), last checked 2026-11-01 | prod walk fresh-activation 41279196446 2026-11-01 on 38bfb9d93: a fresh worker'… | AI suggestions stay BLOCKED in 10.9 (owner AI keys); the honest off-state is proven | not gated in code (free today) | owner decision pending | mixed (H audit) | NOT TESTED | AI suggestions stay BLOCKED in 10.9 (owner AI keys); the ho… |
| 2.20 | Manager review / confirm | manager, worker | PASS (production proof), last checked 2026-11-02 | prod walk journal-confirm 41478434884 2026-11-02 on 4453e9d3a (4/4): the worker… | — | not gated in code (free today) | owner decision pending | mixed (A list, H audit) | NOT TESTED | none |
| 2.21 | Work verification 8 states | worker, manager | PASS (production proof), last checked 2026-11-01 | prod walk work-verification 41280396705 2026-11-01 on 38bfb9d93 (6/6); #2895 co… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 2.22 | Photos / task evidence | worker, self-employed specialist | PASS (production proof), last checked 2026-11-01 | prod walk worker-records-exports 41312948857 2026-11-01 on 7f8bfaa2a (8/8) P-1;… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 2.23 | Hours metrics/allocations/timesheets | worker, manager, company | PASS (production proof), last checked 2026-11-03 | prod walk project-execution 41722638759 2026-11-03 on 7f0f06583 (passed); earli… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 2.24 | Experience records + disputes | worker, manager | FAIL | 2026-11-01 reconciled with product-truth: open RED moderation item (EVID-6); de… | — | not gated in code (free today) | owner decision pending | old design (G audit) | NOT TESTED | Coordinator: private record [register lane] |
| 2.25 | Work in numbers | worker, self-employed specialist | PASS (production proof), last checked 2026-11-01 | prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-17;… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 2.26 | One continuous professional history | worker, job seeker | PASS (production proof), last checked 2026-11-01 | prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-18;… | — | not gated in code (free today) | owner decision pending | mixed (A list) | NOT TESTED | none |
| 2.27 | Org historical evidence import | company, manager | BLOCKED | ARCH-5 owner | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | Owner: the decision in the Reason column. Then the coordina… [register lane] |
| 2.28 | Historical consolidation | system | BLOCKED | owner OK on #2362 | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | Owner: the decision in the Reason column. Then the coordina… [register lane] |
| 2.29 | Living CV potential capabilities | worker, job seeker | PASS (production proof), last checked 2026-11-01 | prod walk living-cv-growth 41281984217 2026-11-01 on 38bfb9d93 (3/3, lt/en/ru);… | — | not gated in code (free today) | owner decision pending | mixed (A list, G audit) | NOT TESTED | none |
| 2.30 | Voice Work Journal | worker, self-employed specialist | BLOCKED | STT host (owner) | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | Owner: the decision in the Reason column. Then the coordina… [register lane] |
| 2.31 | Journal hash chain | worker, manager, system | PASS (production proof), last checked 2026-10-24 | journal-confirm run 40083466362 10-24 (3/3): worker records entry, employer app… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 2.32 | Counterparty review | self-employed specialist, client, manager | PASS (production proof), last checked 2026-11-01 | prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-16;… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 2.33 | Gallery | self-employed specialist, worker | PASS (production proof), last checked 2026-11-01 | prod walk worker-records-exports 41312948857 2026-11-01 on 7f8bfaa2a (8/8) G-1/… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | one phone-size step named in evidence; otherwise NOT TESTED | none |
| 2.34 | Journal + hours export | worker, manager | PASS (production proof), last checked 2026-11-01 | prod walk worker-records-exports 41312948857 2026-11-01 on 7f8bfaa2a (8/8) E-1/… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 2.35 | Discoverability consent | worker, job seeker | PASS (production proof), last checked 2026-11-01 | prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green,… | — | not gated in code (free today) | owner decision pending | mixed (G audit) | NOT TESTED | none |
| 2.36 | Profession-specific journal templates | worker, self-employed specialist | NOT TESTED | templates + migration exist (decision 0006; lib/journal/journal-templates.ts);… | no production walk | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | no production walk |
| 2.37 | Subject refuses an imported record | worker | NOT IMPLEMENTED | architecture §1.6/§10 (ARCH-5); appears only as the blocker of 2.27 | owner decision ARCH-5, then build | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | owner decision ARCH-5, then build |

### Section 3 — Company operations & projects (36 rows)

| ID | Function | For whom | Status | Evidence | Known issue | Plan | Intended tier | V2 design | Mobile | Next step |
|---|---|---|---|---|---|---|---|---|---|---|
| 3.1 | Company home | company, manager | PASS (production proof), last checked 2026-10-23 | owner session 10-23 the partner organization 1.6 s; role-routes 39783147517 | large-org timing not measured | not gated in code (free today) | owner decision pending | mixed (A list) | NOT TESTED | large-org timing not measured |
| 3.2 | Projects | company, manager | PASS (production proof), last checked 2026-11-03 | prod walk project-execution 41722638759 2026-11-03 on 7f0f06583 (passed); earli… | — | not gated in code (free today) | owner decision pending | mixed (H audit) | NOT TESTED | none |
| 3.3 | Objects / sites | company, manager | PASS (production proof), last checked 2026-11-03 | prod walk project-execution 41722638759 2026-11-03 on 7f0f06583 (passed); earli… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 3.4 | Stages | company, manager | PASS (production proof), last checked 2026-11-03 | prod walk project-execution 41722638759 2026-11-03 on 7f0f06583 (passed); earli… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 3.5 | Tasks | company, manager, worker | PASS (production proof), last checked 2026-11-03 | prod walk project-execution 41722638759 2026-11-03 on 7f0f06583 (passed); earli… | — | not gated in code (free today) | owner decision pending | mixed (H audit) | NOT TESTED | none |
| 3.6 | Worker->project assignment | company, manager | PASS (production proof), last checked 2026-11-03 | prod walk project-execution 41722638759 2026-11-03 on 7f0f06583 (passed); earli… | — | not gated in code (free today) | owner decision pending | mixed (H audit) | NOT TESTED | none |
| 3.7 | Brigades | company, manager | PASS (production proof), last checked 2026-10-22 | brigade-formation 39795574869 10-22 | — | not gated in code (free today) | owner decision pending | mixed (A list, H audit) | NOT TESTED | none |
| 3.8 | Team->project assignment | company, manager | PASS (production proof), last checked 2026-11-01 | prod walk brigade-formation 41350506578 2026-11-01 on 7c46946c3 (19/19, B2B-1..… | — | not gated in code (free today) | owner decision pending | mixed (H audit) | NOT TESTED | none |
| 3.9 | Readiness | company, manager | PASS (production proof), last checked 2026-11-03 | prod walk project-execution 41722638759 2026-11-03 on 7f0f06583 (passed); earli… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 3.10 | Defects / corrections | company, manager | PASS (production proof), last checked 2026-11-03 | prod walk project-execution 41722638759 2026-11-03 on 7f0f06583 (passed); earli… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 3.11 | Handover passport | company, manager | PASS (production proof), last checked 2026-11-03 | prod walk project-execution 41722638759 2026-11-03 on 7f0f06583 (passed); earli… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 3.12 | Project economics | company, manager | PASS (production proof), last checked 2026-11-03 | prod walk project-execution 41722638759 2026-11-03 on 7f0f06583 (passed); earli… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 3.13 | Operations board + export | company, manager | PASS (production proof), last checked 2026-11-03 | prod walk project-execution 41722638759 2026-11-03 on 7f0f06583 (passed); earli… | outsider-refusal step E-13 still to re-run (spec fixed #2702) | not gated in code (free today) | owner decision pending | mixed (H audit) | NOT TESTED | outsider-refusal step E-13 still to re-run (spec fixed #270… |
| 3.14 | Employer planning / calendar | company, manager | PASS (production proof), last checked 2026-10-21 | calendar-planning 39571666417 10-21 | open: UF-6 (first real user 2026-11-04) | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | open: UF-6 (first real user 2026-11-04) |
| 3.15 | Absences / leave | worker, manager, company | PASS (production proof), last checked 2026-10-23 | calendar-planning run 40007491242 (green) 10-23 | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 3.16 | Capacity / gap timeline | company, manager | PASS (production proof), last checked 2026-10-23 | owner session 10-23: workforce planning shows active team 2, capacity [volume w… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 3.17 | Capacity reservation | company, manager | PASS (production proof), last checked 2026-11-03 | prod walk project-execution 41722638759 2026-11-03 on 7f0f06583 (passed); earli… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 3.18 | Utilisation | company, manager | PASS (production proof), last checked 2026-10-26 | prod walk utilisation-planned-actual run 40295307338 (2026-10-26): U-0..U-3 8/8… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | one phone-size step named in evidence; otherwise NOT TESTED | none |
| 3.19 | Planned vs actual | company, manager | PASS (production proof), last checked 2026-10-26 | prod walk run 40295307338 (2026-10-26): P-1..P-4 — three stages planned 5 days,… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | one phone-size step named in evidence; otherwise NOT TESTED | none |
| 3.20 | Shifts / rotas | company, manager | PASS (production proof), last checked 2026-10-28 | rota-repeat 40659497014; earlier: prod-qa-walk rota-repeat 40018016745 10-23 (5… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 3.21 | Roster | company, manager | PASS (production proof), last checked 2026-11-01 | prod walk org-roster 41318490491 2026-11-01 on 681e6678f (7/7) R-1; earlier: or… | — | not gated in code (free today) | owner decision pending | mixed (A list, H audit) | NOT TESTED | none |
| 3.22 | People import | company, manager | PASS (production proof), last checked 2026-11-01 | prod walk org-roster 41318490491 2026-11-01 on 681e6678f (7/7) R-2; earlier: or… | spec fault fixed #2667 | not gated in code (free today) | owner decision pending | mixed (A list) | NOT TESTED | spec fault fixed #2667 |
| 3.23 | On/offboarding runs | company, manager | PASS (production proof), last checked 2026-11-01 | prod walk org-roster 41318490491 2026-11-01 on 681e6678f (7/7) R-3; earlier: or… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 3.24 | Approvals / workflows | company, manager | PASS (production proof), last checked 2026-11-03 | prod walk documents-approvals 41716118134 2026-11-03 on a10b6c47d (passed); ear… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 3.25 | Management decisions + reviews | manager | PASS (production proof), last checked 2026-10-28 | company-governance 40687308231 (2026-10-28) D-1..D-5 green; prod walk company-g… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | one phone-size step named in evidence; otherwise NOT TESTED | none |
| 3.26 | Instructions | manager, company, worker | PASS (production proof), last checked 2026-11-01 | prod walk org-roster 41318490491 2026-11-01 on 681e6678f (7/7) R-5; earlier: or… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 3.27 | Company history + data quality | company, manager | PASS (production proof), last checked 2026-11-01 | prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-20;… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 3.28 | Manager chat answers | manager, company | PASS (production proof), last checked 2026-10-24 | manager-chat run 40054481359 10-24 (5/5) | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 3.29 | Organization documents register | company, manager | PASS (production proof), last checked 2026-11-03 | prod walk documents-approvals 41716118134 2026-11-03 on a10b6c47d (passed); ear… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 3.30 | Company settings + help request | company, manager | PASS (production proof), last checked 2026-11-01 | prod walk org-roster 41318490491 2026-11-01 on 681e6678f (7/7) R-4; earlier: or… | 10-23 failure was a walk-spec defect (#2702) | not gated in code (free today) | owner decision pending | mixed (H audit) | NOT TESTED | 10-23 failure was a walk-spec defect (#2702) |
| 3.31 | Reporting / export | company, manager | PASS (production proof), last checked 2026-11-01 | prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-21;… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 3.32 | Assets / tools | company, manager | PASS (production proof), last checked 2026-11-01 | prod walk org-roster 41318490491 2026-11-01 on 681e6678f (7/7) R-6; earlier: or… | D-2 fixed | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | D-2 fixed |
| 3.33 | Hours page | company, manager, worker | PASS (production proof), last checked 2026-11-01 | prod walk company-chain 41283188592 2026-11-01 on 38bfb9d93 (13/13) H-1/H-2 com… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 3.34 | Project forecast engine + recompute modes | company, manager | NOT TESTED | 2026-11-01: engine wired to the manager project page, computed on read (#2920,… | wire storage + recompute modes (#2738), then walk a project with enough recorded work | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | wire storage + recompute modes (#2738), then walk a project… |
| 3.35 | Commitment overlap -> warning -> alternatives -> override -… | company, manager | NOT TESTED | architecture §5 J-TIME-FREEDOM; MCP calendar_conflicts_get exists; UI flow and… | flow + production walk | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | flow + production walk |
| 3.36 | Company Living CV | company, manager | NOT TESTED | owner order 2026-10-24; nearest: company history 3.27 | owner to confirm the product shape | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | owner to confirm the product shape |

### Section 4 — Demand, jobs & matching (27 rows)

| ID | Function | For whom | Status | Evidence | Known issue | Plan | Intended tier | V2 design | Mobile | Next step |
|---|---|---|---|---|---|---|---|---|---|---|
| 4.1 | Canonical demand intake | company, manager, agency | PASS (production proof), last checked 2026-11-01 | prod walk fresh-activation 41279196446 2026-11-01 on 38bfb9d93: fresh company d… | — | FREE: 1 active need; paid/trial: no ceiling; enforced only for pilot organisations | owner decision pending | unified (A list) | NOT TESTED | none |
| 4.2 | Demand != supply direction | system | PASS (production proof), last checked 2026-10-25 | public-market-direction run 40186517027 (green) 10-25: demand vs supply directi… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 4.3 | Worker opportunity board + interest | worker, job seeker | PASS (production proof), last checked 2026-11-01 | prod walk company-chain 41283188592 2026-11-01 on 38bfb9d93 (13/13) C-1; earlie… | — | not gated in code (free today) | owner decision pending | unified (A list) | NOT TESTED | none |
| 4.4 | Public /jobs board | job seeker, worker | PASS (production proof), last checked 2026-11-05 | prod walk jobs-search 41978529892 2026-11-05 on c9a58473e (7/7) J-1..J-7; earli… | open: UF-1, UF-2, UF-7 (first real user 2026-11-04) | not gated in code (free today) | owner decision pending | mixed (A list) | NOT TESTED | open: UF-1, UF-2, UF-7 (first real user 2026-11-04) |
| 4.5 | Matching engine both directions | job seeker, company | PASS (production proof), last checked 2026-11-01 | prod walk company-talent-history 41279265278 2026-11-01 on 38bfb9d93 (17/17) K-… | older needs await an owner-approved backfill | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | older needs await an owner-approved backfill |
| 4.6 | Team matching + team offer | company, agency | PASS (production proof), last checked 2026-11-01 | prod walk brigade-formation 41350506578 2026-11-01 on 7c46946c3 (19/19, B2B-1..… | pricing note fixed #2687 | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | pricing note fixed #2687 |
| 4.7 | B2B negotiation | company, agency | PASS (production proof), last checked 2026-10-22 | brigade-formation run 39795574869 (green) 10-22 | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 4.8 | Anonymous public need intake | company | PASS in CI only | isolated public-need walk (signup-isolated 40833394554, #2883): anonymous intak… | not walked in production | not gated in code (free today) | owner decision pending | mixed (A list) | NOT TESTED | not walked in production |
| 4.9 | Saved searches + alerts | job seeker, worker | PASS (production proof), last checked 2026-11-02 | prod walk alert-mail 41488266687 2026-11-02 on fa81b12fd (9/9, 390 px): work ca… | not walked in production | not gated in code (free today) | owner decision pending | mixed (A list) | NOT TESTED | not walked in production |
| 4.10 | Organizational supply discovery | company, manager | PASS (production proof), last checked 2026-11-01 | prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green,… | — | not gated in code (free today) | owner decision pending | mixed (G audit) | NOT TESTED | none |
| 4.11 | Candidates / scouting | company, agency | PASS (production proof), last checked 2026-11-01 | prod walk company-chain 41283188592 2026-11-01 on 38bfb9d93 (13/13) C-2; earlie… | — | not gated in code (free today) | owner decision pending | mixed (A list, G audit) | NOT TESTED | none |
| 4.12 | Shortlist + notes | company, agency | PASS (production proof), last checked 2026-11-01 | prod walk company-talent-history 41279265278 2026-11-01 on 38bfb9d93 (17/17) K-… | — | not gated in code (free today) | owner decision pending | old design (G audit) | NOT TESTED | none |
| 4.13 | Auto-match + receipt | company, agency | PASS (production proof), last checked 2026-11-01 | prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green,… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 4.14 | Candidate drafts | agency, company | PASS (production proof), last checked 2026-11-01 | prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green,… | — | not gated in code (free today) | owner decision pending | old design (G audit) | NOT TESTED | none |
| 4.15 | Agency-client bridge | agency, client | PASS (production proof), last checked 2026-11-03 | prod walk agency-chain 41717112150 2026-11-03 on a10b6c47d (passed); earlier: a… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 4.16 | Interested-worker contact | company, agency | PASS (production proof), last checked 2026-11-01 | prod walk company-chain 41283188592 2026-11-01 on 38bfb9d93 (13/13) C-3/C-4; ea… | — | not gated in code (free today) | owner decision pending | old design (G audit) | NOT TESTED | none |
| 4.17 | Discoverability consent | worker, job seeker | DUPLICATE (not counted) | duplicate of 2.35 (same function); kept for history, NOT counted in the totals;… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none (see the row it duplicates) |
| 4.18 | Employer data disclosure grant | worker, job seeker | BLOCKED | owner #2471 | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | Owner: the decision in the Reason column. Then the coordina… [register lane] |
| 4.19 | Contact disclosure requests | worker, job seeker, company | PASS (production proof), last checked 2026-11-01 | prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green,… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 4.20 | Discovery identity protection | system | PASS (production proof), last checked 2026-10-24 | worker-identity-split run 40046311013 (green) 10-24 | — | not gated in code (free today) | owner decision pending | mixed (G audit) | NOT TESTED | none |
| 4.21 | Person page name gating | system | PASS (production proof), last checked 2026-11-01 | prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green,… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 4.22 | 3 free profile views + VIP | company | NOT IMPLEMENTED | built only in RED draft #2474, not merged/applied | owner approval + figures | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | owner approval + figures |
| 4.25 | Admin matching workbench | administrator | PASS (production proof), last checked 2026-10-25 | owner admin session 2026-10-25 12:30 LT, read-only Chromium (Claude in Chrome):… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 4.26 | /match-preview public fit | job seeker, worker | PASS (production proof), last checked 2026-10-25 | ai-off-honesty run 40191899327 10-25 (12/13 green): C-1 signed out: match previ… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 4.28 | First-party supply declaration | self-employed specialist, company | PASS (production proof), last checked 2026-11-01 | prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green,… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 4.29 | Interest->vacancy hand-off | company, agency | PASS (production proof), last checked 2026-10-23 | prod DB 10-23: 3/3 consented hand-offs delivered ~2 s (partner 201/200); 10 non… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 4.30 | Candidate pipeline -> hire decision -> close need (+ agency… | company, agency, manager | NOT TESTED | vision §6; lib/pipeline/candidate-pipeline-facts.ts exists; decision + history… | build decision/history UI; agency parts | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | build decision/history UI; agency parts |

### Section 5 — Chat & communication (21 rows)

| ID | Function | For whom | Status | Evidence | Known issue | Plan | Intended tier | V2 design | Mobile | Next step |
|---|---|---|---|---|---|---|---|---|---|---|
| 5.1 | Chat-first home | worker, job seeker, company, manager | PASS (production proof), last checked 2026-10-25 | ai-off-honesty run 40191899327 10-25 (12/13 green): B-3 chat opens the door for… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 5.2 | Transcript persistence | worker, company | PASS (production proof), last checked 2026-11-01 | prod walk chat-continuity 41322286924 2026-11-01 on 4a5b45828: a question survi… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 5.3 | Single-use confirmations | worker, company, manager | PASS (production proof), last checked 2026-10-21 | chat-confirm-once 39604342494 10-21 | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 5.4 | Conversations / threads | worker, company, agency | PASS (production proof), last checked 2026-11-03 | prod walk agency-chain 41717112150 2026-11-03 on a10b6c47d (passed); earlier: a… | — | not gated in code (free today) | owner decision pending | unified (A list) | NOT TESTED | none |
| 5.5 | Message translation | worker, company | BLOCKED | ai-off-honesty run 40191899327 10-25: A-4/A-5 original English words shown labe… | AI provider keys (owner) — honest off-state proven, the AI function itself not | not gated in code (free today) | owner decision pending | unified (A list) | one phone-size step named in evidence; otherwise NOT TESTED | AI provider keys (owner) — honest off-state proven, the AI… |
| 5.6 | In-app notifications | worker, job seeker, company | PASS (production proof), last checked 2026-10-25 | notifications-inapp runs 40012716741 (10-23) + 40204616787 (10-25), 8/8 green b… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 5.7 | E-mail notifications | worker, job seeker, company | PASS (production proof), last checked 2026-11-02 | prod walk alert-mail 41488266687 2026-11-02 (A-2 per-kind e-mail consent stored… | not walked in production | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | not walked in production |
| 5.8 | Push | worker, company | BLOCKED | #2712 merged; migration 20261023190255 applied (0 subscriptions, RLS on, no ano… | owner: VAPID keys + real delivery test | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | owner: VAPID keys + real delivery test |
| 5.9 | Weekly digest | worker, job seeker, company | PASS (production proof), last checked 2026-11-09 | prod walk digest-check 42581979562 2026-11-09 (5/5): D-0 the Monday 07:00 UTC s… | by design a worker who visited that week gets the digest in-app only | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | by design a worker who visited that week gets the digest in… |
| 5.10 | Attention / activity centre | worker, company, manager | PASS (production proof), last checked 2026-11-01 | prod walk notifications-inapp 41312513056 2026-11-01 on 7f8bfaa2a (8/8), incl.… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | one phone-size step named in evidence; otherwise NOT TESTED | none |
| 5.11 | Worker calendar | worker, self-employed specialist | PASS (production proof), last checked 2026-10-23 | calendar-planning run 40007491242 (green) 10-23 | open: UF-6 (first real user 2026-11-04) | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | open: UF-6 (first real user 2026-11-04) |
| 5.12 | Availability | worker, self-employed specialist, job seeker | PASS (production proof), last checked — | owner session write+revert | — | not gated in code (free today) | owner decision pending | mixed (G audit) | NOT TESTED | none |
| 5.13 | Booking request->accept->engagement | worker, self-employed specialist, company | PASS (production proof), last checked 2026-11-03 | prod walk orders-bookings 41718546706 2026-11-03 on a10b6c47d (passed); earlier… | the acknowledged-overlap path stays RED #2795 (constraint not relaxed); plain accept works | not gated in code (free today) [register lane: key booking_requests is checked, included in FREE] | owner decision pending | old design (G audit) | one phone-size step named in evidence; otherwise NOT TESTED | the acknowledged-overlap path stays RED #2795 (constraint n… |
| 5.14 | Command finder + voice | worker, company | PASS (production proof), last checked — | owner #2673/#2679 (finder only) | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 5.15 | Voice as equal door | worker, company | NOT TESTED | COM-8 corrected to PARTIAL/CODE_PROVEN (#2714): voice capture panel + turn poli… | no prod voice walk | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | no prod voice walk |
| 5.16 | Owner Telegram alerts | administrator | BLOCKED | owner bot token | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | Coordinator: private record [register lane] |
| 5.17 | Support conversations | worker, company | PASS (production proof), last checked 2026-11-01 | prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green,… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 5.18 | Global dashboard search | worker, company, manager | PASS (production proof), last checked 2026-11-01 | prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green,… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 5.19 | Inbox report view | manager, company | PASS (production proof), last checked 2026-11-01 | prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green,… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 5.20 | User-defined automations | company, manager | NOT IMPLEMENTED | vision §12, §19 item 7 | build | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | build |
| 5.21 | SMS / WhatsApp channels | worker, company | NOT IMPLEMENTED | vision §11 (marked later) | owner: paid channel provider (separate approval) | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | owner: paid channel provider (separate approval) |

### Section 6 — Marketplace (22 rows)

| ID | Function | For whom | Status | Evidence | Known issue | Plan | Intended tier | V2 design | Mobile | Next step |
|---|---|---|---|---|---|---|---|---|---|---|
| 6.1 | Service offerings + request loop | self-employed specialist, client | PASS (production proof), last checked 2026-11-03 | prod walk marketplace 41729310761 2026-11-03 on 7f0f06583 (passed after the wal… | — | not gated in code (free today) | owner decision pending | mixed (A list) | NOT TESTED | none |
| 6.2 | Listings goods/rental/wanted | self-employed specialist, client, company | PASS (production proof), last checked 2026-11-03 | prod walk marketplace 41729310761 2026-11-03 on 7f0f06583 (passed after the wal… | — | not gated in code (free today) | owner decision pending | mixed (A list) | NOT TESTED | none |
| 6.3 | One discovery index | client, company | PASS (production proof), last checked 2026-11-03 | prod walk marketplace 41729310761 2026-11-03 on 7f0f06583 (passed after the wal… | — | not gated in code (free today) | owner decision pending | mixed (A list) | NOT TESTED | none |
| 6.4 | Buyer workspace | client, company | PASS (production proof), last checked 2026-11-03 | prod walk buyer-workspace 41713787541 2026-11-03 on a10b6c47d (10/10, B-3b the… | open security/permission item — details kept out of the public repository (owner rule) | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | open security/permission item — details kept out of the pub… |
| 6.6 | Proposals/contracts | self-employed specialist, company | PASS (production proof), last checked 2026-11-03 | prod walk documents-approvals 41716118134 2026-11-03 on a10b6c47d (passed); ear… | — | not gated in code (free today) | owner decision pending | mixed (A list) | NOT TESTED | none |
| 6.7 | Procurement | company, manager | PASS (production proof), last checked 2026-11-03 | prod walk orders-bookings 41718546706 2026-11-03 on a10b6c47d (passed); earlier… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 6.8 | Business trips | company, manager, worker | PASS (production proof), last checked 2026-11-03 | prod walk orders-bookings 41718546706 2026-11-03 on a10b6c47d (passed); earlier… | fixed by #2706 (rpc .catch crash) | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | fixed by #2706 (rpc .catch crash) |
| 6.9 | Finance records | company, manager | PASS (production proof), last checked 2026-11-03 | prod walk orders-bookings 41718546706 2026-11-03 on a10b6c47d (passed); earlier… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 6.10 | Project-cost calculator | client, company, self-employed specialist | PASS (production proof), last checked 2026-10-25 | public-org-locales run 40205429467 10-25 (19 green, 2 skipped): U-7 project-cos… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 6.11 | Cross-border readiness | company, worker | PASS (production proof), last checked 2026-10-23 | live 10-23 public part | copy D-2 | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | copy D-2 |
| 6.12 | Cross-border deals | company | NOT IMPLEMENTED | registry NOT_BUILT: cross-border deals module | owner: decide whether 6.6 contracts + 6.11 cross-border readiness suffice | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | owner: decide whether 6.6 contracts + 6.11 cross-border rea… |
| 6.13 | Orders goods purchase | client, company | NOT IMPLEMENTED | registry NOT_BUILT: goods purchase order lifecycle | depends on payments for goods (only org plans are armed); owner design | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | depends on payments for goods (only org plans are armed); o… |
| 6.14 | Logistics | company | NOT IMPLEMENTED | registry NOT_BUILT: logistics/shipment/freight | depends on 6.13 | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | depends on 6.13 |
| 6.16 | Commercial handoff to the partner organization | company | PASS (production proof), last checked 2026-10-24 | prod DB: commercial_handoffs 7 delivered, last 2026-10-24 08:58 UTC | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 6.17 | CRM pipeline | administrator | PASS (production proof), last checked 2026-10-25 | owner admin session 2026-10-25 12:30 LT, read-only Chromium (Claude in Chrome):… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 6.18 | Waitlist | worker, company | PASS (production proof), last checked 2026-11-01 | prod walk register-gaps 41357630136 2026-11-01 (3/3) G-1: real anonymous submit… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 6.19 | Team enquiries | company, agency | PASS (production proof), last checked 2026-11-01 | prod walk company-talent-history 41279265278 2026-11-01 on 38bfb9d93 (17/17) T-… | — | not gated in code (free today) | owner decision pending | mixed (A list) | NOT TESTED | none |
| 6.20 | Value channels | system | PASS (production proof), last checked 2026-10-26 | public-org-locales run 40371836163 2026-10-26: S-9 chat names the value channel… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 6.21 | /business/[slug] | company, self-employed specialist, client | BLOCKED | RED RPC owner | — | not gated in code (free today) | owner decision pending | old design (A list) | NOT TESTED | Owner: the decision in the Reason column. Then the coordina… [register lane] |
| 6.22 | Housing / accommodation | worker, company | NOT IMPLEMENTED | vision §8, §19 item 4 | owner scope, then build | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | owner scope, then build |
| 6.23 | Service order rating, cancellation and dispute | client, self-employed specialist | NOT IMPLEMENTED | vision §7 | owner policy, then build | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | owner policy, then build |
| 6.24 | Swipe-style B2C discovery feed | client | NOT IMPLEMENTED | decision 0013 pattern 3 (lower confidence) | owner to confirm | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | owner to confirm |

### Section 7 — Plans, billing & entitlements (31 rows)

| ID | Function | For whom | Status | Evidence | Known issue | Plan | Intended tier | V2 design | Mobile | Next step |
|---|---|---|---|---|---|---|---|---|---|---|
| 7.1 | Plan catalogue + /pricing | company, worker, agency | PASS (production proof), last checked 2026-10-25 | public-org-locales run 40205429467 10-25 (19 green, 2 skipped): U-2 /pricing pl… | — | not gated in code (free today) | owner decision pending | unified (A list) | NOT TESTED | none |
| 7.2 | Free organization limit 1 open need | company | PASS in CI only | brigade walk 10-12; pilot lifted limit 10-23; 2026-11-01: not walkable on the Q… | — | FREE: 1 active need; paid/trial: no ceiling; enforced only for pilot organisations | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 7.3 | Entitlement resolver | system | PASS (production proof), last checked 2026-10-23 | pilot payment changed effective entitlements live 10-23 | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 7.4 | Stripe TEST checkout/portal/webhook | administrator | OPTIONAL TEST (not a pass) | billing-test-mode never executed: the pilot organization is not armed in Stripe… | extra TEST scenario; does not block launch and is not a payment defect | billing function | owner decision pending | NOT ASSESSED | NOT TESTED | extra TEST scenario; does not block launch and is not a pay… |
| 7.5 | Live charging | company | NOT TESTED | 2026-11-01 reconciled with product-truth: pilot payment only; self-serve paid p… | — | billing function | owner decision pending | NOT ASSESSED | NOT TESTED | Owner: self-serve stays off by decision [register lane] |
| 7.6 | Billing recovery cron | system | BLOCKED | #2696 removed the GH cadence that hit nginx-404; recovery still needs the VPS c… | owner VPS step | billing function | owner decision pending | NOT ASSESSED | NOT TESTED | owner VPS step |
| 7.7 | Manual pilot grant (admin) | administrator | BLOCKED | no admin session | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | Coordinator: fix the walk harness, re-run [register lane] |
| 7.8 | LMC credit ledger | company | BLOCKED | owner design | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | Owner: the decision in the Reason column. Then the coordina… [register lane] |
| 7.9 | LMC top-ups, VIP, ai_plus, tiers | company, agency | NOT IMPLEMENTED | registry NOT_BUILT: LMC top-ups, VIP media EUR 24.99, ai_plus, agency tiers, re… | owner prices; LMC owner-locked | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | owner prices; LMC owner-locked |
| 7.10 | 3 profile views + VIP | company | DUPLICATE (not counted) | duplicate of 4.22 (same function); kept for history, NOT counted in the totals;… | owner approval + figures | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none (see the row it duplicates) |
| 7.11 | Deferred plans | worker, agency | NOT IMPLEMENTED | registry NOT_BUILT: worker_plus, agency_pilot plans | owner prices | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | owner prices |
| 7.12 | AI cost metering | administrator | BLOCKED | AI runtime off (10.6) | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | Owner: the decision in the Reason column. Then the coordina… [register lane] |
| 7.13 | Plan-gated booking_requests | company | NOT TESTED | public-org-locales run 40205429467 10-25: S-6 PASS - bookings surface renders w… | needs an org at its booking limit (synthetic Gama is on the pilot) | not gated in code (free today) [register lane: key booking_requests is checked, included in FREE] | owner decision pending | NOT ASSESSED | NOT TESTED | needs an org at its booking limit (synthetic Gama is on the… |
| 7.14 | Vacancy translation entitlement | company | BLOCKED | ai-off-honesty run 40191899327 10-25: C-2 failed on a spec locator (two main el… | AI provider keys (owner) — honest off-state proven, the AI function itself not | not gated in code (free today) [register lane: key vacancy_translations is off on every plan] | owner decision pending | NOT ASSESSED | NOT TESTED | AI provider keys (owner) — honest off-state proven, the AI… |
| 7.15 | EUR 99 subscription checkout | company | BLOCKED | EUR 99 order hidden by design while the pilot pass is on; VAT path = RED #2685… | owner: approve #2685 and decide when to show EUR 99 | billing function | owner decision pending | NOT ASSESSED | NOT TESTED | owner: approve #2685 and decide when to show EUR 99 |
| 7.16 | Webhook signature verification | system | PASS (production proof), last checked 2026-10-23 | 3 LIVE events verified 10-23 | — | billing function | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 7.17 | No double charge / processing | company | PASS (production proof), last checked — | 3 live events, 0 dup event ids, UNIQUE(provider,event_id); 1 subscription row | 2 stale open checkout ops | billing function | owner decision pending | NOT ASSESSED | NOT TESTED | 2 stale open checkout ops |
| 7.18 | Payment changes rights | company | NOT TESTED | paid -> rights PASS (pilot 10-23) | missing evidence: payment failure or expiry -> rights withdrawn (TEST-mode failed payment scenario,… | billing function | owner decision pending | NOT ASSESSED | NOT TESTED | missing evidence: payment failure or expiry -> rights withd… |
| 7.19 | Refunds and disputes | company | BLOCKED | refund/dispute recorded only; 0 events in prod | owner refund policy + TEST walk | billing function | owner decision pending | NOT ASSESSED | NOT TESTED | owner refund policy + TEST walk |
| 7.20 | Invoices inside LM | company | NOT IMPLEMENTED | in-app invoices/payment history not built (Stripe portal invoice exists; RED dr… | build Stripe invoice read for the org | billing function | owner decision pending | NOT ASSESSED | NOT TESTED | build Stripe invoice read for the org |
| 7.21 | Billing portal for every billing manager | company, manager | NOT TESTED | payer opened the Stripe portal (10-23) | missing evidence: a second billing manager of the same org opens the portal | billing function | owner decision pending | unified (A list) | NOT TESTED | missing evidence: a second billing manager of the same org… |
| 7.22 | Paid-feature rights and limits | company | NOT TESTED | plan limits enforced for needs + bookings (pilot lifted the open-need limit liv… | missing evidence: the other paid-feature limits (profile views #2474, VIP) are not built/applied | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | missing evidence: the other paid-feature limits (profile vi… |
| 7.23 | LMC top-up | company | NOT IMPLEMENTED | registry NOT_BUILT: LMC one-time top-up (1 LMC = [amount withheld]) | owner: packages, VAT, refund; LMC owner-locked | billing function | owner decision pending | NOT ASSESSED | NOT TESTED | owner: packages, VAT, refund; LMC owner-locked |
| 7.24 | LMC granted once per payment | company | NOT IMPLEMENTED | registry NOT_BUILT: LMC grant tied to one confirmed payment | depends on 7.23 | billing function | owner decision pending | NOT ASSESSED | NOT TESTED | depends on 7.23 |
| 7.25 | LMC balance and history | company | NOT TESTED | lmc-csrf run 40210854856 10-25: chat 'Kiek turiu LMC?' door opens the balance s… | open security/permission item — details kept out of the public repository (owner rule) | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | open security/permission item — details kept out of the pub… |
| 7.26 | LMC spend + reversal | company | NOT IMPLEMENTED | registry NOT_BUILT: LMC spend + refund reversal (functions exist, no caller) | depends on 7.23 | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | depends on 7.23 |
| 7.27 | Free VIP for approved employers | company | FAIL | admin grant invisible in live org workspace (registry BROKEN) | owner #2474 | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | owner #2474 |
| 7.28 | Payee and terms | company | FAIL | live terms name seller UAB the partner organization but no renewal/cancellation… | owner/legal clauses (RED); meta-text removal in progress | billing function | owner decision pending | NOT ASSESSED | NOT TESTED | owner/legal clauses (RED); meta-text removal in progress |
| 7.29 | VAT Stripe Tax | company | NOT TESTED | RED draft #2685; sandbox scenarios PASS Stripe-side | — | billing function | owner decision pending | NOT ASSESSED | NOT TESTED | Owner + legal: RED #2685 [register lane] |
| 7.30 | Invoices + work-acceptance acts from the Work Journal | self-employed specialist, company | NOT IMPLEMENTED | vision §10, §19 item 5 (invoice, advance, credit note, acceptance act, accounta… | owner: invoicing rules per country, then build | billing function | owner decision pending | NOT ASSESSED | NOT TESTED | owner: invoicing rules per country, then build |
| 7.31 | Free + two paid tiers for workers AND for companies | worker, company | NOT IMPLEMENTED | owner product goal (2026-11-01); documented today: worker free only (+1 deferre… | owner: final tiers, limits and prices (separate approval); no pricing change before that | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | owner: final tiers, limits and prices (separate approval);… |

### Section 8 — Languages & markets (18 rows)

| ID | Function | For whom | Status | Evidence | Known issue | Plan | Intended tier | V2 design | Mobile | Next step |
|---|---|---|---|---|---|---|---|---|---|---|
| 8.1 | UI localization | worker, job seeker, company | PASS (production proof), last checked 2026-10-23 | live 6 locales x 25 routes 10-23 after #2686 | D-1 fixed | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | D-1 fixed |
| 8.2 | Multilingual work understanding | worker, job seeker, company | PASS (production proof), last checked 2026-10-26 | prod walk sectors-languages run 40300823818 (2026-10-26): 11/11 — 5 sectors und… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 8.3 | Machine translation | worker, job seeker, company | BLOCKED | ai-off-honesty run 40191899327 10-25: A-4 no machine translation, original kept… | AI provider keys (owner) — honest off-state proven, the AI function itself not | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | AI provider keys (owner) — honest off-state proven, the AI… |
| 8.4 | Country labour-market pages | job seeker, worker | PASS (production proof), last checked 2026-10-25 | public-org-locales run 40205429467 10-25 (19 green, 2 skipped): U-5 country lab… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 8.5 | Nine priority launch markets | system | BLOCKED | 2026-10-28 catalog audit: active locales lt/en/ru/nl/de/pl complete (15191 stri… | Activating the 5 markets needs ~9400 missing keys per locale plus the [EN] placeholders translated… | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | Activating the 5 markets needs ~9400 missing keys per local… |
| 8.6 | Country requirement matrix | job seeker, worker | PASS (production proof), last checked 2026-10-25 | requirements-countries run 40209522348 10-25: C-1/C-2 DE+NL matrices from the c… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 8.7 | Public answer engine + llms.txt | job seeker, worker, company | PASS (production proof), last checked 2026-10-25 | public-org-locales run 40205429467 10-25 (19 green, 2 skipped): U-8 /llms.txt p… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 8.8 | SEO plumbing | system | PASS (production proof), last checked 2026-10-25 | public-org-locales run 40205429467 10-25 (19 green, 2 skipped): U-9 robots, sit… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 8.9 | Public org profile | company, client | BLOCKED | public-org-locales run 40205429467 10-25: S-10 skipped honestly - no organizati… | owner: allow a synthetic public profile for the walk, or wait for a real organization to opt in | not gated in code (free today) | owner decision pending | old design (A list) | NOT TESTED | owner: allow a synthetic public profile for the walk, or wa… |
| 8.10 | Marketing site | job seeker, worker, company, agency | PASS (production proof), last checked 2026-10-25 | public-org-locales run 40205429467 10-25 (19 green, 2 skipped): U-1 landing + 4… | — | not gated in code (free today) | owner decision pending | unified (A list) | NOT TESTED | none |
| 8.11 | Mobile web | worker, job seeker, company | PASS (production proof), last checked 2026-11-01 | prod walk mobile-surfaces 41311144346 2026-11-01 on 7f8bfaa2a (6/6) and 4131717… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | mobile-surfaces walk named in evidence (390 px web; the walk's steps only) | none |
| 8.12 | PWA installability | worker, company | PASS (production proof), last checked 2026-10-25 | public-org-locales run 40205429467 10-25 (19 green, 2 skipped): U-10 every loca… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 8.13 | Native app | worker, company | BLOCKED | shared native client proven per platform in 8.17 (Android) and 8.18 (iOS) on pr… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | Owner: the decision in the Reason column. Then the coordina… [register lane] |
| 8.14 | App links | worker, company | BLOCKED | store accounts | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | Owner: the decision in the Reason column. Then the coordina… [register lane] |
| 8.15 | Mobile store release | worker, company | BLOCKED | apps run against production (8.17 Android, 8.18 iOS); no store listing; earlier… | owner store accounts (Google Play, Apple, EAS) + ARCH-6 | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | owner store accounts (Google Play, Apple, EAS) + ARCH-6 |
| 8.16 | Language feedback | worker, job seeker, company, administrator | PASS (production proof), last checked 2026-10-26 | public-org-locales run 40371836163 2026-10-26: S-12 the synthetic owner sends a… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 8.17 | Android app (native) | worker, company | PASS (production proof), last checked 2026-11-02 | 2026-11-02 from main @bdb27bb88 against production (run 41451882387): sign-in,… | not in Google Play (see 8.15) | not gated in code (free today) | owner decision pending | NOT ASSESSED | native Android journey named in evidence; mobile web NOT TESTED | not in Google Play (see 8.15) |
| 8.18 | iOS app (native) | worker, company | PASS (production proof), last checked 2026-11-02 | 2026-11-02 from main @bdb27bb88 against production (run 41451829006, attempt 2… | need submission not tested on iOS (open, owner decision); first attempt can stall on the system Sav… | not gated in code (free today) | owner decision pending | NOT ASSESSED | native iOS journey named in evidence; mobile web NOT TESTED | need submission not tested on iOS (open, owner decision); f… |

### Section 9 — Admin, privacy & security (24 rows)

| ID | Function | For whom | Status | Evidence | Known issue | Plan | Intended tier | V2 design | Mobile | Next step |
|---|---|---|---|---|---|---|---|---|---|---|
| 9.1 | Superadmin console | administrator | PASS (production proof), last checked 2026-10-28 | admin-console 40688059945 (2026-10-28) green: non-admins refused, operator page… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 9.2 | Admin pilots/telemetry/league | administrator | PASS (production proof), last checked 2026-10-25 | owner admin session 2026-10-25 12:30 LT, read-only Chromium (Claude in Chrome):… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 9.3 | Admin user inspect | administrator | PASS (production proof), last checked 2026-10-25 | owner admin session 2026-10-25, read-only: /admin/users/<synthetic QA id> rende… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 9.4 | Privacy request intake | worker, job seeker, company | PASS (production proof), last checked 2026-10-19 | prod DB: erasure request received + executed via intake 2026-10-19 (receipt req… | — | not gated in code (free today) | owner decision pending | mixed (G audit) | NOT TESTED | none |
| 9.5 | GDPR export | worker, job seeker, company | PASS (production proof), last checked 2026-11-01 | prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green,… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 9.6 | GDPR erasure executor | worker, job seeker, company | PASS (production proof), last checked 2026-10-19 | prod DB: privacy_erasure_receipts_v3 executed receipt 2026-10-19 15:23 UTC | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 9.7 | Worker row access identity split | system | PASS (production proof), last checked 2026-10-21 | worker-identity-split 39602569732 10-21 | — | not gated in code (free today) | owner decision pending | mixed (G audit) | NOT TESTED | none |
| 9.8 | RLS on every table | system | PASS (production proof), last checked 2026-10-23 | prod catalog 10-23: 243/243 public tables RLS on; 15 no-policy tables sealed; a… | cleanup candidate backfill snapshot (RED) | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | cleanup candidate backfill snapshot (RED) |
| 9.9 | Audit trail | system, administrator | PASS in CI only | isolated walk 40833394554 (#2883) | open security/permission item — details kept out of the public repository (owner rule) | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | open security/permission item — details kept out of the pub… |
| 9.10 | Rate limiting | system | PASS (production proof), last checked 2026-10-23 | live 10-23: 6 anon POST /api/waitlist (non-JSON) -> 5x400 then 429 retry-after… | in-memory per instance; real-IP depends on VPS cloudflare.inc | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | in-memory per instance; real-IP depends on VPS cloudflare.i… |
| 9.11 | Same-origin checks | system | PASS (production proof), last checked — | prod build 711745d0 (waitlist 403, logout 303) + lmc-csrf run 40210854856 O-1..… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 9.12 | Legal pages | worker, job seeker, company | PASS (production proof), last checked 2026-11-01 | prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green,… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 9.13 | Personal location privacy | worker, job seeker | PASS (production proof), last checked 2026-11-01 | prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green,… | — | not gated in code (free today) | owner decision pending | mixed (G audit) | NOT TESTED | none |
| 9.14 | Telemetry / funnel | administrator | PASS (production proof), last checked 2026-10-25 | owner admin session 2026-10-25 12:30 LT, read-only Chromium (Claude in Chrome):… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 9.15 | Search stacks | system | PASS (production proof), last checked 2026-11-01 | prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green,… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 9.16 | External referral API | system | BLOCKED | partner tokens; anon 401 PASS | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | Owner: the decision in the Reason column. Then the coordina… [register lane] |
| 9.17 | Internal supply feed | system | PASS in CI only | 401 anon; edge logs show authorized Agentai pulls 10-23 (readback 05:50, supply… | readback 1x/24 h vs 4/day intended | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | readback 1x/24 h vs 4/day intended |
| 9.18 | Public JSON APIs | system | PASS (production proof), last checked 2026-11-01 | prod walk register-gaps 41357630136 2026-11-01 G-2 (green; details in the priva… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 9.19 | Admin import sandbox | administrator | BLOCKED | owner admin session 2026-10-25 12:30 LT, read-only Chromium (Claude in Chrome):… | owner: enable flag if wanted | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | owner: enable flag if wanted |
| 9.20 | Admin intelligence inspector | administrator | BLOCKED | owner admin session 2026-10-25 12:30 LT, read-only Chromium (Claude in Chrome):… | owner: enable flag if wanted | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | owner: enable flag if wanted |
| 9.22 | Env schema validation | system | PASS (production proof), last checked — | zod env validation at load; deploy 39952179926 health=healthy, build 431385cf;… | open security/permission item — details kept out of the public repository (owner rule) | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | open security/permission item — details kept out of the pub… |
| 9.23 | Security-definer governance | system | PASS (production proof), last checked 2026-10-23 | prod 10-23: anon SECURITY DEFINER set = allowlist 9/9; PUBLIC exec 0/589 | 3 functions mutable search_path (RED R-2) | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | 3 functions mutable search_path (RED R-2) |
| 9.24 | Security incident handling | system | PASS (production proof), last checked — | live headers HSTS preload, CSP report-only, XFO DENY, nosniff, Referrer/Permiss… | CSP has no report-uri | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | CSP has no report-uri |
| 9.25 | CodeQL / dependency alerts | system | FAIL | 2026-11-01: triaged, details in the private record; earlier: #2879, #2880, #288… | open security/permission item — details kept out of the public repository (owner rule) | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | open security/permission item — details kept out of the pub… |

### Section 10 — MCP & AI agents (26 rows)

| ID | Function | For whom | Status | Evidence | Known issue | Plan | Intended tier | V2 design | Mobile | Next step |
|---|---|---|---|---|---|---|---|---|---|---|
| 10.1 | MCP door 229 tools | worker, company | PASS (production proof), last checked 2026-11-01 | prod walk mcp-agents 41307643008 2026-11-01 on c3df7431d (10/10, A-9 — details… | tools/list 233 tools on c3df7431d; the row title's 229 predates #2889/#2895 | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | tools/list 233 tools on c3df7431d; the row title's 229 pred… |
| 10.2 | Agent scenarios over MCP | worker, company | PASS (production proof), last checked 2026-10-23 | mcp-agents 9/9 39885097311 10-23 | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 10.3 | OAuth 2.1 for MCP clients | worker, company | PASS (production proof), last checked 2026-11-02 | prod walk mcp-oauth-client 41354839810 2026-11-02 (6/6, from #2454 branch) | #2454 (the spec) awaits owner merge; a security item is open (details in the private record) | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | #2454 (the spec) awaits owner merge; a security item is ope… |
| 10.4 | MCP scopes | worker, company | NOT IMPLEMENTED | registry NOT_BUILT: MCP OAuth scope enforcement | auth path = RED; design draft #2923; final set = owner decision X-2 | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | auth path = RED; design draft #2923; final set = owner deci… |
| 10.5 | ChatGPT/Claude listings | system | BLOCKED | owner portals | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | Owner: the decision in the Reason column. Then the coordina… [register lane] |
| 10.6 | AI runtime | worker, company | BLOCKED | ai-off-honesty run 40191899327 10-25: B-4 provider state shown as off; re-prove… | AI provider keys (owner) — honest off-state proven, the AI function itself not | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | AI provider keys (owner) — honest off-state proven, the AI… |
| 10.7 | Conversation intent LLM | worker, company | BLOCKED | 10.6 | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | Owner: the decision in the Reason column. Then the coordina… [register lane] |
| 10.8 | CV AI structuring | worker, job seeker | BLOCKED | 10.6 | — | not gated in code (free today) | owner decision pending | old design (A list) | NOT TESTED | Owner: the decision in the Reason column. Then the coordina… [register lane] |
| 10.9 | Journal AI suggestions | worker | BLOCKED | 10.6 | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | Owner: the decision in the Reason column. Then the coordina… [register lane] |
| 10.10 | Explanation AI | worker, company | BLOCKED | 10.6 | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | Owner: the decision in the Reason column. Then the coordina… [register lane] |
| 10.11 | Six agents without call site | system | PASS (production proof), last checked — | decision implemented (#2765): country_readiness integrated, 5 duplicates retire… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 10.13 | /dashboard/assist | worker, company | PASS (production proof), last checked 2026-10-25 | ai-off-honesty run 40191899327 10-25 (12/13 green): B-4 assist page states the… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 10.14 | Agents OS admin page | administrator | PASS (production proof), last checked 2026-10-25 | owner admin session 2026-10-25 12:30 LT, read-only Chromium (Claude in Chrome):… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 10.15 | Agents OS runtime | administrator | NOT IMPLEMENTED | registry NOT_BUILT: autonomous internal agents runtime | owner AGENT-1..4 decisions; ARCHITECTURE_ONLY | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | owner AGENT-1..4 decisions; ARCHITECTURE_ONLY |
| 10.16 | AI agents as participants | worker, company | NOT IMPLEMENTED | registry NOT_BUILT: AI agents as market participants (AI-4) | owner AGENT-1..4 decisions | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | owner AGENT-1..4 decisions |
| 10.17 | External action receipts | worker, company | PASS (production proof), last checked 2026-10-23 | mcp-agents run 39885097311 (green) 10-23; audit_logs rows observed | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 10.18 | Vacancy source SE | job seeker, worker | PASS (production proof), last checked 2026-10-23 | cursor 06:03 10-23; 49,731 live | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 10.19 | Vacancy source NAV | job seeker, worker | PASS (production proof), last checked 2026-10-23 | cursor 07:27 10-23; 9,266 live | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 10.20 | Vacancy retention | job seeker, worker | FAIL | dry run 39936626534 10-23 fails closed: service_role lacks SELECT on 2 protecte… | open security/permission item — details kept out of the public repository (owner rule) | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | open security/permission item — details kept out of the pub… |
| 10.21 | Eurostat import | system | BLOCKED | gates on but no scheduler calls runEurostatImport; data from 07-15 | owner: allow scheduled import | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | owner: allow scheduled import |
| 10.22 | the partner organization integration | system | BLOCKED | owner | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | Owner: the decision in the Reason column. Then the coordina… [register lane] |
| 10.23 | Agentai supply feed | agency | PASS (production proof), last checked 2026-10-24 | prod edge logs 2026-10-24/25: rpc first_party_supply_feed_v1 200 x4 (last 09:32… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 10.24 | Self-hosted STT/translate | system | BLOCKED | owner deploy | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | Owner: the decision in the Reason column. Then the coordina… [register lane] |
| 10.25 | Cloudflare AI adapter | system | BLOCKED | owner key | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | Owner: the decision in the Reason column. Then the coordina… [register lane] |
| 10.26 | OpenAI apps challenge | system | BLOCKED | owner token | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | Owner: the decision in the Reason column. Then the coordina… [register lane] |
| 10.27 | Maps | worker, job seeker, company | PASS (production proof), last checked 2026-11-01 | prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green,… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |

### Section 11 — Education & learning (10 rows)

| ID | Function | For whom | Status | Evidence | Known issue | Plan | Intended tier | V2 design | Mobile | Next step |
|---|---|---|---|---|---|---|---|---|---|---|
| 11.1 | Institution + learner link | training institution, learner | PASS (production proof), last checked 2026-10-21 | learning-practice 39601905282 10-21 | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 11.2 | Programmes / cohorts | training institution | PASS (production proof), last checked 2026-11-03 | prod walk cohort-join-request 41611766407 2026-11-03 (6/6): an institution open… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 11.3 | Learning compass | learner, worker, job seeker | PASS (production proof), last checked 2026-10-25 | learning-practice run 40154033299 (green) 10-25 | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 11.4 | Practice capacity | company, training institution, learner | PASS (production proof), last checked 2026-10-25 | learning-practice run 40154033299 (green) 10-25 | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 11.5 | Learner outcomes | training institution, learner | PASS (production proof), last checked 2026-10-25 | learning-practice run 40154033299 (green) 10-25 | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 11.6 | Institution reporting + export | training institution | PASS (production proof), last checked 2026-10-25 | learning-practice run 40154033299 (green) 10-25 | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 11.7 | Practice->competency recognition | learner, training institution | PASS (production proof), last checked 2026-11-03 | prod walk recognition-chain 41617507405 2026-11-03 (7 passed, R-3 skipped: lear… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 11.8 | Training & certification register | learner, worker, training institution | FAIL | company-governance 40687308231 (2026-10-28 12:28Z) green incl. T-5 — #2857 work… | engaged non-member workers cannot be assigned training (owner product decision, RED #2816) | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | engaged non-member workers cannot be assigned training (own… |
| 11.9 | Human-in-loop learning review | learner, training institution | BLOCKED | owner parked nav door | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | Owner: the decision in the Reason column. Then the coordina… [register lane] |
| 11.10 | RPL equivalence structure | learner, worker | NOT IMPLEMENTED | 2026-11-02: design recorded in decision 0028 §D-15 (procedure; structure stays… | owner, RED schema | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | owner, RED schema |

### Section 12 — Market intelligence (6 rows)

| ID | Function | For whom | Status | Evidence | Known issue | Plan | Intended tier | V2 design | Mobile | Next step |
|---|---|---|---|---|---|---|---|---|---|---|
| 12.1 | Market map | worker, job seeker, company | PASS (production proof), last checked 2026-10-23 | owner session 10-23: market map renders Leaflet tiles, markers, radius and loca… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 12.2 | Labour-market intelligence | worker, job seeker, company | PASS (production proof), last checked 2026-10-23 | live public 10-23 | copy D-2 | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | copy D-2 |
| 12.3 | /dashboard/intelligence | worker, company, manager | PASS (production proof), last checked 2026-11-01 | prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-19;… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 12.4 | Demand recognizer | administrator, company | PASS (production proof), last checked 2026-10-23 | owner session 10-23 after #2690: LT need sentence recognises role, place (Vilni… | duration-vs-headcount follow-up #2694 (auto-merge after regression tests); re-check after deploy; c… | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | duration-vs-headcount follow-up #2694 (auto-merge after reg… |
| 12.5 | Public market facts | job seeker, worker, company | PASS (production proof), last checked 2026-10-23 | live 10-23 58,997 = DB | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 12.6 | Admin league / market | administrator | PASS (production proof), last checked 2026-10-25 | owner admin session 2026-10-25 12:30 LT, read-only Chromium (Claude in Chrome):… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |

### Section 13 — Infrastructure & operations (17 rows)

| ID | Function | For whom | Status | Evidence | Known issue | Plan | Intended tier | V2 design | Mobile | Next step |
|---|---|---|---|---|---|---|---|---|---|---|
| 13.1 | VPS hosting + auto-deploy | system | FAIL | 2026-11-01: infrastructure finding and remediation #2911 + agentai#1226 (live 2… | REGRESSION-class infra: GitHub-runner → VPS inbound loss now fails production walks; provider netwo… | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | REGRESSION-class infra: GitHub-runner → VPS inbound loss no… |
| 13.2 | Health probe + monitor | system | PASS (production proof), last checked — | live | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 13.3 | Prod QA walk harness | system | PASS (production proof), last checked 2026-10-22 | role-routes run 39783147517 (green) 10-22 | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 13.4 | Supabase capacity | system | PASS in CI only | Supabase org plan=pro (get_organization 2026-10-25) | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 13.5 | Database backup | system | PASS (production proof), last checked 2026-11-05 | First backup started by a merge: run 41981561592 2026-11-05 on f8dbb2b3b, 18.6… | Per part, 2026-11-05. PASS: start after Quality Gates on main, guard skip (41834401403, #3067); a b… | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | Per part, 2026-11-05. PASS: start after Quality Gates on ma… |
| 13.6 | VPS cron bundle | system | PASS (production proof), last checked 2026-10-23 | prod data 10-23: all 4 VPS cron entries ran (handoffs 06:00, job-alerts, weekly… | 1 erasure notice queued (no SMTP) | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | 1 erasure notice queued (no SMTP) |
| 13.7 | Migration safety + parity | system | PASS (production proof), last checked 2026-10-23 | parity tool vs prod ledger 10-23 | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 13.8 | Migration ledger parity | system | PASS (production proof), last checked 2026-10-23 | prod ledger 10-23: 396 match; all drift documented except ESCO fn applied with… | record/merge #2410 | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | record/merge #2410 |
| 13.9 | Supabase GitHub integration | system | BLOCKED | owner | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | Coordinator: private record [register lane] |
| 13.10 | Quality gates | system | PASS (production proof), last checked 2026-10-25 | Quality Gates on main run 40175733431 success 2026-10-25 | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 13.11 | E2E in CI | system | PASS (production proof), last checked — | e2e-smoke 39950760373 on live build 431385cf: 32/32 | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 13.12 | Executable product constitution | system | PASS (production proof), last checked — | quality 39950760135 product-truth green (111 caps, 28 nodes, 6 journeys) | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 13.13 | Feature-availability catalogue | administrator, system | NOT TESTED | 2026-11-01 code read: the catalogue's UI consumers (feature-availability-grid,… | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | Coordinator: Chrome check of the catalogue's surfaces [register lane] |
| 13.14 | Owner waivers / product gate | administrator | PASS (production proof), last checked — | product gate + self-test pass; waivers 35/35; live anon secdef gate PASS 589/9 | live parity gate skipped: CI role lacks USAGE on supabase_migrations (owner GOV-1) | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | live parity gate skipped: CI role lacks USAGE on supabase_m… |
| 13.15 | Old-browser compatibility | worker, job seeker, company | PASS (production proof), last checked — | shim live | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | none |
| 13.16 | Browser crash reports | system | NOT TESTED | only a registry citation; no primary evidence recoverable | — | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | Coordinator: find primary evidence or mark not built [register lane] |
| 13.17 | Env parity after hosting move | system | FAIL | 2026-10-27 read-only: last real AI call gemini 2026-10-15 16:07; since then pro… | OWNER+LEGAL: AI off coincides with owner 10-15 Gemini personal-data restriction (needs billed key +… | not gated in code (free today) | owner decision pending | NOT ASSESSED | NOT TESTED | OWNER+LEGAL: AI off coincides with owner 10-15 Gemini perso… |

## 4. The 15 modules

Rule: every row is assigned to exactly one module by its register section, with named exceptions by function name. DUPLICATE rows (4.17, 7.10) are left out, so the totals add to 288.

Section defaults: 1 -> module 1; 2 -> module 2; 3 -> module 8; 4 -> module 3; 5 -> module 11; 6 -> module 5; 7 -> module 12; 8 -> module 15; 9 -> module 15; 13 -> module 14; 10, 11, 12 -> "other" (MCP and AI agents, education, market intelligence have no module in the list).

Exceptions by name:

- to module 2 (Worker profiles, CV, experience, skills, documents): 5.11, 5.12, 10.8
- to module 3 (Job ads, needs and search): 9.15, 10.18, 10.19, 10.20
- to module 4 (Employer and company profiles): 3.1, 3.27, 3.29, 3.30, 3.36, 6.21, 8.9
- to module 5 (Service providers and service orders): 5.13
- to module 6 (Agencies, selection and offers): 4.6, 4.7, 4.11, 4.12, 4.14, 4.15, 4.16, 4.18, 4.19, 4.30
- to module 7 (Team formation, members, leads, roles): 3.7, 3.15, 3.21, 3.22, 3.23, 6.19
- to module 9 (Project structures and visual views): 3.3, 3.4, 3.13, 3.14, 3.16
- to module 10 (Work journals, hours, confirmations): 2.19, 2.20, 2.21, 2.22, 2.23, 2.25, 2.30, 2.31, 2.32, 2.34, 2.36, 3.33, 10.9
- to module 11 (Notifications, messaging, communication): 1.13, 3.28
- to module 12 (FREE/PREMIUM/TRIAL and access rights): 4.22
- to module 13 (Stripe payments, invoices, subscriptions): 7.4, 7.5, 7.6, 7.15, 7.16, 7.17, 7.18, 7.19, 7.20, 7.21, 7.23, 7.24, 7.28, 7.29, 7.30
- to module 14 (Administration and operator functions): 1.14, 4.25, 5.16, 6.17, 9.1, 9.2, 9.3, 9.14, 9.19, 9.20, 9.22, 10.14, 10.15
- to module 15 (Languages, mobile, security, accessibility): 1.11, 4.20, 4.21, 13.15
- to module 16 (other) (other): 6.7, 6.8, 6.9, 6.11, 6.12, 6.14, 6.18, 6.20, 6.22, 8.4, 8.5, 8.6, 8.7, 8.8, 8.10, 9.16, 9.17, 9.18

| # | Module | Total | PASS (production proof) | PASS in CI only | FAIL | BLOCKED | NOT TESTED | NOT IMPLEMENTED | OPTIONAL TEST |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Sign-up, sign-in, accounts and organisations | 12 | 11 | 0 | 0 | 1 | 0 | 0 | 0 |
| 2 | Worker profiles, CV, experience, skills, documents | 29 | 22 | 0 | 1 | 4 | 1 | 1 | 0 |
| 3 | Job ads, needs and search | 16 | 14 | 1 | 1 | 0 | 0 | 0 | 0 |
| 4 | Employer and company profiles | 7 | 4 | 0 | 0 | 2 | 1 | 0 | 0 |
| 5 | Service providers and service orders | 11 | 8 | 0 | 0 | 0 | 0 | 3 | 0 |
| 6 | Agencies, selection and offers | 10 | 8 | 0 | 0 | 1 | 1 | 0 | 0 |
| 7 | Team formation, members, leads, roles | 6 | 6 | 0 | 0 | 0 | 0 | 0 | 0 |
| 8 | Projects, assignment of workers and teams | 19 | 17 | 0 | 0 | 0 | 2 | 0 | 0 |
| 9 | Project structures and visual views | 5 | 5 | 0 | 0 | 0 | 0 | 0 | 0 |
| 10 | Work journals, hours, confirmations | 13 | 10 | 0 | 0 | 2 | 1 | 0 | 0 |
| 11 | Notifications, messaging, communication | 19 | 14 | 0 | 0 | 2 | 1 | 2 | 0 |
| 12 | FREE/PREMIUM/TRIAL and access rights | 16 | 2 | 1 | 1 | 4 | 3 | 5 | 0 |
| 13 | Stripe payments, invoices, subscriptions | 15 | 2 | 0 | 1 | 3 | 4 | 4 | 1 |
| 14 | Administration and operator functions | 29 | 19 | 1 | 2 | 4 | 2 | 1 | 0 |
| 15 | Languages, mobile, security, accessibility | 28 | 22 | 1 | 1 | 4 | 0 | 0 | 0 |
| 16 | other | 53 | 33 | 1 | 1 | 12 | 0 | 6 | 0 |
| | **All** | **288** | **197** | **5** | **8** | **39** | **16** | **22** | **1** |

Rows that are FAIL / NOT IMPLEMENTED / BLOCKED, per module:

**1. Sign-up, sign-in, accounts and organisations**

- FAIL: none
- NOT IMPLEMENTED: none
- BLOCKED: 1.8 Multi-capability organization

**2. Worker profiles, CV, experience, skills, documents**

- FAIL: 2.24 Experience records + disputes
- NOT IMPLEMENTED: 2.37 Subject refuses an imported record
- BLOCKED: 2.10 External profile links; 2.27 Org historical evidence import; 2.28 Historical consolidation; 10.8 CV AI structuring

**3. Job ads, needs and search**

- FAIL: 10.20 Vacancy retention
- NOT IMPLEMENTED: none
- BLOCKED: none

**4. Employer and company profiles**

- FAIL: none
- NOT IMPLEMENTED: none
- BLOCKED: 6.21 /business/[slug]; 8.9 Public org profile

**5. Service providers and service orders**

- FAIL: none
- NOT IMPLEMENTED: 6.13 Orders goods purchase; 6.23 Service order rating, cancellation and dispute; 6.24 Swipe-style B2C discovery feed
- BLOCKED: none

**6. Agencies, selection and offers**

- FAIL: none
- NOT IMPLEMENTED: none
- BLOCKED: 4.18 Employer data disclosure grant

**7. Team formation, members, leads, roles**

- FAIL: none
- NOT IMPLEMENTED: none
- BLOCKED: none

**8. Projects, assignment of workers and teams**

- FAIL: none
- NOT IMPLEMENTED: none
- BLOCKED: none

**9. Project structures and visual views**

- FAIL: none
- NOT IMPLEMENTED: none
- BLOCKED: none

**10. Work journals, hours, confirmations**

- FAIL: none
- NOT IMPLEMENTED: none
- BLOCKED: 2.30 Voice Work Journal; 10.9 Journal AI suggestions

**11. Notifications, messaging, communication**

- FAIL: none
- NOT IMPLEMENTED: 5.20 User-defined automations; 5.21 SMS / WhatsApp channels
- BLOCKED: 5.5 Message translation; 5.8 Push

**12. FREE/PREMIUM/TRIAL and access rights**

- FAIL: 7.27 Free VIP for approved employers
- NOT IMPLEMENTED: 4.22 3 free profile views + VIP; 7.9 LMC top-ups, VIP, ai_plus, tiers; 7.11 Deferred plans; 7.26 LMC spend + reversal; 7.31 Free + two paid tiers for workers AND for compani…
- BLOCKED: 7.7 Manual pilot grant (admin); 7.8 LMC credit ledger; 7.12 AI cost metering; 7.14 Vacancy translation entitlement

**13. Stripe payments, invoices, subscriptions**

- FAIL: 7.28 Payee and terms
- NOT IMPLEMENTED: 7.20 Invoices inside LM; 7.23 LMC top-up; 7.24 LMC granted once per payment; 7.30 Invoices + work-acceptance acts from the Work Jou…
- BLOCKED: 7.6 Billing recovery cron; 7.15 EUR 99 subscription checkout; 7.19 Refunds and disputes

**14. Administration and operator functions**

- FAIL: 13.1 VPS hosting + auto-deploy; 13.17 Env parity after hosting move
- NOT IMPLEMENTED: 10.15 Agents OS runtime
- BLOCKED: 5.16 Owner Telegram alerts; 9.19 Admin import sandbox; 9.20 Admin intelligence inspector; 13.9 Supabase GitHub integration

**15. Languages, mobile, security, accessibility**

- FAIL: 9.25 CodeQL / dependency alerts
- NOT IMPLEMENTED: none
- BLOCKED: 8.3 Machine translation; 8.13 Native app; 8.14 App links; 8.15 Mobile store release

**16. other**

- FAIL: 11.8 Training & certification register
- NOT IMPLEMENTED: 6.12 Cross-border deals; 6.14 Logistics; 6.22 Housing / accommodation; 10.4 MCP scopes; 10.16 AI agents as participants; 11.10 RPL equivalence structure
- BLOCKED: 8.5 Nine priority launch markets; 9.16 External referral API; 10.5 ChatGPT/Claude listings; 10.6 AI runtime; 10.7 Conversation intent LLM; 10.10 Explanation AI; 10.21 Eurostat import; 10.22 the partner organization integration; 10.24 Self-hosted STT/translate; 10.25 Cloudflare AI adapter; 10.26 OpenAI apps challenge; 11.9 Human-in-loop learning review

Module membership (all row IDs):

- 1. Sign-up, sign-in, accounts and organisations: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.12, 1.15
- 2. Worker profiles, CV, experience, skills, documents: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.14, 2.15, 2.16, 2.17, 2.18, 2.24, 2.26, 2.27, 2.28, 2.29, 2.33, 2.35, 2.37, 5.11, 5.12, 10.8
- 3. Job ads, needs and search: 4.1, 4.2, 4.3, 4.4, 4.5, 4.8, 4.9, 4.10, 4.13, 4.26, 4.28, 4.29, 9.15, 10.18, 10.19, 10.20
- 4. Employer and company profiles: 3.1, 3.27, 3.29, 3.30, 3.36, 6.21, 8.9
- 5. Service providers and service orders: 5.13, 6.1, 6.2, 6.3, 6.4, 6.6, 6.10, 6.13, 6.16, 6.23, 6.24
- 6. Agencies, selection and offers: 4.6, 4.7, 4.11, 4.12, 4.14, 4.15, 4.16, 4.18, 4.19, 4.30
- 7. Team formation, members, leads, roles: 3.7, 3.15, 3.21, 3.22, 3.23, 6.19
- 8. Projects, assignment of workers and teams: 3.2, 3.5, 3.6, 3.8, 3.9, 3.10, 3.11, 3.12, 3.17, 3.18, 3.19, 3.20, 3.24, 3.25, 3.26, 3.31, 3.32, 3.34, 3.35
- 9. Project structures and visual views: 3.3, 3.4, 3.13, 3.14, 3.16
- 10. Work journals, hours, confirmations: 2.19, 2.20, 2.21, 2.22, 2.23, 2.25, 2.30, 2.31, 2.32, 2.34, 2.36, 3.33, 10.9
- 11. Notifications, messaging, communication: 1.13, 3.28, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.14, 5.15, 5.17, 5.18, 5.19, 5.20, 5.21
- 12. FREE/PREMIUM/TRIAL and access rights: 4.22, 7.1, 7.2, 7.3, 7.7, 7.8, 7.9, 7.11, 7.12, 7.13, 7.14, 7.22, 7.25, 7.26, 7.27, 7.31
- 13. Stripe payments, invoices, subscriptions: 7.4, 7.5, 7.6, 7.15, 7.16, 7.17, 7.18, 7.19, 7.20, 7.21, 7.23, 7.24, 7.28, 7.29, 7.30
- 14. Administration and operator functions: 1.14, 4.25, 5.16, 6.17, 9.1, 9.2, 9.3, 9.14, 9.19, 9.20, 9.22, 10.14, 10.15, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9, 13.10, 13.11, 13.12, 13.13, 13.14, 13.16, 13.17
- 15. Languages, mobile, security, accessibility: 1.11, 4.20, 4.21, 8.1, 8.2, 8.3, 8.11, 8.12, 8.13, 8.14, 8.15, 8.16, 8.17, 8.18, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 9.11, 9.12, 9.13, 9.23, 9.24, 9.25, 13.15
- 16. other: 6.7, 6.8, 6.9, 6.11, 6.12, 6.14, 6.18, 6.20, 6.22, 8.4, 8.5, 8.6, 8.7, 8.8, 8.10, 9.16, 9.17, 9.18, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.10, 10.11, 10.13, 10.16, 10.17, 10.21, 10.22, 10.23, 10.24, 10.25, 10.26, 10.27, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6

## Limits

- No walk was run for this file. A PASS (production proof) holds for the date and build in its row, not for the build in production today.
- "Plan" reflects what the code enforces, not a price list; the intended tier of every function waits for the owner.
- V2 design states come from unmerged code inventories; 219 of the 288 counted rows are NOT ASSESSED (the 290 table rows include the two DUPLICATE rows 4.17 and 7.10, which are not counted).
- "For whom" comes from a draft map table in the register.

