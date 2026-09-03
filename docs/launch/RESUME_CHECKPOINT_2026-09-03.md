# RESUME_CHECKPOINT — 2026-09-03 (execution mode: FIRST REAL ECOSYSTEM USE)

Supersedes the audit-only checkpoint of the same date (morning). The owner
mandate of 2026-09-03 closed the audit phase; this file is the execution
checkpoint a new session resumes from. Read with
`OWNER_ACTION_QUEUE_2026-09-03.md` (owner gates) and
`PILOT_LANES_2026-09-03.md` (pilot checklists).

Canonical root `C:\Users\Mano\Documents\labourmarketai`, branch `main`.

| Item | Value |
|---|---|
| `main` SHA | `ae3717e6` (#1446) — after #1439, #1445, #1447, #1446 merged today |
| Production | `4cb8ed59` (#1445) at 07:31 UTC; Vercel deploying `ae3717e6` — verify `/api/health` `build` on resume |
| Production health | **200 ×3** (db 31–328 ms) since #1445 + the two applied migrations. P0-1 closed for health; `/jobs-sitemap.xml` cold path now index-only (~640 ms) and 503+Retry-After on any transient failure |
| Applied to prod today | `20260903070000_public_vacancy_board_index_and_count_work_mem_v1` (ledger `20260903070235`) · `20260903090000_public_vacancy_supply_cover_index_v1` (ledger `20260903072912`) — both GREEN, paired rollbacks in `supabase/rollbacks/` |
| Open PR with auto-merge | none pending (all GREEN PRs merged) |
| RED drafts (needs-human-gate) | **#1448** (RED batch 2026-09-03 A: supply-counts row + agency offer decision) · #1441 #1440 #1436 #1433 #1430 #1426 #1421 #1355 #1266 #1046 #1045 #897 #896 #895 #883 #740 |
| Temp worktrees | `scratchpad/wt-red` (branch `feat/cc/red-batch-2026-09-03`, PR #1448 open — keep until merged, then `git worktree remove`). wt-1439 and wt-p0 removed after merge (4 checks clean). Stale `.claude/worktrees/agent-*` (4) predate this session — untouched (owner rule), but they pollute vitest collection when run from the wrong root |
| Local processes | none (prod-start preview stopped; browser tab open only for probes — close on exit) |

## Scores (unchanged unless material product state changed)

CORE 78 · COMMERCIAL 35 · FULL_VISION 40 · FULL_VISION_PROD_VERIFIED 24. P0-1/P2-1 closure and the first-run router move CORE toward ~80 and PROD_VERIFIED by ~1; not recomputed formally (owner: do not spend engineering time on it).

## Actor state (BEFORE → AFTER today)

| Actor | Value chain | Before | After | Prod verified? | Real-user ready? | Blocker | Next action |
|---|---|---|---|---|---|---|---|
| Person / worker | signup → intent → profile → journal → board → interest | worker/company picker only | "I'm looking for work" intent → guided profile | chain PROD_VERIFIED (prior); router deployed with `ae3717e6` (verify) | YES | G-1 real-inbox proof for e-mail signups | Lane C pilot |
| Employer | signup → company → plain-language need → match → contact/booking | generic dashboard first | "I need workers" → canonical company setup directly | prior proofs; router verify | YES | headcount in non-English (#1303) | Lane C |
| Agency | org → roster → client → share → offer → booking → engagement | hidden role; unclear surface | "I'm a recruiter / agency" → `staffing_agency` company; bridge keyed on companies; client acts via contact/booking | backend PROD_VERIFIED in parts; 0 real rows | YES for first use (decision record = #1448) | none | Lane A pilot; prove chain with one real agency |
| Student | intent → current education → journal → board; institution link | only via institution invite | "I'm a student" → current `worker_education` row + worker identity | router verify | YES (basic) | student home / Learning Compass MISSING | Track C slice 2 |
| Education institution | org → capability → invite learners → participation | training_provider only by hand | "I represent an institution" → setup with `training_provider` declared | invite/accept PROD_VERIFIED (prior); router verify | YES (invite + status at /dashboard/network) | learner-activity view limited by the least-privilege ruling; cohort/program MISSING (RED tables) | Track C slice 1 (learners section on the education-first home) |

## First autonomous actions on resume

1. Verify production is on `ae3717e6` (`/api/health` build) and run the P2-1 probe: `/foo-control.xml` → 404 (root not-found), `/llms.txt` → 200, `/jobs-sitemap.xml` → 200. Record in the register.
2. Walk the first-run router once on production with a bounded identity per intent (5 signups are NOT needed — one identity can be re-onboarded only once; use the existing E2E identities where onboarding is incomplete, otherwise verify the wizard renders the five cards and the student fields via the browser).
3. If the owner replied "Apply batch 2026-09-03 A": apply #1448's two migrations via Supabase MCP in order, verify (cron.job row; `count_public_vacancies_v1()` fast; 4-value CHECK), merge, then register `respond_agency_candidate_offer_v1` + `list_agency_offered_candidates_for_request_v2` in `lib/security/canonical-authenticated-rpcs.ts` and build the client accept/decline UI on the scouting page.
4. Track C slice 1 (GREEN): education-first home "Learners" section = sent student invitations by status + count of linked `student` contexts (`manages_organization` RLS) — no learner personal data (least-privilege ruling 2026-08-27).
5. Time-to-first-value reader (GREEN): admin readiness page computes per-actor TTFV from existing `pilot_events` (signup_completed → first of journal_entry_saved / demand_saved / service_request_sent / booking_proposed / contact_requested) until the new events accumulate.
6. Track E: regenerate `agantai/contracts/labourmarket-capability-contract.json` from production facts (owner PC, read-only against prod) so Agentai's marketing claims track the new SHA; VPS state remains owner-gated (VPS-1).

Do not re-run proofs recorded in the register or the audits; do not generate `e2e-*` mail.
