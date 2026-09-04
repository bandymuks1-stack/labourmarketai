# RESUME_CHECKPOINT — 2026-09-04 (Owner Master Execution Contract, autonomous mode)

> State table, not an essay (contract §35). Rewritten in place as the queue
> moves. Authority: [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) §5.5 →
> [`docs/product/OWNER_MASTER_EXECUTION_CONTRACT_2026-09-04.md`](../product/OWNER_MASTER_EXECUTION_CONTRACT_2026-09-04.md).
> Previous checkpoint (morning): `RESUME_CHECKPOINT_2026-09-03.md` (top update).

## State

| Item | Value |
|---|---|
| Production | `f11bd5be` verified 07:42 UTC (health 200, db 715 ms) — same as `main` at session start |
| `main` | `f11bd5be` (#1466 chat-first agency + docs) |
| Active P0 chain | **C+D — role-tunnel repair / capability-aware starters** (branch `feat/cc/starters-capability-mix`) |
| Real recruiter account | `worklandworkoficial@…` (admin of "Labour market ai Sp. z o.o", org roles `employer,training_provider`, company type `staffing_agency`, 8 open needs, 1 roster worker, 1 project, 0 client connections). Last event `dashboard_viewed` 06:15 UTC. **REAL_RECRUITER_USED_PRODUCT = FALSE** — no chat action after #1466 |
| Real institution | none yet. **REAL_EDUCATION_INSTITUTION_USED_PRODUCT = FALSE** |
| Local stack | Docker Desktop dead (Inference manager) → `LOCAL_DOCKER_UNAVAILABLE`; verification = unit/guards/typecheck/lint/build + CI + prod walk with bounded `e2e-*` identities (magic-link mint, never the real user) |
| Uncommitted local-only | `.claude/launch.json` (`dev-local`), `supabase/config.toml` (553xx ports) — harness, never commit |

## Ordinary-human-usable vs technically proven (honest)

| Actor | Ordinary-human-usable in prod | Only technically proven | Broken / missing |
|---|---|---|---|
| Worker | say "noriu darbo" → 3-best board → interest (browser-proven earlier, n=3 real) | document readiness (never reaches the chat); gap → only "log work" chip, no how-to-close | "what am I missing / what expires" has NO chat answer; express-interest UI bypasses the dispatcher |
| Employer | "reikia darbuotojų" → ONE inline form → demand → candidates → contact/booking | matching + shortlist (browser 2026-08-27) | "reikia 12 pastolininkų Roterdame nuo spalio 5" classifies **unknown** (no scaffolder work type, no absolute date, city collapsed to country) |
| Agency | "noriu pakviesti klientą" → one question → persisted connection (E2E identity on prod) | proposal chain (DB-proven, rolled back) | greeting was three agency chips only (**this slice**); roster invitations send no e-mail |
| Student | compass renders on the profile (local) | cohort/programme reads | compass is route-only in chat; no executable compass actions |
| Institution | invite learner / programmes as PAGE actions (local browser) | learner outcomes RPC (no caller) | no education executors in the action registry (create programme / cohort / assign by sentence) |

## Queue (contract §33; next automatic step first)

1. **C+D (in progress)**: starters derived from capabilities + facts (`lib/conversation/starters.ts`, `starter-signals.ts`), composed fallback + "acting for {company}" line, 11 locales, guards re-anchored → build → PR (auto-merge) → prod walk with the E2E agency identity (expected mix: client needs · need workers · invite candidate) → record.
2. **F (employer sentence)**: scaffolder + other construction occupations as work types; absolute start date in the time window; city kept beside the country in the demand prefill; fixture for the owner's sentence.
3. **E/K (worker documents + gap → solution)**: chat answer for "ko man trūksta / kas baigia galioti" over `getWorkerDocumentCentre` / `computeCountryReadiness`; gap answers carry the closing step (training / document help), not only "log work".
4. **H/I (education executors)**: `education.create-programme`, `education.create-cohort`, `education.assign-learner`, `education.invite-learner` as registered actions over the existing RPCs (ONE dispatcher); compass actions executable.
5. **G (agency beyond E2E)**: roster invitation delivery (no e-mail today), agency proposal by sentence proven against a shared request.
6. **N (My Space / Attention)**: pins need persistence (none exists; funnel events are write-only for the user) — infrastructure slice AFTER 2–5.

## Open owner gates (consolidated, do not re-ask)

RED drafts unchanged: #1441 #1440 #1436 #1433 #1430 #1426 #1421 #1355 #1266 #1046 #1045 #897 #896 #895 #883 #740. DEV-1 (Windows excluded port range) and Docker Desktop are owner-machine actions. No new gate opened this session.
