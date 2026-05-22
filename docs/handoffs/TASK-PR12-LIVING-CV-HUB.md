# TASK-PR12: Living CV Hub + Entry-Level Manager Confirmation

**Status:** Draft — awaiting PR #11 merge + architect detail pass
**Branch:** `feat/cc/pr12-living-cv-hub`
**Strategic context:** `docs/handoffs/TASK-ARCH-LABOURMARKETAI-UNIVERSAL-DIRECTION.md` Part 3.1, Part 3.3, Part 4 PR #12

## Scope (Headline)

- `<CVHub>` component — replaces static profile page
- `<ProfessionCard>`, `<SkillBadge>`, `<ReadinessSignal>` — reusable building blocks
- `<ManagerConfirmationView>` — entry-level confirmation UI (not profession-wide)
- Read endpoints: CV aggregate, pending confirmations
- Confirmation / rejection via the PR #10 `SECURITY DEFINER` RPCs
  (`confirm_entry_skills`, `reject_entry`)

## Hard Guardrails

- **Confirmation / rejection goes through a `SECURITY DEFINER` RPC (or
  server-only action) with DB-side authorization.** No direct client `INSERT`
  into confirmation tables (§3.1, §7).
- **Each confirmation / rejection writes transactionally, in one RPC call:**
  1. `work_journal_entry_skill_link` — update/confirmation state
  2. `skill_confirmation_history` — append-only row (§3.1)
  3. `audit_log` — immutable row (§3.4)

  Every record carries: actor id, target entry id, event payload, and a
  **server-side timestamp** (§3.2). All-or-nothing: partial writes are not
  allowed.
- The RPC checks actor role, org / engagement membership, worker relationship,
  and target-entry ownership server-side before writing.
- CV is the central surface. Old `/dashboard/profile` redirects here.
- **Confirmation is per-entry-per-skill. Never profession-wide.**
- Confirmation attribution is visible (who, when, which entry).
- Readiness Signal % is transparently computable; tooltip explains the formula.
- No fake numbers presented as real. Labeled placeholders (`Sample`, `Demo`) are
  allowed only where real data does not yet exist for the user.
- No invented endorsements. No auto-confirmation. AI may suggest, never persists (§7.1).
- **UI shows success only after the RPC returns success.** No optimistic
  "confirmed" state before the server transaction commits.

## Definition of Done

- [ ] CV Hub displays multiple professions with per-profession readiness
- [ ] Manager can confirm individual skills per entry (never profession-wide)
- [ ] Confirmation/rejection executes via RPC; client never writes confirmation tables directly
- [ ] One transactional write produces all three records (link state + history + audit) with actor/entry/payload/server-timestamp
- [ ] Confirmation history visible to worker + confirmer
- [ ] Worker CV reflects confirmation only after RPC success
- [ ] Skill badges visually distinguish: ✓ verified, • declared, ? in-progress
- [ ] i18n: all new strings in 10 locales (§2.4)
- [ ] RLS: manager can't confirm outside their org (deny-path test)

## Out of Scope

- Custom skill creation (M2)
- AI skill suggestion refinement (M3+)
- CV PDF export full impl (scaffold OK)
- Dashboard redesign (PR #13)

> **Architect will replace this skeleton with the full PR #12 spec before execution.**
