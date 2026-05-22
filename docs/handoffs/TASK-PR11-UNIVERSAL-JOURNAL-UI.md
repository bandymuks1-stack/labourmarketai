# TASK-PR11: Universal Work Journal UI + API

**Status:** Draft — awaiting PR #10 merge + architect detail pass
**Branch:** `feat/cc/pr11-universal-journal-ui`
**Strategic context:** `docs/handoffs/TASK-ARCH-LABOURMARKETAI-UNIVERSAL-DIRECTION.md` Part 3.2, Part 4 PR #11

## Scope (Headline)

- New endpoints for entry CRUD + skill linking
- `<WorkJournalEntryForm>` — profession-agnostic universal form
- `<EntrySkillPicker>` — system-suggested + manual skill selection
- New page: `/dashboard/journal`
- RLS enforcement on new endpoints
- All new i18n keys in all 10 locale files (§2.4)

## Hard Guardrails

- No tiler-specific fields. Form is fully generic.
- No auto-confirmation. Worker selects skills as `self_declared`; manager confirms in PR #12.
- Old tiler form removed only after universal form passes E2E.
- `original_language` set from worker's UI locale at submission time.

## Definition of Done

- [ ] Universal form works for 5+ professions
- [ ] Skill suggestion shows skills from profession template + entry-text inference
- [ ] All new strings in 10 locale files (EN, LT verified; others `[EN]` placeholder)
- [ ] E2E test: create entry as tilerer; create entry as electrician; both succeed via same component
- [ ] RLS enforced (worker can't see other workers' entries)
- [ ] No regression to existing flows

## Out of Scope

- Manager confirmation view (PR #12)
- CV hub display (PR #12)
- Proof of work upload UI (scaffold only; full impl M2)
- Custom skill creation (scaffold; locked to M2)

> **Architect will replace this skeleton with the full PR #11 spec before execution.**
