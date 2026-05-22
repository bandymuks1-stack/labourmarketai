# labourmarket.ai — Universal Architecture (Summary)

> **Full strategic context:** `docs/handoffs/TASK-ARCH-LABOURMARKETAI-UNIVERSAL-DIRECTION.md`
> This file is a quick reference. The strategic doc is the source of truth.

## Core Principle

One person → many profession contexts → many journal entries → entry-level skill confirmations → one living CV.

## Non-Negotiables

1. **No tiler hardcode.** All profession-dependent behavior loads from slug + JSON.
2. **New worker must start without company.** `context_type = 'PERSONAL'` is a default valid state.
3. **CV is the central living trust object.** Computed, signal-rich, real-time.
4. **No unlabeled fake data, no fake verification, no fake AI.** Placeholder / sample data is allowed during the pre-launch phase **only when clearly visually labeled** (`Sample`, `Demo`, `Placeholder`). Real data is required for anything presented as real. AI never confirms or sends on behalf of a human (§7).

## Data Model (Headline)

- `worker_profession_context` — links person ↔ profession ↔ optional org
- `work_journal_entry` — universal entry with explicit `profession_id`, `original_text`, `original_language`
- `work_journal_entry_skill_link` — entry-level skill assertion + confirmation
- `proof_of_work` — file attachments per entry (scaffold M1, used M2+)
- `skill_confirmation_history` — append-only audit trail (§3)

## PR Sequence

| PR | Scope | State |
|---|---|---|
| #9 | This docs suite | In progress |
| #10 | Non-destructive DB schema | Next |
| #11 | Universal Work Journal UI + API | After #10 |
| #12 | Living CV Hub + entry confirmation | After #11 |
| #13 | Dashboard redesign (Industrial Intelligence aesthetic) | After #12 |

## Doctrine Alignment

This architecture is compliant with PLATFORM_DOCTRINE.md sections:
- §2, §2.4 (translations, locale set)
- §3 (append-only, audit)
- §4 (default-closed visibility)
- §5 (positions ≠ RBAC roles)
- §7 (AI never confirms without human)
- §10 (Lego — slug + JSON for all extensible taxonomy)

See strategic doc Part 5 for the full alignment table.

## What This Architecture Does NOT Do

- Does not auto-verify skills based on entry count, tenure, or AI inference.
- Does not require a company / project for worker onboarding.
- Does not lock a person to a single profession.
- Does not invent market or trust claims that aren't backed by real data.
- Does not hardcode profession-specific UI or form fields.
