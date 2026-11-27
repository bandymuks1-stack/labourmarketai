# 0032 — No interface noise (binding, owner rule 2026-11-15)

**Status:** binding, permanent. Applies to every agent, every future PR and every locale.

## Rule

Never add primitive or redundant text to the user interface: text that explains the obvious or
talks down to the user. This covers:

- account-promise badges such as „Paskyros nereikia" / "No account needed";
- instructions for self-evident actions ("press the button to…", "fill in the field below");
- explanations repeated on the same page or path;
- demonstration or filler captions;
- any other informational noise that gives the user nothing they need.

## Standard

- Professional, minimal design at the level of Apple / macOS.
- Short, clear function names.
- Only information the user actually needs.
- No new helper text without a real need. A missing explanation is not fixed by adding one; first
  ask whether the screen itself should make it obvious.

## What stays

Keep the legal, consent, privacy and security texts, plus the essential explanation of an action's
consequence: what is sent, to whom, what is charged, what cannot be undone. Doctrine §18 also stays.
Fake or placeholder data must still be visibly marked, and honest empty states are not noise.

## Scope

This is a copy and review rule. It does not change functionality, registration logic or
architecture.

## Enforcement

- `CLAUDE.md` and `AGENTS.md` carry this rule as a standing instruction.
- `.claude/skills/code-review/SKILL.md`, Layer 2, carries it as a review criterion. A PR that adds
  interface noise gets a should-fix, or a blocker when it misleads.
