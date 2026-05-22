# TASK-PR12: Living CV Hub + Entry-Level Manager Confirmation

**Status:** Draft — awaiting PR #11 merge + architect detail pass
**Branch:** `feat/cc/pr12-living-cv-hub`
**Strategic context:** `docs/handoffs/TASK-ARCH-LABOURMARKETAI-UNIVERSAL-DIRECTION.md` Part 3.1, Part 3.3, Part 4 PR #12

## Scope (Headline)

- `<CVHub>` component — replaces static profile page
- `<ProfessionCard>`, `<SkillBadge>`, `<ReadinessSignal>` — reusable building blocks
- `<ManagerConfirmationView>` — entry-level confirmation UI (not profession-wide)
- New endpoints: CV aggregate, pending confirmations, confirmation submit
- `skill_confirmation_history` written on every confirmation event (§3)

## Hard Guardrails

- CV is the central surface. Old `/dashboard/profile` redirects here.
- Confirmation is per-entry-per-skill. Never profession-wide.
- Confirmation attribution is visible (who, when, which entry).
- Readiness Signal % is transparently computable; tooltip explains the formula.
- No fake numbers presented as real. Labeled placeholders (`Sample`, `Demo`) are allowed only where real data does not yet exist for the user.
- No invented endorsements. No auto-confirmation.

## Definition of Done

- [ ] CV Hub displays multiple professions with per-profession readiness
- [ ] Manager can confirm individual skills per entry
- [ ] Confirmation history visible to worker + confirmer
- [ ] Worker CV reflects confirmation within UI refresh cycle
- [ ] Skill badges visually distinguish: ✓ verified, • declared, ? in-progress
- [ ] i18n: all new strings in 10 locales
- [ ] RLS: manager can't confirm outside their org

## Out of Scope

- Custom skill creation (M2)
- AI skill suggestion refinement (M3+)
- CV PDF export full impl (scaffold OK)
- Dashboard redesign (PR #13)

> **Architect will replace this skeleton with the full PR #12 spec before execution.**
