# W4 — PROFESSIONAL IDENTITY: BASELINE (acceptance stage, not a rebuild)

Opened 2026-08-01, immediately after `W3_CHAT_FIRST_WORKSPACE_CONSOLIDATION_COMPLETE`
(main `7a4babba`). W4's job is to ACCEPT what exists, close what is missing —
never to rebuild the canonical Player Card.

Classification: `FULL` · `PARTIAL` · `MISSING` · `BLOCKED` · `DUPLICATE` ·
`OBSOLETE` · `PRODUCTION_PROVEN`. A row may carry `PENDING_AUDIT` with its
exact probe when this baseline could not verify it without guessing — a
baseline that invents states would poison the whole wagon.

## Verified today (during W3 Package 4 work — evidence in the W3 record)

| Capability | State | Evidence |
|---|---|---|
| Worker identity — Player Card | FULL (local-proven) | `player-card` result kind, `dataReadiness: "real"`; renders via `components/app/workspace/player-card-result.tsx`; e2e `w3-second-dashboard` row 1: chat opens it, editor writes the DATABASE row, reload/Back/Forward hold, 375px clean |
| Work-card editor (availability + location + preferred countries) | FULL (local-proven) | `WorkCardEditor` inside the player-card result — the ONE editor after W3; `wagon4-setup-journey` + `player-card-profile` guards pin the door (`/dashboard?result=player-card`) |
| Readiness model | FULL | 5-dimension `deriveWorkerReadiness` drives the editor's one next action (row 21 record) |
| Profile hub + completeness pillars | PARTIAL | `profile-hub-overview` renders pillar rows (availability pillar verified; the full pillar set needs the W4 acceptance list mapped pillar-by-pillar) |
| Setup journey (guide over canonical surfaces) | FULL | `worker-setup-journey` steps → `#profile-edit`, player-card result, `#cv-availability` — all destinations exist (guard-pinned) |
| Evidence loop (journal → skills) | PARTIAL | journal→capability-extraction→confirm loop exists (W1/W2 records); W4 must map which skill claims surface on the card and which lack evidence links |
| Availability | FULL (worker side) | work-card editor writes `availability_status` — e2e asserts the DB transition |
| Subjective reputation | BLOCKED → W6 | owner ruling (row 24): no subjective store exists; nothing fabricated, no stars, no total score |

## PENDING_AUDIT — exact probes (first W4 work items)

| Capability | Probe |
|---|---|
| Organization identity | Does the company/agency get a presentable identity surface (beyond the workspace)? Read `dashboard/company` + `business-profile` surfaces; check share-safe rendering |
| Real skills catalogue | `skillNames`/`professions` namespaces + `workers/[id]/skills` API — verify the declared-skill CRUD path end-to-end and its i18n coverage |
| Work history | Where do past engagements render (journal? card? CV)? Verify a worker with history shows it on the card |
| Projects | `/dashboard/projects` detail exists (W3 row 3 proof) — check the worker↔project attribution on the identity surface |
| Languages | CV language dimension — verify it renders on the card and is editable |
| Certificates | Search for a certificates model; likely MISSING — confirm before classifying |
| Public / share-safe presentation | Is there any anonymous-safe card view? Check share routes + leak guards; likely MISSING or gated |
| Permissions | Who may see which card fields (worker vs employer vs anonymous)? Map the RLS + render gates |
| Production proof | Blocked by `PROD_QA_*` secrets (standing) — every W4 acceptance stays local-stack until the owner supplies them |

## Rules carried forward

- Do NOT rebuild the Player Card; extend the existing result only.
- Row-by-row browser assertions before any deletion/port (the W3 method).
- No fabricated reputation, no fake verification badges, no invented scores.
- Mobile 375px + keyboard/accessible-name legs on every accepted row.

---

## AUDIT COMPLETE — 2026-08-01 (three parallel read-only audits, file:line evidence in the PR)

### Consolidated classification (replaces the PENDING_AUDIT rows)

