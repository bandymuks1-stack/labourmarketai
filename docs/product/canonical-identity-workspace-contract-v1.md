# Canonical Identity Workspace Contract v1

Status: ACTIVE (canonical-user-journey-living-cv-crm v1)
Date: 2026-07-13

## The rule

Each identity has exactly ONE canonical work centre. Every other surface
either feeds it or is reachable from it — never competes with it.

| Identity | Canonical work centre | Entry |
|---|---|---|
| Worker | `/dashboard` (premium hub person block + top-slot + module grid) with `/dashboard/journal` as the primary work surface | primary nav |
| Company | `/dashboard/company` | module grid / identity actions |
| Staffing agency | `/dashboard/company` with `company_type='staffing_agency'` mode sections (owner decision Direction A — never a separate dashboard) | same as company |
| Customer/buyer | `/dashboard/buyer` | identity actions |
| Admin | `/dashboard/admin` | admin tab |

## One next-action resolver

`apps/web/lib/dashboard/next-action.ts` is THE canonical next-action module:
role actions (`workerNextAction` / `managerNextAction` / `customerNextAction`)
plus the profile hub's `deriveProfileNextAction`. The state-driven top-slot
ladder stays in `lib/dashboard/top-slot.ts` (it selects WHICH pending-state
card claims the one above-the-fold slot; the resolver decides the role's
next action). Candidate-pipeline stage next-actions live with the pipeline
derivation (`lib/pipeline/candidate-pipeline.ts`) because they are stage
properties, not role properties.

Removed as duplicates (2026-07-13): `lib/worker/next-action-engine.ts`
(S9 command queue), `lib/dashboard/my-work-view.ts`,
`lib/process-brain/profile-process-brain.ts`, `lib/profile/profile-next-action.ts`
(folded in), `components/app/today/**` (today-screen cockpit),
`components/app/my-work-view.tsx`, `profile-process-assistant.tsx`,
`profile-cv-clarity-card.tsx`, `worker-evidence-card.tsx`.

## One action centre per workspace

- Worker `/dashboard`: premium hub leads; ONE top-slot card; status strip;
  module grid; readiness status (MyZone); explainers LAST.
- Company `/dashboard/company`: `CompanyNextActions` is ONLY the data-driven
  status/fix header; `CompanyActionNextActions` is the one room action card.
  The static four-card explainer stack is gone and must not return
  (guard: `company-dashboard-next-actions.test.ts`).

## Forbidden (guard-enforced where possible)

- A second dashboard, profile, CV, candidate list, calendar, communication
  centre, or standalone AI dashboard.
- A separate "employer preview" surface for workers.
- Duplicated "kitas veiksmas" blocks on one screen.
- Re-adding the removed engines/components above.
- `/dashboard/search` as a page — CommandFinder embedded on `/dashboard`
  is the one search home (`universal-search-reports.test.ts`).

## Where a fact lives (one canonical place)

| Fact | Canonical home |
|---|---|
| Worker identity/profile | `/dashboard/profile` (structured), `profiles` + `workers` |
| CV (output) | `/cv` — read-time composition of canonical tables (`lib/cv-export/verified-cv.ts`) |
| CV (input) | profile text-first flow (text saved to `profiles.profile_text`; confirmed suggestions → `profile_skill_claims` + promoted `worker_skills`) |
| Work history evidence | `journal_entries` + `journal_entry_skills` |
| Skills | `worker_skills` (catalogued) + `profile_skill_claims` (free-label, claims-only tier) |
| Availability/pay/location | work-card editor inside the hub person block (`workers` columns) |
| Demand | `customer_requests` (drafts AND submitted — one row promoted in place) |
| Candidate pipeline | derived stage over `demand_shortlist` + `demand_interest_signals` + `booking_requests` + conversations (`lib/pipeline/candidate-pipeline.ts`) |
| Communication | `conversations` model; `/dashboard/communication` |
| Next action | `lib/dashboard/next-action.ts` (+ stage actions in the pipeline module) |
