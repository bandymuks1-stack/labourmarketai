# TASK <SHORT-ID> — <one-line title>

**To:** <executor, e.g. Claude Code>
**From:** <author, e.g. Architect / DI>
**Branch:** <feat/cc/... — new or existing>
**PR scope:** <one line: size + nature, e.g. "doc-only, additive, small">
**PR status:** <DRAFT until DI marks ready | ready immediately | …>

---

## Context

<Why this work exists; the problem; links to prior PRs / handoffs / doctrine
sections. Enough for the executor to act without guessing.>

## Task

<What to do. Numbered sub-tasks (A, B, …) for multi-part work. Be concrete:
exact files, exact strings, acceptance per item where it helps.>

## Definition of done

- <Checklist of verifiable outcomes.>
- CI green (typecheck, lint, build all locales, tests) as applicable.
- PR status honored (draft vs ready).

## Out of scope

- <Explicitly list what NOT to touch, to prevent scope creep.>

## Recovery & rollback

Every handoff must answer how the work can be safely undone if needed. Fill in
what applies; for purely additive, slug-based, or behind-a-flag work, a single
sentence is enough ("Additive only — no rollback procedure needed").

- **Schema changes.** Is the migration reversible? If yes, document the down
  migration. If no (destructive), explain why and follow the two-PR rule
  (pending §14).
- **User-visible changes.** Can the feature be gated behind a flag for quick
  disable? If yes, name the flag. If no, describe the manual rollback path.
- **Data writes.** Journal data is append-only per §3 — corrections come as new
  rows, never overwrites. For other tables, how is data introduced by this PR
  rolled back if the PR is reverted?
- **Locale files.** All 10 files must exist; rollback never deletes a locale
  file (§2.4). Note new keys added; on revert they become orphans, which is
  safe.
- **Configuration / registries.** Slug + JSON changes are non-destructive by
  construction (§10). Just list what slugs / units / templates were added.
- **External dependencies.** New API providers, new external services, new
  webhooks — what happens if the provider is unavailable or removed?

## Doctrine references

- <Cite the `docs/PLATFORM_DOCTRINE.md` sections this work touches or must obey,
  e.g. §2/§2.4 (translations/locale set), §3 (append-only), §8.2 (conflict
  disclosure), §10 (Lego).>

## After-completion step

<What the executor does at the end: push branch, open PR, draft vs ready, who
merges, who to notify. Reminder: only DI marks a PR ready unless this handoff
explicitly authorizes otherwise.>
