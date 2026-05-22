# TASK-PR10b — Journal Security-Hardening Spec (migration `0014`)

**Status:** SPEC ONLY — no SQL implementation, no migration file, no app code in this PR.
**Branch:** `feat/cc/pr10b-0014-hardening-spec`
**Type:** Docs-only (spec). Implementation is a separate, explicitly-approved PR.
**Supersedes:** the old greenfield `TASK-PR10-UNIVERSAL-SCHEMA` spec (see `docs/handoffs/TASK-PR10-GAP-ANALYSIS.md`).
**Strategic context:** `docs/handoffs/TASK-ARCH-LABOURMARKETAI-UNIVERSAL-DIRECTION.md`
**Author:** Claude Code · **Date:** 2026-05-22

> The universal journal data model already shipped in PR #12 (`0013_work_journal_m1.sql`).
> PR #10b is a **small, additive delta** that closes the genuine security gaps from
> the gap analysis. It does **not** create a new journal system, Prisma, or duplicate schema.

---

## 1. Genuine gaps this addresses (from `TASK-PR10-GAP-ANALYSIS.md`)

1. **Feature-flag lock missing** — `journal_entries.visibility_scope` CHECK allows `'client_report'` and `'public_proof_link'` with no gate; a worker can set them directly today.
2. **`audit_logs` not written on confirmation** — table exists (since `0001`) but the journal/confirmation flow never inserts into it.
3. **No reject/revoke flow** — `journal_entry_confirmations` is insert-only positive confirmation; there is no rejection or revocation path.
4. **`original_language` lacks a 10-locale CHECK** — column is `char(2) not null`, unconstrained.
5. **No `proof_of_work` scaffold** — no evidence-attachment table exists.
6. **No server-side transaction layer for trust-changing operations** — confirmations are currently a direct client `INSERT` gated only by an RLS `WITH CHECK`.

---

## 2. Exact real schema names (current repo — verified against migrations `0001`–`0013`)

**Tables (relevant):**
- `public.journal_entries` — append-only entries (SELECT + INSERT policies only; UPDATE/DELETE denied)
- `public.journal_entry_confirmations` — append-only confirmations
- `public.journal_entry_metrics`, `public.journal_entry_extractions`
- `public.engagement_contexts` — person↔org↔relationship (§5.5); `relationship_slug` FK → `relationship_types`
- `public.organizations` (mirror of `companies`/`agencies`), `public.relationship_types`, `public.productivity_units`
- `public.workers`, `public.profiles`, `public.professions`, `public.skills`, `public.worker_skills`
- `public.audit_logs` — columns: `id, actor_id, action, entity, entity_id, payload, occurred_at, created_at, updated_at` (RLS enabled since `0001`)

**Existing functions (do NOT recreate):**
- `public.is_admin()` — `0001` / `0003`
- `public.owns_worker(w uuid)` — `0001`
- `public.manages_organization(org uuid)` — `0013` (SECURITY DEFINER; checks active `manager`/`owner`/`external_manager` engagement)
- `public.mirror_company_to_org()`, `public.mirror_agency_to_org()` — `0013` (trigger fns)

**Existing grant pattern (binding):** this project has **no default grants** (see `0004`). Every table the app session touches needs an EXPLICIT `GRANT … TO authenticated`; RLS then restricts rows. Any new table/RPC in `0014` must follow this.

**No Prisma exists.** No `prisma/schema.prisma`. Migrations are hand-authored SQL applied via `supabase db push`.

---

## 3. DI write-path decision (encoded)

> **DI-resolved (2026-05-22).** The decisions below are final for the `0014` implementation.

**Worker self-created entries — may remain direct INSERT**, *if and only if* RLS `WITH CHECK` constrains them to: actor's own worker row, valid content, and **closed/private visibility only** (`visibility_scope = 'closed'`). Direct worker INSERT with `'team'`, `'client_report'`, or `'public_proof_link'` is **not allowed** — any exposure change goes through the `set_entry_visibility` RPC.

