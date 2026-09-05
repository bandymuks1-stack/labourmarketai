# RESUME_CHECKPOINT — 2026-09-04 → 05 (Owner Master Execution Contract, MASTER completion orchestrator)

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
| Production | **`169df06f`** (#1518). Vercel Hobby quota hit again 09:20 UTC — `main` deployments of #1519/#1520/#1521/#1522 all "rate limited"; production frozen until the window drains. **Fixed for the future by #1521 (`b9c2905d`)**: `apps/web/vercel.json` `git.deploymentEnabled` = main true / every other branch false — verified: a branch push produced NO Vercel status for 3 min while CI ran; `main` still triggers a deployment (the #1522 merge attempted one). A watcher polls `/api/health` for the first build newer than `169df06f` |
| `main` | **`169df06f`** = production. #1512 Gemini proposer, #1513 confirmation, #1515–#1518 gap-resolution all SERVED. **Walked 08:44–08:52 UTC on `169df06f`**: Gemini proposer PARTIAL (reached in prod — 2 paid `ai_runs` rows — but 2 company paraphrases over-matched by the deterministic router = **D1**); confirmation **FAILED at step 1** (no enable-review chip, raw id `#8cda64` shown = **D2**); gap-resolution PARTIAL (manager side works incl. Gauta/Patikrinta; the person's CHAT side silent while the instructions PAGE shows the rows = **D3**). Root causes + lanes: `MASTER_COMPLETION_MAP_2026-09-05.md` §0/§3. **#1441 Stripe: head `1a24cb1a`, rebased after #1518, MERGEABLE, RED draft — write-owner HANDED OFF; billing = owner gate G-8 + prod acceptance, no second writer** |
| FINAL_DESIGN_STATUS | **READY_FOR_IMPLEMENTATION** (owner handoff 2026-09-05, frozen, Draft 3 does not exist) — contract recorded at `docs/design/final/00-FROZEN-DESIGN-CONTRACT.md` (+ `00-GALUTINE-DIZAINO-SISTEMA.md`, `27-architecture.png`); the visual set 01–27/A1–A4 was NOT delivered, packages are implemented from the text. Package ↔ stage mapping and lanes: `MASTER_COMPLETION_MAP_2026-09-05.md` §4–§5. SAFE PILOT packages: P1 · P2 · P3 · P6-subset |
| Active lanes (one write owner per domain) | **J MERGED** as `dec7877d` (#1522: invitation → the person's brief "E2E Walker UAB kviečia jus" → "mano kvietimai" in 6 languages → accept over `worker.respond-invitation` → the existing SECDEF accepts; no decline invented; QA read-only review = APPROVE, one P3: roster fingerprint keyed by org id not row → queue) · **CONV** = `fix/cc/router-precision-d1` (D1, two files, awaiting its test run) · **P1** `feat/cc/design-p1-public-entry` (running) · **P3** `feat/cc/design-p3-requirement-ledger` (running) · **D2** = PR #1523 `fix/cc/confirm-work-person-name` (auto-merge armed, CI) · **P5/C1 subset** and **P4 Field subset** PAUSED to relieve CPU saturation (worktrees `lane-p5-employer` 16 files / `lane-p4-field` 11 files uncommitted; relaunch from the worktree state when P1/P3/CONV finish) · **D** docs (this) · **S** none (owner gate; #1441 rebased to `d2bdae56`, MERGEABLE). The main checkout `Documents/labourmarketai` sits on the Stripe branch — no lane writes there |
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

1. DONE: J merged (`dec7877d`); D2 = #1523 (CI); D1 = CONV branch in test; D3 reclassified as walk artefacts (chat side proven by screenshots; ratio 1/7). NEXT on the served build after the quota lifts: `walk-confirm-work-prod.cjs` (name = "E2E Worker Two"), the invitation walk (lane J's 7 steps), `walk-gemini-proposer-prod.cjs` (the two paraphrases → project-risk / who-available), gap link 5–6 (click "Vėliau" → reply → the manager's line). QA P3 for the CONV lane's next batch: include the roster row id/created_at in the invitation fingerprint (`lib/invitations/attention.ts:201`); add a behavioural test that the fingerprint never yields `pending` on a read error.
2. After the CONV batch is served: re-run `walk-gemini-proposer-prod.cjs` → `walk-confirm-work-prod.cjs` → `walk-gap-resolution-prod.cjs` + the invitation walk on that SHA; record in the night log. Residue of today's gap walk CLEANED via MCP 09:05 UTC (readiness rows `34a951ff`/`41031748` → `needed` — all 7 rows of E2E Worker Two on `3b9c55d3` are now `needed`, the morning walk's one `received` row included; document `4fa437c5` and instruction message `dd9d717f` deleted).
3. Parallel now (disjoint domains): P3 RequirementLedger read model over `lib/player-card/readiness.ts` (+ "who can help" ranking over existing `training_programs` / `service_offerings`), P6-subset provenance classes derived from `journal_entry_confirmations`, P2 components extending the canonical `PlayerIdentityCard` — chat render places wait for the CONV lane.
4. `walk-outcomes-prod.cjs` (E5) on the served build; `walk-stripe-live-prod.cjs` only after the owner's G-8 block + a real payment.
5. My Space typed-sentence counting + reorder gesture — invisible until #1475 is applied.
6. Real-user watch on every resume: `pilot_events` for profile `875eb16b…` (still `dashboard_viewed` 06:15 UTC 2026-09-04).
7. Residue register (E2E, intentional): project `3b9c55d3` (stage `1885abb7` done; tasks `712182db` todo, `81a07ed1` done; assignment `80883119`; log `01d4a36d`; readiness rows), project `d9af86de` "E2E Kauno objektas (testinis)" (draft; assignment `d6617763` ended). Bookings: none. Document files: none.

## Open owner gates (consolidated, do not re-ask, do not broaden)

- **Apply My Space 2026-09-04** → #1475 (`20260904120000_workspace_pins_v1`).
- ~~**Gemini for the conversation**~~ **CLOSED 2026-09-05** — owner approval recorded; the grant row is in code (task-scoped, paid profile); revoke = delete the row.
- **Transactional e-mail** (`INVITE_EMAIL_PROVIDER`, `INVITE_EMAIL_API_KEY`, `INVITE_EMAIL_FROM`): invitations and instructions are stored, not e-mailed; the chat says so.
- **Public programme projection** (institution + programme names readable by workers).
- **Verified positive internship company**.
- ~~Journal review v4 hold~~ — NOT a gate on the canonical chain (see queue 3); the legacy `company_workers.journal_review_enabled` path stays refused by 0031 and is not used.
- **Vercel plan**: Hobby limits recur under bursts; no purchase, no probing pushes.
- RED drafts unchanged (all behind main, none rebased on purpose): #1496 #1475 #1441 #1440 #1436 #1433 #1430 #1426 #1421 #1355 #1266 #1046 #1045 #897 #896 #895 #883 #740; parked design PRs #1225 #1211 #1166. DEV-1 and Docker Desktop are owner-machine actions.
