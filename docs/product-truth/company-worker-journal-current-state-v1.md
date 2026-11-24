# Company / Worker / Work-Journal — Current State Truth Map v1

**Base:** main `46e97b2` (after Employment↔Journal Bridge cycle) · **Method:**
repo + migration evidence only. Honest classifications: `real` /
`partial` / `blocked_by_migration_0030` / `not_enabled`.

> One-line truth: buyer requests, worker profile, work-journal create +
> manager-confirm, and company/agency see+invite are **real**. The
> employment↔journal bridge is **code-complete but blocked** on the
> owner applying migration `0030` (additive, committed, not applied).
> Foreman / project-manager / site-manager remain **not_enabled**.

## Classification

| Area | Status | Evidence |
| --- | --- | --- |
| Buyer request workflow | real | `/dashboard/buyer`; `lib/buyer/*` (customer_requests 0028, attachments 0029); understanding center PRs #105/#107/#109/#110 |
| Worker profile | real | `/dashboard/profile`; profiles + profile_skill_claims (0014/0015) |
| Company workers (see + invite) | real | `/dashboard/company`; `lib/company/company-workers.ts` (company_workers + invite RPC, 0027) |
| Agency workers (see + invite) | real | `/dashboard/agency`; `lib/agency/agency-workers.ts` (agency_workers + invite RPC, 0001/0025) |
| Work journal create / persist | real | `components/app/journal-entry-composer.tsx` → `lib/journal/actions.ts` → `create_journal_entry_full` RPC (0017) |
| Work journal manager review/confirm | partial | `/dashboard/inbox` + `lib/journal/confirm-actions.ts` (journal_entry_confirmations, 0013) — runs on the journal ORG model (organizations/engagement_contexts), not on employment links |
| Employment ↔ journal bridge | blocked_by_migration_0030 | columns `operations_role` / `operations_title` / `journal_review_enabled` (0030) committed, **not applied**; `lib/operations/employment-journal-context.ts` + 42703 fallback ready; live app shows "not assigned / review not enabled" until applied |
| Operations role / title | blocked_by_migration_0030 | per-worker column in company/agency tables; helper-driven display; null until migration applied + values set |
| Manual review (employment-scoped) | not_enabled | no link between company_workers and journal review; bridge ready but `journal_review_enabled` defaults false |
| Foreman / brigadier | not_enabled | profession labels only; no role/route/permission; `role-capabilities.ts` status `not_enabled` |
| Project manager / site manager | not_enabled | same — `not_enabled` in capability map; storing a label grants no capability |

## Build-next (post-migration order)

1. Owner applies migration `0030` (see runbook — Step 3).
2. Safe role-assignment write UI + server action (owner/admin only) — see
   `docs/contracts/operations-role-assignment-v1.md`.
3. Per-relationship `journal_review_enabled` enable flow (real permission).
4. Then — and only then — a real foreman/PM operations view backed by
   assigned roles + enabled review.

No fake roles, approvals, matching, or AI anywhere in the above.
