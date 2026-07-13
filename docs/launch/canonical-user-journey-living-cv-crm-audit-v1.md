# Canonical User Journey & Living CV/CRM — Architecture Audit v1

Status: **AUDIT ONLY — implementation gated on owner decision for PR #746**
Date: 2026-07-13
Base: `origin/main` @ `790fe680` (PR #744 merged)
Branch: `feat/canonical-user-journey-living-cv-crm-v1`
Blocking gate: PR #746 (`feat/production-ux-root-cause-repair-v2`, 77 files) is OPEN and
overlaps this programme's surface (navigation.ts, dashboard-module-registry.ts,
profile-text-first-flow.tsx, skill-claim-extractor.ts, company page, market map,
company_locations migration). Per operating baseline, no implementation starts on this
branch until the owner merges or closes #746.

---

## 1. Route inventory (worker / company / agency)

~98 `page.tsx` routes under `apps/web/app/[locale]`. Primary nav
(`lib/config/navigation.ts`) exposes only 4 tabs + conditional admin:
`/dashboard`, `/dashboard/market-map`, `/dashboard/journal`, `/dashboard/communication`
(+ `/dashboard/admin`). Everything else is reached via the dashboard module grid
(`lib/dashboard/dashboard-module-registry.ts`), account menu, in-page links, or not at all.

### Worker
| Route | Purpose |
|---|---|
| `/dashboard` | Shared overview (premium hub + module grid + my-zone + next-action) |
| `/dashboard/journal` (+`/voice`) | Work journal (primary tab), player-card identity |
| `/dashboard/profile` | Structured profile, skills, availability prefs, languages |
| `/cv` | Verified CV print view (read-time composition) |
| `/dashboard/opportunities` | Demand consumption, match signals, save/compare |
| `/dashboard/reports/evidence` | Print evidence report |
| `/dashboard/player-card` | Redirect → journal (already consolidated) |

### Company
| Route | Purpose |
|---|---|
| `/dashboard/company` | Canonical company workspace (demand intake, roster, scouting bridge) |
| `/dashboard/company/scouting` | Deterministic match-v1 shortlist over own demand |
| `/dashboard/company/projects/new`, `/dashboard/projects*` | Project map/stadium/operations |
| `/dashboard/candidates` | Private drafts of UNREGISTERED people (separate model) |
| `/dashboard/inbox` (+`/quick`, `/report`) | Journal review inbox (3 views of one queue) |
| `/dashboard/instructions`, `/dashboard/finance` | Instructions channel, finance records |

### Agency
Agency is **not a distinct identity** (owner decision "Direction A", 2026-07-05):
onboarding offers only `worker`/`company` (`components/app/onboarding-wizard.tsx:18`);
`/dashboard/agency`, `/dashboard/agency/pool`, `/dashboard/start/agency` are redirect
stubs into the company workspace; agency mode = `companies.company_type='staffing_agency'`
chip on `/dashboard/company`. **No client management, no multi-company handling exists.**

### Shared (all roles, module grid)
`/dashboard/tasks`, `/bookings`, `/planning`, `/network`, `/communication(/[id])`,
`/documents`, `/services`, `/service-requests`, `/activity`, `/assist`, `/reports`,
`/privacy`, `/market-map`, `/account`, `/start*`, `/dashboard/buyer` (customer role).

### Admin (18 routes, superadmin-gated)
Incl. `/dashboard/admin/company-need-intakes`, `/matching`, `/pipeline`,
`/candidate-pool`, `/need-structuring`, `/market`, `/league`, `/launch-readiness`, etc.

### Public/marketing (23)
`/company-need`, `/worker-intake`, `/match-preview` (AI-draft demos, non-persisted),
`/for-workers|companies|agencies`, `/labour-market(/[country])`, taxonomy/SEO pages, legal.

---

## 2. Component inventory per domain (dashboard, profile, CV, journal, skills, jobs, offers, contacts, candidates, CRM, communication)

