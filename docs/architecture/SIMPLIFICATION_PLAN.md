# Simplification plan (2026-11-23)

> **SUPPORTING — NOT THE CANONICAL ARCHITECTURE.** The architecture is
> [`docs/OWNER_TARGET_ARCHITECTURE_V1.md`](../OWNER_TARGET_ARCHITECTURE_V1.md).
> This is deliverable E of the owner's P0 audit (issue #3679). Security and
> permission items carry only their id, owner and state here; their detail
> stays in the private record (`AGENTS.md`, lines 82-85). It orders the
> proven findings of the other deliverables into small, safe steps. It adds no
> finding of its own and decides nothing the owner has not decided.

## 0. Inputs and rules

| Input | File | State |
|---|---|---|
| A — function map | `docs/architecture/PLATFORM_FUNCTION_MAP.md` | merged |
| B — technical map, with measured reliability (§12) | `docs/architecture/TECHNICAL_ARCHITECTURE_MAP.md` | merged |
| C — duplication audit, the ids used below | `docs/audits/DUPLICATION_AUDIT.md` | merged |
| D — carousel navigation spec, the N-steps and OD-decisions used below | `docs/design/CAROUSEL_NAVIGATION_SPEC.md` | PR #3681 |
| F — production acceptance matrix | `docs/qa/PRODUCTION_ACCEPTANCE_MATRIX.md` | PR #3680 |
| G — agent change rules | `docs/AGENT_CHANGE_RULES.md` | merged |

Rules for every step (from `docs/AGENT_CHANGE_RULES.md` §4):

- **One finding per PR.** The PR names the audit id (for example `CV-13`) and
  its owner lane.
- **No lost function, data or access.** Every caller is listed and moved or
  kept. Every role keeps its path. Deep links resolve.
- **A guard first.** The test that protects the kept path, and fails if the
  duplicate returns, lands in the same PR.
- **RED stays RED.** Any SQL that drops, revokes, retires a function version or
  changes RLS is a draft with `needs-human-gate`, applied only after owner
  approval.
- **Merges are batched.** Every merge to `main` deploys. A deploy makes the
  production walk brake refuse walks for its duration plus 5 minutes. On
  2026-11-23 it refused 45138442951 and 45139668246. Merge in batches between
  walk windows, never one by one during a walk.

The goal is less complexity and fewer failure points, not fewer lines. A
finding marked SUSPECTED in C is measured before it is changed.

## 1. Keep unchanged

These paths are proven in production. They are the canonical ones the
duplicates fold into, and no step below rewrites them.

| Path | Production evidence | Canonical module |
|---|---|---|
| Worker: sign-up → profile → CV → save, on 3 devices | profile-cv-history 45091874326 (375), 45097071365 (phone), 45094839877 (desktop) | `lib/journal/professional-experience.ts` (decision 0025), `lib/skills/potential-skills.ts` (0023) |
| Employer chain: need → candidates → contact | company-chain 45140908370 (phone-375, build `f0424833`) | the need and contact cores named in A |
| Education: programme → cohort → invite → practice board | learning-practice 45141893755 (phone, build `f0424833`) | the education workspace in A |
| Phone surfaces, including the organisation doors row | mobile-surfaces 45142813658 (phone, build `f0424833`) | `OrganizationDoors` (until N7) |
| Booking → worker accepts → hire visible to both sides | orders-bookings 45049554634, 45052181467 | booking engagement invariant, `lib/booking/engagement-invariant.ts` |
| Live charging | owner decision 2026-11-16 (FUNCTION_REGISTER 7.5). No billing change since. | Stripe checkout and webhook as deployed |
| One header for every dashboard route | `one-header-navigation.test.ts` | `ConversationHeader` |
| Public goal navigation | D §3 | `GoalNavigator` on `CardRail`, fed by `PUBLIC_INTENTS` |
| Message write core, AI egress gate, erasure runner | B §5, §7, §9 | as named in B |

## 2. Fix: defects with a known cause

