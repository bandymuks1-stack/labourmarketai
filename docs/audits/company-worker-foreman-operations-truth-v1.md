# Company / Worker / Foreman Operations — Truth Audit v1

**Date:** 2026-05-29 · **Base:** main `7f6b0b2` · **Method:** repo evidence only
(routes, files, lib functions, migrations, guards). No runtime claims beyond
what the code/schema proves. Classifications: `real_working` /
`partial_working` / `ui_only` / `planned_only` / `missing` /
`unclear_needs_manual_check`.

> Headline answer to the owner's question: labourmarket.ai is **NOT yet a
> single connected company→foreman→worker→work-journal coordination
> system**. It is a set of **real but separate** pieces. Worker self-use,
> work journal (create + manager confirm), and company/agency worker
> *invitations* are real. **Foreman / brigadier / project-manager /
> site-manager roles do not exist as real roles**, per-worker role
> assignment is missing, and the employment link (`company_workers`) is
> **not connected** to the journal manager model (`organizations` /
> `engagement_contexts`).

---

## 1. Route inventory (relevant)

| Area | Route | Status |
| --- | --- | --- |
| Worker dashboard / overview | `/[locale]/dashboard` | real_working |
| Worker profile | `/[locale]/dashboard/profile` | real_working |
| Work journal | `/[locale]/dashboard/journal` | real_working |
| Manager review inbox | `/[locale]/dashboard/inbox` | real_working (journal org model) |
| Company workspace | `/[locale]/dashboard/company` | partial_working |
| Agency workspace | `/[locale]/dashboard/agency` | partial_working |
| Buyer/customer | `/[locale]/dashboard/buyer` | real_working |
| Company setup | `/[locale]/dashboard/start/company` | real_working |
| Agency setup | `/[locale]/dashboard/start/agency` | real_working |
| Buyer setup | `/[locale]/dashboard/start/buyer` | real_working |
| Account / roles | `/[locale]/dashboard/account` | real_working |
| Admin | `/[locale]/dashboard/admin` (+ project-truth, users/[id], …) | real_working |
| Communication | `/[locale]/dashboard/communication` | partial_working |
| Discover / search / talent / visual-os | various | preview / partial |

There is **no** `/dashboard/foreman`, `/dashboard/project`, `/dashboard/team`,
or worker role-assignment route.

## 2. Data-model inventory

Real tables (from `supabase/migrations`):

- People/roles: `profiles` (0001), `profile_roles` (0003), `workers` (0001).
- Employment links: `company_workers` + `company_worker_invitations` (0027),
  `agency_workers` (0001) + `agency_worker_invitations` (0025).
- Entities: `companies`, `agencies` (0001), `customers` (0026).
- Buyer demand: `customer_requests` (0028), `customer_request_attachments` (0029).
- Work journal: `journal_entries`, `journal_entry_metrics`,
  `journal_entry_extractions`, `journal_entry_confirmations`,
  `organizations`, `relationship_types`, `engagement_contexts`,
  `productivity_units` (0013); correction/soft-delete lifecycle (0018);
  atomic `create_journal_entry_full` RPC (0017).
- Skills: `skills`, `worker_skills` (0010/0011), `profile_skill_claims` (0015),
  `professions`/`worker_professions` (0008), `profession_skills` (0010).
- Legacy/unused-by-app: `projects`, `job_demands`, `matches`, `match_actions`,
  `threads`, `messages`, `plans`, `subscriptions` (0001). `projects` is
  referenced only by job-postings, **not** by worker coordination.

**Missing tables:** `teams`; any `foreman`/`project_manager` role table; any
per-worker role/title column on `company_workers` (schema has only
`status in ('active','paused','removed')`, 0027:44-51); any link between
`company_workers`/`agency_workers` and journal `organizations`/`engagement_contexts`.

## 3. Role map

Source: `apps/web/lib/config/roles.ts`, `apps/web/lib/auth/{require-role,actions,admin-signal}.ts`.

| Role | Exists in code/data? | Route | Distinct permissions/UI | Verdict |
| --- | --- | --- | --- | --- |
| worker | yes (`profile_roles`) | `/dashboard` | full self-use | real_working |
| company (admin) | yes | `/dashboard/company` | see/invite workers | partial_working |
| agency | yes | `/dashboard/agency` | see/invite workers | partial_working |
| buyer/customer | yes | `/dashboard/buyer` | request flow | real_working |
| admin/superadmin | yes (dual signal `deriveIsAdmin`) | `/dashboard/admin` | broad RLS read | real_working |
| foreman / brigadier | **no** — profession label only (`messages/*/professions.json`) | none | none | ui_only / missing |
| project manager / site manager | **no** — label only | none | none | ui_only / missing |
| team_lead | config-only, `availability:"hidden"` (roles.ts) | none | none | planned_only |

