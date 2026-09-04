# RESUME_CHECKPOINT — 2026-09-04 (Owner Master Execution Contract, autonomous mode)

> State table, not an essay (contract §35). Rewritten in place as the queue
> moves. Authority: [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) §5.5 →
> [`docs/product/OWNER_MASTER_EXECUTION_CONTRACT_2026-09-04.md`](../product/OWNER_MASTER_EXECUTION_CONTRACT_2026-09-04.md).
> Previous checkpoint (morning): `RESUME_CHECKPOINT_2026-09-03.md` (top update).

## State

| Item | Value |
|---|---|
| Production | `71f93e11` (#1473) verified 10:19 UTC by the agency + compass walks; #1474 (attention) merged after — confirm `/api/health` `build` on resume |
| `main` | #1467 starters · #1468 employer sentence · #1469 documents · #1470 institution by sentence · #1471 skill-gap → documents · #1472 student compass · #1473 shared-needs fix · #1474 attention. Open: **#1476** My Space code (auto-merge) · **#1475** My Space table (RED draft, owner gate) · opportunity-type dimension (branch `feat/cc/opportunity-type-dimension`, PR next) |
| Active P0 chain | all P0 actors have a prod-proven sentence chain (E2E identities); now: student "kur galiu atlikti praktiką?" narrows to internships (PR), then typed-sentence usage for My Space, F2 |
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
| Worker | find work, log work, CV, documents + gaps with closing step | training suggestion for a skills gap (**owner gate**: public programme projection); locative country names |
| Employer | need → form → demand → candidates → contact/booking; the owner's sentence structured | end date / duration; site as a project |
| Agency | whole chain by sentence; attention lines (offers awaiting, needs without offer, clients pending) (#1474) | client's decision by sentence (chips exist on the scouting page); e-mail delivery (**owner gate**) |
| Institution | programme / cohort / learner invitation / assignment / list; attention: pending learner invitations | `institution_learner_outcomes_v1` has no caller; e-mail delivery (**owner gate**) |
| Student | compass answered; internships as opportunity type (PR) | executable compass actions beyond chips |
| Everyone | My Space: pinned row + ask after repeated use + unpin (code #1476; table #1475 owner-gated) | reorder gesture; typed-sentence usage counting |

## Queue (contract §33; next automatic step first)

1. Opportunity-type dimension PR → merge → prod walk with the E2E learner ("kur galiu atlikti praktiką?") — the board needs at least one `internship` demand visible to it for a positive proof; the E2E client can create one by sentence (opportunityType select) if none exists.
2. My Space: count TYPED sentences (intent → chip ref map) so the ask also fires for people who type; reorder gesture.
3. F2: end date / duration in the demand structurer; the site as a project object.
4. Real-user watch on resume: `pilot_events` for profile `875eb16b…`.

## Open owner gates (consolidated, do not re-ask)

- **Apply My Space 2026-09-04** → #1475 (`20260904120000_workspace_pins_v1`): one reference table, owner-only RLS, `grant … to authenticated` only (the static grant rule makes it RED). Until applied the chat shows no row and no ask.
- **Transactional e-mail** (`INVITE_EMAIL_PROVIDER` = resend|postmark, `INVITE_EMAIL_API_KEY`, `INVITE_EMAIL_FROM` in Vercel prod env): every invitation is stored, not sent; the chat says so.
- **Public programme projection** (institution + programme names readable by workers) for "who can help" on a skills gap — privacy/commercial decision.
- RED drafts unchanged: #1441 #1440 #1436 #1433 #1430 #1426 #1421 #1355 #1266 #1046 #1045 #897 #896 #895 #883 #740. DEV-1 and Docker Desktop are owner-machine actions.