**Trust-changing and exposure-changing operations MUST go through a `SECURITY DEFINER` RPC / server-side transaction (with authorization + audit):**
- manager confirm (client confirm scaffolded but **locked** in M1 — see §4)
- reject
- revoke
- visibility change to `'team'`, `'client_report'`, or `'public_proof_link'`
- **de-exposure** back to `'closed'`/private (required for safety/recovery)
- any confirmation / audit state change

**Hard rules:**
- **No direct client `INSERT`/`UPDATE`/`DELETE`** into confirmation history, audit log, or public/client exposure state.
- Each trust/exposure RPC **writes an `audit_logs` row in the same transaction**.
- `journal_entries` / `journal_entry_confirmations` / `audit_logs` stay append-only.
- Confirmation is **entry-specific AND skill-specific — never profession-wide** (DI non-negotiable).

---

## 4. Proposed new RPCs (signatures — illustrative, not final SQL)

All `SECURITY DEFINER`, `SET search_path = public`, `REVOKE ALL … FROM PUBLIC, anon`, `GRANT EXECUTE … TO authenticated`, internal authz checks, and an `audit_logs` insert per call.

**Names DI-approved.** Confirmation is **entry-specific AND skill-specific** —
`confirm_journal_entry` takes a `p_skill_ids uuid[]` so it confirms named skills
on a named entry, never a whole profession. (If clearer at implementation,
`confirm_journal_entry_skills` is an acceptable alias for the same contract.)

| Approved RPC | Purpose | Authz check (server-side) | Writes |
|---|---|---|---|
| `confirm_journal_entry(p_entry_id uuid, p_skill_ids uuid[], p_source text default 'manager', p_note text default null)` | manager confirm of specific skills on a specific entry | `manages_organization(ec.organization_id)` for the entry's engagement. `p_source='client'` is **scaffolded but raises `client_confirmation_locked`** in M1 | `journal_entry_confirmations` (`kind='confirm'`) + `audit_logs` |
| `reject_journal_entry(p_entry_id uuid, p_reason text)` | reject (non-destructive) | same manager authz; **`p_reason` required** (raise if null/blank) | `journal_entry_confirmations` (`kind='reject'`, `reason`) + `audit_logs` |
| `revoke_entry_confirmation(p_confirmation_id uuid, p_reason text)` | revoke a prior confirmation | manager authz + confirmation belongs to actor's managed org; **`p_reason` required** | `journal_entry_confirmations` (`kind='revoke'`, `reason`) + `audit_logs` |
| `set_entry_visibility(p_entry_id uuid, p_scope text)` | exposure change **and de-exposure** — `'team'` / `'client_report'` / `'public_proof_link'` / back to `'closed'` | `owns_worker(entry.worker_id)`; exposure scopes additionally require the matching `feature_flags` enabled; **de-exposure to `'closed'` is always allowed** (safety/recovery) | UPDATE `journal_entries.visibility_scope` (via definer) + `audit_logs` |

> Naming aligns with the existing `manages_organization` style. Final names/params confirmed by architect at implementation time.

---

## 5. Non-destructive migration plan (`0014_journal_security_hardening.sql`)

All `CREATE` / `ADD` / `CREATE POLICY` / `CREATE FUNCTION` only. **No `DROP TABLE`, no destructive `ALTER`, no data loss.** (Policy/grant tightening below is the one nuance — see §5.5.)

### 5.1 `feature_flags` table (gap #1)
- `CREATE TABLE public.feature_flags (flag_key text primary key, is_enabled boolean not null default false, description text, updated_at timestamptz default now(), updated_by uuid references public.profiles(id))`.
- Seed `('visibility.public_proof', false)`, `('visibility.client_report', false)`.
- RLS enable; `SELECT using (true)` (flags are not secret); writes admin-only (`is_admin()`).
- `GRANT SELECT … TO authenticated`.
- Enforcement: the `set_entry_visibility` RPC checks the flag; **additionally** a CHECK/trigger on `journal_entries` rejects direct insert/update that sets `visibility_scope IN ('client_report','public_proof_link')` from a non-definer path.

