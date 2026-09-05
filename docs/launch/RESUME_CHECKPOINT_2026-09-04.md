# RESUME_CHECKPOINT — 2026-09-04 → 05 (Owner Master Execution Contract, autonomous mode)

> State table, not an essay (contract §35). Rewritten in place as the queue
> moves. Authority: [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) §5.5 →
> [`docs/product/OWNER_MASTER_EXECUTION_CONTRACT_2026-09-04.md`](../product/OWNER_MASTER_EXECUTION_CONTRACT_2026-09-04.md).
> Execution change (owner, 2026-09-05 morning): batch by CONNECTED JOURNEY →
> one implementation batch → local/CI verification → ONE merge/deploy → ONE
> production walk over the journey. No micro-PR factory; no pushes only to
> trigger deployments. Previous checkpoint: `RESUME_CHECKPOINT_2026-09-03.md`.

## State

| Item | Value |
|---|---|
| Production | **`d11e7d54`** = tip of `main` (#1508 squash, served 03:23 UTC 2026-09-05). The Vercel Hobby rate limit hit 22:57 UTC 2026-09-04 lasted hours, not 24 h: `5e12348d` (#1504) was served by 03:17 UTC. Read `https://labourmarket.ai/api/health` `.build` before ANY walk; never push to test the limit |
| `main` | #1467–#1474 · #1476–#1508. Open GREEN: **`feat/cc/project-journey-result-risk`** (PROJECT journey batch: task RESULT + project RISK by sentence; rebased on `d11e7d54`; typecheck/lint/build/guards green locally) → PR + auto-merge → ONE deploy → `walk-task-status-prod.cjs` + `walk-project-risk-prod.cjs`. RED draft: **#1475** My Space table (owner gate) |
| Prod-proven on the served SHA (2026-09-05, E2E identities) | #1503 stage by sentence (`project_stages 1885abb7` = done) · #1504 task title without deadline tail (`work_tasks 81a07ed1`) · #1502 document FILE in the thread (`document_files 5b5f449e` v1 → cleaned) — all on `5e12348d`, modules byte-identical on `d11e7d54`; #1505 employer greeting "2 darbuotojai atsakė į jūsų rezervacijų pasiūlymus" after the QA worker's decline in the chat (`booking_requests 5ddba5d1` declined → deleted) · #1506 what-if move Vilnius → Kaunas (`d6617763`, ended) → restore (Vilnius `80883119` active, as found) · #1508 "paruošk ataskaitą" → 2 CSV chips → real download (`operations-e2e-kauno-objektas-testinis.csv`, 11-column header) — all on `d11e7d54`. Details: `pilot-feedback/2026-09-05-night-continuation.md` |
| Active P0 chain | PROJECT journey from real state: create → assign → worker log with project_id → pulse → task by sentence → capacity → stage by sentence → what-if move → **RESULT by sentence (task done/started/blocked, manager OR assignee) → RISK by sentence (which project needs someone)** (branch above, PENDING_PROD_PROOF) → next rung: per-person READINESS by sentence with "who can help" (§12/§16) → §14 confirmation (approval by sentence) |
| Real recruiter account | admin of "Labour market ai Sp. z o.o". Last event `dashboard_viewed` 06:15 UTC 2026-09-04 — no event since. **REAL_RECRUITER_USED_PRODUCT = FALSE** (real-user evidence pending; not permission to impersonate) |
| Real institution | none yet. **REAL_EDUCATION_INSTITUTION_USED_PRODUCT = FALSE** — chain prod-proven with the E2E institution only |
| Local stack | Docker Desktop dead → `LOCAL_DOCKER_UNAVAILABLE`; verification = unit/guards/typecheck/lint/build + CI + prod walks with bounded `e2e-*` identities. Walk scripts (35) live in the session scratchpad `…/36b83d75-…/scratchpad/walks/` (copied from the 68d7e1bc session); `curl` denied — use `node -e fetch` |
| Known local-only red | `lib/guards/opportunity-type-internship.test.ts` (2 tests) — CRLF working copy of an LF migration; passes in CI |
| Uncommitted local-only | `.claude/launch.json` (`dev-local`), `supabase/config.toml` (553xx ports) — harness, never commit; `git rebase --autostash` |

## Ordinary-human-usable vs technically proven (honest)

| Actor | Usable by sentence in prod (`d11e7d54`) | Still missing |
|---|---|---|
| Worker | find work, log work (with project), CV, documents + gaps + the FILE in the thread; attention: expiring / missing documents; "mano projektai"; booking answer in the chat | closing a task by sentence (branch, PENDING_PROD_PROOF); training suggestion for a skills gap (**owner gate**: public programme projection) |
| Employer | need → form → demand → candidates → contact/booking from the chat panel; the greeting says when workers ANSWERED; a project by sentence, people assigned, a task by sentence (clean title + due), capacity, a stage by sentence, what-if move + confirm, figures + CSV export | task RESULT + "which project is at risk?" (branch, PENDING_PROD_PROOF); per-person readiness with "who can help"; approval by sentence (§14) |
| Agency | whole chain by sentence; attention lines; the CLIENT decides on the offer by sentence | e-mail delivery (**owner gate**) |
| Institution | programme / cohort / learner invitation / assignment / list; attention; learner OUTCOMES block | e-mail delivery (**owner gate**) |
| Student | compass; internships narrowed, absent type named, visible dimension listed | positive internship proof needs a VERIFIED company's demand (**owner decision**) |
| Everyone | My Space pin/unpin/reorder/ask — code only until #1475 is applied | — |

## Queue (contract §33; next automatic step first)

1. Push `feat/cc/project-journey-result-risk` ONCE → PR → `gh pr merge --auto --squash` → after merge read `/api/health` → `EXPECT_BUILD=<sha> node walk-task-status-prod.cjs` (expect: the chat ASKS between the two "sumontuoti pastolius" tasks → exact-title chip → "Užduotis pažymėta atlikta." → `work_tasks 81a07ed1` = done, `712182db` stays todo) then `walk-project-risk-prod.cjs` (expect the Vilnius line's numbers = MCP counts: people 1, open tasks 1, overdue 0, blocked stages 0). Record in the night log; flip PENDING_PROD_PROOF.
2. Next PROJECT rung (same journey, next batch): "kas trūksta projektui X?" → per assigned person: unchecked readiness items + missing documents by name (operations centre's `WorkerOps`) → chips: the person's documents, "kas laisvas?", training/provider where known (§12/§16 continue after the gap). Then §14 approval by sentence over `requestTaskApprovalAction` (workflow engine).
3. My Space: typed-sentence usage counting (intent → chip ref map exists in `pin-usage-from-intent.ts`); reorder gesture. Blocked for visibility by #1475 (owner apply).
4. Real-user watch on every resume: `pilot_events` for profile `875eb16b…`.
5. Residue register (E2E, intentional): project `3b9c55d3` (stage `1885abb7` done; tasks `712182db` todo, `81a07ed1` todo→done after the walk; assignment `80883119`; log `01d4a36d`), project `d9af86de` "E2E Kauno objektas (testinis)" (second project for move walks; assignment `d6617763` ended). Bookings: none. Document files: none.

## Open owner gates (consolidated, do not re-ask, do not broaden)

- **Apply My Space 2026-09-04** → #1475 (`20260904120000_workspace_pins_v1`): one reference table, owner-only RLS, `grant … to authenticated` only. Until applied the chat shows no row and no ask.
- **Transactional e-mail** (`INVITE_EMAIL_PROVIDER`, `INVITE_EMAIL_API_KEY`, `INVITE_EMAIL_FROM` in Vercel prod env): every invitation is stored, not sent; the chat says so.
- **Public programme projection** (institution + programme names readable by workers) for "who can help" on a skills gap.
- **Verified positive internship company**: verifying an E2E company exposes test demands to real workers.
- **Journal review v4 hold** (`journal_review_enabled`).
- **Vercel plan**: Hobby limits recur under bursts; a paid-plan decision is the owner's — no purchase, no probing pushes.
- RED drafts unchanged (all behind main, none rebased on purpose): #1496 #1475 #1441 #1440 #1436 #1433 #1430 #1426 #1421 #1355 #1266 #1046 #1045 #897 #896 #895 #883 #740; parked design PRs #1225 #1211 #1166. DEV-1 and Docker Desktop are owner-machine actions.
