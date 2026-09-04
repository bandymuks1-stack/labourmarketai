# RESUME_CHECKPOINT — 2026-09-04 (Owner Master Execution Contract, autonomous mode)

> State table, not an essay (contract §35). Rewritten in place as the queue
> moves. Authority: [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) §5.5 →
> [`docs/product/OWNER_MASTER_EXECUTION_CONTRACT_2026-09-04.md`](../product/OWNER_MASTER_EXECUTION_CONTRACT_2026-09-04.md).
> Previous checkpoint (morning): `RESUME_CHECKPOINT_2026-09-03.md` (top update).

## State

| Item | Value |
|---|---|
| Production | `c448cff7` (#1468) verified ~09:55 UTC by the prod walk; #1469 (documents in chat) merged after — confirm `/api/health` `build` on resume |
| `main` | #1467 starters · #1468 employer sentence · #1469 documents in chat — next PR: education by sentence (branch `feat/cc/education-by-sentence`) |
| Active P0 chain | **H/I — institution + student by sentence** (C+D, F, E/K DONE) |
| Real recruiter account | admin of "Labour market ai Sp. z o.o" (`employer,training_provider` + `staffing_agency`; 8 open needs, 1 roster worker, 1 project, 0 client connections). Last event `dashboard_viewed` 06:15 UTC. **REAL_RECRUITER_USED_PRODUCT = FALSE** — no chat action yet. Its next greeting (post-#1467): "Pakviesti klientą · Kandidatai · Projektai" + the "Veikiate … vardu" line |
| Real institution | none yet. **REAL_EDUCATION_INSTITUTION_USED_PRODUCT = FALSE** |
| Local stack | Docker Desktop dead → `LOCAL_DOCKER_UNAVAILABLE`; verification = unit/guards/typecheck/lint/build + CI + prod walks with bounded `e2e-*` identities (magic-link mint; scripts in the session scratchpad: `walk-starters-prod.cjs`, `walk-employer-sentence-prod.cjs`) |
| Uncommitted local-only | `.claude/launch.json` (`dev-local`), `supabase/config.toml` (553xx ports) — harness, never commit |

## Prod-proven today (E2E identities, never the real user)

| Slice | Proof |
|---|---|
| #1467 starters are suggestions | agency workspace opens with a MIX (client needs · need workers · invite candidate), names the organization + all capabilities, composed fallback, employer sentence works inside an agency, #1466 intact — `pilot-feedback/2026-09-04-starters-not-a-role-menu.md` |
| #1468 employer sentence | "Reikia 12 pastolininkų Roterdame nuo spalio 5." → prefilled form (Pastolininkas · Rotterdam, Nyderlandai · 12 · 2026-10-05) → row with `scaffolder / NL / 12 / start_earliest 2026-10-05` — `pilot-feedback/2026-09-04-employer-sentence-structured.md` |
| #1469 documents in chat | unit + guards; prod walk pending (needs a worker identity with preferred countries — `e2e-*` worker via magic link) |

## Ordinary-human-usable vs technically proven (honest)

| Actor | Ordinary-human-usable in prod | Only technically proven | Broken / missing |
|---|---|---|---|
| Worker | "noriu darbo" → 3-best board → interest; documents / "ko man trūksta" answered in the chat (#1469, unit-proven) | gap → document centre / work-card next step | prod walk of #1469; express-interest UI bypasses the dispatcher; skills gap still closes only via "log work" (no training suggestion — programmes are not publicly readable) |
| Employer | "reikia darbuotojų" → ONE form → demand → candidates → contact/booking; the owner's sentence fully structured (prod-proven) | matching + shortlist (browser 2026-08-27) | end date / duration; site as a project object |
| Agency | "noriu pakviesti klientą" → one question → persisted connection (E2E on prod); mixed starters | proposal chain (DB-proven) | roster invitations send no e-mail; real account has not acted |
| Institution | (this PR) "pakviesk studentą" → one question → canonical invitation; "sukurk programą / grupę", "priskirk studentą grupei", "parodyk programas" → forms built from real rows → RPCs | unit + guards | prod walk with an E2E institution identity; `institution_learner_outcomes_v1` still has no caller |
| Student | compass on the profile (route by sentence) | cohort/programme reads | executable compass actions |

## Queue (contract §33; next automatic step first)

1. **H/I (PR open)**: education by sentence → merge → prod walk with an E2E `training_provider` organization (create one via the setup flow with the E2E identity, or reuse a fixture org on prod if one exists) → record.
2. **E (prod walk of #1469)**: worker identity with preferred countries → "kas baigia galioti?" / "ko man trūksta?" on prod → record.
3. **G (agency beyond E2E)**: roster invitation delivery (no e-mail today); proposal by sentence against a shared request on prod.
4. **K (gap → solution)**: a public projection of programmes by target profession (privacy decision: institution names are visible on the public network already? verify) so a skills gap can name training; otherwise the honest "who can help" stays the document source.
5. **N (My Space / Attention)**: pins need persistence (none exists; funnel events write-only for the user) — after 1–4.
6. **F2**: end date / duration in the demand structurer; the site as a project.

## Open owner gates (consolidated, do not re-ask)

RED drafts unchanged: #1441 #1440 #1436 #1433 #1430 #1426 #1421 #1355 #1266 #1046 #1045 #897 #896 #895 #883 #740. DEV-1 (Windows excluded port range) and Docker Desktop are owner-machine actions. No new gate opened this session.