- **Dashboard hubs — 5 overlapping implementations:** `premium-hub/**`,
  `my-zone.tsx` + `control-room-view-model.ts`, `dashboard-module-grid.tsx` + registry,
  `today/today-screen.tsx` + `lib/worker/today-screen.ts`, `my-work-view.tsx` +
  `lib/dashboard/my-work-view.ts`. The worker `/dashboard` page stacks **three at once**.
- **Next-action — 5 engines + 2 company blocks:** `lib/dashboard/next-action.ts`,
  `lib/worker/next-action-engine.ts` (command queue), `lib/profile/profile-next-action.ts`,
  `lib/process-brain/profile-process-brain.ts`, `lib/dashboard/my-work-view.ts`; plus
  `company-next-actions.tsx` AND `company-action-next-actions.tsx` render together on
  company surfaces.
- **CV input:** `cv-import-upload.tsx` → `/api/cv/extract` (`lib/cv/extract.ts`, real
  PDF/DOCX/TXT extraction) → `cv-input-panel.tsx` → `profile-text-first-flow.tsx`.
  `lib/cv/types.ts` declares an M2 structured-import contract (`CvImportData`) that is
  **not implemented** — raw text feeds the skill-claim extractor and is discarded.
- **CV output:** `lib/cv-export/verified-cv.ts` (`buildVerifiedCv`), `skill-tiers.ts`,
  `/cv` page, `cv-preview.tsx`. Reads canonical tables at read time; no stored CV entity.
- **Journal:** `journal-entry-composer.tsx`, recognition via
  `lib/structuring/skill-recognition.ts` + `extract-journal-suggestions.ts`, links via
  `lib/journal/journal-entry-skills.ts`, tier recompute `lib/journal/skill-source*.ts`,
  confirmations `lib/journal/confirm-actions.ts`.
- **Skills — 3 extractors, 2 stores:** `lib/profile/skill-claim-extractor.ts`
  (free-label → `profile_skill_claims`), `lib/structuring/extract-profile-suggestions.ts`
  and `extract-journal-suggestions.ts` (catalogued → `worker_skills` /
  `journal_entry_skills`). Three parallel tier encodings: `journal/skill-source.ts`,
  `cv-export/skill-tiers.ts`, `profile/skill-evidence.ts`.
- **Candidates — 4 separate surfaces/models:** admin candidate-pool (`lib/staffing/candidate-pool*`),
  manager `candidate_drafts` (`lib/candidates/**`), company scouting `demand_shortlist`
  (`lib/scouting/**`), legacy agency pool (`lib/agency/pool.ts`).
- **Communication:** `lib/communication/**` (conversations model, eligibility,
  attachments, translation stubs); IA collision: `/dashboard/inbox` is journal review,
  `/dashboard/communication` is messaging — both named "inbox".
- **Availability/salary/location stored in 2–3 disjoint shapes each:** work-card columns
  (`lib/worker/work-card.ts`) vs availability-prefs v1/v2
  (`lib/worker/availability-prefs*.ts`) vs `lib/location/**` vs `lib/demand/demand-location.ts`.
- **Orphaned duplicates still in tree:** `profile-cv-clarity-card.tsx`,
  `worker-evidence-card.tsx`, `profile-process-assistant.tsx` (removed from pages,
  files remain).

---

## 3. Tables, RPC and RLS supporting these flows

RLS posture: fail-closed platform-wide; dominant pattern = SELECT policy scoped to
owner/admin/relationship, writes via SECURITY DEFINER RPCs only.

