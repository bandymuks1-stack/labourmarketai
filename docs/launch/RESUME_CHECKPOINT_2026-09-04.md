# RESUME_CHECKPOINT — 2026-09-04 (Owner Master Execution Contract, autonomous mode)

> State table, not an essay (contract §35). Rewritten in place as the queue
> moves. Authority: [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) §5.5 →
> [`docs/product/OWNER_MASTER_EXECUTION_CONTRACT_2026-09-04.md`](../product/OWNER_MASTER_EXECUTION_CONTRACT_2026-09-04.md).
> Previous checkpoint (morning): `RESUME_CHECKPOINT_2026-09-03.md` (top update).

## State

| Item | Value |
|---|---|
| Production | `3b459de7` (#1470) verified ~09:50 UTC by the institution walk; #1471 merged after (documents tail) — confirm `/api/health` `build` on resume |
| `main` | #1467 starters · #1468 employer sentence · #1469 documents in chat · #1470 institution by sentence · #1471 skill-gap → documents. Open: **#1472** student compass (auto-merge) |
| Active P0 chain | **H — student compass (PR open) → prod walk**; then G (agency proposal on prod) / K (gap → training) / N (My Space) |
| Real recruiter account | admin of "Labour market ai Sp. z o.o" (`employer,training_provider` + `staffing_agency`; 8 open needs, 1 roster worker, 1 project, 0 client connections). Last event `dashboard_viewed` 06:15 UTC. **REAL_RECRUITER_USED_PRODUCT = FALSE**. Its next greeting: "Pakviesti klientą · Kandidatai · Projektai" + "Veikiate „Labour market ai Sp. z o.o“ vardu…" |
| Real institution | none yet. **REAL_EDUCATION_INSTITUTION_USED_PRODUCT = FALSE** — the sentence chain is prod-proven with the E2E institution (below) |
| Local stack | Docker Desktop dead → `LOCAL_DOCKER_UNAVAILABLE`; verification = unit/guards/typecheck/lint/build + CI + prod walks with bounded `e2e-*` identities (magic-link mint; scratchpad `walk-*.cjs`, `wait-prod.cjs` — `curl` is denied in this harness) |
| Uncommitted local-only | `.claude/launch.json` (`dev-local`), `supabase/config.toml` (553xx ports) — harness, never commit |

## Prod-proven today (E2E identities, never the real user)

| Slice | Proof |
|---|---|
| #1467 starters are suggestions | agency workspace opens with a MIX, names the organization + all capabilities, composed fallback, employer sentence works inside an agency — `pilot-feedback/2026-09-04-starters-not-a-role-menu.md` |
| #1468 employer sentence | "Reikia 12 pastolininkų Roterdame nuo spalio 5." → prefilled form → row `scaffolder / NL / 12 / start_earliest 2026-10-05` — `pilot-feedback/2026-09-04-employer-sentence-structured.md` |
| #1469/#1471 documents in chat | no country → honest ask + work-card chip; NL+DE → 6 missing required documents with issuing source; "ko man trūksta?" now continues to documents — `pilot-feedback/2026-09-04-documents-in-chat.md` |
| #1470 institution by sentence | programme → cohort → learner invitation (truthful "created, no e-mail") → assignment form from real rows; full telemetry chain incl. `first_real_action` — `pilot-feedback/2026-09-04-institution-by-sentence.md` |

## Ordinary-human-usable vs technically proven (honest)

| Actor | Ordinary-human-usable in prod | Only technically proven | Broken / missing |
|---|---|---|---|
| Worker | "noriu darbo" → 3-best board → interest; "ko man trūksta / kas baigia galioti / kokių dokumentų reikia" answered with the closing step | — | skills gap closes only via "log work" (no training suggestion: programmes not publicly readable); country names in the nominative |
| Employer | "reikia darbuotojų" → ONE form → demand → candidates → contact/booking; the owner's sentence fully structured | matching + shortlist (browser 2026-08-27) | end date / duration; site as a project object |
| Agency | "noriu pakviesti klientą" → one question → persisted connection; mixed starters | proposal chain (DB-proven) | roster/learner invitations are stored, not e-mailed (**owner gate**: `INVITE_EMAIL_PROVIDER/API_KEY/FROM`); real account has not acted |
| Institution | "sukurk programą / grupę", "pakviesk studentą", "priskirk studentą grupei", "parodyk programas" → real rows + readback (prod-proven) | — | `institution_learner_outcomes_v1` has no caller; e-mail delivery (same owner gate) |
| Student | (PR #1472) "ką man mokytis? / mano kompasas" → becoming · evidence · fits · missing · next-step chips | unit + guards | prod walk after merge (`walk-compass-prod.cjs`, identity `e2e-learner-…`) |

## Queue (contract §33; next automatic step first)

1. **H (PR #1472)**: merge → prod walk of the compass with the E2E learner → record.
2. **G (agency beyond E2E)**: proposal by sentence on prod against a client-shared request (needs a client identity accepting the E2E agency's connection and sharing a request — two-identity walk).
3. **K (gap → training)**: a public projection of programmes by target profession so a skills gap can name training — privacy decision (institution names are already public on the network? verify before building; if not, owner gate).
4. **N (My Space / Attention)**: pins need persistence (none exists; funnel events write-only for the user).
5. **F2**: end date / duration in the demand structurer; the site as a project; locative country names in the documents answer.
6. **Real-user watch**: on resume, check `pilot_events` for the real recruiter profile (`875eb16b…`) — any `chat_action_persisted` flips REAL_RECRUITER_USED_PRODUCT.

## Open owner gates (consolidated, do not re-ask)

- **Transactional e-mail** (`INVITE_EMAIL_PROVIDER` = resend|postmark, `INVITE_EMAIL_API_KEY`, `INVITE_EMAIL_FROM` in Vercel prod env): until set, every invitation (roster, client, learner) is stored and the chat says so honestly; nothing is sent.
- RED drafts unchanged: #1441 #1440 #1436 #1433 #1430 #1426 #1421 #1355 #1266 #1046 #1045 #897 #896 #895 #883 #740.
- DEV-1 (Windows excluded port range) and Docker Desktop are owner-machine actions. No new gate opened this session.
