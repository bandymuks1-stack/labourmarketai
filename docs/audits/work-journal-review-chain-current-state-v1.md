# Work Journal Review Chain — Current State Audit v1

**Base:** main (12-step cycle) · **Method:** repo evidence. Verdicts:
`real` / `partial` / `not_enabled` / `missing`.

> One-line: the review chain is **real on the journal ORG model**
> (organizations + engagement_contexts + manages_organization RLS) — a
> manager sees unconfirmed entries in an inbox and confirms/rejects them.
> It is **not connected to the employment links** (company_workers /
> agency_workers); the migration-0030 bridge is the ready-but-unapplied
> path to connect them. Foreman/PM cannot review.

## 1. Where entries are created
`/[locale]/dashboard/journal` → `components/app/journal-entry-composer.tsx`
→ server action `lib/journal/actions.ts:createJournalEntry`. **real.**

## 2. Where entries persist
RPC `create_journal_entry_full` (migration 0017) inserts
`journal_entries` + `journal_entry_metrics` atomically; edit/soft-delete
via 0018 RPCs. **real.**

## 3. Where a reviewer sees entries
`/[locale]/dashboard/inbox` (`app/[locale]/dashboard/inbox/page.tsx`)
selects `journal_entries` joined to `engagement_contexts!inner(organization_id)`
and `journal_entry_confirmations(id)`, filtering to entries with **zero**
confirmations (line ~54-60), rendered via `JournalInboxEntry`. Visible only
to a viewer who **manages the entry's organization** (RLS
`manages_organization`, migration 0013). **partial** — real, but org-scoped,
not employment-scoped.

## 4. Review statuses that exist
Confirmations live in `journal_entry_confirmations` (0013) with a
`confirmation_scope` carrying `action: 'confirm' | 'reject'`. The worker's
journal page derives `submitted | confirmed | rejected` from those rows.
There is **no** "approved/verified" status beyond a manager confirmation
row. **real (manual), narrow.**

## 5. Server actions / API
`lib/journal/confirm-actions.ts`: `confirmEntry` (line 111) and `rejectEntry`
(line 170) — append a `journal_entry_confirmations` row and (on confirm)
mark worker skills + recompute confidence (`lib/journal/confidence.ts`).
Manager authorisation is checked before the write. **real.**

## 6. Permissions
DB-level: `journal_entries_select` RLS = `owns_worker OR is_admin OR
manages_organization(engagement_context.organization_id)` (0013). Confirm
write is gated to a manager of the entry's org. **real, org-model.**

## 7. Relation to the employment bridge
The reviewer relationship is keyed on **journal organizations /
engagement_contexts**, NOT on `company_workers` / `agency_workers`. So a
company that *invited* a worker via the employment link gets no journal
review path today. Migration `0030` adds `journal_review_enabled` to the
employment tables and `computeEmploymentJournalContext` is ready to gate on
it — but nothing yet **populates an engagement_context from an employment
link**. That join is the missing piece. **bridge-ready, not connected.**

## 8. What is missing before foreman/PM can review
1. foreman / project_manager must become **enabled** roles (capability map)
   with real permissions — today `not_enabled`.
2. A link from an employment relationship (+ assigned role + 
   `journal_review_enabled=true`) to a journal `engagement_context` /
   `organization` so RLS `manages_organization` admits the reviewer.
3. migration `0030` applied + role assignment write path (see the role
   assignment contract).

## Next PR suggestions
- A pure **review-readiness helper** that classifies an entry's manual-review
  state from existing fields (no new DB) — Step 7.
- Later (post-0030 + role assignment): an RPC that provisions an
  engagement_context from an enabled employment relationship — the real
  employment↔journal join. Owner/migration-gated.

No implementation in this audit (docs-only).
