# Convergence Changelog — Single Universal Product

> **Branch:** `feat/cc/converge-single-product`
> **Date:** 2026-05-30
> **Goal (locked):** LABMA OS is ONE working universal labour-market product.
> No parallel models, no duplicate flows, no sample/mock data in the product
> surface. Marketing illustrative content stays clearly separated from the
> functional app.

This PR is the **safe convergence slice**. Roughly half of the original
convergence brief was already true in the codebase (verified against the live
DB `gorgitwvdzxbnaxhrsrw` and the migration history), and two of the locked
decisions conflicted with the work-journal → Manager-Confirm loop shipped the
same week. Per the brief's own rule ("disagreements must be raised, not
silently ignored") and PLATFORM_DOCTRINE §8.2, those were surfaced and the
owner chose: **protect the loop, stage the org reroute; neutralize the
matching UI only; ship a safe slice + changelog.** This document records the
result.

---

## 1. Single canonical path per domain (the headline)

| Domain | ONE canonical path (live) | Legacy / dormant (kept, not reachable as a parallel flow) |
|---|---|---|
| **Organisation / relationships** | `organizations` + `engagement_contexts` (`relationship_slug`) + `relationship_types`. Work Journal entries pin to an `engagement_context`, never directly to an org (doctrine §5.5). | `companies` / `agencies` = legacy backfill source (`organizations.legacy_company_id` / `legacy_agency_id`). `company_workers` / `agency_workers` remain the **live membership link** for now (they back the Manager-Confirm loop via the 0036 accept RPCs) — full reroute into `engagement_contexts` is a **staged follow-up** (see §4). |
| **Messaging** | `conversations` + `conversation_participants` + `conversation_messages`. All app code already uses `conversation_messages`. | `threads` + `messages` (both 0 rows, zero app references) → **dropped** by the migration in §3. |
| **Demand / request intake** | `customer_requests` (+ `customers`, `customer_request_attachments`) is the ONE live intake path. | `job_demands` / `matches` / `match_actions` schema kept **dormant** for the future M4 matching engine; their **reachable UI was removed** (see §2). `pilot_drafts` (pilot intake CTA) and `leads` (`/api/leads` pilot-request funnel) are **kept** — they are live, owner-reviewed intake surfaces, not duplicates of `customer_requests`. |

---

## 2. What was DELETED (code-only, this PR — non-destructive to data)

The half-wired `job_demands` matching UI was a second, reachable demand model.
It is now unreachable from the running app; the DB schema stays dormant.

**Removed files:**
- `app/[locale]/dashboard/discover/page.tsx` — worker "browse public job_demands" route.
- `components/app/job-posting-form.tsx`, `job-postings-list.tsx`, `public-job-postings-list.tsx`.
- `lib/job-postings/job-postings.ts`, `job-postings-public.ts`, `job-postings-actions.ts`, `types.ts` (orphaned after the route/components were removed — zero remaining importers).
- Guards `lib/guards/worker-jobs-browse.test.ts` and `lib/guards/job-postings.test.ts` (they **pinned the now-removed UI as reachable**).