Live switchable roles are exactly `worker | company | agency | customer`
(`role-switcher.tsx` filters to `isLiveRoleId`).

## 4. Work journal truth

- Worker creates entry: **real_working** — `components/app/journal-entry-composer.tsx`
  → `lib/journal/actions.ts:createJournalEntry` → RPC `create_journal_entry_full`
  (0017) inserts `journal_entries` + `journal_entry_metrics` atomically.
- Persisted: **real_working** (real DB write; soft-delete + supersede via 0018 RPCs).
- Manager/company/admin can see entries: **partial_working** — `/dashboard/inbox`
  (`app/[locale]/dashboard/inbox/page.tsx`) lists *unconfirmed* entries for a
  viewer who manages the entry's `organization` (RLS `manages_organization`,
  0013:340-352). This is the journal **org model**, NOT `company_workers`.
- Review/approve/reject: **real_working (code)** — `lib/journal/confirm-actions.ts:
  confirmEntry/rejectEntry` append `journal_entry_confirmations`, mark
  `worker_skills` verified, recompute confidence (`lib/journal/confidence.ts`).
- Skills/evidence linkage: **partial_working** — profession-level recompute on
  confirm; no per-entry skill FK; `platform_skill_aggregates` /
  `journal_entry_extractions` are unused placeholders (M2/M3).

**Gap:** a company/foreman that invited a worker via `company_workers` gets **no**
journal visibility, because journal review keys off `engagement_contexts` /
`organizations`, which nothing in the employment flow populates.

## 5. Company worker management truth

Source: `app/[locale]/dashboard/company/page.tsx`, `lib/company/company-workers.ts`,
`components/app/company-workers-section.tsx`, migration 0027.

- See workers: **real_working** (`listActiveCompanyWorkers`).
- Invite workers: **real_working** (`invite_company_worker` RPC, 5 honest outcomes;
  no external email send — invitee self-joins).
- See pending invitations: **real_working** (`listCompanyWorkerInvitations`).
- Assign roles to a worker: **missing** (no UI, no RPC, no role/title column).
- Distinguish worker/foreman/manager: **missing** (`company_workers` has only
  `status`).
- Remove/disable a worker: **partial_working** — DB supports
  `status in ('active','paused','removed')` but there is **no UI action**.

Agency mirrors company exactly (`lib/agency/agency-workers.ts`, 0025) — same verdicts.

## 6. Foreman / project-manager truth

- Foreman / brigadier: **ui_only / missing** — only profession-label strings;
  no role, route, permission, or UI.
- Project manager / site manager: **missing / ui_only** — same.
- Can either see a team / review work / coordinate daily work: **missing** — no
  team model, and the journal review path is org-based, not foreman-based.
- This layer is **planned_only at best** — there is not even a hidden role for
  foreman/PM (only `team_lead` is a hidden future role).

## 7. Top gaps (by product value × safety)

1. **No per-worker role/title in employment links** — a company cannot mark a
   worker as foreman/manager. (Needs a small additive column or a separate
   role-assignment table → migration; owner-gated.)
2. **Employment ↔ journal disconnect** — `company_workers` not linked to journal
   `organizations`/`engagement_contexts`, so an employer can't see a hired
   worker's journal. (Design + likely migration; owner-gated.)
3. **No foreman/project-manager role** — absent from the role catalogue and DB.
4. **No team/project coordination** — `projects` exists but unused for workers;
   no `teams`.
5. **Company worker management is read-only** — no pause/remove/role UI on top of
   the existing `status` column (UI-only follow-up, safe).

## 8. Recommended PR sequence (this cycle)

- **PR B** — pure role-capability map (`lib/operations/role-capabilities.ts` + tests):
  one honest source of truth that marks foreman/PM/team_lead as
  `not_enabled`/`planned`. **Safe, no migration.**
- **PR C** — company/agency worker management *clarity*: surface, from existing
  data only, that role coordination (foreman/manager) is **not enabled**, plus a
  truthful next action. **Safe, no migration.**
- **PR D (optional)** — work-journal review-readiness helper that explains, per
  entry, manual-review state from existing fields. **Safe, no migration.**
- **PR E** — foreman/project-manager **honest "not enabled / role design"**
  surface (no fake dashboard).
- **PR F** — guards locking these truths (no fake "fully working" foreman/PM
  claims, capability statuses stay explicit).

Anything requiring a **role column / link table / new role enum is a DB
migration → owner-gated**; this audit recommends doing the safe doc/helper/UI
clarity PRs first and flagging the migration decisions to the owner.

## Acceptance / honesty

No code behaviour changed by this audit (docs-only). No fake claims: every
"real_working" is backed by a cited insert/RPC/route; every gap is named.
Nothing here asserts foreman/PM/coordination works.