| Domain | Canonical table(s) | Notes |
|---|---|---|
| Identity | `profiles`, `profile_roles`, `workers` | availability/salary/prefs live as `workers` columns (v1+v2) |
| CV file | `worker_documents` (`document_type='cv'`, `file_path`) | disconnected from structured profile |
| Structured CV | read-time join of `workers` + `worker_skills` + `worker_professions` + `worker_languages` + `profile_skill_claims` | **no stored CV entity** |
| Journal | `journal_entries` (hash-chained), `journal_entry_skills`, `journal_entry_confirmations`, `journal_entry_extractions` (built, unused), `journal_entry_photos` | `confirm_entry_and_verify_skills()` flips `worker_skills.verified` |
| Skills | `skills` + `esco_*` (2 catalogues), `worker_skills`, `profile_skill_claims`, `candidate_skills` | 5 stores, reconciled only via RPCs |
| Demand | `customer_requests` (live), `company_need_public_intakes` (anonymous, deny-all RLS), `job_demands` (dormant, 0001) | **3 models, no bridge between them** |
| Matching | `matches`/`match_actions` (dormant); live = `list_open_demand_for_workers()` RPC + `demand_interest_signals` + `demand_shortlist` | |
| Pipeline | `project_worker_operational_statuses` (8 states), `demand_shortlist`, `demand_interest_signals`, `booking_requests`, `candidate_drafts` | **6 competing status enums, no canonical funnel** |
| Communication | `conversations`, `conversation_participants`, `conversation_messages`, `conversation_message_attachments`; `work_instructions` separate | legacy `threads`/`messages` dropped |
| Network | `invitations` (canonical, applied 2026-07-12), `engagement_contexts` (spine); legacy `agency_worker_invitations`/`company_worker_invitations` not dropped | |
| Planning | `work_tasks`, `follow_up_tasks`, `booking_requests` | no calendar/events entity; **no interview entity** |
| Notifications | none — ad-hoc `*_seen` tables + `last_read_at` | |

Key RPCs: `save_worker_card`, `save_worker_availability_prefs(_v2)`,
`create_journal_entry_full`, `review_journal_entry(+batch)`,
`confirm_entry_and_verify_skills`, `save_demand_draft`, `submit_demand_request`,
`list_open_demand_for_workers`, `submit_company_need_public_v1`,
`propose/respond/withdraw_booking_request(_v2)`, `set_worker_operational_status`,
`create_invitation_v1` family, `can_view_worker()` (consent-gated discovery).

Applied-ledger state (docs/APPLIED_LEDGER.md): `work_tasks`, `finance_records`,
`invitations`, `worker_languages`, prefs v2, `worker_saved_opportunities`,
booking lifecycle v2, privacy consent — all APPLIED. `company_locations`
(20260713120000) exists only in PR #746 — **not in main**. Journey-critical fragility:
`20260702140000_worker_personal_engagement.sql` header says NOT applied by automated
session — if genuinely unapplied in prod, a fresh solo worker's Journal tab dead-ends
at `contextState="none"` (owner should verify against the Supabase ledger).

---

## 4. Existing AI call sites

- **Real inference (1):** voice transcription — self-hosted whisper.cpp
  (`services/transcribe/server.mjs`) via `lib/voice/transcribe-action.ts`; honest
  degradation when env unset; transcript is human-confirmed before journal persist.
- **LLM runtime (built, OFF):** `lib/ai/runtime/**` — Anthropic provider
  (`providers/anthropic.ts`, the only allowlisted SDK importer), mock/disabled providers,
  cost guards. Gated by `AI_PROVIDER_MODE` + `AI_API_KEY` (unset everywhere).
- **Agent registry: 11 registered, only 3 invoked** (`worker_profile`, `company_need`,
  `matching_explanation`) — and only from the three public marketing demo pages
  (`/worker-intake`, `/company-need`, `/match-preview`), all non-persisted.
  **8 agents are dead prompts** (incl. `work_journal`, `skill_evidence`,
  `booking_risk`, `translation_copy`).
- **Second inert boundary:** `lib/ai/provider.ts` noop + `lib/config/ai.ts`
  (`AI_ASSIST_ENABLED=false`) — only consumer is estimate-clarify. Two separate AI
  gates exist (env-driven runtime vs source-literal assist flags).
- **Rule-based recognition labelled honestly:** `lib/structuring/**`,
  `skill-claim-extractor.ts` — deterministic dictionaries, no model.
- **Fake-AI copy risk:** `/work-abroad` renders `workAbroad.aiNote`
  ("AI helps prepare your CV and profile…") with **no AI behind it**.

---

## 5. Duplicated or competing surfaces

