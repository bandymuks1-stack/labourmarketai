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

## Acceptance criteria — skill aggregation (absorbs M1 mobile bug #3)

Bug #3 (skill counter overwrite) is **deferred here** rather than hotfixed in M1 —
it is a single-context / aggregation-logic symptom whose full fix belongs in the
universal Journal/CV flow.

- [ ] Worker has 7 existing skills in one profession/context; adds 3 new → CV Hub shows **10 total**.
- [ ] **No previously saved skill is silently overwritten** on add.
- [ ] Skill count **aggregates across ALL profession contexts**, not a single context.
- [ ] Breakdown stays explicit: self-declared / journal-supported / evidence-supported / manager-or-client confirmed.
- [ ] **Regression test MUST FAIL if the UI shows only the newly added 3.**
- [ ] Full fix belongs in PR #11 (universal Journal/CV flow), **not an M1 temporary hack**.

## Owns: entry↔skill-link table + compensating controls #3 / #4 (from PR #10b §5.8)

PR #11 introduces the entry↔skill-link table (the "universal" `work_journal_entry_skill_link`
equivalent). It **does not exist in the current schema**, so it must **not** be
created inside PR #10b / migration `0014`. When PR #11 introduces it, that PR
also owns the two compensating controls deferred from
`docs/handoffs/TASK-PR10B-0014-HARDENING-SPEC.md` §5.8:

- [ ] **Control #3 — BEFORE INSERT** on the entry↔skill-link table: validate `skill_id` belongs to the entry's profession taxonomy (`profession_skills`); reject `skill_not_in_profession`; links are **entry-specific, never profession-wide**.
- [ ] **Control #4 — AFTER INSERT** on the entry↔skill-link table: append a `journal_entry_confirmations` row (`kind = 'confirm'`, `self_declared` semantics) linking entry/worker/profession/skill/actor + server timestamp; append-only.
- [ ] These are the only two of PR #10b's seven compensating controls that are **PR #11 scope** (#1, #2, #5, #6, #7 ship in `0014`).

> **Architect will replace this skeleton with the full PR #11 spec before execution.**