### 5.2 10-locale CHECK on `original_language` (gap #4)
- `ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_original_language_chk CHECK (original_language IN ('en','lt','lv','et','nl','de','da','no','sv','pl'))`.
- **Doctrine §2.4 codes** — note `da`/`sv` (NOT `dk`/`se`; the old greenfield spec had these wrong).
- Pre-flight: confirm existing rows already satisfy the set (M1 data is `lt`/`en`); if any violate, the constraint add must be `NOT VALID` then validated, or data corrected first. Document in migration header.

### 5.3 Reject / revoke records (gap #3) — **DI-decided**
- **Use the existing `journal_entry_confirmations` as the decision ledger.** Do
  **NOT** create a new `journal_entry_decisions` table in PR #10b unless the
  implementation proves it unavoidable (document the proof if so).
- Additive `ADD COLUMN` only:
  - `kind text not null default 'confirm' check (kind in ('confirm','reject','revoke'))`
  - `reason text` (a.k.a. note)
- **`reason` is required for `reject` and `revoke`** — enforced in the RPC (raise
  on null/blank) and reinforced by a CHECK: `kind = 'confirm' OR (reason is not
  null and length(trim(reason)) > 0)`.
- **Append-only preserved:** confirm/reject/revoke are all INSERTs of new rows
  (never UPDATE/DELETE of prior rows). The ledger is the full decision history.

### 5.4 `audit_logs` wiring (gap #2)
- No schema change to `audit_logs` (columns sufficient: `actor_id, action, entity, entity_id, payload`).
- Every RPC in §4 inserts one row, e.g. `action='entry_confirmed'`, `entity='journal_entries'`, `entity_id=p_entry_id`, `payload=jsonb_build_object(...)`.

### 5.5 RLS / grant tightening (gap #6 + exposure lock)
- `journal_entry_confirmations`: **REVOKE INSERT** from `authenticated`; drop the direct `journal_entry_confirmations_insert` policy. Inserts happen only via SECURITY DEFINER RPC (which bypasses RLS). SELECT policy unchanged.
- `journal_entries`: tighten the `journal_entries_insert` `WITH CHECK` so direct insert requires `owns_worker(worker_id)` **AND** `visibility_scope = 'closed'` (closed/private only — DI-decided). `'team'`, `'client_report'`, and `'public_proof_link'` are set **only** via the `set_entry_visibility` RPC (authz + feature-flag + audit).
- New RPCs: `REVOKE ALL FROM PUBLIC, anon; GRANT EXECUTE TO authenticated`.
- Net default-deny posture preserved; this **narrows** the authenticated surface (no loosening).

### 5.6 `proof_of_work` scaffold (gap #5)
- `CREATE TABLE public.proof_of_work (id uuid pk, entry_id uuid references journal_entries(id) on delete cascade, file_type text, file_path text, file_name text, caption text, uploaded_at timestamptz default now(), uploaded_by uuid references profiles(id))`.
- RLS enable; SELECT inherits parent-entry visibility; **no client INSERT policy** in M1 (upload flow is M2 via RPC). `GRANT SELECT … TO authenticated`.

### 5.7 Append-only hardening (optional, gap #7)
- BEFORE UPDATE/DELETE triggers `RAISE EXCEPTION` on `journal_entries`, `journal_entry_confirmations`, `audit_logs`, `proof_of_work` — belt-and-suspenders for §3.1 "all roles", since SECURITY DEFINER RPCs and admin otherwise bypass RLS.

---

## 6. RLS / default-deny impact summary

- **Net effect: tighter, not looser.** New tables ship RLS-enabled with explicit grants. Existing `journal_entry_confirmations` loses its direct-INSERT path (moved to RPC). `journal_entries` direct insert is constrained to non-exposed visibility. No policy is loosened, no RLS disabled. Consistent with AGENTS.md auto-commit rule "additive RLS is OK / no loosening".

