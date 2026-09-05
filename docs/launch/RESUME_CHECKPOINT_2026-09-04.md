# RESUME_CHECKPOINT — 2026-09-04 → 05 (Owner Master Execution Contract, autonomous mode)

> State table, not an essay (contract §35). Rewritten in place as the queue
> moves. Authority: [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) §5.5 →
> [`docs/product/OWNER_MASTER_EXECUTION_CONTRACT_2026-09-04.md`](../product/OWNER_MASTER_EXECUTION_CONTRACT_2026-09-04.md).
> Execution change (owner, 2026-09-05): batch by CONNECTED JOURNEY → one
> implementation batch → local/CI verification → ONE merge/deploy → ONE
> production walk over the journey; a read-only sentence is NOT a batch — the
> journey ends in a canonical corrective action, persisted and read back.
> Previous checkpoint: `RESUME_CHECKPOINT_2026-09-03.md`.

## State

| Item | Value |
|---|---|
| Production | **`fc579348`** (#1511 squash, 05:04 UTC 2026-09-05) — **FROZEN AGAIN**: #1512 merged 05:37 UTC and Vercel created NO production deployment (the Hobby limit, as at 22:57 UTC the night before). `main` is ahead of production; when the limit lifts, ONE push (or the owner's Redeploy) serves the newest main and the queued walks run against that SHA; read `https://labourmarket.ai/api/health` `.build` before ANY walk. The Vercel Hobby limit hit 22:57 UTC 2026-09-04 lasted hours, not 24 h — never push to test it |
| `main` | #1467–#1474 · #1476–#1509. **#1510 merged → production `f8db65b4` (04:47 UTC); the READINESS journey walk PASSED on it (ask → state → seed 7 rows → received → instruction → the person's brief).** #1511 landing honesty (prod `fc579348`); **#1512 Gemini proposer MERGED 05:37 UTC (`7313e70e`, not served yet — PENDING_PROD_PROOF: `walk-gemini-proposer-prod.cjs`)**. Next PR, ONE push: **`feat/cc/confirmation-journey`** (§14 confirm-work over the inbox's one-tap confirm + the membership review RPC; the RU landing spec's retired-label fix) → auto-merge; its proof `walk-confirm-work-prod.cjs` rides the same single deploy. RED draft: **#1475** My Space table (owner gate) |
| Prod-proven 2026-09-05 (E2E identities) | on `5e12348d`: #1503 stage by sentence · #1504 task title · #1502 document FILE (cleaned). On `d11e7d54`: #1505 "2 darbuotojai atsakė į jūsų rezervacijų pasiūlymus" after the QA worker's decline in the chat (booking deleted) · #1506 what-if move Vilnius → Kaunas → restore (as found) · #1508 CSV download. On `91770caa`: #1509 "užduotis sumontuoti pastolius atlikta" → `work_tasks 81a07ed1` = done (resolved 04:26:10 UTC) · "kuris projektas rizikoje?" → two project lines whose numbers = MCP counts. Details: `pilot-feedback/2026-09-05-night-continuation.md` |
| Active P0 chain | PROJECT journey: create → assign → log with project → pulse → task → capacity → stage → what-if move → RESULT by sentence → RISK by sentence (all prod-proven) → **READINESS journey** (#1510, PROD-PROVEN 04:49–04:51 UTC): "kas trūksta projektui X?" → per-person facts from the operations centre's own read → chips that WRITE over the ONE dispatcher (start the checklist · mark a row received · ask the person = a work instruction) → the same read again → the person's brief says "Laukia nurodymų: N." → next: §14 approval by sentence over `requestTaskApprovalAction` |
| Gemini / LLM runtime (owner check 2026-09-05) | **Implemented and LIVE in prod** (`lib/ai/runtime`, gemini adapter, model `gemini-3.5-flash-lite`; `AI_PROVIDER_MODE=live` + key evidenced by real paid `ai_runs` rows, last 2026-08-29, task `explain_market_demand` — the only `PUBLIC` task). **The conversation does NOT reach Gemini**: the router is deterministic by design, `unknown` → canned fallback; no conversation task exists. A typed sentence is `SENSITIVE_FREE_TEXT`; `AI_EGRESS_GRANTS` is EMPTY **by owner decision** (free tier may never receive personal data). **APPROVED and BUILT 2026-09-05** ("OWNER APPROVAL — GEMINI CONVERSATION NLU EGRESS"): ONE task-scoped grant row in `data-egress.ts` (`tasks: ["propose_conversation_intent"]`, dated, sourced, revocable by deleting the row); the shape below is now the implementation (branch `feat/cc/gemini-conversation-proposer`, PENDING_PROD_PROOF): LLM proposes ONLY an existing `INTENT_REGISTRY` id → the SAME handlers → `authorizeDispatch` → executor; the deterministic router stays the floor |
| Standing constraints | **Scale rule (owner 2026-09-05, contract §1b, ARCHITECTURE §5.5 row): permanent, system-wide** — every layer must scale to ≥1M people and the far larger graph they create without rebuilding the canonical architecture; bounded reads, indexes, pagination, no N+1, RLS never weakened, LLMs get minimum authorized context; applied silently; no scale module; escalate only a redesign-level blocker or a paid capacity decision |
| Real recruiter account | admin of "Labour market ai Sp. z o.o". Last event `dashboard_viewed` 06:15 UTC 2026-09-04. **REAL_RECRUITER_USED_PRODUCT = FALSE** |
| Real institution | none. **REAL_EDUCATION_INSTITUTION_USED_PRODUCT = FALSE** |
| Local stack | Docker dead → `LOCAL_DOCKER_UNAVAILABLE`; verification = unit/guards/typecheck/lint/build + CI + prod walks with `e2e-*` identities. Walk scripts (37) in the session scratchpad `…/36b83d75-…/scratchpad/walks/`; `curl` denied — `node -e fetch`. Python patch scripts must be FILES (stdin mis-decodes non-ASCII on this box) |
| Known local-only red | `lib/guards/opportunity-type-internship.test.ts` (2) — CRLF working copy; green in CI |
| Uncommitted local-only | `.claude/launch.json`, `supabase/config.toml` — harness, never commit; `git rebase --autostash` / stash them before `checkout -b` |

## Ordinary-human-usable vs technically proven (honest)

| Actor | Usable by sentence in prod (`91770caa`) | Still missing |
|---|---|---|
| Worker | find work, log work (with project), CV, documents + gaps + the FILE in the thread; attention: expiring / missing documents; "mano projektai"; booking answer in the chat; closing their own task by sentence | training suggestion for a skills gap (**owner gate**: public programme projection) |
| Employer | need → demand → candidates → contact/booking from the chat; the greeting says when workers ANSWERED; project by sentence, people assigned, a task (clean title + due), capacity, a stage, what-if move + confirm, task RESULT, "which project is at risk?", figures + CSV | §14 CONFIRMATION journey (work → evidence → employer confirmation → verified capability → identity) |
| Agency | whole chain by sentence; attention lines; the CLIENT decides on the offer by sentence | e-mail delivery (**owner gate**) |
| Institution | programme / cohort / learner invitation / assignment / list; attention; learner OUTCOMES | e-mail delivery (**owner gate**) |
| Student | compass; internships narrowed, absent type named | positive internship proof (**owner decision**: verified company) |
| Everyone | My Space pin/unpin/reorder/ask — code only until #1475 is applied; conversation understood by the deterministic router only (LLM fallback **owner gate**) | — |

## Queue (contract §33; next automatic step first)

1. DONE 04:51 UTC — readiness walk on `f8db65b4`: 7 rows (6 `needed`, 1 `received`), instruction `406a576d` (deleted after readback), the person's brief "Laukia nurodymų: 1."
2. When production serves the newest main (read `/api/health`): `EXPECT_BUILD=<sha> node walk-gemini-proposer-prod.cjs` (acceptance 1–8; MCP: `ai_runs` task `propose_conversation_intent`, `pilot_events.metadata.resolution`) THEN `walk-confirm-work-prod.cjs` (§14: enable review → confirm entry `01d4a36d` → the person's card; MCP: engagement `90da8c16` review on, `journal_entry_confirmations`, `worker_skills.verified`). Record both in the night log. Do NOT push to trigger the deploy.
3. BUILT (branch `feat/cc/confirmation-journey`, PR next): §14 CONFIRMATION over the EXISTING canonical chain — the inbox's one-tap confirm (`confirm_entry_and_verify_skills`) + `set_engagement_journal_review`; the recorded "journal review v4 hold" was the LEGACY roster RPC, not the canonical engagement flag (4 engagements already reviewable in prod). After proof: the worker-side attention line for a fresh confirmation (only from a canonical read, no noise) and the checklist ↔ document-type bridge (design first — a mapping is a new structure).
4. My Space typed-sentence counting + reorder gesture — invisible until #1475 is applied.
5. Real-user watch on every resume: `pilot_events` for profile `875eb16b…`.
6. Residue register (E2E, intentional): project `3b9c55d3` (stage `1885abb7` done; tasks `712182db` todo, `81a07ed1` done; assignment `80883119`; log `01d4a36d`; readiness rows after the walk), project `d9af86de` "E2E Kauno objektas (testinis)" (draft; assignment `d6617763` ended). Bookings: none. Document files: none.

## Open owner gates (consolidated, do not re-ask, do not broaden)

- **Apply My Space 2026-09-04** → #1475 (`20260904120000_workspace_pins_v1`).
- ~~**Gemini for the conversation**~~ **CLOSED 2026-09-05** — owner approval recorded; the grant row is in code (task-scoped, paid profile); revoke = delete the row.
- **Transactional e-mail** (`INVITE_EMAIL_PROVIDER`, `INVITE_EMAIL_API_KEY`, `INVITE_EMAIL_FROM`): invitations and instructions are stored, not e-mailed; the chat says so.
- **Public programme projection** (institution + programme names readable by workers).
- **Verified positive internship company**.
- ~~Journal review v4 hold~~ — NOT a gate on the canonical chain (see queue 3); the legacy `company_workers.journal_review_enabled` path stays refused by 0031 and is not used.
- **Vercel plan**: Hobby limits recur under bursts; no purchase, no probing pushes.
- RED drafts unchanged (all behind main, none rebased on purpose): #1496 #1475 #1441 #1440 #1436 #1433 #1430 #1426 #1421 #1355 #1266 #1046 #1045 #897 #896 #895 #883 #740; parked design PRs #1225 #1211 #1166. DEV-1 and Docker Desktop are owner-machine actions.
