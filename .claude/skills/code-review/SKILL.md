---
name: code-review
description: labourmarket.ai project code-review checklist. ALWAYS use before merging any PR, after completing any slice, when the user asks to review changes, or before enabling auto-merge. Wraps Claude Code's built-in /code-review with the project-specific dimensions (doctrine compliance, honesty copy, RLS, i18n parity, guards) that a generic review misses.
---

# Code Review — labourmarket.ai

Run reviews in two layers. The generic layer catches bugs; the project layer
catches doctrine drift — both are required before merge because real users are
on the product and every merge is public.

## Layer 1 — generic correctness

Run Claude Code's built-in `/code-review` on the branch diff. Fix or
consciously dismiss every finding; do not merge with unexamined findings.

## Layer 2 — project dimensions

These are the failure classes generic review does not know about. Check each
against the diff:

1. **Doctrine compliance** — run the `doctrine-guard` skill checks if the
   change touches schema, data flow, or any new structure. A reviewed bug fix
   that introduces a parallel structure is a net loss.
2. **Honesty copy** — no "verified" unless truly verified, no green unless
   real, no demo/pilot framing (§18), no global person score (§19). Colours
   cannot lie. Check both EN and LT copy.
3. **RLS & visibility** — every new table has RLS enabled, default-closed
   (§4), explicit GRANT to `authenticated` (this project has NO default
   grants — a missing grant fails silently as an empty result, not an error).
4. **i18n parity** — new keys exist in all 10 locale files in the same PR
   (`[EN] <english>` placeholders are acceptable outside EN/LT). No hardcoded
   user-facing strings.
5. **Guards** — `pnpm -F web test` green; if the change fixes a recurring
   violation class, a new `lib/guards/*.test.ts` ships in the same PR.
6. **Verification evidence** — for user-visible changes, the PR description
   states what was exercised in a real browser (webapp-testing pass,
   light + dark). "Typecheck passed" is not verification of visible behavior.

## Output

Report findings as: severity (blocker / should-fix / nit), file:line, what,
and why it matters. Blockers stop the merge; everything else is judgment.
