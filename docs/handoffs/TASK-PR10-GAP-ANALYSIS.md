# TASK-PR10 — Gap Analysis (spec vs already-shipped schema)

**Status:** Docs-only analysis. **No migration written, no schema changed.**
**Branch:** `feat/cc/pr10-schema-gap-analysis`
**Author:** Claude Code
**Date:** 2026-05-22
**Inputs:** PR #10 spec (`TASK-PR10-UNIVERSAL-SCHEMA`, full version from DI) vs the actual repo schema (`supabase/migrations/0001`–`0013`).

---

## TL;DR

**The PR #10 universal data model was already shipped in PR #12** via
`supabase/migrations/0013_work_journal_m1.sql` — 12 tables, RLS enabled on all
of them, under doctrine-aligned names (`engagement_contexts` per §5.5, etc.).

The PR #10 spec, as written, **cannot be executed verbatim** and **must not be
executed as a greenfield migration** — doing so would (a) fail to apply
(references tables that don't exist) and (b) create a second, parallel journal
system duplicating what PR #12 shipped (violates §6 storage minimalism).

This document is the gap delta: what the spec asked for, what already exists,
and the **genuinely missing items** that a small, targeted, non-destructive
migration (`0014`) could add — pending one architectural decision by DI.

---

## 1. Spec assumptions that are wrong for this repo

| Spec assumes | Reality in this repo | Impact |
|---|---|---|
| Prisma (`prisma/schema.prisma`, `pnpm prisma generate`) | **No Prisma at all** — pure `supabase/migrations/*.sql` | PART 2 of the spec is entirely N/A |
| Tables `"User"`, `"Organization"`, `"OrganizationMembership"`, `User.platform_role` | `profiles`, `organizations`, `engagement_contexts` + `relationship_types`, `profile_roles` / `active_role` | Every FK / authz reference in the spec SQL would fail (`REFERENCES "User"` errors immediately) |
| New migration `0013_universal_schema.sql` | `0013_work_journal_m1.sql` already occupies that slot | Migration-number collision; next free index is **`0014`** |
| Greenfield tables `work_journal_entry`, `worker_profession_context`, `skill_confirmation_history`, `audit_log` | Already exist as `journal_entries`, `engagement_contexts` (+ `worker_professions`), `journal_entry_confirmations`, `audit_logs` | Building the spec's tables = duplicate parallel model |

### Name mapping (spec → actual)

| Spec table | Already-shipped equivalent |
|---|---|
| `work_journal_entry` | `journal_entries` (0013) |
| `worker_profession_context` | `engagement_contexts` (0013, §5.5) + `worker_professions` |
| `work_journal_entry_skill_link` | (skills linked via `worker_skills` + `journal_entry_metrics`; entry↔skill confirmation via `journal_entry_confirmations`) |
| `proof_of_work` | **no equivalent** — not yet built |
| `skill_confirmation_history` | `journal_entry_confirmations` (0013, append-only) |
| `audit_log` | `audit_logs` (0001) |
| `feature_flags` | **no equivalent** — not yet built |

---

## 2. Requirement-by-requirement gap table

Legend: ✅ MET · 🟡 PARTIAL · ❌ GAP · ⚖️ DECISION NEEDED

| # | PR #10 requirement | Status | Evidence / note |
|---|---|---|---|
| 1 | Universal multi-profession journal tables | ✅ MET | 12 tables in `0013`; profession-agnostic (`journal_entries.profession_id` nullable, `entry_type_slug`) |
| 2 | New worker can start without company (`PERSONAL` context) | ✅ MET | `0013` backfills a primary `'unemployed'`/`'employee'` engagement; `engagement_contexts.organization_id` nullable |
| 3 | RLS enabled + default-deny on all new non-taxonomy tables | ✅ MET | `enable row level security` on all 12; `journal_entries` has SELECT+INSERT only → UPDATE/DELETE denied (append-only) |
| 4 | No public reads except taxonomy | ✅ MET | Taxonomy/registry tables `select using (true)`; journal/engagement scoped by `owns_worker` / `manages_organization` / `is_admin` |
| 5 | Writes authorized server-side | 🟡 PARTIAL / ⚖️ | Authz IS enforced server-side, but via **RLS `WITH CHECK`** (`owns_worker`, `manages_organization`) on **direct INSERT** — NOT via `SECURITY DEFINER` RPCs. See §3 decision. |
| 6 | SECURITY DEFINER RPCs `add_entry` / `confirm_entry_skills` / `reject_entry` | ❌ GAP / ⚖️ | Not present. Shipped SECURITY DEFINER fns are `manages_organization`, `mirror_company_to_org`, `mirror_agency_to_org` (helpers/triggers, not write RPCs). Needed only if DI chooses the RPC pattern. |
| 7 | Append-only via explicit triggers | 🟡 PARTIAL | Append-only is enforced by **RLS policy denial** (no UPDATE/DELETE policy), not by triggers. Blocks the `authenticated` role; a definer fn / admin could still mutate. Doctrine §3.1 wants UPDATE/DELETE blocked for *all* roles → trigger hardening is a reasonable add. |
| 8 | `audit_log` written on every confirm/reject | ❌ GAP | `audit_logs` exists (0001) but **nothing in the journal flow inserts into it**. No audit row on confirmation. |
| 9 | Reject / revoke flow | ❌ GAP | No rejection or revoke concept in the shipped schema. `journal_entry_confirmations` is insert-only positive confirmation; there is no `reject_entry` path. |
| 10 | PUBLIC_PROOF / CLIENT_REPORT feature-flag locked | ❌ GAP | `journal_entries.visibility_scope` CHECK *allows* `'client_report'` and `'public_proof_link'`, but there is **no feature_flags table and no gate** — a worker could set those values directly today. |
| 11 | `original_language` constrained to the 10-locale set (§2.4) | ❌ GAP | Column is `char(2) not null` with **no CHECK constraint**. (Note: the spec's own SQL used wrong codes `'dk','se'` — doctrine §2.4 set is `en,lt,lv,et,nl,de,da,no,sv,pl`.) |
| 12 | `proof_of_work` scaffold table (M2) | ❌ GAP | No such table exists. Scaffold deferred. |

---

## 3. The one architectural decision DI/architect must make

**Write path: keep RLS-`WITH CHECK` direct INSERT (shipped), or move to `SECURITY DEFINER` RPC-only (spec)?**

- **Shipped (RLS direct INSERT):** `journal_entries` and `journal_entry_confirmations`
  allow direct client `INSERT`, gated by RLS `WITH CHECK` (`owns_worker(worker_id)`
  for entries; `manages_organization(...)` for confirmations). Authorization is
  server-side (in the DB), just expressed as policy rather than function body.
- **Spec (RPC-only):** no INSERT policies; all writes through `SECURITY DEFINER`
  functions that check authz, then write entry + history + `audit_log` in one
  transaction.

Both satisfy "authorization happens server-side." The RPC pattern additionally
gives: a single transactional place to write the **audit row** (gap #8) and the
**reject/revoke** path (gap #9), and a natural home for the **feature-flag lock**
(gap #10). That's the strongest argument for RPCs.

**Recommendation:** Adopt a thin RPC layer for the *state-changing* operations
(confirm / reject) so audit + flag-lock live in one transactional path, while
leaving worker self-INSERT of entries as-is (RLS `WITH CHECK` is fine for
self-owned append-only content). This is a smaller change than the spec's full
RPC rewrite and avoids re-plumbing the working M1 entry-create flow.

---

## 4. Proposed targeted `0014` (only the real gaps — NON-destructive)

If DI approves, a single additive migration `0014_journal_security_hardening.sql`
would address gaps #8–#12 without touching the working `0013` model:

1. `feature_flags` table + seed (`visibility.public_proof=false`,
   `visibility.client_report=false`); add a CHECK/trigger on `journal_entries`
   so `visibility_scope IN ('client_report','public_proof_link')` requires the
   matching flag enabled. *(gap #10)*
2. Add a 10-locale CHECK to `journal_entries.original_language`
   (`en,lt,lv,et,nl,de,da,no,sv,pl`). *(gap #11)*
3. `confirm_entry_skills(...)` and `reject_entry(...)` `SECURITY DEFINER` RPCs
   that: check authz, write `journal_entry_confirmations` (confirm) or a
   revoke/rejection record, and **insert an `audit_logs` row** — all in one
   transaction. Revoke needs a small append-only `journal_entry_confirmations`
   extension or a sibling table (TBD with architect). *(gaps #6, #8, #9)*
4. Optional hardening: BEFORE UPDATE/DELETE triggers on `journal_entries`,
   `journal_entry_confirmations`, `audit_logs` that `RAISE EXCEPTION`
   (belt-and-suspenders for §3.1 "all roles"). *(gap #7)*
5. Optional: `proof_of_work` scaffold table (RLS, no client write). *(gap #12)*

All `CREATE` / `ADD` / `CREATE POLICY` only — no `DROP`, no destructive `ALTER`.
EXPLICIT `GRANT … TO authenticated` required per migration 0004 (this project has
no default grants).

---

## 5. What NOT to do

- ❌ Do **not** create `work_journal_entry` / `worker_profession_context` /
  `skill_confirmation_history` / `audit_log` — they duplicate shipped tables.
- ❌ Do **not** create migration `0013_universal_schema.sql` — number is taken.
- ❌ Do **not** add Prisma — the repo doesn't use it.
- ❌ Do **not** run the spec's verbatim SQL — it references non-existent objects.

---

## 6. Verification limitations (this environment)

- `supabase` CLI is **not on PATH** here → `supabase db reset` and the RLS test
  suite (spec PART 4/6) cannot be run from this session. Any future `0014` must
  be verified by DI locally / in staging before the production `db push`.
- This analysis is static (reading migrations `0001`–`0013`), not a live DB check.

---

## 7. Recommendation

1. Treat PR #10 as **closed-by-PR-#12** for the *data model* itself.
2. Open a follow-up (call it PR #10b or fold into PR #11 prep) scoped to the
   **security-hardening delta** in §4, after DI picks the write-path pattern in §3.
3. Architect updates the PR #10 spec to target the real schema (or formally
   supersedes it with this gap analysis).

> Awaiting DI decision on §3 before any `0014` migration is written.