| # | Id | Defect | Step | Owner | Guard | State |
|---|---|---|---|---|---|---|
| F1 | CV-6 | The Living CV lists skills and work history twice | Remove the hero lists; the sections are the one listing | G | the CV render guard in #3690 | PR #3690 (draft; `signup-isolated` red) |
| F2 | CV-13 | The journal stacks up to four empty messages | One empty state when there are no entries | A | the journal empty-state guard | PR #3685 (`signup-isolated` red) |
| F3 | CV-21 | German profile shows English skill names (two catalogues) | One catalogue, one slug-name fallback | A | locale skill-name test | PR #3685 |
| F4 | — | Workspace name cut at 768 px (de/nl/pl/ru) | Wrap, not truncate | A | 768 contact-sheet metric | PR #3685 |
| F5 | MSG-3 | Work-instruction messages send no "new message" notification | Call the shared notify helper after the RPC | C | notification e2e | open |
| F6 | MSG-2 | Contact rules differ between two doors (permission-relevant; detail in the private record) | One resolver | B with F | a parity test | open |
| F7 | AI-2 | MCP demand-create loses the start/end date and the team split | One mapper and one base schema | B | a mapper parity test | open |
| F8 | CV-18 | The chat CV import drops skill inference | One proposals hook for both flows | G | an import-to-proposals test | open |
| F9 | CV-10 | The CV import skips the education row cap | The import calls the form's core | G | a row-cap test | open |
| F10 | ORG-7 | One of three review-queue reads hides its failure | A shared reader that passes the unknown state through (SEP-7) | M | an unknown-not-zero guard | open |
| F11 | CV-1 | Employers see `workers.experience_years`, which nothing writes | A consented figure from the one 0025 reading | G | a 0025 reader guard | open |
| F12 | HIRE-4 | Security-relevant (SUSPECTED); detail in the private record | Measure first; fix per the private record | F, then C | an authority test | open |
| F13 | — | Public-vacancy reads (sitemap, search, counts) hit statement timeouts in production (B §12.1) | Keyset sitemap function | D | migration-safety, a timing walk | RED #2996 |
| F14 | BYP-1 | Privacy-relevant (SUSPECTED); detail in the private record | Measure first; fix per the private record | B with F | `ai-data-egress.test.ts` | open |

## 3. Merge into one implementation

Each row keeps every door. Only the duplicate implementation behind the doors
goes.

| # | Ids | Area | One implementation | Owner | Depends on |
|---|---|---|---|---|---|
| M1 | NAV-12, D N1–N11 | Three horizontal card systems | `CardRail` (D §3, §6) | A2 (A, M per caller) | OD-1 and OD-2 for N3–N6 |
| M2 | NAV-1, NAV-2, NAV-3, DEAD-7 | Organisation area lists, the admin link twice, one route with two label keys | `ORGANIZATION_WORK_AREAS`, one key per route | M | — |
| M3 | ORG-1, ORG-2 | Two project-create forms; two team-assign forms (one write each) | One component, both doors | M | — |
| M4 | ORG-4, ORG-6 | Needs list with three readers; two approvals cards with two counts | One workspace-scoped reader; one view model | M | — |
| M5 | ORG-5, ORG-8, ORG-9 | Need doors that bypass `NeedDoorLink`; two folds; hand-built chips | `NeedDoorLink`, `chipLinkClassName`, `ui/Button` | M | — |
| M6 | AI-1, AI-3, AI-8 | Ten actions wired twice (chat vs MCP); the journal mapper copied | The bridge or shared mappers around the one write core | B | F7 |
| M7 | MSG-1 | MCP conversation readers re-implement the web inbox and thread readers | MCP calls the web readers | B | — |
| M8 | MSG-5, MSG-6 | Two ways to send email; two owner alerts for one event | `sendTransactionalEmail`; one alert next to `persistPublicCompanyNeed` | S | — |
| M9 | AI-9, AI-10, CV-19, CV-20 | Number and day-word lexicons, text-folding copies, ESCO prefix search, period check | `parseWordNumber`, `foldText`, the RPC, `isPeriodRecord` | E | — |
| M10 | CV-7, CV-8, CV-9, CV-11, CV-12, CV-16 | Skill add (3 ways), journal composers and editors, past work, work card, declared-skills counts | The canonical one named in C for each | A and G | F1 |
| M11 | CV-2, CV-3, CV-4, CV-15 | A second evidence ladder, "supported by work", per-organisation hours, the Player Card limit | `deriveEvidenceTier`; the 0025 reader | G | F11 |
| M12 | HIRE-3, then HIRE-1 | Two acceptance chains; two company → employee invitation writers | `accept_invitation_apply_v2`, then `invitations` | C (RED parts with F) | F12 |
| M13 | HIRE-5, HIRE-7, HIRE-8, HIRE-9 | Booking accept without the engagement row; two writers of `team_assignments`; two engagement readers | Booking accept opens the engagement; one insert helper; one reader | C | M12 |
| M14 | REG-1 | Two function registers, each called "the one" | Both kept, one fact each, linked by capability id | coordinator | — |
| M15 | AUTH-1 | Phone sign-up drifted from web sign-up | One shared rules module for both clients | F | — |
| M16 | SQL-5, SQL-10, SQL-11, SQL-12 | Booking response v3/v4 copy; withdraw v1/v2; three accept bodies; 48 "object missing?" checks | Delegators and one helper | D (RED for SQL bodies) | owner approval |

