# PREMIUM PRODUCT REBUILD — W1 AUDIT + FIRST IMPLEMENTATION SLICE

## Verdict

```text
LABOURMARKET_AI_PREMIUM_REBUILD_PARTIALLY_COMPLETE
```

W1 (audit) is complete and the first implementation slice is delivered and
browser-proven. W2–W11 are not started. The verdict is not `COMPLETE` because
the main production E2E paths have not been re-proven in production, and it is
not `NOT_ACCEPTABLE` because this turn shipped working code and removed real
defects, not documentation.

---

## 0. THE FINDING THAT REFRAMES THE COMMAND

**The premium chat-first product is already built. It is not merged.**

```text
main                                  752f8b19   ← what production runs
feat/cc/premium-unified-product-v1    edcec2fc   ← main + 16 commits, Draft PR #925
feat/cc/goal3-project-evaluation-v1   f3e16015   ← + Goal 3, from the previous turn
git rev-list --left-right --count main...feat/cc/premium-unified-product-v1  →  0  16
```

`main` is **zero commits ahead** and **sixteen behind**. Everything the command
describes as needing a rebuild — the chat-first workspace with a contextual
result surface, the canonical `MarketMap`, the premium Player Card with real
charts, the market → projects → project-evaluation chain — exists on that
branch, unmerged, behind a Draft PR opened 2026-07-30.

Rebuilding it in `main` would produce the second parallel architecture the
command explicitly forbids, and would duplicate work already proven in an
authenticated browser. **The rebuild's first task is therefore not to build: it
is to land what exists.** That is what this turn did the groundwork for.

Why it never landed: the branch carried **7 failing guard tests**, all on the
landing. They are now all green (§4).

---

## 1. AUDIT

Read-only, whole product, not just recent PRs.

| Sritis | Dabartinė būsena | Veikia realiai | Problema | Reikalingas pakeitimas |
|---|---|:--:|---|---|
| Branch / HEAD | `main` @ `752f8b19`, clean | — | 16 commits of premium work unmerged | Land PR #925 + Goal 3 |
| Routes | **107 pages, 71 under `/dashboard`** | ✅ | The ~72-route sprawl the blueprint diagnosed; every answer became a route | W3 result surface (exists on branch) |
| `/dashboard` root | `ConversationChat` — chat-first | ✅ | Chat-first is ALREADY on main | Keep |
| Context Panel / result surface | **Only on the branch** | ❌ on main | The conversation has nowhere to render an answer | Merge |
| `/dashboard/advanced` | **916-line second dashboard** (Premium Hub) | ✅ | THE parallel dashboard the command forbids; reachable from account menu + a work-log CTA | W3: fold into the result surface, then delete |
| Navigation | `bottom-nav` (5 items) + `dashboard-chrome` (module bar) + account menu | ✅ | Three nav systems | W3 consolidation |
| Charts | `evidence-timeline-chart`, `skill-evidence-chart` mounted in `worker-player-card`; `supply-demand-chart` in `market-pulse` | ✅ | Real, hand-rolled SVG, real rows | Extend per §6, do not replace |
| Player Card | `worker-player-card.tsx`, canonical, charts restored in #923, collapse fixed in #924 | ✅ | Owner REJECTED the completion round (#922) | W4 |
| Mock / fake data | **2 real cases**: `dashboard/talent` (`SAMPLE_WORKERS`/`SAMPLE_JOBS`) and `player-card-showcase` | ⚠ | `talent` is superadmin-gated, "Sample ·" prefixed, preview-bannered — honest but adds a route | Fold into W4 or delete |
| Dead CTAs | **3 found** (§3) | ❌ | Two dead nav anchors + one silent submit | **FIXED this turn** |
| Dead code | `live-product-demo.tsx` (194 lines), `audience-value-sections.tsx` | ❌ | Unmounted, referenced only by stale comments | 1 deleted, 1 flagged (§6) |
| Login | Google OAuth + email/password, inline | ✅ | No dead social buttons | §10 largely satisfied |
| Onboarding | 94-line page | ⚠ | Not audited against the 5-step §10 flow | W9 |
| Workspace context | `lib/company/active-organization.ts`; `activeOrgName` drives `resultContext` on the branch | ⚠ | Isolation not re-proven per context | W3 |
| Dependencies | **14 direct** — no UI kit, no chart library, no CSS framework beyond Tailwind | ✅ | Already lean; charts are hand-rolled SVG | Protect (§5) |
| Guards | 790 test files | ✅ | 7 were red on the branch | **FIXED this turn** |
| i18n | 11 locales; `conversation.results` in 5 | ⚠ | Newer namespaces lag | W11 |

### Not audited this turn (declared, not assumed)

Performance, accessibility beyond the landing, mobile beyond the Goal 3 panel,
the calendar-conflict path, the employer candidate path, CV import, and
production runtime state. These belong to W8/W10/W11 and are listed as **not
done**, not as passing.

