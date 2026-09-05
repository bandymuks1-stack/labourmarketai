# Night continuation 2026-09-04 → 2026-09-05 — journeys, not rungs

All proofs with E2E identities on production (`labourmarket.ai`), never the real user. ENTRY → REQUEST → ACTION → PERSISTED → DEPENDENT STATE → NEXT.

## WORKER — "mano projektai" from the person's side (#1499, prod `e535971d`)

- ENTRY: chat, E2E Worker Two (assigned to project `3b9c55d3`).
- REQUEST: "mano projektai".
- ANSWER: "Jūsų projektai (1 aktyv.): • E2E Vilniaus objektas (testinis) — Vilnius" + "Atidaryti: …" chip (screenshot `walk-worker-project/60-worker-projects.png`).
- DEPENDENT STATE: "ką turiu padaryti šiandien?" lists the worker's own journal line for that project.
- First run on a cold deploy showed the typing indicator at the 9 s mark — the walk now waits for the answer text; not a product defect.

## PROJECT → PROGRESS — a stage by sentence (#1500, prod `02e4476c`) — DEFECT FOUND, FIXED (#1503)

- ENTRY: operations page (visual side) — stage "Pamatai" added on project `3b9c55d3` (row `1885abb7`, `planned`).
- REQUEST (chat): "etapas pamatai baigtas".
- OBSERVED: "Etapo būsenos pakeisti nepavyko" — twice, on two runs.
- DIAGNOSIS without a local stack: `pilot_events` carries `chat_intent_recognized` (stage-status) but **no** `chat_action_attempted` → the dispatcher never reached the executor; postgres logs show no RPC error. Cause: `company.update-stage-status` is `reversible_write`; `prepareConfirmationAction` answers `no_confirmation_needed`, and the chat treated every `!prep.ok` as failure. The write never ran.
- FIX: #1503 — accept that answer, dispatch without a token; guard `confirmation-tier-honesty.test.ts` scans every literal `prepareConfirmationAction("…")` call site (the candidates panel already gated on `needsToken`).
- NEXT: re-walk `walk-stage-prod.cjs` on the #1503 build (chain armed).

## WORKER — the document FILE without leaving the chat (#1501 + #1502)

- #1501: ONE worker-document file write (`uploadWorkerDocumentFileCore`) shared by the documents page (redirect-with-notice) and the chat (`uploadWorkerDocumentFileForChatAction` → `{ notice }`). Guard: single `scope: "worker"` call site; the core is not an exported action.
- #1502: after "turiu naują A1 pažymą iki 2027-03-31" records the row, the chat asks the page's own file layer (`listMyDocuments` + `getWorkerDocumentFiles`) and, only when it answers, offers the file in the thread (`DocumentFileEmbed`: PDF/Word/photo ≤ 5 MB; the core's real notice; readiness re-answers after "uploaded"). Eleven catalogues carry real copy.
- PROOF: `walk-document-file-prod.cjs` (chain armed for the #1502 build; blob removed with `CLEANUP=1`, `document_files` row deleted via MCP afterwards) — result recorded below when it lands.

## EMPLOYER — contact / proposal FROM THE CHAT PANEL (S → P on `02e4476c`)

- ENTRY: chat, E2E Walker UAB → "parodyk kandidatus" → the Suvirintojas demand's candidates (4 rows; 1 contactable, 2 "cannot contact" said honestly, 1 already accepted).
- ACTION: candidate row expanded → "Pasiūlyti rezervaciją" → start 2026-09-11 / end 2026-09-25 / note → submit through the ONE dispatcher (`company.propose-booking`, important tier, token minted).
- PERSISTED: `booking_requests 910c138a` `proposed` (worker `2b7213f7`, the QA test worker — the only contactable candidate; the e2e proof worker was correctly "cannot contact").
- DECISION: the worker's decline in the chat — walk running with the QA test identity; row deleted via MCP afterwards (no engagement residue by design).

## Employer polish (in flight)

- "pridėk užduotį projektui: sumontuoti pastolius iki 2026-10-03" pre-filled the title WITH its deadline tail; `stripEndDatePhrase` removes exactly the phrase the parser read (numeric or a known month word; "iki pietų" stays). Branch `fix/cc/task-title-deadline-tail`.

## Residue (E2E, recorded)

- project `3b9c55d3` with stage `1885abb7`, assignment `80883119`, log `01d4a36d`, task `712182db` (earlier); booking `910c138a` (to delete after the decline walk); document file for E2E worker2's A1 row (blob removed by the walk; row via MCP).

## PROJECT — the §11 WHAT-IF move, built (branch `feat/cc/project-move-what-if`; not live until the Vercel freeze lifts)

- ENTRY: chat, company identity — "perkelk Joną į projektą Y" / "move John to project Riga" / "переведи Ивана на проект Рига" / "verplaats Jan naar project Utrecht" / "versetze Jan in das Projekt Berlin" (intent `move-worker`, write).
- RESOLVE: the person and the destination against the company's REAL projects and ACTIVE assignments (`loadProjectMoveOptionsForChat` over the operations centre's own read); what the sentence leaves open is asked with chips built from those rows.
- WHAT-IF (nothing written): `loadProjectMoveWhatIfForChat` — X: people N → N−1, the person's OPEN work packages that stay on X, X's readiness checklist checked/total for them; Y: people M → M+1, the checklist starts 0/N there, absences inside Y's dates (or "no dates" / "leave model does not answer", said), country change. Ends with "nothing has changed yet — only your confirmation will".
- COMMIT: the confirm chip only — `company.move-worker` (strong tier, token) = assign to Y (`assign_worker_to_project`) THEN end X (`end_worker_project_assignment`); a failed second step is reported as "on both projects — finish it in the panel". The destination project re-opens in the panel.
- Guard `move-worker-intent.test.ts`: routes in 5 locales; the what-if module has no table/RPC/write; the executor's order; the chat's chip order; real copy in 11 catalogues.
- Vercel production freeze: the walk (`walk-move-prod.cjs`, to be written for E2E Walker UAB with a second project) runs after the reset.