## 4. Safe removal

GREEN only with a caller-grep proof in the PR (import graph, string-loaded
routes, MCP tools, guards that pin the file). RED rows need a zero-row or
zero-caller assertion and a reversible recreate.

| # | Ids | What | Class | Proof required | Owner |
|---|---|---|---|---|---|
| R1 | DEAD-1, DEAD-2, DEAD-3 (B S-3) | Components with no importer (43 files in B §4.1); `market-map-shell.tsx`, with its 16 guards re-pointed at the live page | GREEN | Import graph; a no-orphan guard added in the same PR | E |
| R2 | CV-17, CV-2 | Dead CV pieces; the second evidence ladder (after M11) | GREEN | Import graph | G |
| R3 | DEAD-5 | Translation namespaces never referenced (3 confirmed; 7 suspected are measured first) | GREEN | Key grep across code and guards, in all 7 locales | A2 |
| R4 | AI-7 | Vacancy translation at import time, which has no provider | GREEN | No caller; the read-time path is kept | B |
| R5 | SQL-1, SQL-7 | App fallbacks that name only dead function versions; stale lists of absent tables and RPCs | GREEN, after #3688 is applied | Production ledger read | D |
| R6 | NAV-10 | Routes nothing links to | GREEN, per route: link it or retire it with a redirect | Route tree and walk logs | A2 |
| R7 | HIRE-2 | Unreachable legacy agency → worker invitation writer; accept kept until 0 pending rows | GREEN writer; RED accept | Production row count | C |
| R8 | SQL-2, SQL-3, SQL-9, SEC-1/2/4 | Old function versions with no caller; the retired agency board RPCs | **RED** (#3688 covers SEC-1/2/4) | Caller proof, rollback | D, F |
| R9 | B S-5, S-6, SQL-8, SQL-13 | Tables never written; functions with no reference; the one-off backfill table | **RED**, owner decision | Zero rows, F and L confirm erasure and RPL need nothing | D |

## 5. Dependencies to separate first

1. **#3688 apply (owner) → R5.** The GREEN removal of app fallbacks comes only after the old versions are revoked in production.
2. **#3164 before #3219** (AI-6).
3. **F12 → M12 → M13.** The hiring merges wait until F12 is measured and closed.
4. **F7 → M6.** Fix the drifting demand-create mapper before folding the chat and MCP wiring.
5. **OD-1 and OD-2 (owner) → D N3–N6.** N1, N2, N7a and N11 need no decision and go first.
6. **F1 → M10, F11 → M11 → R2.** One CV listing and one 0025 reading before folding the CV editors and ladders.
7. **#3647/#3657 (RED) → MSG-7, OFFER-2.** The anonymous thread and the order pseudonyms decide which offer thread stays.

## 6. Speed and reliability blockers (measured, from B §12)

| # | Blocker | Effect | Step |
|---|---|---|---|
| S1 | Statement timeouts on public-vacancy reads | Server errors on the sitemap, search and counts | F13 (RED #2996) |
| S2 | Uncaught server errors and browser crash reports go only to the VPS container log | Unhandled exceptions are **not measured** | Owner-side `ops/vps/lm-smoke.sh` run for the count; then an alert on the existing log reader. No new log store. |
| S3 | Flaky isolated tests: `journal-template-isolated` T-3 (3×), `teams-projects-isolated` T-3, `audit-trail-isolated-web-a` U-1; suspected `journal-reach-isolated` R-1 and R-3 | Red CI on unrelated PRs; slower merges | One root-cause fix per test, owner lane L. Never a retry bump or a skip. |
| S4 | 28 pages with no production walk, including the whole admin console (B §14) | Unknown production state | L, inside the extended `prod-ux-metrics` (#3689 merged), within the 24/day cap |
| S5 | GitHub schedule ticks missed twice in two days | Walks wait for a push | Kept as is (owner rule). Kicked by a push when ticks stop. |
| S6 | Each merge deploys; the brake refuses walks during a deploy | Lost walk tries | Batched merges (§0) |

## 7. Tests that guard each step

| Step type | Guard |
|---|---|
| Any removal | Import-graph or no-orphan guard (`e2e-testid-orphans.test.ts`, the capability register's consumer rule), typecheck, build |
| Navigation | `one-header-navigation.test.ts`, `public-intents.test.ts`, `page-pattern-consistency.test.ts`, the D click script in `prod-ux-metrics`, mobile-surfaces M-6 |
| CV and history | `living-cv-potential-inference.test.ts` (0023), the 0025 reader guards, profile-cv-history on 3 devices |
| Messaging and notifications | Notification e2e, chat-continuity and notifications-inapp walks |
| Hiring and bookings | orders-bookings and company-chain walks, booking engagement invariant |
| Chat vs MCP parity | A parity test per folded action; mcp-chain and mcp-agents walks |
| SQL | `migration-safety`, RLS tests, rollback file, owner gate for RED |
| Privacy | decision 0033 guards, `ai-data-egress.test.ts`, erasure runner tests |

A step is done only when its production walk passes on the deployed build, not
when its PR merges.

## 8. Phases

| Phase | Content | Gate |
|---|---|---|
| P1 — now | F1–F4 (PRs open), F5–F11, M2, M5, M9, R1, R3, R4, R6, D N1 + N2 + N7a + N11, S3 | GREEN; review on the current head; a production walk after deploy |
| P2 — after P1 walks pass | M3, M4, M6, M7, M8, M10, M11, M14, M15, R2, D N7 | GREEN |
| P3 — after owner decisions | D N3–N6 and N10 (OD-1, OD-2), D N8 (OD-3), F12 → M12 → M13, R7 | GREEN, or RED where SQL |
| P4 — RED, owner approval each | #3688 → R5, R8, R9, M16, F13, D N9 (OD-4) | `needs-human-gate`, exact SQL in the PR, apply via MCP after approval |

## 9. Owner decisions this plan waits on

| Id | Question | Source |
|---|---|---|
| OD-1 | Signed-in level-1 goals: the six public goals for everyone (level 2 by rights), or role-specific sets | D §7 |
| OD-2 | Signed-in AI entry: mark "My space", or a seventh header control | D §7 |
| OD-3 | Level-3 categories for goals other than "Find work" | D §7 |
| OD-4 | Pins storage (RED) | D §7 |
| OD-5 | Mark the six-item contract in `role-aware-navigation-contract-v1.md` SUPERSEDED | D §7 |
| NAV-9 | Phone app vs web main destinations | C |
| AUTH-2 | Canonical path for setting up as a buying client | C |
| OFFER-1, OFFER-5 | The commercial record (proposals vs offer terms); which lane is the subcontract chain | C |
| AI-4, AI-11 | Retire or re-route the no-op provider stack; `/match-preview` on the frozen fork | C |
| HIRE-6 | The fold plan for governance invitations | C |
| RED | #3688, #3620, #3632, #3649, #3651, #3657, #2996 and the R8/R9/M16 SQL | C §11, B §6 |

## 10. Not in this plan

- Building new modules, pages, stores or navigation. The freeze in #3679 and the rules in `docs/AGENT_CHANGE_RULES.md` hold.
- Any decision on legal texts (#3626, paid terms #2842 for FUNCTION_REGISTER 7.28).
- Agentai OS. It is a separate project; its state never fails a LabourMarket.ai step.
