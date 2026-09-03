# RESUME_CHECKPOINT — 2026-09-03 (execution mode: FIRST REAL ECOSYSTEM USE, late session)

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
| RED batches — **ALL APPLIED TO PROD 2026-09-03 11:00 UTC** (owner sentence "Apply batch 2026-09-03 A+B+C"; PRs ready, merging in order A→B→C with ratchet re-base) | **#1448** batch A (supply-counts row + agency offer decision + client accept/decline UI + agency-side decision chips; ratchet 259) · **#1454** batch B (education programmes/cohorts/members + demand per profession + programmes UI; ratchet 258) · **#1456** batch C (institution learner outcomes, aggregates only, suppressed < 5; ratchet 258) — all MERGEABLE against `main` (257) · #1441 #1440 #1436 #1433 #1430 #1426 #1421 #1355 #1266 #1046 #1045 #897 #896 #895 #883 #740 |
| Temp worktrees | `scratchpad/wt-red` (#1448), `scratchpad/wt-red-b` (#1454) — with node_modules; `scratchpad/wt-red-c` (#1456) — no node_modules. Keep until merged, then `git worktree remove`. Pilot runbooks: `PILOT_RUNBOOK_LANE_A_RECRUITER.md`, `PILOT_RUNBOOK_LANE_B_INSTITUTION.md`. Stale `.claude/worktrees/agent-*` predate this session — untouched; **run vitest from `apps/web`** |
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

1. Verify production build; if #1453 merged, confirm the demand card renders for a `staffing_agency` company (CI covers compile; a real pilot login is the visual proof).
2. If the owner replied "Apply batch 2026-09-03 A": apply #1448's two migrations in order via Supabase MCP, verify (cron.job row; `count_public_vacancies_v1()` < 50 ms; 4-value CHECK; RPCs present), mark ready, merge, remove `wt-red`.
3. If "Apply batch 2026-09-03 B": apply `20260903120000`, verify (3 tables RLS on; `count_public_vacancies_by_profession_v1(5)` rows), merge #1454, remove `wt-red-b`.
4. Track C slice 3 (GREEN): internship as a demand kind through `customer_requests.payload.engagement_type = 'internship'` (no CHECK change) surfaced on the board and the compass; learner-side view of own cohort/programme (reads exist after B).
5. Agency: after #1448, agency-side offer progress shows the client decision (`offer_status` accepted/declined) — small read/label change.
6. Time-to-first-value: the admin telemetry section is live; the first external pilot supplies the first per-actor measurement. Do not fabricate one.
7. Track E: regenerate `agantai/contracts/labourmarket-capability-contract.json` from production facts (read-only); VPS-1 stays owner-gated.

Do not re-run proofs recorded in the register or the audits; do not generate `e2e-*` mail; never edit frozen landing files.
