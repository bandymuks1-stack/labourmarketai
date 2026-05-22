# TASK-PR13: Dashboard Redesign (Living OS Feel)

**Status:** Draft — awaiting PR #12 merge + architect detail pass
**Branch:** `feat/cc/pr13-dashboard-redesign`
**Strategic context:** `docs/handoffs/TASK-ARCH-LABOURMARKETAI-UNIVERSAL-DIRECTION.md` Part 3.4, Part 4 PR #13

## Scope (Headline)

- Redesigned worker dashboard: Ready Signal front & center, profession cards, pending confirmations, growth metrics, quick actions
- Redesigned manager dashboard: team ready signals, confirmation queue, optional skill heatmap
- Industrial Intelligence aesthetic: blueprint grid, orange/cyan/amber palette, Bricolage Grotesque + Instrument Serif + JetBrains Mono
- `<JournalEntryCard>`, refactored `<WorkerDashboard>`, polished `<ProfessionCard>`

## Hard Guardrails

- All displayed metrics either traceable to real data **or** visibly labeled as sample / demo / placeholder.
- Ready Signal % tooltip explains the formula (verified / declared, last activity, etc.).
- Mobile-responsive (test at 360px width minimum).
- No fake "10,000 workers near you" presented as real. Such illustrative figures must carry a `Sample` or `Illustrative` label and be replaced with real numbers the moment real data exists.
- Performance: dashboard initial paint < 2s on 4G.

## Definition of Done

- [ ] Dashboard visually matches landing aesthetic
- [ ] All interactive elements working (cards, expandables)
- [ ] Ready Signal calculation transparent
- [ ] Mobile-responsive verified
- [ ] i18n: all strings in 10 locales
- [ ] Accessibility: ARIA labels, keyboard nav
- [ ] No performance regression

## Out of Scope

- Analytics / reporting (M3+)
- Real-time WebSocket updates (M2+)
- Dark mode toggle (skip; existing app doesn't have)

> **Architect will replace this skeleton with the full PR #13 spec before execution.**
