# TASK — Install quality skills + create permanent doctrine-guard skill

> **Status:** executing (Claude Code session, 2026-06-12)
> **Branch:** `feat/cc/skills-doctrine-guard`
> **Tier:** GREEN (docs/config only, no migrations, no schema)

## GOAL — INSTALL QUALITY SKILLS + CREATE PERMANENT DOCTRINE-GUARD SKILL

We are preparing labourmarket.ai for public exposure. Real users have already
reported bugs, and bug-fixing sessions revealed two systemic gaps: (1)
verification relies on reading code instead of exercising the running app, so
visible defects slip through; (2) fixes risk creating parallel structures that
duplicate canonical ones. This task closes both gaps permanently. The deeper
purpose: technologies and tools will change, but the essence of this platform
must not — clarity, reliability, human-first design, AI that never lies, one
canonical structure for every concept. We encode that essence as a
project-owned skill so it survives any future tooling change and loads
automatically in every session for every collaborator.

## STEP 1 — Create this handoff file first

Write this entire GOAL + plan into
`docs/handoffs/TASK_skills_and_doctrine_guard.md`, then execute.

## STEP 2 — Install external skills

Run from repo root, verify each lands in `.claude/skills/`:

```
npx -y skills add anthropics/skills --skill webapp-testing --agent claude-code
npx -y skills add anthropics/skills --skill code-review --agent claude-code
npx -y skills add anthropics/skills --skill skill-creator --agent claude-code
npx ui-skills add baseline-ui
npx ui-skills add fixing-accessibility
npx ui-skills add fixing-motion-performance
npx ui-skills add fixing-metadata
```

If any command fails, diagnose and resolve autonomously (alternate install
path, manual SKILL.md placement from anthropics/skills repo) — do not hand
debugging back to the user.

## STEP 3 — Create the doctrine-guard project skill

Using skill-creator best practices, create our own project skill at
`.claude/skills/doctrine-guard/SKILL.md`. Description must trigger on: any
schema change, new table/RPC/migration, new component/page/route, bug fix
touching data flow, or any task that could introduce a new structure. The
skill must read `docs/PLATFORM_DOCTRINE.md` as the binding source and enforce,
in this order:

1. **ESSENCE** (never updatable, only extendable): clarity, reliability,
   human-first, level playing field (§1), AI-never-lies (§7), Reality
   principle (no fake/demo framing), Work Journal as the central spine.
2. **CANONICAL CHECK** before creating anything new: does a canonical
   equivalent already exist? Canonical map: ORG = organizations +
   engagement_contexts + relationship_types; MESSAGING = conversations /
   conversation_participants / conversation_messages; DEMAND =
   customer_requests (sole structured-demand intake);
   projects.organization_id = canonical FK. If an equivalent exists → extend
   it, never create a parallel. If genuinely new → state why no existing
   structure fits, in the PR description.
3. **SAFETY RAILS**: default-closed visibility (§4), append-only legal proof
   (§3), storage minimalism (§6), translations via
   original_text+original_language (§2), positions vs roles (§5).
4. **MIGRATION RULES**: additive = GREEN auto-merge; unguarded DROP /
   RLS-loosening / auth-core = RED → draft + human gate; prod apply only via
   Supabase MCP apply_migration; naming `YYYYMMDDHHMMSS_snake_case.sql`.
5. **VERIFICATION RULE**: any user-visible fix must be verified with
   webapp-testing (real browser pass: light+dark theme, the changed flow
   end-to-end) and pass code-review before merge.

The skill should explain WHY each rule exists (one line each, grounded in
PROJECT_VISION.md), not just command — skills work better through reasoning
than prohibition. Keep frontend constraints explicit: frontend-design skill is
for creative quality, but design tokens from PR #162 (Bricolage Grotesque,
Instrument Serif, JetBrains Mono, rgb(var(--c-*)) tokens, dark default) are
binding — no new palettes or font systems.

## STEP 4 — Commit + PR

Commit everything (`.claude/skills/*` + handoff file) on
`feat/cc/skills-doctrine-guard`, open PR (GREEN tier: docs/config only, no
migrations). Restart guidance in PR description: collaborators must restart
their Claude Code session after pulling to load the skills.

## EXECUTION NOTES (2026-06-12, deviations from plan)

- `webapp-testing` and `skill-creator` installed cleanly from
  `anthropics/skills` into `.claude/skills/` (provenance in
  `skills-lock.json`).
- **`code-review` does not exist in the anthropics/skills repo** (it ships 18
  skills; none is code-review — `/code-review` is built into Claude Code
  itself). Installing a third-party substitute was out of the approved scope,
  so a **project-owned** `.claude/skills/code-review/SKILL.md` was authored
  instead: Layer 1 delegates to the built-in `/code-review`, Layer 2 adds the
  labourmarket.ai-specific dimensions (doctrine, honesty copy, RLS grants,
  i18n parity, guards, browser-verification evidence). More durable than a
  third-party copy and exactly what the doctrine-guard verification rule
  needs.
- **`npx ui-skills add` is broken on Windows** (its bin is a shell script).
  The four skills were placed manually from the official `ui-skills@0.1.6`
  npm tarball (`package/skills/*/SKILL.md`) — same content the CLI would have
  installed.
- The doctrine-guard frontend section binds to the **token files** as source
  of truth rather than a hardcoded font list: the current owner lock
  (`apps/web/tokens/typography.ts`, 2026-06-11) is Bricolage Grotesque +
  Inter + JetBrains Mono — Instrument Serif from PR #162 has since been
  swapped out, which is itself proof that tokens, not lists, must be the
  binding reference.

## HARD GUARDRAILS (firm)

- No schema changes in this task.
- No parallel structures.
- Never use the shorthand for the legacy project name — always write
  **labourmarket.ai**.
- Do not touch the labourmarket.ai/lt legacy project.
- Everything else is direction, not a ceiling — if a better way exists to make
  the doctrine-guard skill stronger or more durable, take it.
