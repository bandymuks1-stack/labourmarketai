# RESUME_CHECKPOINT — 2026-09-03 (execution mode: FIRST REAL ECOSYSTEM USE, late session)

## UPDATE — 2026-09-04 morning (first REAL recruiter account) — READ THIS FIRST

| Item | Value |
|---|---|
| `main` / production | **`20c0c5dd`** (#1463) — health `build=20c0c5dd` verified 05:07 UTC |
| Real Lane A account | Google account, `lt`, `signup_completed` 04:19:07 UTC (= T0), `role_selected {intent: agency}` 04:27:30, step 2 (name + country) **not submitted**; 0 companies / orgs / invitations; single canonical identity. REAL_RECRUITER_USED_PRODUCT = FALSE |
| P0 fixed before the real user reached it | onboarding + `?new=1` created a SECOND company ("<name> UAB" shell + the real one) → fail-closed workspace resolver → "no company profile" (prod 2026-09-02). #1463: router drops `new=1`, no fabricated seed, the setup page completes the shell (`firstSetup`), company dashboard sends a shell back to setup |
| TTFV | `first_real_action` / `first_real_result` now EMITTED on the agency bridge (server actions + where each side sees the other's response). Before #1463 they were declared only |
| Prod proof (E2E identity, separate from real evidence) | full first-session path walked on `20c0c5dd` at 390 px: onboarding → agency preset → ONE company → workspace with bridge + real demand → persists. `docs/launch/pilot-feedback/2026-09-04-lane-a-real-recruiter.md` |
| Owner decision (later that morning) | the real account represents the EXISTING verified agency **"Labour market ai Sp. z o.o"** (companies `788225e9…`, org `19f47e78…`), no duplicate. Its creator account is live, so the connection is a **governance membership**, not a creator transfer. Package: **#1464** RED draft (`20260904060000_owns_company_governance_membership_v1`: `owns_company` := creator OR active owner/admin membership; `create_agency_client_connection_v1` uses it; grants restated; rollback verbatim) + the data grant (admin membership, company role, onboarding closed on the real profile — exact SQL + rollback in the pilot-feedback doc) + **#1465** GREEN (membership-aware `getOwnedCompanyById`; setup page edits a governed company). Read-only proof on prod rows green; the rolled-back dry run was blocked by the session permission layer → post-apply readback is the proof |
| Owner's next step | reply **"Apply Lane A ownership 2026-09-04"** (or "… as owner" for co-owner instead of admin). Then the agent applies #1464 via MCP, runs the grant, reads back per actor, marks #1464 ready; the real account's next visit to `/lt/dashboard` lands in the agency workspace |
| Dev machine | Docker Desktop 4.75 fails to start (Inference manager listener error — Quit / Reset dialog) → no local stack this session; prod probes use the bounded `e2e-*@labourmarket.ai` identities via magic-link mint (see memory) |

Next smallest slices: agency workspace order on mobile (bridge / roster / demand first — measured 3.6 / 7.7 / 1.7 screens down); roster invitation e-mail (today none is sent; candidate must sign in with the invited address and accept); `first_real_result step=system` for the agency (public demand card with count > 0); `/dashboard/start/*` hardcoded `label(lt,en)` → i18n keys.

---

## UPDATE — evening run (2026-09-03, after batch D) — READ THIS FIRST

| Item | Value |
|---|---|
| `main` | `b6514087` (#1461) on `cba98045` (#1460) — plus #1462 (TTFV) auto-merging and one docs+copy commit after it; verify `git log origin/main -4` |
| Production | **`cba98045`** verified 18:46 UTC (#1460 live: `/lt/signup` 308 → `/lt/auth/signup` PROD VERIFIED). #1461/#1462 deploy after merge — confirm `/api/health` `build` on resume |
| Pilot entry URL | `https://labourmarket.ai/lt/auth/signup` (canonical); `/lt/signup`, `/lt/login`, `/lt/register` redirect there since `cba98045` |
| Lane B | B1 (setup + `capabilityDeclared` signal), B2/B3/B6 (programme → cohort → assign) **proven in the local browser** as the fixture institution after the D fix; invite deep link opens pre-set to "Studentas"; **not yet done by a real institution on production** |
| Lane A | DB chain prod-proven (window 2); UI friction fixed (#1460); **not yet done by a real recruiter** |
| Student | compass chip + cohort block + linked steps proven locally; student intent lands on `#learning-compass` |
| Local harness | stack runs on **553xx** via UNCOMMITTED `supabase/config.toml` (ports, analytics/inbucket off) + UNCOMMITTED `.claude/launch.json` `dev-local` entry → scratch runner; keep both until the owner frees 54290–54489 (DEV-1). Fixture seeds in the local DB: dev.worker student context + accepted invitation + current education row + one programme/cohort under Dev Construction. **Stop `next dev` before `pnpm build`** (shared `.next`). |
| Open PRs | #1462 (auto-merge) — otherwise only the long-standing RED drafts |
| Milestones | REAL_RECRUITER_USED_PRODUCT = FALSE · REAL_EDUCATION_INSTITUTION_USED_PRODUCT = FALSE (no fabrication) |

Next smallest slices: `/dashboard/start/*` hardcoded `label(lt,en)` → i18n keys (ru/nl/de first screen); emit the real `first_real_action` / `first_real_result` events (worker board, programme created, offer decided); UI caller for `institution_learner_outcomes_v1`; employer internship posting proof on prod (B8) so the type chip gets real rows.

---

## UPDATE — window 2 (2026-09-03, after the A+B+C handoff)

| Item | Value |
|---|---|
| `main` | `953c34e7` (#1459 opportunity-type chip) on `7f15c221` (docs) on `d5172597` (#1458) — verify `git log origin/main -3` |
| Production | `d5172597` verified 12:45 UTC; `953c34e7` was `Vercel: pending` at merge (the docs push `7f15c221` was rate-limited — harmless) — confirm `/api/health` `build` on resume |
| RED batch D | **APPLIED TO PROD 13:04 UTC** (owner "Apply batch 2026-09-03 D"; ledger `20260903130400`; readback per actor green; residue 0). **#1457 MERGED → `13c2bc1e`** (migration count on `main` = 262). Its Vercel deployment was rate-limited — harmless: the PR is DB + guard files only, no runtime code. **Production = `953c34e7`** (#1459) verified 13:12 UTC. |
| Production defect (Lane B) | **CLOSED in the DB**: the `42P17` policy recursion on the three education tables is gone (manager/learner/outsider/anon reads verified). The UI needs no change; the programmes section and the student cohort view light up with real rows. Next: walk B2/B3/B6 with the owner's real institution. |
| Lane A | A4 → A8 chain PROD-PROVEN 2026-09-03 (rolled back, zero residue) — invite/accept/share/offer/accept→booking/progress/candidate accept→engagement/outsider 0. Only real people are missing. |
| Lane B | B1, B4, B5 (invite/learners) live; **B2/B3/B6 blocked in prod until D**; B7 compass live; B10 aggregates live |
| Real pilot signals | none — 0 rows in agency_client_connections / agency_candidate_offers / education_programs / education_cohorts; 15 auth users in 48 h are e2e/proof identities |
| Harness | local Supabase cannot bind 54321/54322 (Windows excluded port range → owner DEV-1); local DB volume holds all 261 + the D fix applied via `docker exec psql`; Bash classifier intermittently overloaded — read-only tools and Supabase MCP keep working |
| Temp worktrees | none created this window; branch `feat/cc/student-cohort-compass-v1` deleted after merge; `fix/cc/education-rls-recursion-v1` stays until #1457 merges |

Actor deltas: **Student** — cohort/programme/institution/direction + live demand in the compass (merged, prod value after D). **Education institution** — programmes UI BROKEN in prod until D (was reported LIVE; the readback missed it). **Agency** — whole chain proven at DB level; UI walk still needs a real recruiter. Next smallest slices: opportunity type (internship / apprenticeship) badge on board rows + compass fits; Track E contract regeneration.

---

The owner confirmed the direction (2026-09-03): no broad audits; education/student
and agency loops are the highest functional priorities after production
stability; `REAL USER READY = YES` means an external pilot can experience real
value independently. Read with `OWNER_ACTION_QUEUE_2026-09-03.md` (owner gates)
and `PILOT_LANES_2026-09-03.md` (pilot checklists).

Canonical root `C:\Users\Mano\Documents\labourmarketai`, branch `main`.

| Item | Value |
|---|---|
| `main` at last write | `cb88be09` + #1455 merged 09:44 UTC (internship type) — verify `git log origin/main -3` |
| Production | `da136d3e` verified 08:25 UTC (health 200 ×3); later merges redeploy automatically — verify `/api/health` `build` on resume |
| Production health | 200 ×3, db 52–849 ms. P0-1 closed (health probe constant-cost; count index-only + autovacuum thresholds); P2-1 closed |
| Applied to prod today | `20260903070000`, `20260903090000`, `20260903110000`, `20260903130000` (internship/apprenticeship projection; ledger `20260903094724`) — all GREEN, paired rollbacks — + one manual `VACUUM (ANALYZE) public.public_vacancies` |
| Merged today | #1439 #1445 #1447 #1446 #1449 #1450 #1451 #1452 #1453 #1455 |
| Open with auto-merge | none (all GREEN slices merged) |
| **Production = `8d3e7dec`** (deployed 11:47 UTC after a ~55 min Vercel Hobby rate-limit window; VERCEL-1 closed without owner action). RED batch A+B+C live in DB AND UI. | health 200, db 577 ms |
| RED batches — **ALL APPLIED TO PROD 2026-09-03 11:00 UTC AND MERGED** (owner sentence "Apply batch 2026-09-03 A+B+C"; #1448 → `6255e28e`, #1454 → `1f6703fa`, #1456 → `8d3e7dec`; ratchets now 261; temp worktrees removed) | **#1448** batch A (supply-counts row + agency offer decision + client accept/decline UI + agency-side decision chips; ratchet 259) · **#1454** batch B (education programmes/cohorts/members + demand per profession + programmes UI; ratchet 258) · **#1456** batch C (institution learner outcomes, aggregates only, suppressed < 5; ratchet 258) — all MERGEABLE against `main` (257) · #1441 #1440 #1436 #1433 #1430 #1426 #1421 #1355 #1266 #1046 #1045 #897 #896 #895 #883 #740 |
| Temp worktrees | none — `wt-red`, `wt-red-b`, `wt-red-c` removed after merge (all clean). Pilot runbooks: `PILOT_RUNBOOK_LANE_A_RECRUITER.md`, `PILOT_RUNBOOK_LANE_B_INSTITUTION.md`. Stale `.claude/worktrees/agent-*` predate this session — untouched; **run vitest from `apps/web`** |
| Local processes | none; no browser tab open |

## Actor state after this stretch

| ACTOR | FIRST REAL VALUE | PROD VERIFIED | TTFV (real events) | PILOT READY | STILL INCOMPLETE | NEXT IMPROVEMENT |
|---|---|---|---|---|---|---|
| Worker | intent → guided profile → journal → 3-best board → interest | chain proven earlier; router CI-green | 1 min to first action, ≈5 h to first result (n=3) | YES (Lane C) | e-mail delivery proof (G-1); result latency is the employer side | none blocking |
| Employer | intent → company setup → plain-language need → match → contact/booking | proven earlier | ≈5 h to action/result (n=3) | YES | shortlist/booking depth; demand attribution (#1440 gated) | Lane C pilot |
| Agency | `staffing_agency` company → roster invite → client connection → share → offer → client contact/booking → engagement; **+ live demand card** (#1453) | bridge proven in parts; 0 real rows | none yet | YES for a recruiter WITH a client; decision record after #1448 | explicit accept/decline (#1448); candidate pool needs each worker to accept an invite | apply #1448 → prove chain with one real agency |
| Student | intent → current education → **Learning Compass** (becoming / evidence / fits / missing / next) → board | #1452 CI-green; compass renders on the student path | none yet | YES (basic) | internship as a demand kind; cohort membership visible to the student (after #1454) | apply #1454; internship demand kind |
| Education institution | intent → `training_provider` → invite learners → **Learners** (#1450) → **live demand** (#1453) → **programmes/cohorts + demand per programme** (#1454, after apply) | invite/accept proven earlier; sections CI-green | none yet | YES for invite + participation + demand; programmes after #1454 | outcome visibility (placements of learners) — needs booking/engagement joins under the least-privilege ruling | apply #1454 → Lane B pilot |

## First autonomous actions on resume

**Superseded 2026-09-03 12:00 UTC — start from `NEW_WINDOW_HANDOFF_2026-09-03.md` §9.** Batches A/B/C are applied, merged and deployed (`8d3e7dec`); the numbered list that stood here referred to them.

Do not re-run proofs recorded in the register or the audits; do not generate `e2e-*` mail; never edit frozen landing files.
