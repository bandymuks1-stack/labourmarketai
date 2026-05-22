# TASK-PR10: Universal Data Model (Non-Destructive Schema)

**Status:** Draft — awaiting PR #9 merge + architect detail pass
**Branch:** `feat/cc/pr10-universal-schema`
**Strategic context:** `docs/handoffs/TASK-ARCH-LABOURMARKETAI-UNIVERSAL-DIRECTION.md` Part 2.2

## Scope (Headline)

Non-destructive migration adding:
- `worker_profession_context`
- `work_journal_entry`
- `work_journal_entry_skill_link`
- `proof_of_work` (scaffold)
- `skill_confirmation_history`

Plus Prisma schema updates + seed data. No drops, no destructive changes. Old schema remains until PR #11 cutover.

## Hard Guardrails

- Migration must be reversible (rollback SQL documented in file header).
- No data loss on rollback.
- RLS policies drafted (not enforced yet — PR #11 enforces).
- All `original_language` columns constrained to the 10-locale set (§2.4).
- No hardcoded profession slugs in seed SQL.

## Definition of Done

- [ ] Migration `0013_add_universal_journal_schema.sql` created
- [ ] Reversible (rollback SQL in header comment)
- [ ] Prisma schema updated (`prisma/schema.prisma`)
- [ ] Seed data covers 5+ professions (no tiler-only seed)
- [ ] Local test pass (fresh DB + existing fixtures)
- [ ] Architect detail pass complete before opening PR

## Out of Scope

- API endpoints (PR #11)
- UI changes (PR #11)
- RLS enforcement (PR #11)
- Backfill of old journal entries (PR #11, if any exist)

> **Architect will replace this skeleton with the full PR #10 spec before execution.**