1. CV input vs CV output share no storage (upload → extractor fuel only).
2. 2 skill stores + 3 extractors + 3 tier encodings.
3. 4 candidate list surfaces with 4 different backing models.
4. 6 pipeline status enums; no canonical funnel.
5. 3 demand models with no conversion path between them.
6. 5 hub/cockpit implementations; 3 rendered simultaneously on `/dashboard`.
7. 5 next-action engines + duplicated company next-action blocks.
8. 2 "inbox" surfaces (messaging vs journal review) with colliding naming.
9. Availability (2 stores), salary (2 shapes), location (3 shapes).
10. 2 skill catalogues (`skills` native vs ESCO).
11. `/dashboard/search` page vs embedded CommandFinder (page is orphaned).
12. 3 report surfaces (`/reports`, `/reports/evidence`, `/inbox/report`).
13. Legacy not dropped: `agency_worker_invitations`, `company_worker_invitations`,
    `company_workers`/`agency_workers` link tables, `agencies` table.

---

## 6. Dead-end and demo pages

- Orphaned (no inbound links): `/dashboard/search`.
- Deliberately parked previews (guard-enforced unlinked): `/dashboard/learning`,
  `/dashboard/talent`, `/dashboard/visual-os(/agency)`.
- Demo/non-persisted: `/worker-intake`, `/company-need` (public side),
  `/match-preview`, `/dashboard/market/recognize`, `/dashboard/assist`
  (honest disabled state), `/dashboard/admin/agent-os` (static docs).
- Dead-end by data: `/dashboard/admin/company-need-intakes` queue — intakes never
  convert to positions or link to accounts.
- Dormant model: `job_demands` + `matches`/`match_actions` (0001-era, unused by live flow).

---

## 7. Where the full user journey breaks

### Worker (registration → … → contact with employer)
| Step | State |
|---|---|
| Registration, role pick, CV import → per-chip confirm → profile claims | **Works** (strongest part) |
| Journal entry | Conditional: requires `engagement_contexts` row; solo-worker personal engagement depends on `20260702140000` being applied |
| Entry → visible skill growth | Partial: links bump evidence tier, but logging never creates a skill; confirmation requires a manager with review enabled — a solo worker's skills are frozen at `self_declared` forever |
| Matching offer + explanation | Works (deterministic match-v1, honest per-dimension explanation) |
| **Contact employer** | **DOES NOT EXIST.** Worker can only write an internal interest signal (`demand_interest_signals`); `evaluateContactPermission` has no worker-initiated path; only companies open threads. The journey ends in a waiting room. |

### Company (need → … → decision)
| Step | State |
|---|---|
| Registration, company profile | Works |
| Need intake | **Fragmented ×3**: public `/company-need` (anonymous, dead-ends in admin queue), dashboard `DemandDraftForm` (draft only), root `#demand-intake` wizard (actual submit). None feed each other — same data entered up to 3 times. |
| Need → structured position | Partial: recognition + human confirm on scouting page; backfill is superadmin-only |
| Candidates, save, pipeline status | Works (scouting + `demand_shortlist`), but confusable with `/dashboard/candidates` drafts |
| Contact candidate | Works (gated, no PII leak) |
| Next action | Present but duplicated across 3 components |
| Decision | Partial: booking proposal exists; no hire/close outcome that retires the demand |

### Agency
Journey **does not exist** as a distinct product (deliberate Direction A). Missing
entirely: client entity, multi-company representation, client→position→candidates flow.
Owner decision required: keep folded into company (document honestly) vs build the
client-management layer.

---

## 8. What can be reused (do not rebuild)

- `lib/market/match-v1.ts` + match explanation components — real, honest matching.
- `lib/scouting/**` + `demand_shortlist` — working candidate shortlist with statuses.
- `project_worker_operational_statuses` — 8-state enum covers most of the target
  pipeline (naujas≈candidate, susisiekti≈contacted, priimtas≈assigned, atmestas≈rejected).
