# TASK-PR10b — `0014` Implementation Command (DRAFT — not yet authorized)

**Status:** DRAFT command for a FUTURE implementation PR. **No SQL, no migration, no app code in this PR.**
**Type:** Docs-only.
**Spec of record:** `docs/handoffs/TASK-PR10B-0014-HARDENING-SPEC.md` (merged in PR #15) — **read it first**.
**Author:** Claude Code · **Date:** 2026-05-22

> ⛔ Do **not** execute this command until DI says exactly: **"implement 0014 now."**
> This document only defines *how* the implementation PR must be done when authorized.

---

## 0. Preconditions (verify before starting)

- PR #15 merged (spec of record is on `main`). ✅ (merge commit `4e779da`)
- DI has explicitly said **"implement 0014 now"** — without this, STOP.
- `supabase` CLI available locally (or a documented alternative) — needed to verify; **not** available in prior sessions, so flag if still missing.

---

## 1. Hard constraints

- **Separate migration PR.** Branch `feat/cc/pr10b-0014-implementation`.
- **Automerge: NO.** Stays draft until the SQL/RLS/RPC/audit diff is reviewed AND DI approves the production migration.
- **No Prisma.** The repo has none; do not introduce it.
- **No second journal system.** The universal model already shipped in PR #12 (`0013_work_journal_m1.sql`). `0014` is an additive delta on the **real** tables, never a parallel set.
- **Use actual real table/column names** (verified against `0001`–`0013`):
  `journal_entries`, `journal_entry_confirmations`, `journal_entry_metrics`, `engagement_contexts`, `organizations`, `professions`, `profession_skills`, `skills`, `worker_skills`, `workers`, `profiles`, `audit_logs` (`actor_id, action, entity, entity_id, payload, occurred_at`).
  Existing helpers: `is_admin()`, `owns_worker(uuid)`, `manages_organization(uuid)`.
- **Migration number:** next free index — `0013` is taken → use **`0014_journal_security_hardening.sql`** (confirm against `supabase/migrations/` at start).
- **No** changes to `apps/**` (beyond what a later UI PR needs), env/config/deploy, package/lockfiles, RLS on existing unrelated tables, or the deploy pipeline.

---

## 2. Scope — implement ONLY these (PR #10b / `0014`)

Per spec §1–§5 and the §5.8 compensating controls:

1. **Feature-flag lock** for `public_proof_link` / `client_report` (spec §5.1):
   `feature_flags` table + seed (both `false`) + RLS (select-all, admin write) + explicit grant.
2. **`original_language` 10-locale CHECK** (spec §5.2) — codes `en,lt,lv,et,nl,de,da,no,sv,pl` (NOT `dk`/`se`). Add `NOT VALID` then `VALIDATE` if any legacy row risks failing; document in header.
3. **Decision ledger on `journal_entry_confirmations`** (spec §5.3, DI-decided): additive `kind` (`confirm`/`reject`/`revoke`, default `confirm`) + `reason`; CHECK that `reason` is non-blank for reject/revoke; append-only preserved. **Reuse this table — do NOT create `journal_entry_decisions`** unless implementation proves it unavoidable (document the proof).
4. **Audit on every confirm/reject/revoke** (spec §5.4) — each RPC writes an `audit_logs` row in the same transaction.
5. **RPCs** (spec §4, DI-approved names), all `SECURITY DEFINER`, `SET search_path = public`, `REVOKE ALL FROM PUBLIC, anon`, `GRANT EXECUTE TO authenticated`, server-side authz, audit write:
   - `confirm_journal_entry(p_entry_id uuid, p_skill_ids uuid[], p_source text default 'manager', p_note text default null)` — entry-specific AND skill-specific; `'client'` source raises `client_confirmation_locked`.
   - `reject_journal_entry(p_entry_id uuid, p_reason text)` — reason required.
   - `revoke_entry_confirmation(p_confirmation_id uuid, p_reason text)` — reason required.
   - `set_entry_visibility(p_entry_id uuid, p_scope text)` — exposure (`team`/`org`/`client_report`/`public_proof_link`, flag-gated) **and** de-exposure to `closed` (always allowed).
6. **`proof_of_work` scaffold** (spec §5.6) if non-destructive: table + RLS default-deny (SELECT inherits parent entry; **no** client INSERT in M1) + explicit grant.
7. **Direct-INSERT compensating controls #1, #2, #5, #6, #7** (spec §5.8) on `journal_entries`:
   - **#1 BEFORE INSERT:** validate profession active, worker owned by `auth.uid()`, engagement context owned/authorized, `original_language` in §2.4 set, `visibility_scope = 'closed'` only.
   - **#2 AFTER INSERT:** write `audit_logs` (`action='entry_created'`, actor/worker/profession/context/visibility + server timestamp) — DB-enforced.
   - **#5 visibility guard:** BEFORE UPDATE raises `use_set_entry_visibility_rpc` when `OLD.visibility_scope <> NEW.visibility_scope`.
   - **#6 RLS/grants:** direct INSERT policy limited to own-worker + `'closed'`; no direct UPDATE/DELETE for trust/exposure; no direct client writes to confirmations/audit/exposure.
   - **#7 trigger-function security:** `SECURITY DEFINER` + fixed `search_path`; DB enforces audit/history, not app code.

### Explicitly OUT of `0014` scope → PR #11

- **Compensating controls #3 and #4** (entry↔skill-link validation + self-declared history seeding) — the entry↔skill-link table **does not exist** in the current schema and must **not** be invented in `0014`. They belong to PR #11, which introduces that table. (See `TASK-PR11-UNIVERSAL-JOURNAL-UI.md`.) Only introduce them in `0014` if `0014` explicitly creates that table **and DI approves**.

---

## 3. Migration shape (non-destructive)

- `CREATE TABLE` (`feature_flags`, `proof_of_work`), `ALTER TABLE … ADD COLUMN` (`journal_entry_confirmations.kind/reason`), `ADD CONSTRAINT` (locale CHECK), `CREATE FUNCTION` (RPCs + trigger fns), `CREATE TRIGGER`, `CREATE POLICY`, `REVOKE`/`GRANT`.
- **No `DROP TABLE`, no destructive `ALTER`, no data deletion.** The one tightening: revoke direct INSERT on `journal_entry_confirmations` + tighten `journal_entries_insert` to `'closed'` only — a **narrowing** (no loosening of RLS).
- Wrap in `BEGIN; … COMMIT;`.

---

## 4. Rollback SQL (must ship in the migration footer)

Document a manual DOWN block (forward-only `db push`; rollback by hand / `git revert`):
- `DROP FUNCTION` the 4 RPCs + trigger fns; `DROP TRIGGER`s.
- Re-`CREATE` the original `journal_entry_confirmations_insert` policy + re-`GRANT INSERT` (copy verbatim from `0013`).
- `ALTER TABLE journal_entries DROP CONSTRAINT journal_entries_original_language_chk`.
- `ALTER TABLE journal_entry_confirmations DROP COLUMN kind, DROP COLUMN reason`.
- `DROP TABLE feature_flags, proof_of_work` (new, empty).
- No existing data mutated → rollback is data-safe.

---

## 5. Tests / static verification (required before opening the PR)

Run on a fresh local DB (`supabase db reset`) + a staging-copy DB:
- Direct INSERT into `journal_entries` only succeeds with `visibility_scope = 'closed'`; `'team'`/`'org'`/`'client_report'`/`'public_proof_link'` rejected.
- Direct `UPDATE` of `journal_entries.visibility_scope` blocked → `use_set_entry_visibility_rpc`.
- `public_proof_link` / `client_report` locked while flags off; succeed via `set_entry_visibility` after admin enables flag; de-exposure to `'closed'` always allowed.
- `confirm_journal_entry` / `reject_journal_entry` / `revoke_entry_confirmation` each write a `journal_entry_confirmations` row (correct `kind`) **and** an `audit_logs` row, in one transaction.
- Non-manager calling confirm/reject/revoke → `not_authorized`.
- `'client'` source → `client_confirmation_locked`.
- `original_language='dk'` rejected; `'da'` accepted.
- Append-only: UPDATE/DELETE on `journal_entries`, `journal_entry_confirmations`, `audit_logs` rejected.
- Anon role denied on all journal/confirmation/audit tables; authenticated cannot directly write confirmations/audit.

> If `supabase` CLI is unavailable, **STOP and report** — do not claim verification that wasn't run.

---

## 6. Production-migration gate (in the PR description)

- ⚠️ Merging to `main` may trigger Supabase `db push`. **DI must approve the production migration separately** — call this out explicitly in the PR description.
- Include a checklist: local dry-run ✓, fresh-DB tests ✓, staging-copy tests ✓, rollback reviewed ✓, RLS default-deny proof ✓, **DI production-migration approval ✓**.
- Agents never run production migrations.

---

## 7. Remaining DI decisions before implementation

1. Confirm `journal_entry_confirmations` `kind`+`reason` extension (vs new table) — spec §11.1 (DI leaned reuse).
2. Confirm direct worker insert is `'closed'` only (DI decided yes).
3. `set_entry_visibility` handles de-exposure (DI decided yes).
4. Final RPC param shapes (`p_skill_ids` array on confirm).
5. Whether `confirm_journal_entry` writes to `worker_skills` (source `manager_confirmed`) as part of the closed loop, or only the ledger — needs architect confirmation against the existing `0010`/`0013` skill model.

> When DI says **"implement 0014 now"** and answers §7, execute on branch
> `feat/cc/pr10b-0014-implementation`, open a **draft** PR, run §5 verification,
> and **do not** mark ready / merge until DI approves the production migration.
