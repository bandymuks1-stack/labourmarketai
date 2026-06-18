# Full Product Signal Train — final report

Date: 2026-06-19. Source of truth: `LABOURMARKETAI_FULL_PRODUCT_TRAIN.md`.
Autonomous train run #477 → #481, each: fresh branch → discovery → audit → smallest
real slice → tests → validation → PR → CI green → squash merge → Vercel git-auto
deploy → production smoke.

## 1. PR list and merge SHAs
| PR | Title | Merge SHA |
|---|---|---|
| #477 | Universal Work Text → Skill Recognition Core v1 | `04ca41c39ee1bc9512269ab772d90b5ee34056e8` |
| #478 | Work Entry Review UI + Persistence Bridge v1 | `f3ad6873483e0ef9977b0382e2620c499c5649e8` |
| #479 | Evidence Report Generator v1 | `1b1a45b3fe580a3aa5f45250cf49e0f700efaad8` |
| #480 | Product Signal Connection v1 | `ff5313879940b46a7571a913bebe3a88458cebac` |
| #481 | Labour Market World Map Visual v2 | `1ad63cded9d5e827f69f7e9fc661ee213d12e0de` |

Per-PR audits live under `docs/audits/`.

## 2. What skill recognition now supports (#477)
Deterministic `recognizeUniversal(text)` (`lib/structuring/universal-recognition.ts`): cross-domain candidate skills (construction, web/design, admin/warehouse, cleaning, electrical) + verbs, objects, quantities (e.g. 50 m²), ALL durations, domain hints, and UNMAPPED phrases for unresolved work. LT-first, EN/RU-safe folding. Suggestions are always "suggested / not confirmed"; unknown work → an unmapped phrase, never an invented unrelated skill. Fixed the measured gaps (web/admin empty, cleaning→carpentry false positive, dropped 2nd duration). No external AI.

## 3. What work entry review supports (#478)
"Suggested skills from this entry" review panel (`components/app/work-entry-skill-review.tsx`, mounted in the journal composer): cross-domain suggestions with reason + domain, detected quantities/durations, unmapped phrases, accept / ignore. Accept → a self-declared profile claim via the existing claims path (supported/profile signal, never verified). Persistence reuses existing tables (`profile_skill_claims` / `journal_entry_skills` / `worker_skills`) — no DB migration.

## 4. What reports exist (#479)
Print-ready Evidence Report at `/dashboard/reports/evidence` (`lib/reports/evidence-report.ts`): 5 honest sections — profile evidence, skills supported by work entries, work-entry summary, missing evidence / confirmation needed, work-need fit readiness. Separates self-declared → supported by entry → confirmed by a person. No fake scores/verification/matching; fit readiness `not_available` without a real work-need context. PDF = browser print (no new dependency).

## 5. How product signals connect (#480)
`lib/signals/connected-skill-signal.ts` (`mergeSkillSignal` + `getOwnAcceptedClaimCount`) unions accepted self-declared claims into the shared skill signal (read-only, no DB). Accepted suggestions now light up My Work View and the World Map honestly as self-declared. End-to-end chain: work text → recognition (#477) → review/accept (#478) → cockpit + map signals (#480) → evidence report (#479).

## 6. How the map uses real signals (#481)
Labour Market World Map v2 (`components/app/labour-market-world-map.tsx`): an original map-like canvas — central Profile Hub + glowing routes to districts (skills/evidence, availability, work needs, company, teams, trust, market pulse), desktop canvas + side panel, mobile vertical path. Zones light up from real owner signals (incl. accepted claims); empty zones stay honest. No fake markers/coordinates. The market-map page is reordered so the world view is the first impression; the Google Maps configuration notice is a secondary, future precise-location layer below.

## 7. What remains backend / DB / AI / future work
- Promoting accepted self-declared claims to catalogued `worker_skills` taxonomy slugs (taxonomy growth) — owner-gated.
- Mapping non-canonical candidate labels (web/admin/cleaning/electrical) to canonical skills.
- Teams/brigades real data; cross-user / consent-aggregated market pulse; confirmed coordinates → real precise map points (the secondary Google layer).
- Richer company / work-need fit using a real need-skill model.
- Persisting unmapped phrases / report snapshots as structured rows → a dedicated migration PR (RLS + tests).
- Optional future AI assist on recognition (core stays deterministic).
None of these are faked today — all surface as honest empty/concept/not-available states.

## 8. Production smoke summary
All five deploys = success (Vercel git-auto). Auth-gated surfaces correctly redirect unauthenticated: `/dashboard/journal`, `/dashboard/reports/evidence`, `/dashboard/market-map` → `/auth/login`. Public landing `/en` 200. Recognition/report/signal/map logic covered by the full vitest suite (4777 tests green at the end of the train) + per-PR guards.

## 9. Safety confirmations
Across the whole train: no DB migration · no Supabase/RLS/auth/billing change · no env/secrets · no manual deploy (Vercel git-auto only) · no external AI/API · no fake data (workers/companies/demand/markers/coordinates/scores) · no automatic verification · no guaranteed matching/job · no old LABMA naming · no "living/gyvas/живой" wording · no external product copying. Each PR was migration-safety green and quality green before squash merge.