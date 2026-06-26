# Approval Permission Readiness — v1 (Product Reality Train · Wagon 2)

**Type:** read-only readiness/audit. **No migration, no DB/RLS/schema/Supabase/env/auth-core change, no production mutation, no merge, no deploy.**
**Baseline:** production `main` = `d57233fbece1ea7140315f830baddf7d683c5b2a` (post-#509). Project `gorgitwvdzxbnaxhrsrw`.

## Problem
Production previously showed approve/reject actions next to **"Neturite teisės peržiūrėti šio įrašo."**; #509 *hid* the contradiction (buttons disappear on a permission denial) but did not resolve the real permission mismatch. Owner rule: a company leader/director responsible for a worker/company context must be able to approve relevant employee journal entries; if approval is not allowed, the UI must say why and show no approval actions.

## TL;DR
The list of reviewable entries has a standalone **`is_admin()` shortcut**; the approval action does **not** — it additionally requires the caller to hold an active *reviewer engagement* (`manager`/`owner`/`external_manager`) in the entry's org, with **no `is_admin()` bypass**. So the **single platform admin is shown entries the action then refuses** (`no_reviewer_engagement`). **Real company owners are never blocked.** Production data reproduces this exactly. Fix = make the list and the action use **one** reviewer rule (reversible `CREATE OR REPLACE FUNCTION` ×3, no schema/RLS change) — a separate, owner-gated RED PR. One open decision: should the platform admin be a universal cross-company approver (A: no / B: yes).

---

## 1. Current code flow
- **List (inbox):** `app/[locale]/dashboard/inbox/page.tsx` → RPC `reviewable_journal_entry_ids()`.
- **Actions (server):** `lib/journal/review-actions.ts` → `reviewJournalEntry` → RPC `review_journal_entry(entry_id, decision, note)`; `confirmEntrySkills` → RPC `confirm_entry_and_verify_skills(entry_id, skill_ids, note)`.
- **Batch:** `review_journal_entries_batch(...)` (migration `20260611120000_batch_journal_review.sql`) **delegates per entry to `review_journal_entry`** ("the single source of review truth") → inherits the same gate.
- **UI:** `components/app/journal-inbox-entry.tsx` maps RPC codes; #509 added `canAct = !done && !permissionBlocked` (codes `not_authorized` / `no_reviewer_engagement` / `review_not_enabled`) so action surfaces hide on a denial.
- **Denial codes originate in the RPCs** (`supabase/migrations/20260530140000_membership_engagement_reroute.sql`):
  - `not_authorized` — `is_admin() OR manages_organization(v_org)` fails (line 191 / 236).
  - `review_not_enabled` — the entry's engagement `journal_review_enabled` is false (line 192 / 237).
  - `no_reviewer_engagement` — caller lacks an active `('manager','owner','external_manager')` engagement in the org (line 198 / 250).

## 2. DB/RPC contract (repo, side by side)
Latest definitions: list + actions in `20260530140000_membership_engagement_reroute.sql`; `manages_organization` in `0013_work_journal_m1.sql`.

| | Predicate |
|---|---|
| `manages_organization(org)` | `EXISTS engagement_contexts WHERE profile_id=auth.uid() AND organization_id=org AND status='active' AND relationship_slug IN ('manager','owner','external_manager')` |
| **List** `reviewable_journal_entry_ids()` | org-scoped **AND** `journal_review_enabled` **AND `(is_admin() OR manages_organization(org))`** **AND** not already confirmed |
| **Action** `review_journal_entry` / `confirm_entry_and_verify_skills` | authorize `is_admin() OR manages_organization(v_org)`; require `journal_review_enabled`; **then additionally** require `v_eng` = active `('manager','owner','external_manager')` engagement of the caller in the org — **NO `is_admin()` bypass** |

**Why they disagree:** the **list** has a standalone `is_admin()` branch; the **action's `v_eng`** requirement does not. An admin is therefore *listed* entries the action refuses with `no_reviewer_engagement`. For a **non-admin**, `manages_organization` and `v_eng` are the *same* predicate, so they cannot disagree → **the contradiction is admin-path only**. (The action is also internally inconsistent for admins: it *authorizes* via `is_admin()` at line 191, then *blocks* at the `v_eng` check.)

## 3. Read-only production verification (done)
**Migrations applied** (so the cause is *not* a missing migration): `0013 work_journal_m1`, `manager_review_evidence_result`, `org_owner_engagement_backfill`, `membership_engagement_reroute`, `batch_journal_review` are all in `list_migrations`.

Read-only SELECT aggregates (no mutation; ids/counts only):
- **Active engagement distribution:** `employee` = **15**, `owner` = **7**, **`manager` = 0**, **`external_manager` = 0** → the only reviewers today are the 7 org **owners**.
- **Entries:** total 19; org-scoped 12; review-enabled 11; **reviewable now = 1**; reviewable-but-no-reviewer-engagement-in-org = **0**; orgless = 7; orgs with review open = 3.
- **The one reviewable entry** `cc5605b5-98ba-4bd9-9781-23bba7c623ab` is in org `20b2c802-c624-43c0-b368-8fa6c1fbeae3`, which has **1** owner-reviewer, but **admins_with_reviewer_eng_in_org = 0** (admin_count = **1**).

**Conclusion:** the lone platform admin is *shown* the entry via the list's `is_admin()` branch but holds no engagement in that org → the action returns `no_reviewer_engagement` → "Neturite teisės". **Real company owners are not blocked** (they hold an `owner` engagement, so list == action). The reported symptom is the **admin-path mismatch**, exactly as the code predicts.

> Appendix has the exact re-runnable read-only queries.

## 4. Proposed fix (NOT applied here — separate owner-gated RED PR)
Make the **list** and the **action** use **one** reviewer rule.

**Recommended — Option A (reviewers = engagement holders only):**
- `reviewable_journal_entry_ids()`: replace `(is_admin() OR manages_organization(ec.organization_id))` → `manages_organization(ec.organization_id)`.
- `review_journal_entry` + `confirm_entry_and_verify_skills`: replace `if not (is_admin() OR manages_organization(v_org))` → `if not manages_organization(v_org)` so authorization == the `v_eng` requirement (removes the authorize-then-block inconsistency). `v_eng` check unchanged.
- **Net:** *listed ⇒ actionable*; company owners/managers approve their own context; the platform admin is no longer a universal cross-company approver. Pure `CREATE OR REPLACE FUNCTION` ×3 — **no schema/RLS/column/grant change**; batch inherits via delegation.
- **Trade-off:** the platform admin loses the global review queue / cross-company approval.

**Alternative — Option B (admin is a real universal reviewer):** give the action's `v_eng` step an `is_admin()` bypass (record the confirmation with `confirmer_role='admin'`). Requires verifying `journal_entry_confirmations.confirmer_engagement_context_id` nullability + the `confirmation_role_check` constraint (migration `confirmation_role_check`) — touches the verified-proof spine → more risk. Keeps the list as-is.

**Scope/class:** Option A is `CREATE OR REPLACE FUNCTION` only, no RLS/schema change. **RED-class** (proof-spine RPC) → draft PR + `needs-human-gate`; prod apply via Supabase MCP `apply_migration` after approval, never `db push`.

**Before / after:**
- *Before:* admin is shown the entry → click → `no_reviewer_engagement` ("Neturite teisės"); #509 hides the buttons after the denial. Owner: works.
- *After (A):* admin no longer sees other companies' entries (not listed) → no buttons to begin with; owner/manager sees + approves their own. Contradiction impossible (list == action).

**Related finding (separate wagon, NOT this PR):** there are **0** `manager`/`external_manager` engagements, and `grant_org_manager` appears to have no end-user UI (never used). So a **non-owner "director"** cannot become a reviewer even after the RPC alignment — enabling them needs a manager-grant path. **YELLOW follow-up.**

## 5. UI rule (keep #509)
No approve/reject/request-change when permission is false; one clear reason; no fake success. Enforced by `lib/guards/production-reality-trust-p0.test.ts` — must stay green through any change.

## 6. Rollback plan
`CREATE OR REPLACE` the three functions back to their current bodies (captured verbatim in the implementation PR). No data migrated → instant, lossless. Verified `worker_skills` proof rows are untouched.

## 7. Tests / smoke (for the implementation PR)
- **Contract/guard test:** assert the list RPC and the action RPC reference the **same** reviewer-engagement predicate (static SQL scan, like existing migration guards); assert no standalone `is_admin()` listing branch remains (Option A).
- **Behavioral:** owner-with-engagement is listed AND approves end-to-end; admin-without-engagement is NOT listed and the action denies identically; `review_not_enabled` path unchanged.
- **Smoke (preview/branch DB only, never prod):** seed org + owner engagement + review-enabled employee entry → owner approves; admin-without-engagement sees nothing to approve. Keep the #509 UI guard green.

## 8. GREEN / YELLOW / RED
- UI contradiction: **GREEN** (fixed by #509).
- Real company-leader (org owner) approval: **GREEN today** (works via owner engagement; never the blocked party).
- Admin-path listed-but-not-actionable: **YELLOW** — real, fixable with a reversible RPC alignment; needs owner choice A vs B.
- Non-owner director as reviewer: **YELLOW/RED** — needs a manager-grant path (separate wagon).
- Migration/RPC change risk: **RED** (proof-spine RPC; owner-gated apply; reversible).

## 9. Final recommendation
**Needs owner authorization first**, then **safe to implement as the next PR.** Recommended **Option A**: one reviewer rule (active `manager`/`owner`/`external_manager` engagement in the org) applied identically to the list and the action — remove the list's `is_admin()` shortcut and the action's `is_admin()` authorize-then-block. Reversible `CREATE OR REPLACE FUNCTION` ×3, no schema/RLS/grant change, RED-gated apply via MCP. Read-only verification is complete. **The one open decision is A vs B** — whether the platform admin should be a universal cross-company approver. The non-owner-director grant path is a separate follow-up wagon.

---

## Appendix — exact read-only checks (re-runnable, SELECT-only)
```sql
-- (1) active engagement distribution
select relationship_slug, status, count(*)
from public.engagement_contexts group by 1,2 order by 3 desc;

-- (2) reviewable-entry reality
with rev as (
  select je.id entry_id, ec.organization_id org, ec.journal_review_enabled,
         exists (select 1 from public.journal_entry_confirmations c where c.entry_id = je.id) confirmed
  from public.journal_entries je
  join public.engagement_contexts ec on ec.id = je.engagement_context_id)
select
  (select count(*) from public.journal_entries) total_entries,
  (select count(*) from rev where org is not null) org_scoped,
  (select count(*) from rev where org is not null and journal_review_enabled) review_enabled,
  (select count(*) from rev where org is not null and journal_review_enabled and not confirmed) reviewable_now,
  (select count(*) from rev r where org is not null and journal_review_enabled and not confirmed
     and not exists (select 1 from public.engagement_contexts m
       where m.organization_id=r.org and m.status='active'
         and m.relationship_slug in ('manager','owner','external_manager'))) reviewable_but_no_reviewer;

-- (3) admin vs reviewer-engagement for each reviewable entry's org
with admins as (
  select p.id profile_id from public.profiles p
  where p.active_role='admin'
     or exists (select 1 from public.profile_roles pr where pr.profile_id=p.id and pr.role='admin')),
reviewable as (
  select je.id entry_id, ec.organization_id org
  from public.journal_entries je
  join public.engagement_contexts ec on ec.id = je.engagement_context_id
  where ec.organization_id is not null and coalesce(ec.journal_review_enabled,false)
    and not exists (select 1 from public.journal_entry_confirmations c where c.entry_id=je.id))
select (select count(*) from admins) admin_count, r.entry_id, r.org,
  (select count(*) from public.engagement_contexts m where m.organization_id=r.org and m.status='active'
     and m.relationship_slug in ('manager','owner','external_manager')) org_reviewers,
  (select count(*) from admins a join public.engagement_contexts m on m.profile_id=a.profile_id
     where m.organization_id=r.org and m.status='active'
       and m.relationship_slug in ('manager','owner','external_manager')) admins_with_reviewer_eng_in_org
from reviewable r;
```
