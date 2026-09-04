# RESUME_CHECKPOINT — 2026-09-04 (Owner Master Execution Contract, autonomous mode)

> State table, not an essay (contract §35). Rewritten in place as the queue
> moves. Authority: [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) §5.5 →
> [`docs/product/OWNER_MASTER_EXECUTION_CONTRACT_2026-09-04.md`](../product/OWNER_MASTER_EXECUTION_CONTRACT_2026-09-04.md).
> Previous checkpoint (morning): `RESUME_CHECKPOINT_2026-09-03.md` (top update).

## State

| Item | Value |
|---|---|
| Production | **FROZEN at `02e4476c`** — Vercel Hobby build rate limit hit 2026-09-04 ~22:57 UTC ("Deployment rate limited — retry in 24 hours" on every commit since, incl. `e4ffd04d` #1502 and `2723d876` #1503). Nothing merged after 02e4476c is live. When the limit lifts (~23:00 UTC 2026-09-05) production needs a NEW push to `main` (or the owner's Redeploy in Vercel) — then run the pending walks: `walk-stage-prod.cjs`, `walk-document-file-prod.cjs` (CLEANUP=1), `walk-employer-proposal-prod.cjs` (WORKER_EMAIL=qa.worker+multiw) |
| `main` | #1467–#1474 · #1476–#1501 (incl. #1495 pulse, #1497 task, #1498 capacity, #1499 worker projects, #1500 stages, #1501 file core). Open: **#1502** document file in the chat (auto-merge), `fix/cc/stage-status-confirmation` (PR after build). RED draft: **#1475** My Space table (owner gate) |
| Active P0 chain | PROJECT journey from real state: create → assign → worker log with project_id → pulse → task by sentence → capacity → a stage moved by sentence (#1500; first prod walk exposed the token-tier defect, fix in flight → re-walk `walk-stage-prod.cjs` after deploy). WORKER: the document FILE offered in the thread after the sentence (#1502 → `walk-document-file-prod.cjs` after deploy, then MCP row cleanup). Then: EMPLOYER contact/proposal via the chat panel (S → prod walk) |
| Real recruiter account | admin of "Labour market ai Sp. z o.o". Last event `dashboard_viewed` 06:15 UTC. **REAL_RECRUITER_USED_PRODUCT = FALSE**. Its next greeting: "Pakviesti klientą · Kandidatai · Projektai" + "Veikiate „…“ vardu" line; its first sentence "noriu pakviesti klientą" is prod-proven with the E2E agency |
| Real institution | none yet. **REAL_EDUCATION_INSTITUTION_USED_PRODUCT = FALSE** — the whole chain is prod-proven with the E2E institution |
| Local stack | Docker Desktop dead → `LOCAL_DOCKER_UNAVAILABLE`; verification = unit/guards/typecheck/lint/build + CI + prod walks with bounded `e2e-*` identities (scratchpad `walk-*.cjs`, `wait-prod.cjs`; `curl` denied in this harness) |
| Uncommitted local-only | `.claude/launch.json` (`dev-local`), `supabase/config.toml` (553xx ports) — harness, never commit |

## Prod-proven today (E2E identities, never the real user) — docs/launch/pilot-feedback/2026-09-04-*.md

| Actor | Sentence chain proven on production |
|---|---|
| Company (any) | greeting = a MIX of its capabilities, names the organization; composed fallback; "reikia darbuotojų" works inside an agency (#1467) |
| Employer | "Reikia 12 pastolininkų Roterdame nuo spalio 5." → scaffolder / Rotterdam, Nyderlandai / 12 / start 2026-10-05 persisted (#1468) |
| Worker | "kas baigia galioti?" → honest ask for the country; NL+DE → 6 required documents with issuing source; "ko man trūksta?" continues to documents (#1469/#1471) |
| Agency | invite client → client accepts + shares (canonical RPCs) → invite candidate → worker joins → "parodyk klientų poreikius" lists the need → "pasiūlyk kandidatą" → offer `offered` → status; full telemetry incl. `first_real_action:offer_candidate` (#1466/#1473) |
| Institution | "sukurk programą" → "sukurk grupę" → "pakviesk studentą" (truthful "created, no e-mail") → assignment form from real rows → "parodyk programas"; `first_real_action` ×3 (#1470) |
| Student | "ką man mokytis?" → becoming · evidence · fits · missing · next-step chips + full compass chip (#1472) |
| Worker (assigned) | "mano projektai" → "Jūsų projektai (1 aktyv.): • E2E Vilniaus objektas (testinis) — Vilnius" + open chip, from the person's side (#1499, `e535971d`) |

## Ordinary-human-usable vs technically proven (honest)

| Actor | Usable by sentence in prod | Still missing |
|---|---|---|
| Worker | find work, log work, CV, documents + gaps; attention: expiring / missing documents (#1485/#1487); a document RECORDED by sentence (#1488, PR) | the file by sentence — offered in the thread after the record (#1502, unproven on prod until the walk); training suggestion for a skills gap (**owner gate**: public programme projection) |
| Employer | need → form → demand → candidates → contact/booking; the owner's sentence structured incl. end date; a project by sentence and people assigned right after (#1483/#1486); attention: candidates waiting for an answer, agency offers waiting (#1485/#1487) | site readiness / work packages (§11 Project Field) |
| Agency | whole chain by sentence; attention lines (#1474); the CLIENT decides on the offer by sentence, accept → canonical booking (#1487, prod-proven decline) | e-mail delivery (**owner gate**) |
| Institution | programme / cohort / learner invitation / assignment / list; attention: pending learner invitations; learner OUTCOMES block (#1484: the one caller of `institution_learner_outcomes_v1`, suppression said) | e-mail delivery (**owner gate**) |
| Student | compass answered; "kur galiu atlikti praktiką?" narrows to internships (#1477), NAMES an absent type (#1479) and lists what IS visible on the same dimension (#1481) | positive internship proof needs a demand from a VERIFIED company visible to a worker — no E2E company is verified; verifying one exposes test demands to real workers (**owner decision**) |
| Everyone | My Space: pinned row + ask after repeated use (chip AND typed sentence, #1480) + unpin + "Į priekį" reorder (#1482) — code only until the table is applied (#1475 owner-gated) | — |

## Queue (contract §33; next automatic step first)

1. On resume: consume #1495 (pulse walk) / #1497 (task walk) / #1498 / worker-projects PR chains; then keep evaluating at journey level (owner notes 2026-09-04 late / 2026-09-05).
2. My Space: count TYPED sentences (intent → chip ref map) so the ask also fires for people who type; reorder gesture.
3. F2: end date / duration in the demand structurer; the site as a project object.
4. Real-user watch on resume: `pilot_events` for profile `875eb16b…`.

## Open owner gates (consolidated, do not re-ask)

- **Apply My Space 2026-09-04** → #1475 (`20260904120000_workspace_pins_v1`): one reference table, owner-only RLS, `grant … to authenticated` only (the static grant rule makes it RED). Until applied the chat shows no row and no ask.
- **Vercel Hobby build rate limit** (hit 2026-09-04 ~22:57 UTC): production deploys refused for 24 h. Options only the owner has: upgrade the Vercel project to Pro, or wait; no code change fixes it. Consequence recorded once here; merges continue, prod proofs resume after the reset.
- **Transactional e-mail** (`INVITE_EMAIL_PROVIDER` = resend|postmark, `INVITE_EMAIL_API_KEY`, `INVITE_EMAIL_FROM` in Vercel prod env): every invitation is stored, not sent; the chat says so.
- **Public programme projection** (institution + programme names readable by workers) for "who can help" on a skills gap — privacy/commercial decision.
- RED drafts unchanged: #1441 #1440 #1436 #1433 #1430 #1426 #1421 #1355 #1266 #1046 #1045 #897 #896 #895 #883 #740. DEV-1 and Docker Desktop are owner-machine actions.