---

## 2. PONYTAIL-IMPROVED — READ-ONLY AUDIT AND DECISION

**Source:** `github.com/0xwilliamortiz/ponytail-improved`. MIT. Ships two Node
lifecycle **hooks** plus skills, installed with `npm install && npx .`, and
registers automatically in skill-capable hosts. Core is a seven-rung ladder:
does this need to exist → already in the repo → standard library → platform →
installed dependency → can it be one line → write the minimum that works. Its
own framing is "lazy, not negligent": validation, error handling, security and
accessibility stay mandatory.

**Decision: `ADAPT_RULES_ONLY`.**

Reasons, in order of weight:

1. **Supply-chain and blast radius.** It installs lifecycle hooks that activate
   in every agent session on the host. This repo shares a machine with
   `agentai` and Watchmaker Vismantas; §17 forbids installing globally without
   separate permission, and a hook that runs on every session in every project
   is exactly that, regardless of where the `npm install` happened.
2. **Uncontrolled instruction injection.** Hooks that prepend rules to each
   session would sit upstream of this repo's own doctrine (`CLAUDE.md`,
   `AGENTS.md`, 790 guard tests). Two rule sources with no precedence contract
   is a conflict waiting to be discovered in the middle of a task.
3. **`/ponytail-audit` on a guard-heavy repo.** Its simplification pass reads
   duplication as waste. Much of this repo's "duplication" is deliberate: 790
   guard files exist to be redundant with the code they pin. The risk of a
   simplification pass deleting guards is real and the downside is silent.
4. **The value is the ladder, and the ladder is free.** Nothing in the seven
   rungs needs a dependency to apply.

The rules are therefore adopted directly. They are already what this turn did:
`landing-composition.ts` is one 80-line helper replacing four copies of a stale
grep; `live-product-demo.tsx` was deleted rather than kept "just in case"; the
`#partners` nav item was removed rather than a partners section invented to
justify it; and no dependency was added.

**Not installed. Not added to any skill. Reversible in one decision.**

### Simplicity summary (this slice)

| Rodiklis | Prieš | Po |
|---|---:|---:|
| UI komponentų skaičius | 1 dead hero component | 0 |
| Dubliuojami komponentai | `live-product-demo` + `hero-live-demo` | 1 |
| Tiesioginės priklausomybės | 14 | **14** |
| Neveikiantys CTA | 3 | **0** |
| Paraleliniai navigacijos keliai | 3 | 3 *(W3)* |
| Mock/stub duomenų vietos | 2 | 2 *(both honest+gated)* |
| Bendras pakeisto kodo kiekis | — | +198 / −258 |
| Pašalinto negyvo kodo kiekis | — | **194 lines + 11 unused i18n keys** |

No new dependency was introduced, so the per-dependency justification table is
empty by construction.

---

## 3. THE THREE DEAD CTAs — WHY NOTHING CAUGHT THEM

All three sat on the **public landing**, behind guards that were red for an
unrelated reason.

Four guards asserted things about the landing by grepping
`app/[locale]/(marketing)/page.tsx` for a literal string. When the landing was
recomposed into `<HeroLiveDemo>` / `<FinalCtaBand>` / `<ProductChainBand>`,
every one of them failed — not because a CTA had been removed, but because it
had moved one file down. Four red lights that mean "the file changed shape"
train everyone to ignore them, and an ignored guard protects nothing.

| # | Defect | Impact | Fix |
|---|---|---|---|
| 1 | `nav.partners → /#partners` — the section left the landing with the rebuild (`audience-value-sections.tsx` unmounted) | Every visitor clicking "Partneriams" scrolled nowhere | Nav item removed; `nav.partners` deleted from **11** locale catalogues. Restoring the anchor would have meant inventing a section to justify a link; that audience already has a real page behind "Agentūroms" |
| 2 | Hero ask form: submit with **no pending signal and no announced result** | The one interactive control on the landing gave no sign it had done anything; an unanswerable question was shown but never announced | `aria-busy` + a visible pending dot, both derived from the existing phase machine; `role="status"` on the unmatched message. The submit is deliberately **not** disabled — re-asking mid-run is legitimate |
| 3 | `live-product-demo.tsx` — 194 lines, unmounted, referenced only by a stale comment | Dead code that guards still asserted about | Deleted; guards repointed to `hero-live-demo.tsx`, which carries the same demo badge and reduced-motion handling |

### A mistake this turn made, and how it was caught

While fixing #1 the audit concluded `#how-it-works` was **also** dead and added
`id="how-it-works"` to `<ProductChainBand>`. It was wrong: `page.tsx:67` already
wraps that band in `<div id="how-it-works">`. The derived guard file list had
filtered to `components/marketing/` and dropped `page.tsx`, so a live anchor
looked dead — and the "fix" introduced a **duplicate id**, an accessibility
defect.

