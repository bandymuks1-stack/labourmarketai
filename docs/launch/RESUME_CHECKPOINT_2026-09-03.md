# RESUME_CHECKPOINT — 2026-09-03 (execution mode: FIRST REAL ECOSYSTEM USE, late session)

## UPDATE — window 2 (2026-09-03, after the A+B+C handoff) — READ THIS FIRST

| Item | Value |
|---|---|
| `main` | `953c34e7` (#1459 opportunity-type chip) on `7f15c221` (docs) on `d5172597` (#1458) — verify `git log origin/main -3` |
| Production | `d5172597` verified 12:45 UTC; `953c34e7` was `Vercel: pending` at merge (the docs push `7f15c221` was rate-limited — harmless) — confirm `/api/health` `build` on resume |
| RED batch D | **APPLIED TO PROD 13:04 UTC** (owner "Apply batch 2026-09-03 D"; ledger `20260903130400`; readback per actor green; residue 0). **#1457** marked ready, auto-merge armed — on resume confirm it merged, its Vercel status, and `/api/health` `build`; migration count becomes 262 on `main` |
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
