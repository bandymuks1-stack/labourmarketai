# FINAL RELEASE READINESS BOARD — 2026-09-17

Owner mode: **PRODUCT COMPLETION** (after the #1751 disposition). One line per
area, one status from the closed set `LIVE · BLOCKED_RED · BLOCKED_EXTERNAL ·
REAL_DATA_REQUIRED · HUMAN_UI_PROOF_ONLY`, the concrete evidence for LIVE, the
exact missing edge for a blocker. Nothing here is HUMAN_UI_PROVEN; that status
is the owner's alone.

Production at the time of writing: `main` `8f29b513` (#1753, #1754, #1755 merged); the
history visual foundation `85ef5294` (#1751) deployed, `/api/health` ok, build
`85ef5294`, no runtime errors in the deployment log. The owner's historical
session `47627d4a` is untouched: 158 rows, 0 committed, 0 decisions taken.

| Area | Status | Evidence / missing edge |
|---|---|---|
| **WORKER** | **LIVE** | register J-WORKER-EVIDENCE: journal → evidence → confirmation → living profile → capability all LIVE (`PRODUCTION_DATA_PATH_PROVEN`; flywheel proven on production 2026-08-27); opportunities board, express-interest and employer ack LIVE both sides (#595–#597); booking → engagement → project assignment LIVE (#857); CI `e2e-smoke` (32 browser tests) green on every PR today. **Not live:** "demonstrated capability recognised against a formal requirement" (SKL-9 / RPL) = BLOCKED_RED, ARCH-2 owner-deferred. |
| **EMPLOYER** | **LIVE** | register J-COMPANY-EXECUTION: roster · project/site · assignment (warns, never blocks) · free/committed read · need → supply → execution all LIVE on production data (9 projects, 3 active assignments); demand intake proven (`employer-no-retyping.spec`); canonical demand = `customer_requests` (#1556). **Not live:** override RECEIPT after a known clash (CAL-7) = BLOCKED_RED (needs a receipt object/row, packet in `OWNER_GATE_PACKETS_2026-09-08.md`); org MANAGER reading the roster (ORG-5) = BLOCKED_RED by owner decision. |
| **AGENCY / NONSTOP** | **LIVE (individual workers)** · **REAL_DATA_REQUIRED (brigades)** | Model B canonical (#49db28bb); agency supply = `agency_offer` (#1587); demand → match → assignment → deployment for ONE worker at a time is the same chain as EMPLOYER. **Missing:** brigade offered/assigned as a UNIT — BLOCKED_RED (E6 consent scope under ARCH-4, WRK-6 team→project FK); production holds 0 teams, so nothing is walkable regardless. |
| **INSTITUTION** | **REAL_DATA_REQUIRED** | Built and proven on the local stack today: organization declares education (`org-capability-settled-training_provider`) → invites a learner **as a student** (`invitations.relationship_slug = 'student'`, pending, share-link) → learner accepts → cohort membership through the existing `set_education_cohort_member_v1` (UI: `institution-program-forms.tsx`) → practice recorded as work on the learner's own profile (LIVE, #1290) → competency (LIVE, 8 transversal capabilities). Production holds 0 cohort members — a real institution has to be onboarded; that is data, not code. **Not live:** competency → qualification / recognised equivalence (SKL-9) = BLOCKED_RED (ARCH-2). |
| **MULTILINGUAL COMMUNICATION** | **BLOCKED_RED (one decision)** | Code LIVE (#1753): every participant reads a thread and instructions in **their own** locale through the egress-gated runtime; original preserved one tap away; participants-only RLS verified on production; local proof LT manager ↔ RU worker; `ai_runs` audits the refusal. **Missing edge:** an owner egress grant row for task `translate_message` (DeepL and/or Gemini) + the provider key — `docs/launch/OWNER_GATE_MULTILINGUAL_COMMUNICATION_2026-09-17.md`. Until then everyone sees originals with a language badge. Georgian/Ukrainian as UI locales = separate language-coverage gate. |
| **HISTORICAL IMPORT** | **HUMAN_UI_PROOF_ONLY (owner commit)** | Pre-commit: LIVE on production (session `47627d4a`: 158 rows, 7 people, 17 objects, 1 decision; visual workspace #1751 deployed). Post-commit path proven on the local stack with the same 158-row shape (#1755): CONFIRM → 147 records + 11 label decisions → committed rows stay committed → roster name **offered** to a worker (new) → worker accepts → Work in Numbers "organizacijos apskaitoje 306 val. per 35 dienas" → the worker's calendar shows 20 organization-recorded days. **Waiting on the owner:** settle the 800 h / 165 h decision and press CONFIRM on production. **Known edge (not blocking):** the 11 rows whose text names a typo variant of a created object become label decisions AFTER the commit creates the objects (they counted as "ready" before). |
| **CALENDAR / COMMITMENTS** | **LIVE** | PAST = ACTUAL: the worker's canonical calendar carries journal days (confirmation state as words) and, since #1755, the organization's recorded hours beside them, never summed; a period aggregate (800 h / 165 h) never becomes a day (guard-pinned). NOW = COMMITTED: free / committed / unavailable three-state read (`lib/conversation/capacity.ts`), assignment warns on overlap (CAL-7 DETECT → WARN → DECIDE). FUTURE = PLANNED: planned vs actual stage dates (CAL-10), learned durations offered never stored, utilisation with its denominator (CAL-9). **Not live:** the override receipt (above). |
| **WORK JOURNAL / EVIDENCE** | **LIVE** | Chat-first journal, confirmations, live-entry filter (Step A1), Work in Numbers, verified CV export, subject SEES imported records (#1744). **Not live:** the subject REFUSING an organization's record = BLOCKED_RED (no INSERT policy admits a subject; packet 2026-09-08). |
| **MATCHING** | **LIVE** | canonical-slug matching (#594), worker board Model-A RPC (#595), 3-best board with Gemini explanation proven on production, interest loop both sides, team match engine complete (`matchTeamToNeed`) but its employer surface waits on the ARCH-4 consent relation (BLOCKED_RED for brigades only). |
| **PRODUCTION / AUTH / PAYMENTS** | **AUTH LIVE · PAYMENTS BLOCKED_RED · CI secret BLOCKED_EXTERNAL** | Auth: Google sign-in only on web, email confirmation gate verified (autoconfirm OFF), PKCE/logout stable; `/api/health` ok (auth 52–168 ms, db 65–277 ms). Payments: Stripe LIVE key path proven with zero money (K4); real charging armed only by **two independent owner acts** (MKT-7). `GOV-1`: a READ-ONLY `SUPABASE_DB_URL` GitHub secret is an owner action (never handled by an agent). |

## What was done in this window (all GREEN, all merged or auto-merging)

- #1751 merged as the accepted visual foundation (`85ef5294`), deployed, verified; visual status recorded in the design constitution.
- #1753 multilingual work communication (viewer-language read through the gate) — merged.
- #1754 `revalidatePath` on localised routes (spawned task) — merged.
- #1755 historical post-commit path — committed rows stay committed, the roster link offer, the organization's actual layer on the calendar — merged (`8f29b513`).
- Docs: this board; the multilingual owner gate packet.

## The consolidated RED list (owner decisions, none resolvable by an agent)

1. **Egress grant for `translate_message`** (+ provider key) — turns multilingual communication on.
2. **CAL-7 override receipt** — a receipt object for a deliberately accepted clash.
3. **Subject refusal of an organization record** — a narrow subject-only write path.
4. **Brigade as a unit** — demand-scoped consent relation (E6) + team→project FK (WRK-6).
5. **RPL / recognised equivalence** — ARCH-2, deferred by the owner.
6. **MKT-7** two owner acts to arm charging · **GOV-1** read-only DB secret for CI · ORG-5 · EVID-2 · EVID-6 (unchanged from the product-truth ledger).

## What only real use can prove

A real worker, a real employer, Nonstop's staffing desk and one real training
institution walking their chains on production. Every automated line above is a
machine confirming code runs; the owner's HUMAN_UI_PROVEN count stays where the
owner last set it.
