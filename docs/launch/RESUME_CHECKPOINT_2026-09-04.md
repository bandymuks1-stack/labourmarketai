# RESUME_CHECKPOINT — 2026-09-04 (Owner Master Execution Contract, autonomous mode)

> State table, not an essay (contract §35). Rewritten in place as the queue
> moves. Authority: [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) §5.5 →
> [`docs/product/OWNER_MASTER_EXECUTION_CONTRACT_2026-09-04.md`](../product/OWNER_MASTER_EXECUTION_CONTRACT_2026-09-04.md).
> Previous checkpoint (morning): `RESUME_CHECKPOINT_2026-09-03.md` (top update).

## State

| Item | Value |
|---|---|
| Production | `f307e574` (#1483) deploying at checkpoint time; last walked build `287b6fb0` (internship honest answer). Next proof: `walk-create-project-prod.cjs` on `f307e574` (E2E agency identity; delete the row afterwards) — confirm `/api/health` `build` on resume |
| `main` | #1467–#1474 (starters, employer sentence, documents, institution, skill-gap→documents, compass, shared-needs fix, attention) · #1476 My Space code · #1477 opportunity type · #1478 end date · #1479 absent type NAMED · #1480 typed-sentence usage · #1481 same-dimension alternatives · #1482 REORDER chip · #1483 project by sentence. Open (auto-merge): **#1484** institution learner outcomes; branch `feat/cc/attention-documents-interest` (worker documents rung + employer candidates-waiting rung; PR after build). RED draft: **#1475** My Space table (owner gate) |
| Active P0 chain | prod-verify #1483 (create-project walk) → PR attention rungs → project AFTER creation in the chat (open the new project's panel from the create-project onDone; assign people there) → next broken ordinary-human link |
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

## Ordinary-human-usable vs technically proven (honest)

| Actor | Usable by sentence in prod | Still missing |
|---|---|---|
| Worker | find work, log work, CV, documents + gaps with closing step | training suggestion for a skills gap (**owner gate**: public programme projection); ~~locative country names~~ (already handled: `termStem` + letter run matches "Vokietijoje" — verified 2026-09-04 evening) |
| Employer | need → form → demand → candidates → contact/booking; the owner's sentence structured | end date / duration; site as a project |
| Agency | whole chain by sentence; attention lines (offers awaiting, needs without offer, clients pending) (#1474) | client's decision by sentence (chips exist on the scouting page); e-mail delivery (**owner gate**) |
| Institution | programme / cohort / learner invitation / assignment / list; attention: pending learner invitations; learner OUTCOMES block (#1484: the one caller of `institution_learner_outcomes_v1`, suppression said) | e-mail delivery (**owner gate**) |
| Student | compass answered; "kur galiu atlikti praktiką?" narrows to internships (#1477), NAMES an absent type (#1479) and lists what IS visible on the same dimension (#1481) | positive internship proof needs a demand from a VERIFIED company visible to a worker — no E2E company is verified; verifying one exposes test demands to real workers (**owner decision**) |
| Everyone | My Space: pinned row + ask after repeated use (chip AND typed sentence, #1480) + unpin + "Į priekį" reorder (#1482) — code only until the table is applied (#1475 owner-gated) | — |

## Queue (contract §33; next automatic step first)

1. Consume the create-project walk result (background task started 2026-09-04 evening; `walk-create-project/` screenshots) → record; delete the E2E project row. Then PR the attention branch; then the chat's create-project `onDone` → open the new project's panel (`selectProjectRef`) so people are assigned right there.
2. My Space: count TYPED sentences (intent → chip ref map) so the ask also fires for people who type; reorder gesture.
3. F2: end date / duration in the demand structurer; the site as a project object.
4. Real-user watch on resume: `pilot_events` for profile `875eb16b…`.

## Open owner gates (consolidated, do not re-ask)

- **Apply My Space 2026-09-04** → #1475 (`20260904120000_workspace_pins_v1`): one reference table, owner-only RLS, `grant … to authenticated` only (the static grant rule makes it RED). Until applied the chat shows no row and no ask.
- **Transactional e-mail** (`INVITE_EMAIL_PROVIDER` = resend|postmark, `INVITE_EMAIL_API_KEY`, `INVITE_EMAIL_FROM` in Vercel prod env): every invitation is stored, not sent; the chat says so.
- **Public programme projection** (institution + programme names readable by workers) for "who can help" on a skills gap — privacy/commercial decision.
- RED drafts unchanged: #1441 #1440 #1436 #1433 #1430 #1426 #1421 #1355 #1266 #1046 #1045 #897 #896 #895 #883 #740. DEV-1 and Docker Desktop are owner-machine actions.