The browser caught it (`strict mode violation: resolved to 2 elements`), not the
guard. The id was reverted and the guard's file list now includes `page.tsx`.
Recorded here because it is the same failure mode as the original bug: a check
that looks at the wrong set of files gives confident wrong answers.

---

## 4. WHAT CHANGED

| File | Purpose |
|---|---|
| `lib/guards/landing-composition.ts` | **NEW.** Resolves the landing's real render tree (page + imports, depth-capped). One helper, four call sites, replacing four stale greps. |
| `components/marketing/hero-live-demo.tsx` | `aria-busy` + visible pending dot on the ask submit; `role="status"` on the unmatched result. |
| `components/layouts/site-nav.tsx` | Dead `partners` nav item removed, with the reason recorded. |
| `components/marketing/live-product-demo.tsx` | **DELETED** — 194 lines of dead code. |
| `components/marketing/product-chain-band.tsx` | Comment recording why it must NOT carry `id="how-it-works"`. |
| `lib/guards/global-landing.test.ts` | Hardcoded `LANDING_FILES` replaced by the derived tree; guard repointed to `hero-live-demo`; asserts the superseded file stays deleted. |
| `lib/guards/public-market-entry.test.ts` | Entry CTAs asserted across the composed tree, and on `href[=:]` so the CTA-descriptor form counts. |
| `lib/guards/public-nav-canonical.test.ts` | Same; `partners` removed from the expected nav + locale key set so it cannot drift back unused. |
| `lib/guards/service-offers-baseline.test.ts` | Cinematic baseline asserted across the composed sections; `LiveProductDemo` → `HeroLiveDemo`. |
| `lib/guards/landing-freeze.ts` + baseline | Freeze follows the component that is actually rendered. |
| `messages/{11 locales}.json` | `nav.partners` removed. |
| `tests/e2e/landing-repair.spec.ts` | **NEW.** 4 browser scenarios proving the three fixes. |
| `scripts/dev-acceptance.ts` | Forwards `-- -p <port>` so parallel acceptance sessions do not collide. |

---

## 5. ENGINEERING CHECKS

| Command | Before | After |
|---|---|---|
| `pnpm -C apps/web test` | **783 passed / 7 failed** | **790 passed / 0 failed** |
| `pnpm -C apps/web typecheck` | clean | **clean** |
| `pnpm -C apps/web lint` | 0 errors, 22 warnings | **0 errors, 22 warnings** |
| `playwright test tests/e2e/landing-repair.spec.ts` | — | **4 passed** |
| `playwright test tests/e2e/goal3-project-evaluation.spec.ts` | 8 passed | **8 passed** (unaffected) |

The branch is fully green for the first time since the landing rebuild.

### Browser evidence

Route `/lt` on the local acceptance server, no session required.

| Scenario | Result | Console errors |
|---|---|---:|
| hero ask → `aria-busy="true"` + visible pending dot, then back to `false` | pass | 0 |
| unanswerable question → visible, `role="status"` | pass | 0 |
| "Partneriams" absent; "Kaip veikia" → `#how-it-works` in viewport | pass | 0 |
| `/auth/signup` and `/company-need` present on the landing and both resolve < 400 | pass | 0 |

Screenshots: `hero-ask-busy-1440.png`, `hero-unmatched-1440.png`,
`how-it-works-anchor-1440.png`.

---

## 6. WHAT IS STILL WRONG (honest list)

1. **`/dashboard/advanced` is still a 916-line second dashboard.** This is the
   single largest violation of the command still open. It cannot be deleted
   before the result surface absorbs what it does — W3.
2. **71 authenticated dashboard routes.** Unchanged.
3. **Three navigation systems** coexist.
4. **`audience-value-sections.tsx` is dead code and was NOT deleted.**
   Deliberate: unlike `live-product-demo`, it has no successor, so deleting it
   destroys content with nothing replacing it. Flagged for an owner decision.
5. **The premium branch is still unmerged.** It is now green; merging is an
   owner decision.
6. **W2–W11 not started**: design tokens, the workspace shell consolidation,
   §6 charts, W7 search paths, W8 calendar conflicts, W9 onboarding, W10
   mobile/a11y/performance, W11 production E2E.
7. **Nothing was verified in production.** All evidence is local.

---

## 7. PRODUCTION STATUS

```text
merge performed:              NO
deploy performed:             NO
production writes performed:  NO
migration performed:          NO
billing / payments touched:   NO
ponytail-improved installed:  NO  (ADAPT_RULES_ONLY)
old LABMA project touched:    NO
```

---

## 8. RECOMMENDED NEXT STEP

Land the premium work before building anything new — it is green, it is
proven, and every W2+ stage otherwise risks being built twice:

1. Merge `feat/cc/premium-unified-product-v1` (PR #925) → `main`.
2. Merge `feat/cc/goal3-project-evaluation-v1` on top.
3. Then W3: fold `/dashboard/advanced` into the result surface and delete it.

Steps 1–2 are owner-gated merges and were **not** performed.
