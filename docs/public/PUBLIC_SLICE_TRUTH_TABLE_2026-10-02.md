# Public acquisition slice — product-truth table (2026-10-02)

Scope: `/`, `/for-workers`, `/for-companies`. Every claim or UI state the
premium concept boards used, traced to the repository. **Rule: a claim that is
not VERIFIED is changed in copy or design — never given new backend truth.**
Paths relative to repo root. Source: two read-only audits of the repo on
2026-10-02 (no data was read from production).

## A. Record states and confirmation

| Concept board state | Source of truth | Status | What the public copy may say |
|---|---|---|---|
| "Recorded" | `journal_entries` has **no status column** (`supabase/migrations/0013_work_journal_m1.sql:123-137`); state is derived from the append-only `journal_entry_confirmations` ledger | VERIFIED (as "no review yet") | "You record the work." Never "submitted/approved" as stored statuses. |
| "Waiting for manager" | `apps/web/lib/journal/review-status.ts:14-23,79-93` — `submitted` = no confirmation row yet | VERIFIED | "Waiting for a manager's review." |
| "Confirmed" | `review_journal_entry` (`20260720150000_journal_photo_continuity_v1.sql:509`), decision `approved`; confirmed skills flip to `verified` via `confirm_entry_and_verify_skills` | VERIFIED | "A manager confirms it." Only where the org has `journal_review_enabled` and a manager/owner/external-manager engagement exists. |
| "Returned with a question" | `changes_requested` carries an optional free-text note; **no question/reply thread** exists (`review-status.ts`, `messages/en/journal.json:91-102`) | PARTIAL | "Sent back for changes, with a note." **Not** "a question". Also `rejected` exists (label "Returned"). |
| Worker-recorded but unconfirmed | `self_reported` verification state (`apps/web/lib/journal/work-verification-state.ts:72-103`); label "Your own record — no manager confirmation yet" | VERIFIED | "It stays your own record until someone confirms it." |
| Self-confirmation | DB does not block it; read side labels `self_confirmed`; open owner decision EVID-2 | PARTIAL | Never claim every confirmation is independent. |
| Manager records on a worker's behalf | Exists for **hours** (`work_hour_allocations.entered_by`), not for journal entries | PARTIAL | Do not say a manager can write a worker's journal entry. |
| "Unknown / not recorded" | Absence of rows; unknown ≠ 0 (SEP-7) | VERIFIED | "Not recorded yet" is a separate display state, not a workflow state. |

## B. Evidence, hours, history

| Concept | Source | Status | Copy rule |
|---|---|---|---|
| Photos on a record | `journal_entry_photos` (`20260612091000_journal_entry_photos.sql`), `photoCount` in `work-intelligence.ts:167` | VERIFIED | "Add a photo." No invented counts on public pages. |
| Hours per record | derived from `journal_entry_metrics` (`apps/web/lib/journal/work-time.ts`); untimed entries exist and are never printed as 0 h | VERIFIED | "Record the time" — hours are optional per record. |
| Hours totals | timesheets / org journal window report / hours export exist | VERIFIED | No numeric totals in public sample except labelled **Example**. |
| Living CV shows only confirmed work | `apps/web/lib/cv-export/verified-cv.ts`, `confirmation-standing.ts` | VERIFIED | "Confirmed work joins your professional history." Unconfirmed work stays visible as the worker's own record. |
| "Next" separate from history | availability is declared (`workers.available_from`, `availability_status`) | VERIFIED (declared only) | "Available from … — as you state it." Never "checked/booked". |

## C. Public claims

| Claim | Source | Status | Shipped wording |
|---|---|---|---|
| Free for workers | `apps/web/lib/billing/plans.ts:20-31,42,118`; `launch-pricing.test.ts`; owner 2026-09-05 "launch pricing" | VERIFIED | "Free for people." Not "free forever". Existing guarded FAQ wording retained. |
| Company pricing | `plans.ts:32-38`: 1 active position free; Organization EUR 99/month up to 10; PAYMENTS_ENABLED=false | VERIFIED | Landing does **not** print prices; links to `/pricing` (price lives in DB RPC only). "Posting what you need is free." |
| "You decide who sees your history" | `20260711130000_privacy_consent_and_disclosure_v1.sql:224-262` — one switch (`profile_discoverability`, default **not granted**); CV/contact shared only on separate confirmation; the organisation worked for sees work logged for it; admins see all; no worker share-link UI | **PARTIAL — too broad** | Replaced by: "Your profile stays private until you switch visibility on. Then companies see a short professional summary. Your CV and contact details are shared only when you confirm. The company you work for sees the work logged for it." |
| Employers see "records-backed" history | same; summary shows name, professions, experience years, availability, skills count — no CV | PARTIAL | Do not say employers see the full history. |

## D. Company side

| Concept | Source | Status | Decision |
|---|---|---|---|
| Post what you need | `job_demands`, `customer_requests`, `/company-need` | VERIFIED | Primary company CTA (existing route, unchanged). |
| Find people | `/dashboard/talent` | VERIFIED | Kept. |
| "Build teams" as assigning a whole team/brigade | product-truth: whole-team assignment NOT_BUILT, matching a brigade as a unit BROKEN | **UNSUPPORTED** | Copy: "Put the people you work with on a project." (`project_worker_assignments`, `company_workers` exist). No "hire a team" claim. |
| Run work / daily records / confirm | org journal review + hours | VERIFIED | Kept. |
| "3 things need you" aggregate attention panel | real parts exist (records awaiting review, open need); the aggregated panel is a design | PARTIAL | Shown only as a labelled **Example** moment built from real parts: records waiting, open need. |
| Capacity grid / "who you'll need next" | no forecast/capacity object (`DEM-8` MISSING) | **UNSUPPORTED** | Removed. Replaced by "Post the next need" (real). |
| Attendance / "who is on site" | not modelled | **UNSUPPORTED** | Never shown. |
| Planned dates per person, instruction tick-lists, project stages, capability provenance | not modelled | **UNSUPPORTED** | Not in public pages; calendar People-in-time / Work-in-time stay design-only. |

## E. Copy provenance (i18n)

`en` and `lt` authored by the maintainer in this slice. `de`, `pl`, `ru`
(active routed locales) are **AGENT_TRANSLATED**, not native-reviewed; recorded
in `apps/web/messages/public-slice.provenance.json`. Other catalogs fall back
as before. No claim of native review is made.
