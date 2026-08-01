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
