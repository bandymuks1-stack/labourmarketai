# TASK-PR11: Universal Work Journal UI + API

**Status:** Draft — awaiting PR #10 merge + architect detail pass
**Branch:** `feat/cc/pr11-universal-journal-ui`
**Strategic context:** `docs/handoffs/TASK-ARCH-LABOURMARKETAI-UNIVERSAL-DIRECTION.md` Part 3.2, Part 4 PR #11

## Scope (Headline)

- Endpoints / server actions for entry CRUD + skill linking **that call the
  `SECURITY DEFINER` RPCs defined in PR #10** (`add_entry`, `confirm_entry_skills`,
  `reject_entry`) — not direct table access.
- `<WorkJournalEntryForm>` — profession-agnostic universal form
- `<EntrySkillPicker>` — system-suggested + manual skill selection
- New page: `/dashboard/journal`
- All new i18n keys in all 10 locale files (§2.4)

## Hard Guardrails

- **RLS is NOT introduced or enforced in PR #11 — it already landed in PR #10**
  (default-deny). PR #11 relies on the existing policies; it must not add,
  loosen, or re-implement them.
- **No direct `INSERT`/`UPDATE` from the client or server action into journal /
  skill-link / evidence tables.** All writes go through the PR #10 RPCs, which
  perform server-side authorization (§3.1, §7).
- No tiler-specific fields. Form is fully generic (§10).
- **Worker-created entries must work through a personal context when no company
  / project / engagement exists** — `context_type = 'PERSONAL'` is a valid
  default. Onboarding must not require an organization.
- No auto-confirmation. Worker selects skills as `self_declared`; manager
  confirms in PR #12.
- Old tiler form removed only after the universal form passes E2E.
- `original_language` set from the worker's UI locale at submission time (§2.4).

## Definition of Done

- [ ] Universal form works for 5+ professions
- [ ] All writes routed through PR #10 RPCs (no direct table writes); verified
- [ ] New worker with no company/project can create entries via personal context
- [ ] Skill suggestion shows skills from profession template + entry-text inference (suggest only; never persists — §7.1)
- [ ] All new strings in 10 locale files (EN, LT verified; others `[EN]` placeholder per §2.4)
- [ ] E2E test: create entry as tilerer; create entry as electrician; both succeed via the same component
- [ ] Deny-path test: worker cannot read/write another worker's entries (RLS from PR #10 holds)
- [ ] No regression to existing flows

## Out of Scope

- Manager confirmation view (PR #12)
- CV hub display (PR #12)
- Proof of work upload UI (scaffold only; full impl M2)
- Custom skill creation (scaffold; locked to M2)
- Any RLS policy authoring (owned by PR #10)

> **Architect will replace this skeleton with the full PR #11 spec before execution.**
