# RESUME_CHECKPOINT — 2026-09-03 (execution mode: FIRST REAL ECOSYSTEM USE)

Supersedes the audit-only checkpoint of the same date (morning). The owner
mandate of 2026-09-03 closed the audit phase; this file is the execution
checkpoint a new session resumes from. Read with
`OWNER_ACTION_QUEUE_2026-09-03.md` (owner gates) and
`PILOT_LANES_2026-09-03.md` (pilot checklists).

Canonical root `C:\Users\Mano\Documents\labourmarketai`, branch `main`.

| Item | Value |
|---|---|
| `main` at last write | `5f64dc24` + #1449 (autovacuum) merged after; verify with `git log origin/main -3` |
| Production | `ae3717e6` verified 07:3x UTC (P2-1 404s, `/llms.txt`, sitemap); later merges (#1449, #1450, #1451) redeploy automatically — verify `/api/health` `build` on resume |
| Production health | **200 ×3** (db 31–328 ms). P0-1 closed for health; `/jobs-sitemap.xml` cold 200 in 1.86 s after VACUUM + covering index; autovacuum thresholds now keep it index-only |
| Applied to prod today (all GREEN, paired rollbacks) | `20260903070000_public_vacancy_board_index_and_count_work_mem_v1` (ledger `20260903070235`) · `20260903090000_public_vacancy_supply_cover_index_v1` (`20260903072912`) · `20260903110000_public_vacancies_autovacuum_v1` (`20260903074823`) · one manual `VACUUM (ANALYZE) public.public_vacancies` |
| Merged today | #1439, #1445, #1447 (first-run router), #1446 (covering index + P2-1), #1449 (autovacuum) |
| Open with auto-merge | **#1450** institution learners section · **#1451** time-to-first-value per actor — merge on green; nothing to apply for either |
| RED drafts (needs-human-gate) | **#1448** (RED batch 2026-09-03 A: supply-counts row + agency offer decision) · #1441 #1440 #1436 #1433 #1430 #1426 #1421 #1355 #1266 #1046 #1045 #897 #896 #895 #883 #740 |
| Temp worktrees | `scratchpad/wt-red` (branch `feat/cc/red-batch-2026-09-03`, PR #1448 open — keep until merged, then `git worktree remove`). Stale `.claude/worktrees/agent-*` predate this session — untouched (owner rule); **run vitest from `apps/web`, never from the repo root**, or they get collected |
| Local processes | none (prod-start preview stopped); browser tab used only for probes — closed at session end |

## Scores (unchanged unless material product state changed)

CORE 78 · COMMERCIAL 35 · FULL_VISION 40 · FULL_VISION_PROD_VERIFIED 24. P0-1/P2-1 closure, the first-run router and the learners section move CORE toward ~80 and PROD_VERIFIED by ~1–2; not recomputed formally (owner: do not spend engineering time on it).

## Actor state (BEFORE → AFTER today)

| Actor | Value chain | Before | After | Prod verified? | Real-user ready? | Blocker | Next action |
|---|---|---|---|---|---|---|---|
| Person / worker | signup → intent → profile → journal → board → interest | worker/company picker only | "I'm looking for work" intent → guided profile | chain PROD_VERIFIED (prior); router deployed (CI green), first real walk = G-1 | YES | G-1 real-inbox proof for e-mail signups | Lane C pilot |
| Employer | signup → company → plain-language need → match → contact/booking | generic dashboard first | "I need workers" → canonical company setup directly | prior proofs; router CI green | YES | none known (#1303 merged) | Lane C |
| Agency | org → roster → client → share → offer → client contact/booking → engagement | hidden role; unclear surface | "I'm a recruiter / agency" → `staffing_agency` company; bridge keyed on companies; client acts via contact/booking | backend PROD_VERIFIED in parts; 0 real rows | YES for first use (explicit decision record = #1448) | none | Lane A pilot; first real agency proves the chain |
| Student | intent → current education → journal → board; institution link | only via institution invite | "I'm a student" → current `worker_education` row + worker identity | router CI green | YES (basic) | student home / Learning Compass MISSING (RED vocabulary + tables) | Track C slice 2 |
| Education institution | org → capability → invite learners → participation | training_provider only by hand | "I represent an institution" → setup declares `training_provider`; **Learners section** (connected count + invitation states) | invite/accept PROD_VERIFIED (prior); #1450 CI | YES (invite + participation) | cohort/program MISSING (RED tables); learner activity out of view by ruling | Track C slice 2 (cohorts as a RED draft; internship demand kind) |

## First autonomous actions on resume

1. Verify production build (`/api/health`) and that #1450/#1451 merged; if not, read their CI logs (product gate is CI-only — local green does not predict `quality`).
2. If the owner replied "Apply batch 2026-09-03 A": apply #1448's two migrations via Supabase MCP in order, verify (cron.job row; `count_public_vacancies_v1()` fast; 4-value CHECK; RPCs present), merge #1448, remove `scratchpad/wt-red`, then register `respond_agency_candidate_offer_v1` + `list_agency_offered_candidates_for_request_v2` in `lib/security/canonical-authenticated-rpcs.ts` and build the client accept/decline UI on the scouting page (`components` next to `ProposeBookingButton`).
3. Track C slice 2 (RED draft for the batch): `programs` / `cohorts` tables + membership, and an `internship` demand kind; GREEN UI with `needs-migration` degradation.
4. Track E: regenerate `agantai/contracts/labourmarket-capability-contract.json` from production facts (read-only) so Agentai's claims track the new SHA; VPS state stays owner-gated (VPS-1).
5. Telegram: scaffold the distribution job (reads public board rows, posts via the owner bot to the channel from TG-1) behind an env flag, default off.

Do not re-run proofs recorded in the register or the audits; do not generate `e2e-*` mail; never edit the frozen landing files (`lib/guards/landing-freeze.ts`).
