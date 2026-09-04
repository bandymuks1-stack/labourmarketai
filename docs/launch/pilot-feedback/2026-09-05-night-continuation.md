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