| Domain | Class | The one-line truth |
|---|---|---|
| Org identity — public page /business/<slug> | FULL but ORPHANED | complete guard-pinned anon boundary; zero inbound links, no sitemap, no logo, `description` renders but has NO write path |
| Org identity — worker-facing presentation | PARTIAL | bare name strings on opportunities/invitations (none on bookings, deliberate); SIX divergent display_name→legal_name fallback chains (invitations agency branch skips display_name) |
| Skills CRUD | PARTIAL | four separate stores; catalogue CRUD FULL; clarify flow is a write-only sink; dead DELETE endpoint (zero callers); `candidate_skills` is a read-only ghost consumed by both matching engines |
| Skills verification honesty | DEFECTIVE | cv-engagement-cards renders "✓ verified" from manager_confirmed alone (contradicts skill-tiers doctrine); admin-session BLANKET verification: one approved entry flips verified=true on the whole profession (confirm-actions.ts:114 via review-actions.ts:122) |
| Skills anchor | DEFECTIVE | #candidate-skills deep link (player card + account menu) lands on the clarify form, not the skill list |
| Work history — worker self view | FULL | card timeline + profile + /cv; BUT work-history.ts lacks the WORKER_RELATIONSHIPS filter → card shows manager/student/volunteer rows the CV omits (three duplicate queries diverge) |
| Work history — employer view | MISSING | no employer-facing work history exists anywhere |
| Certificates — declared (no file) | FULL (applied) | worker_achievements declared_certificate; no expiry field (migration → owner gate) |
| Certificates — worker_documents chain | BLOCKED (unapplied) | 20260610170000 + 20260613100200 NOT in APPLIED_LEDGER; RPC upsert_worker_document exists in repo, hardened, ZERO app callers — write path buildable code-only with honest needs-migration degradation; prod activation = owner applies the two migrations |
| Certificates — file upload | BLOCKED (owner gate) | no bucket; needs new storage migration |
| Public worker profile / share | BLOCKED (owner gate) | no route/token/slug; HARD legal prerequisite: consent registry has NO purpose for anonymous exposure (consent-definitions.ts:36-38 names adding one as the precondition) — owner wording |
| Employer person page skills | DEFECTIVE (live) | people/[workerId] selects columns DROPPED in 0012 → silently renders zero skills for every worker (error never checked) |
| Contact disclosure delivery | PARTIAL (dead-end) | consent+grant lifecycle works; record_personal_data_disclosure RPC applied with ZERO callers — nothing is ever delivered |
| Employer-visible card | MISSING (owner scope gate) | no flow at any consent level; extending beyond the 7 DISCLOSABLE_FIELDS needs owner consent-scope ruling |
| is_employer() gate | BLOCKED (owner gate) | derives from self-writable profiles.active_role; org-membership gate = RLS migration |
| Dead visibility mechanisms | OBSOLETE | canViewProfilePreview/resolveWorkerVisibilityRelation (no callers, stricter than shipped rule); journal visibility_scope column consulted by no policy |
| Anonymous/wrong-org leakage | FULL (none found) | anon reaches only waitlist INSERT, pilot_events INSERT, 4 allow-listed business RPCs; nothing worker-scoped |
| /cv auth backstop | PARTIAL | page-level gate only; /cv absent from middleware REQUIRES_AUTH |
| Error-vs-empty honesty | PARTIAL (systemic) | RLS denial / missing schema / genuine empty all render the same empty state on every identity read surface — exactly why the employer-skills defect was invisible |

### W4 slice plan (owner order: complete PARTIAL, implement launch-critical MISSING, no rebuilds)

1. **SLICE 1 — identity honesty & correctness (code-only, live on deploy):** fix employer person-page skills select; adopt the stricter verified rule in cv-engagement-cards; scope the blanket-verify write to the actually-confirmed skill ids; fix the #candidate-skills anchor; add the WORKER_RELATIONSHIPS filter to work-history.ts; delete the dead skills DELETE route + dead visibility helpers; error-vs-empty distinction on the profile/person skill reads.
2. **SLICE 2 — certificates write path:** server action + form wrapping upsert_worker_document with honest needs-migration state (prod activation owner-gated on applying 20260610170000/20260613100200).
3. **SLICE 3 — org identity completion:** description write path via existing owner RLS; ONE shared org-display helper replacing the six chains; link opportunity/invitation org names to the published /business/<slug> when it exists; add /cv to middleware REQUIRES_AUTH.
4. **OWNER-GATED, reported once (no loops):** public worker profile (consent purpose wording + migrations), certificate file bucket, declared-cert expiry column, country_document_requirements curation, employer-visible card scope, is_employer org-membership gate, contact-disclosure delivery scope confirmation.