## REPORT — §19 EXPORT by sentence (branch `feat/cc/figures-csv-export`)

- "paruošk ataskaitą" (intent `figures`) answers the organisation's figures as before and now offers up to three `download:` chips — the project operations CSV the operations page already serves (`/dashboard/projects/<id>/operations/report`, manager role + RLS re-checked in the route). The chat treats a `download:` chip as a file (full navigation), never as a page. No report store of its own. Guard `lib/ai-workspace/figures-export.test.ts`.

## Morning 2026-09-05 — the freeze was shorter than 24 h; the served-SHA proofs

- 03:17 UTC: production served `5e12348d` (#1504), not `02e4476c` as the night checkpoint said — Vercel had let #1502–#1504 through. Three queued walks ran against that served build, no deploy spent:
  - `walk-stage-prod.cjs` → "etapas pamatai baigtas" → "Etapas pažymėtas atliktu."; `project_stages 1885abb7` = `done` at 03:19:23 UTC. **#1503 prod-proven.**
  - `walk-task-prod.cjs` → the form pre-filled title `sumontuoti pastolius` / due `2026-10-03` (no deadline tail); saved as `work_tasks 81a07ed1` (`todo`); the pulse said "Užduotys 2 atvirų". **#1504 prod-proven.** Residue: that second task on project `3b9c55d3` (the older `712182db` keeps its long title).
  - `CLEANUP=1 walk-document-file-prod.cjs` → the sentence's form → the file offered in the thread → uploaded → read back as the worker: `document_files 5b5f449e` v1 (241 B PDF) on document `beeb0ce6` → blob removed by the walk, row deleted via MCP. **#1502 prod-proven**, zero residue.
- #1508 (CSV export) had a real MERGE CONFLICT with #1506 on THIS log file only (both appended a section); resolved keeping both, guards/typecheck/lint/build green locally, auto-merge re-armed → merged 03:23 UTC → **production moved to `d11e7d54`** (main tip). The remaining queued walks (#1505 employer "answered", #1506 what-if move + restore, #1508 CSV) run against that served SHA — results below when they land.
- On `d11e7d54` (04:03–04:10 UTC), the consolidated sequence for the rest of the queue:
  - **#1505 EMPLOYER — "workers answered".** `walk-employer-proposal-prod.cjs` (QA worker `qa.worker+multiw`): "parodyk kandidatus" → 4 rows (1 contactable, 1 "cannot contact" said) → booking proposed from the card (`booking_requests 5ddba5d1`, 2026-09-12 → 09-26) → the worker's "ką man siūlo?" on a phone viewport → Priimti / Atmesti → **declined** ("Atmetei") → the employer's next greeting: "2 darbuotojai atsakė į jūsų rezervacijų pasiūlymus." (§4D WHAT CHANGED). Row deleted via MCP afterwards — no engagement residue. (The script's last `log` referenced `workerId` out of scope → a cosmetic `WALK_FAILED` after all evidence was logged; fixed for next time.)
  - **#1506 PROJECT — what-if move, there and back.** `walk-move-prod.cjs`: "perkelk E2E Worker Two į projektą E2E Kauno objektas (testinis)" (second project created by sentence once, `d9af86de`) → what-if lines → "Perkelti" → "Perkelta: priskirtas naujam projektui" + the destination in the panel; `RESTORE=1` the same way back. Readback: Kaunas assignment `d6617763` **ended** (04:06:35 UTC); Vilnius `80883119` **active** with its original `assigned_at` — production as found.
  - **#1508 REPORT — CSV by sentence.** `walk-figures-csv-prod.cjs`: "paruošk ataskaitą" → figures + 2 chips ("Atsisiųsti CSV: E2E Kauno / E2E Vilniaus …") → a real download `operations-e2e-kauno-objektas-testinis.csv`, header `worker_name,operational_status,readiness,declared_skills,confirmed_skills,work_evidence_entries,open_review_items,docs_missing,docs_received,docs_checked,…` (the operations page's own route). Nothing kept.
- Reconciliation of open branches (owner item B): every open PR is a RED draft (`needs-human-gate`) or a parked design PR (#1166/#1211/#1225, 275 commits behind); nothing mergeable is waiting; none was rebased (a push per RED draft would only spend deployments).

## PROJECT journey batch — WORK → RESULT and PROGRESS/RISK by sentence (branch `feat/cc/project-journey-result-risk`)

One branch, two connected rungs of the same journey, over the SAME dispatcher and reads — not two PRs.

- **§14 WORK PERFORMED → RESULT.** "užduotis sumontuoti pastolius atlikta" / "pradėjau užduotį …" / "užduotis užstrigo" (LT · EN · DE · NL · RU · PL) → intent `task-status` (write) → the REAL open tasks the person may close (`loadOpenTasksForChat`: `listMyTasks` + the company's projects' `listProjectTasks`) → one match runs, several ask with one chip each (`task:<project>:<task>:<status>`), none is said → `company.update-task-status` (`reversible_write`, token-less, the same `no_confirmation_needed` rule as the stage) → **the ONE status core** `setWorkTaskStatusCore` that the tasks page's own control now calls too (§5.5; `set_work_task_status_v2` → v1 fallback; refuses to leave `done`/`cancelled`). The WORKER who was given the task may close it: the RPC re-derives creator / assignee / project manager, so the row's role gate is the union `company · agency · worker` — named as the ONE exception in `company-executors.test.ts`. A company re-opens the project (pulse: one open task fewer); a person is offered "Užrašyti darbą" (WORK → JOURNAL → EVIDENCE).
- **§11/§16 PROGRESS / READINESS / RISK.** "kuris projektas rizikoje?" / "kaip sekasi projektams?" / "projektų būklė" (6 locales) → intent `project-risk` (read) → `loadProjectRiskForChat`: the company's live projects × the panel's OWN detail read (`loadProjectDetailForResult`: roster, pulse, stages) → one line per project: people; open / overdue tasks; blocked stages; people missing documents; readiness checked/total; "aktyvus projektas be žmonių" → ordered by the COUNT of real signals (never a score/percent/colour — the contract guard forbids such a field) → chips: open the project (≤3), invite people when a live project has nobody. An unreadable pulse is said as such.
- Guards `task-status-intent.test.ts`, `project-risk-intent.test.ts`; intent registry 58 → 60; behaviour census 45 → 46; `work-tasks.test.ts` reads the core. Typecheck / lint / build green; 918 conversation-layer tests; the only local red is the known Windows-CRLF migration guard.
- Walks written for the served build after merge: `walk-task-status-prod.cjs` (two open tasks share the stem → the chat ASKS → the exact-title chip → `work_tasks 81a07ed1` = `done`; `712182db` stays `todo`) and `walk-project-risk-prod.cjs` (the line's numbers must equal the MCP counts at walk time).
- **#1509 merged 04:2x UTC → production `91770caa`; both walks PASSED on it.** "užduotis sumontuoti pastolius atlikta" resolved DIRECTLY (only the exact title is contained in the sentence — the long-titled twin is not, so no ask was needed) → "Užduotis pažymėta atlikta." → `work_tasks 81a07ed1` = `done`, `resolved_at` 04:26:10 UTC; `712182db` stays `todo`. "kuris projektas rizikoje?" → "Projektų būklė (2 aktyv.):" · "• E2E Kauno objektas (testinis) — rizikos signalų nėra (0 žm., 0 atvirų užduočių)" · "• E2E Vilniaus objektas (testinis) — rizikos signalų nėra (1 žm., 1 atvirų užduočių)" + two "Atidaryti" chips. MCP at walk time: people 1 · open 1 · overdue 0 · blocked stages 0 (Kaunas is `draft`, so "nobody on a live project" is honestly NOT a signal). **RESULT and RISK by sentence: prod-proven.**

## READINESS JOURNEY (owner correction 2026-09-05 — a journey, not a read; branch `feat/cc/project-readiness-by-sentence`)

PROJECT / PERSON → canonical readiness state → exact missing requirement → reason → WHO / WHAT can help → real corrective action → persisted → readback → readiness / risk surfaces agree → next action. Nothing here invents readiness: every fact is the operations centre's own per-person read (`getProjectOperations` → `deriveWorkerOps`), every write is the operations page's own action.

- **State + gap + reason.** "kas trūksta projektui X?" / "ar komanda pasiruošusi?" / "projekto parengtis" (LT · EN · DE · NL · RU · PL) → intent `project-readiness` (read) → the named LIVE project (one live project needs no name; several without a name → ONE question with a chip per project) → per person: the derived reason codes (a name / declared skills / work evidence — `deriveWorkerOps.missing`, verbatim), the manager-kept checklist rows still `needed`/`missing` (stored labels, verbatim), the `rejected`/`expired` rows, checked/total of real rows; people who still need something first; "Dokumentų sąrašas dar nesekamas" when 0 rows; "Projekte dar nėra žmonių" when nobody.
- **WHO / WHAT can help → the corrective action that EXISTS**, offered as chips right after the answer and run over the ONE dispatcher: `company.seed-readiness-checklist` (nothing tracked → the standard 7-row checklist for everyone on the project — the operations page's own seed, `projectOps.defaults` labels in the caller's locale) · `company.set-readiness-item` ("Gauta: <row> (<name>)" → the SAME row marked `received` — `upsert_worker_readiness_item`, the checklist control's own write) · `company.request-readiness` ("Paprašyti: <name>" → a WORK INSTRUCTION in the project's thread whose body is the REAL gap list — `send_work_instruction_to_project`, the instructions page's own send; important tier, the chip is the explicit confirmation) · the operations page · people when there are none.
- **Readback.** After every chip the chat says what changed and runs the SAME readiness read again, so the answer, the operations page and the project pulse / risk line agree (readiness checked/total, "dokumentų trūksta N žm.").
- **The person's side.** The instruction is the next thing their opening brief says — "Laukia nurodymų: N." with the one chip to `/dashboard/instructions` (`listAttentionInstructions`, the attention component's own read) — and their documents flow (record by sentence + the file in the thread, prod-proven) is how they answer it; the manager then marks the row received → checked.
- Guards: `project-readiness-intent.test.ts` (routes, loader = canonical reads only, ask on ambiguity, the three actions = the page's own writes, one write path that re-reads, the REAL gap list as the instruction body, the brief line, 24 catalogue keys × 11 locales); executor import allowlist extended consciously; behaviour census 46 → 49; intent registry 60 → 61.