**Edited:**
- `app/[locale]/dashboard/company/page.tsx` — removed the job-postings section + imports; the canonical `PilotDraftForm` first-action and workers section stay.
- `app/[locale]/dashboard/admin/project-truth/page.tsx` — removed the `discover` route entry (a removed route can't be advertised as "real").

**Added:**
- `lib/guards/matching-ui-neutralized.test.ts` — inverse guard: pins the matching UI as **unreachable** and asserts no migration drops the dormant `job_demands` / `matches` / `match_actions` tables. Reachable matching UI may return only as the real M4 engine, not as drift.

**Kept dormant (schema, not reachable):** `job_demands`, `matches`, `match_actions` tables + migration `0023_job_postings_grants.sql`. `content/placeholders.ts` and the marketing `recent-matches-feed` use placeholder data and live only on the `(marketing)` surface.

---

## 3. DB-touching migrations (committed in this PR, applied by owner on merge)

> Per AGENTS.md + PLATFORM_DOCTRINE §16: migrations are committed, **never run
> automatically**; the owner applies them. Every migration is reversible and
> uses the new `YYYYMMDDHHMMSS_snake_case.sql` convention (§16). Row counts
> below were asserted against live prod before authoring.

1. **Drop legacy `threads` + `messages`** — both **0 rows** (asserted). Drops the two tables, their 16 RLS policies, and `can_access_thread()`. Reversible down-block recreates them. After apply, regenerate `lib/supabase/types.ts` via `pnpm db:types` (this removes the dead `threads` / `messages` / `can_access_thread` type definitions — they are deliberately **not** hand-edited now, so `types.ts` stays a faithful mirror of live prod until the drop applies).
2. **`projects.company_id → organization_id`** — `projects` has **0 rows** (asserted). Adds `organization_id uuid REFERENCES organizations(id)`, backfills from `organizations.legacy_company_id` (no-op at 0 rows), keeps the nullable legacy `company_id` column (non-destructive, fully reversible). No app code reads `projects`, so there is no code-side change.

**Exact SQL is presented for owner approval before the files are written (brief hard-stop).**

---

## 4. Explicitly DEFERRED (not in this PR — staged, with reason)

- **Full org reroute** (`company_workers` / `agency_workers` → `engagement_contexts`). The Manager-Confirm loop currently depends on the link rows created by the `0036` accept-invitation RPCs. `engagement_contexts` lacks `operations_role` / `journal_review_enabled`. Migrating those fields + rewriting the invite/accept/assign RPCs + worker-management UI is its own migration-heavy slice; doing it here would break the working loop mid-flight. **Owner decision: stage it.**
- **`pilot_drafts` fold into `customer_requests`** and **`/api/leads` retirement** — both are wired to live CTAs (Phase 9 Sales Offer, pilot-request). **Owner decision: keep for now**, revisit when `customer_requests` fully subsumes pilot intake.
- **`leads`** stays as the manual pilot-request funnel until a real CRM intake replaces it.

---

## 5. Already true before this PR (verified, no action needed)

- **One Supabase project.** The old inactive ref `xixcyioiulptxvsolbts` exists **nowhere** in the repo; everything points only at `gorgitwvdzxbnaxhrsrw`.
- **No `prisma/schema.prisma`.** The canonical schema source is `supabase/migrations/` + generated `lib/supabase/types.ts`. (The brief's step (a) assumed a Prisma schema; corrected here.)
- **No demo drift in the product surface.** Marketing sample data is isolated under `(marketing)/`; the dashboard reads real DB data or shows explicitly **labeled** preview (`Sample ·`, `VISUAL PLAN · NOT A FEATURE PATH`, counts rendered as `0 · Preview`). No unlabeled fabricated numbers in product routes.

---

## 6. Product-loop walkthrough — verified against the live DB (honest)

Traced on live prod `gorgitwvdzxbnaxhrsrw` (no test rows written to prod):

| Step | Status | Live evidence |
|---|---|---|
| signup → onboarding | ✅ working | 12 `profiles`, all with `active_role`; 12 `workers`. |
| one honest profile | ✅ working | 1 profile ↔ 1 worker (doctrine §5.1). |
| profession + skills | ✅ working | 13 `worker_professions`, 22 `worker_skills`. |
| Work Journal entry | ✅ working | 5 real `journal_entries`, each pinned to an `engagement_context` (`relationship_slug='employee'`) per §5.5. |
| **Manager Confirm → verified proof** | ⚠️ **wired & reachable, NOT yet exercised on prod** | `journal_entry_confirmations` = **0**. Root cause: all 5 entries are pinned to **org-less** engagements (`organization_id = NULL`), and there are **0** `company_workers` / `agency_workers` link rows — so no organisation, hence no manager in the loop. Every step of the path exists (invite `0027`/`0025` → accept `0036` → enable review `0033` → confirm `0034`); none is faked. |

**Honest conclusion:** the worker-side half of the loop is live and real on
prod. The manager-side half is fully wired and reachable but has not been run
end-to-end on prod, because no worker has yet accepted an org invitation and
journaled against an org-linked engagement. To exercise it: an org owner
invites a worker → worker accepts (`accept_company_worker_invitation`, creates
the link) → owner enables journal review → worker adds an entry against that
org engagement → owner confirms → the entry becomes verified proof. This gap is
**pre-existing** and untouched by this convergence; closing it is the first
candidate for the staged org-reroute follow-up (§4).