- `booking_requests` lifecycle v2 — the offer/pasiūlymas stage.
- `conversations` model + eligibility gates — communication primitive.
- `engagement_contexts` + canonical `invitations` — relationship spine.
- `lib/cv/extract.ts` + `cv-input-panel.tsx` — real CV text extraction.
- `lib/cv-export/verified-cv.ts` — the canonical CV composition (extend, don't replace).
- `confirm_entry_and_verify_skills()` — the journal→verified-skill chain.
- `lib/ai/runtime/**` + registry — the reusable AI layer (8 dead prompts ready to wire).
- `journal_entry_extractions` table — already-built home for AI import/extraction
  provenance with `worker_confirmed_subset` (human-review contract in schema).
- `customer_requests.kind/payload` — extensible structured-need storage.
- Admin `company-need-intakes` queue — keep as operator CRM, add conversion.

## 9. What to remove, merge, or make canonical

| Action | Target |
|---|---|
| Make canonical | ONE next-action engine per identity (fold 5 engines into `lib/dashboard/next-action.ts` or successor) |
| Make canonical | ONE worker hub composition on `/dashboard` (collapse premium-hub / my-zone / module-grid stacking) |
| Make canonical | `demand_shortlist` + `project_worker_operational_statuses` + `booking_requests` as THE pipeline; map missing stages (`peržiūrimas`, `pokalbis`) before adding any new table |
| Merge | 3 company need-intake surfaces into one flow (draft → submit in one place; public intake gets a conversion path) |
| Merge | CV upload into structured profile via implemented M2 contract (`lib/cv/types.ts`) with human-confirm review using `journal_entry_extractions`-style provenance |
| Merge | free-label claims → catalogued skill promotion path (so journal evidence works for claims) |
| Remove | orphaned components (`profile-cv-clarity-card.tsx`, `worker-evidence-card.tsx`, `profile-process-assistant.tsx`), `/dashboard/search` page (or link it and remove embedded duplicate) |
| Remove/rename | "inbox" naming collision (journal review vs messaging) |
| Fix copy | `/work-abroad` aiNote (claims AI with no backing) |
| Build (small) | worker-initiated contact path (extend `communication-eligibility.ts` — likely no new table needed: interest signal + company ack already exist) |
| Build (small) | intake→`customer_requests` conversion RPC for the admin queue |

## 10. Migration needs and owner-gate boundaries

**Likely NO new tables needed** for P0–P2. The existing model supports the target
pipeline with two gaps:

1. **Pipeline stages `peržiūrimas` (reviewing) and `pokalbis` (interview)** — extend
   `project_worker_operational_statuses` CHECK or `demand_shortlist` statuses
   (additive enum extension; migration + rollback; human-gated; NOT applied by agent).
2. **Need→position conversion** — new RPC (SECURITY DEFINER) promoting a
   `company_need_public_intakes` row into `customer_requests`; additive, no schema change
   beyond the function (still human-gated per repo policy).
3. **CV structured import (M2)** — decide storage: reuse `journal_entry_extractions`
   pattern vs a `profile_import_reviews` table. Only if reuse proves objectively
   impossible does a new table get drafted (additive, RLS fail-closed, paired rollback,
   APPLIED_LEDGER Deferred, human-gate).

**Owner gates (hard stops):**
- Merge/close decision on **PR #746** (blocks this whole programme's implementation).
- Apply `company_locations` migration from #746 (already owner-gated there).
- Verify + apply `worker_personal_engagement` (20260702140000) if prod lacks it —
  without it the solo-worker journal journey is broken in production.
- Any new migration application (agent drafts only, never applies).
- Agency direction: confirm "stay folded into company" or approve client-management scope.
- AI provider activation (`AI_PROVIDER_MODE=live` + `AI_API_KEY`) — without it all
  LLM-backed steps ship as deterministic + honest-disabled states.
- Voice transcribe service deploy (env gated).

---

## Proposed implementation order (post-#746 decision)

P0: one hub composition + one next-action engine per identity; nav path completeness;
remove orphans. P1: living CV — M2 import contract, human-review import screen,
claim→catalogue promotion, journal→profile visible delta. P2: canonical pipeline mapping
+ missing stages + need conversion + worker contact path. P3: wire 3–4 dead registry
agents into real flows behind existing gates. P4: reuse-first data entry (kill the
triple need intake). P5: text-noise pass on changed screens.
