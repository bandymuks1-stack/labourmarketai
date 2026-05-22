# TASK-PR13: Dashboard Redesign (Living OS Feel)

**Status:** Draft — awaiting PR #12 merge + architect detail pass
**Branch:** `feat/cc/pr13-dashboard-redesign`
**Strategic context:** `docs/handoffs/TASK-ARCH-LABOURMARKETAI-UNIVERSAL-DIRECTION.md` Part 3.4, Part 4 PR #13

## Scope (Headline)

- Redesigned worker dashboard: Ready Signal front & center, profession cards, pending confirmations, growth metrics, quick actions
- Redesigned manager dashboard: team ready signals, confirmation queue, optional skill heatmap
- Industrial Intelligence aesthetic: blueprint grid, orange/cyan/amber palette, Bricolage Grotesque + Instrument Serif + JetBrains Mono
- `<JournalEntryCard>`, refactored `<WorkerDashboard>`, polished `<ProfessionCard>`

## Hard Guardrails — Real-vs-Placeholder Honesty (§7)

- **Every sample / demo / placeholder value is visibly labeled** in the UI
  (`Sample`, `Demo`, `Placeholder`, or `Illustrative`). No unlabeled fake data.
- **Any metric presented as "real" must be traceable to a concrete data record**
  (a specific journal entry, confirmation, or aggregate row). If it cannot be
  traced, it is a placeholder and must be labeled as one.
- **Documented `isPlaceholder: true` principle.** Placeholder surfaces carry an
  explicit `isPlaceholder` flag in their data/props contract so the UI can
  render the label deterministically and tests can assert it. Document this
  principle in the component/data layer.
- **Auto-switch from placeholder to real data** the moment real entries exist
  for the user/scope: a surface flips from labeled-placeholder to real (and
  drops the label) automatically, without manual edits.
- No fake "10,000 workers near you" presented as real — such illustrative
  figures carry a `Sample` / `Illustrative` label and are replaced with real
  numbers as soon as real data exists.
- Ready Signal % tooltip explains the formula (verified / declared, last activity, etc.).
- Mobile-responsive (test at 360px width minimum).
- Performance: dashboard initial paint < 2s on 4G.

## Definition of Done

- [ ] Dashboard visually matches landing aesthetic
- [ ] Every placeholder/sample value is visibly labeled in the UI
- [ ] Every "real" metric is traceable to a concrete data record
- [ ] `isPlaceholder` principle documented and enforced in the data/props contract
- [ ] Surfaces auto-switch placeholder → real when real data exists (tested)
- [ ] All interactive elements working (cards, expandables)
- [ ] Ready Signal calculation transparent
- [ ] Mobile-responsive verified
- [ ] i18n: all strings in 10 locales (§2.4)
- [ ] Accessibility: ARIA labels, keyboard nav
- [ ] No performance regression

## Out of Scope

- Analytics / reporting (M3+)
- Real-time WebSocket updates (M2+)
- Dark mode toggle (skip; existing app doesn't have)

> **Architect will replace this skeleton with the full PR #13 spec before execution.**