---

## 7. Rollback plan

Forward-only migrations (`db push`); rollback is a documented manual DOWN script in the migration footer + `git revert` of the merge:
- `DROP FUNCTION` the four new RPCs + any new triggers.
- Re-`CREATE` the original `journal_entry_confirmations_insert` policy and re-`GRANT INSERT` (captured verbatim from `0013` in the DOWN block).
- `ALTER TABLE … DROP CONSTRAINT journal_entries_original_language_chk`.
- `DROP TABLE feature_flags, proof_of_work` (both new, empty).
- If §5.3 option (a): `ALTER TABLE journal_entry_confirmations DROP COLUMN kind, DROP COLUMN reason`.
- No existing data is mutated by the migration, so rollback is data-safe.

---

## 8. Test plan (for the implementation PR, not this spec PR)

- **RLS deny:** anon blocked on all journal tables; authenticated cannot directly `INSERT` into `journal_entry_confirmations` (now RPC-only); authenticated cannot directly set `visibility_scope` to an exposure scope.
- **RPC happy path:** `confirm_journal_entry` writes a confirmation row **and** an `audit_logs` row in one transaction; worker CV reflects it.
- **RPC authz block:** non-manager calling `confirm_journal_entry`/`reject_journal_entry`/`revoke_entry_confirmation` → `not_authorized`.
- **Feature-flag lock:** `set_entry_visibility(..., 'public_proof_link')` fails while flag off; succeeds when admin enables flag.
- **Locale CHECK:** insert with `original_language='dk'` → rejected; `'da'` accepted.
- **Append-only:** UPDATE/DELETE on confirmations/audit/entries rejected.
- Verified locally via `supabase db reset` on a fresh DB + on a staging-copy DB before any production push.

> Note: the `supabase` CLI was **not available** in the spec-authoring session, so no DB run was performed here. Implementation PR must run these.

---

## 9. Production-migration warning

⚠️ Merging the **implementation** PR to `main` may trigger Supabase `db push` if the repo pipeline auto-applies migrations. **DI must approve the production migration separately.** Agents never run production migrations (AGENTS.md). The PR description for the implementation must carry the production-migration approval checklist and remain **automerge = NO** until the SQL/RLS/RPC diff is reviewed.

---

## 10. Automerge status

- **This spec PR:** docs-only; DI's write-path / RPC / ledger decisions are now encoded (§11). Stays **draft / do not merge** until DI confirms the updated spec.
- **Implementation PR (`0014`):** **automerge = NO** until SQL/RLS/RPC diff is reviewed and DI explicitly says "implement 0014 now."

---

## 11. DI decisions (resolved 2026-05-22)

All prior open questions are now resolved and folded into §3–§5 above:

1. **Decision ledger:** reuse `journal_entry_confirmations` with `kind` (`confirm`/`reject`/`revoke`) + required `reason` for reject/revoke; append-only. **No** new `journal_entry_decisions` table unless implementation proves it unavoidable. (§5.3)
2. **RPC names approved:** `confirm_journal_entry` (takes `p_skill_ids uuid[]`; alias `confirm_journal_entry_skills` acceptable), `reject_journal_entry`, `revoke_entry_confirmation`, `set_entry_visibility`. Confirmation is **entry-specific AND skill-specific, never profession-wide**. (§4)
3. **Direct worker INSERT:** closed/private only (`visibility_scope = 'closed'`). No `'team'`/`'client_report'`/`'public_proof_link'` via direct insert. (§3, §5.5)
4. **Client confirmation:** locked in M1 — manager confirm supported; `'client'` source scaffolded but raises `client_confirmation_locked`. (§4)
5. **De-exposure:** `set_entry_visibility` must support returning to `'closed'`/private (safety/recovery), always allowed without a flag. (§3, §4)

> `0014` implementation remains a **separate, reviewed PR**. Do NOT implement the
> migration until DI explicitly says "implement 0014 now." This document is the
> spec only.
