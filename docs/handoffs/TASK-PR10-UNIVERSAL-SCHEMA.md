# TASK-PR10: Universal Data Model (Non-Destructive Schema + DB-First Security)

**Status:** Draft — awaiting PR #9 merge + architect detail pass
**Branch:** `feat/cc/pr10-universal-schema`
**Strategic context:** `docs/handoffs/TASK-ARCH-LABOURMARKETAI-UNIVERSAL-DIRECTION.md` Part 2.2

## Scope (Headline)

Non-destructive migration adding:
- `worker_profession_context` — person ↔ profession ↔ optional engagement context (never directly to org; §5.5)
- `work_journal_entry`
- `work_journal_entry_skill_link`
- `proof_of_work` (scaffold)
- `skill_confirmation_history` (append-only; §3.1)
- `audit_log` (if not already present) — sensitive-action trail (§3.4)

Plus Prisma schema updates + seed data. No drops, no destructive changes. Old schema remains until PR #11 cutover.

## Hard Guardrails — Security is DB-First (lands in PR #10, not later)

- **RLS enabled + default-deny on every new table in this PR.** RLS is NOT
  postponed to PR #11. Each table ships with `ENABLE ROW LEVEL SECURITY` and no
  permissive default; access is granted only by explicit policy (§3.1, §4).
- **No public reads** except the allowed taxonomy tables (professions, skills,
  and other slug registries per §10). Author-content tables are closed by
  default (§4.1).
- **No direct client writes** to confirmation / evidence / history tables
  (`work_journal_entry_skill_link` confirmation state, `proof_of_work`,
  `skill_confirmation_history`, `audit_log`). Client `INSERT`/`UPDATE` is
  blocked by RLS; all writes go through `SECURITY DEFINER` RPCs.
- **SECURITY DEFINER RPC requirement.** Provide and document these RPCs:
  - `add_entry(...)`
  - `confirm_entry_skills(...)`
  - `reject_entry(...)`

  Each RPC performs **server-side authorization** before any write, checking:
  actor role, org / engagement-context membership, worker relationship, and
  target-entry ownership. No authorization logic in the client.
- **Append-only enforced at policy level** for `skill_confirmation_history` and
  `audit_log`: UPDATE/DELETE blocked for all roles (§3.1).
- **Server-side timestamps only** (`DEFAULT now()`, `timestamptz`); never accept
  client-supplied timestamps for legal-relevant rows (§3.2).
- Migration must be reversible (rollback SQL documented in file header).
- No data loss on rollback.
- All `original_language` columns constrained to the 10-locale set (§2.4).
- No hardcoded profession slugs in seed SQL (§10).
- `public_proof_link` and `client_report` surfaces remain **disabled /
  feature-flagged OFF** in this PR.

## Definition of Done

- [ ] Migration `0014_add_universal_journal_schema.sql` created (next free index; confirm against `supabase/migrations/`)
- [ ] Reversible (rollback SQL in header comment)
- [ ] RLS enabled + default-deny verified on every new table (proof in PR)
- [ ] `SECURITY DEFINER` RPCs `add_entry` / `confirm_entry_skills` / `reject_entry` with server-side authz
- [ ] `audit_log` present and written by sensitive-action RPCs (§3.4)
- [ ] `public_proof_link` / `client_report` disabled / flagged off
- [ ] Prisma schema updated (`prisma/schema.prisma`)
- [ ] Seed data covers 5+ professions (no tiler-only seed)
- [ ] Architect detail pass complete before opening PR

## Pre-Merge Hard Gate (all required before any production migration)

- [ ] Local migration dry-run
- [ ] Fresh-DB test (clean schema from zero)
- [ ] Staging / copy-DB test (against a copy of real data shape)
- [ ] Rollback SQL documented and exercised
- [ ] RLS default-deny proof (queries as anon + authenticated show deny-by-default)
- [ ] **Owner approval before production migration** (DI runs it manually; agents never run prod migrations)

## Out of Scope

- API endpoints (PR #11 — they call the RPCs defined here)
- UI changes (PR #11)
- Backfill of old journal entries (PR #11, if any exist)

> **Architect will replace this skeleton with the full PR #10 spec before execution.**
