# LabourMarket.ai — Design System (canonical index)

> One entry point. This file **indexes** the existing sources and records the
> layer added by the premium-completion mission (2026-10). It is NOT a second
> design system — where a source below says something, that source wins.

## Sources of truth (read in this order)
| Concern | Source |
|---|---|
| Frozen contract (wins on conflict) | `docs/design/final/00-FROZEN-DESIGN-CONTRACT.md`, `00-GALUTINE-DIZAINO-SISTEMA.md` |
| Soul / "one body" principle, 5 per-screen tests | `docs/DESIGN_SOUL.md` |
| Tokens: colour (black + gold), type, radii, shadows, motion | `docs/DESIGN_TOKENS.md`, `apps/web/tokens/*`, `app/globals.css`, `tailwind-preset.ts` |
| Agent-readable summary | root `DESIGN.md` |
| Anti-slop checklist | `docs/design/final/ANTI-SLOP-REVIEW-CHECKLIST.md` |
| Research verdicts (graph, motion, visual QA) | `docs/design/design-intelligence-2026-10.md` |
| Work primitives (WorkSpine, PersonPresence, EvidenceDot) | `apps/web/components/app/work-world/primitives.tsx` |

## Layer added 2026-10 (rules, not new tokens)
1. **Professional, never player.** No game vocabulary for people (guard: `lib/guards/no-game-language-for-professionals.test.ts`). Internal `playerCard` identifiers are legacy names, not copy.
2. **Person is persistent, context changes.** Same portrait/name/profession/state signals on every surface; only the surrounding context changes.
3. **Three density levels:** GLANCE (critical state) → WORK (what the task needs) → INSPECT (full evidence/history). Applies to people, companies, teams, projects, calendar, journal, reports, graph.
4. **Unknown is not zero.** Missing data renders NOT MEASURED / UNKNOWN / NOT VERIFIED, never 0 % or an implied score (product-truth SEP-7). Verification is shown only with evidence (SEP-3).
5. **Colour carries meaning, never alone.** cyan = evidence, green = confirmation, gold = brand/selection and never confirmation; every state also has an icon or text.
6. **Motion explains relationships** (object continuity: professional→team→project, work→evidence→CV). Fast, interruptible, `prefers-reduced-motion` honoured. framer-motion (already installed) only.
7. **Diagrams answer a question.** Native SVG + framer-motion by default; every diagram ships a list/table alternative and keyboard operation. `@xyflow/react` only if a full canvas is justified (see research note).
8. **Lifecycle is the identity:** people ↔ opportunities ↔ companies ↔ teams ↔ projects ↔ real work ↔ evidence ↔ professional growth.

## Visual QA
Playwright (`apps/web/playwright.config.ts`) at 375 / 768 / 1280 / 1920; add `toHaveScreenshot` + `@axe-core/playwright` per the research note. Proof wording: layout emulation ≠ mobile device proof.
