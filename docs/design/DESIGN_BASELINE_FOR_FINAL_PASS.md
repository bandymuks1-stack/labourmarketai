# DESIGN_BASELINE_FOR_FINAL_PASS

Status: **BASELINE FREEZE, NOT A FINAL VISUAL LOCK.** Docs-only. Written 2026-10-03 against `origin/main` `5933d507e`.
Owner decision recorded here: the latest IMPLEMENTED design is frozen as the baseline for a later final design pass. **The final redesign is deferred.** Nothing in this file approves a visual direction, closes a design PR, or changes code. Where a fact was not verified in this pass it is marked **U**.

Authority order is unchanged: `docs/OWNER_TARGET_ARCHITECTURE_V1.md` > `docs/PLATFORM_DOCTRINE.md` > `docs/design/final/00-FROZEN-DESIGN-CONTRACT.md` > `00-GALUTINE-DIZAINO-SISTEMA.md` > `docs/DESIGN_SOUL.md`, `docs/DESIGN_TOKENS.md`, root `DESIGN.md`. This baseline sits below all of them and cannot override them. Decision 0017 (chat-first, one home) supersedes frozen-contract 2.1 and 2.3, as the contract itself records.

## 1. What the baseline is (main vs unmerged)

| Layer | Where | State |
|---|---|---|
| **A. On main today** | `origin/main` `5933d507e` (post #2131) | The only shipped layer. Chat-first home, panel chrome, token system, pre-#2110 identity/work-world components. |
| **B. #2110** `feat/cc/premium-public-slice`, head `2c6853ae6` | Open, not draft, base main, 112 files, +4,819/-830, merge BLOCKED (`quality` failing) | Newest reviewable design slice: public `/`, `/for-workers`, `/for-companies`; identity card/portrait; historical workspace; today/journal/planning day and week objects; 17 visual snapshot files. Carries `docs/public/PUBLIC_SLICE_TRUTH_TABLE_2026-10-02.md` (not on main). |
| **C. #2125** `integration/premium-programme`, head `533b95638` | DRAFT, 377 files, +15,742, BLOCKED (`quality`, `e2e-smoke` failing); 23 commits ahead of main | Superset of #2110 plus Discover IA (`lib/discover/*`, `/dashboard/market`), Work in Time (`lib/planning/time-lens.ts`), cinematic landing, and `design-proof/` image evidence (roughly 260 of the 377 files). GitHub's diff UI refuses it; review by commit or by path. |

**Baseline definition.** The frozen baseline is **layer A as shipped, with layer B (#2110) as the newest implemented-but-unmerged design and layer C (#2125) as its unmerged superset.** The commit to cite for "what is live" is `5933d507e`. The commits to cite for "latest implemented design" are `2c6853ae6` (#2110) and `533b95638` (#2125). Neither B nor C is on main; do not describe them as shipped. Whether and in what order either lands is an owner decision, not made here.

## 2. Component architecture (as implemented)

Read from the tree on main, and from PR diffs for B and C.

- Shell: `apps/web/app/[locale]/dashboard/layout.tsx` resolves user, profile and roles once server-side and feeds `AuthProvider`. The client `components/app/dashboard-chrome.tsx` picks the chrome per route via `dashboardChromeMode()` in `lib/config/navigation.ts`.
- Three chrome modes: `conversation` (`/dashboard` only, bare, the chat supplies the one top bar), `panel` (every other product route: the one top bar `ConversationHeader` over a contextual workspace), `full` (`/dashboard/admin/*` only; legacy module chrome with `dashboard-tabs.tsx` and `bottom-nav.tsx`).
- One top bar: back-to-home, logo, active workspace chip, search (`header-search.tsx`, `/api/dashboard-search`), language, notifications, one avatar menu (`account-menu.tsx`).
- Surfaces are token-driven (`bg-ink-*`, `text-text-*`, `bg-state-*`). Component families: `components/ui`, `components/app/*` (domain), `components/visual/*` (object language), `components/marketing/*` (public), `components/world/*`, `components/decor/*`.
- Identity: main has `components/app/player-card/*`, `worker-player-card.tsx`, `historical-player-card.tsx`. #2110/#2125 add `components/app/identity/{person-identity-card,person-portrait,own-avatar,own-avatar-stream}` and modify `player-card/identity-stage.tsx` and `player-card-modes.tsx`. Two families coexist.
- Work in time (B/C): `components/app/planning/{work-day,work-week,derived-period-evidence}`, `components/app/journal/{journal-calendar,journal-day-object}`; `components/app/historical/*` exists on main and is modified in B/C.
- Public (B/C): `components/marketing/public/{public-hero,explore-fold,explore-steps,home-sides,product-moments,professional-portrait,state-mark,work-record-transition*,world-heroes}`.
- Guards: `apps/web/lib/guards/*` (design-tokens, design-token-classes, ux-2-0-foundation, no-game-language-for-professionals, product-copy-forbidden-terms). #2110 touches 13 guard files, #2125 touches 23.

## 3. Navigation and information architecture

On main (verified in `lib/config/navigation.ts` and `dashboard-chrome.tsx`):
- `/dashboard` is the conversation, the one authenticated home for every identity (decision 0017). The worker's ŠIANDIEN is its opening context, not a separate home.
- No bottom tab bar and no tab row for product users. The 3-tab bar ŠIANDIEN, PASAULIS, PAKLAUSK is retired.
- Every other `/dashboard/*` route is a contextual workspace reached from the conversation, search or deep link: opportunities, journal, profile, projects, planning, market-map, bookings, network, talent, learning, documents, hours, tasks and others.
- `/dashboard/admin/*` keeps the legacy full chrome (internal operator console).
- Command finder: `lib/navigation/command-registry.ts` (deterministic; every route must exist; guard-enforced).

In #2125 (unmerged): adds a `discover` feature at `/dashboard/market` ("Atrask / Discover", role-aware destination over `lib/discover/discover-registry.ts`, owns no data), demotes the map to a lens of Discover (`market_map` `safeToShowInPrimaryNav: false`), adds a `compass` nav icon, and documents the order chat, discover, journal, calendar, messages. Navigation chrome is a standing **NAV owner gate** (from memory notes; current wording **U**). Treat the Discover change as proposed, not accepted.

## 4. Visual tokens (read from `apps/web/tokens/*` and `apps/web/app/globals.css`)

Architecture (`docs/DESIGN_TOKENS.md`): colours are RGB channel triplets in CSS variables (`--c-*`), consumed as `rgb(var(--c-*) / <alpha-value>)`. Dark is `:root`; light is `:root[data-theme="light"]`. A theme swap is a variable swap with zero component edits. Binding rule: no raw hex, px, ms or cubic-bezier in components.

Dark (default):
- Ground and surfaces: `ink-900` 7 7 6 (obsidian), `ink-800` 21 21 19 (graphite cards), `ink-700` 29 29 26, `ink-600` 42 42 38 (decorative hairlines), `ink-500` 118 112 101 (control boundaries).
- Brand: `brand-blue` 212 175 55 (metallic gold #D4AF37; the name is legacy, the value is gold), `brand-champagne` 242 214 117, `brand-cyan` 0 194 255 (evidence-supported), `brand-violet`, `brand-purple`, `brand-orange`.
- State: live 0 230 118, success 52 211 153, warning 255 184 69, amber 255 165 82, danger 255 92 92.
- Text: primary 245 241 232 (warm ivory), secondary 207 201 188, muted 163 156 141; `text-on-brand` 10 10 10 (white on gold is 2.10:1), `text-on-danger` 10 10 10.
- Tier: diamond, gold 255 217 102, silver, bronze. `trust-accent` 52 211 153 (green).

Light: page `ink-900` 244 246 251, card `ink-800` 255 255 255; six channels darkened to AA (owner ratified 2026-09-22).

Binding semantics: verification and employer confirmation are **green** (`trust-accent`); gold means brand, action, pending or informational, never verification (frozen contract 1.11). Tier is not trust.

Type (`tokens/typography.ts`, locked 2026-06-12): display Bricolage Grotesque; body and UI Inter (Cyrillic fallback); mono JetBrains Mono; accent Instrument Serif (hero headlines and pull quotes only, about 28px minimum, never body or UI).

Radii: xs 6, sm 10, md 14, lg 18 (cards), xl 24, 2xl 28, 3xl 36, strictly monotonic (guarded). Motion: `--motion-instant|fast|base|slow`, `.verified-pop`, `.rise-in`, `.live-dot`, all disabled under `prefers-reduced-motion`. Also `tokens/{shadows,gradients,zindex}.ts`.

Not verified this pass (**U**): rendered contrast of #2110/#2125 surfaces; whether their new surfaces add raw values (their guards claim not).

## 5. Known UX defects (recorded, not fixed)

1. Merge-blocked design stack: #2110 fails `quality`; #2125 fails `quality` and `e2e-smoke`. Neither can ship as-is. Failure detail not read in this pass (**U**).
2. #2125 cannot be reviewed in the GitHub diff UI (377 files); about two thirds are screenshots under `design-proof/`.
3. Truth gaps recorded in the #2110 truth table: no question/reply thread on returned journal entries (copy was reworded; PARTIAL); self-confirmation is not blocked by the DB (open decision EVID-2); a manager cannot record a journal entry on a worker's behalf (hours only); the public "you decide who sees your history" claim was too broad and was reworded; whole-team assignment, capacity and forecast grids, attendance and planned-dates-per-person are UNSUPPORTED and were removed from public pages. Calendar People-in-time and Work-in-time are design-only on public surfaces.
4. Navigation: Discover replacing the map tab (#2125) is behind the NAV gate. On main the map and marketplace entry points are split across `/dashboard/market-map`, opportunities, listings and services; reachability from the home chat is **U**.
5. Mobile IA docs (`docs/design/final/01-WORKER-MOBILE-IA-2026-09-13.md`, `02-MOBILE-COMPACTION-RECEIPT-2026-09-13.md`) predate decision 0017 and need a re-read before the final pass (**U**).
6. Agency calendar and planning actor parity was not proven (memory: AGENCY NEPATIKRINTA). Do not claim parity.
7. #2110 public copy: de, pl, ru are AGENT_TRANSLATED, not native-reviewed (`apps/web/messages/public-slice.provenance.json` in #2110). `messages/da.json:1656` holds an untranslated `"[EN] Worker professional profile"` placeholder (from the consolidation matrix; re-check **U**).

## 6. Known visual defects (recorded, not fixed)

1. Light theme: semantic surfaces, text and state swap, but decorative `rgba()` accents in some `globals.css` keyframes and gradients (card-border sheen, glows) are dark-tuned (`DESIGN_TOKENS.md` follow-ups).
2. Primitive elevation (buttons, inputs, forms, cards, tabs, modals, toasts) was never brought fully to the arena language (`DESIGN_TOKENS.md` follow-ups).
3. Two identity component families (`player-card/*` and `identity/*`) coexist until the owner picks one, so a person looks different on different surfaces.
4. Photoreal hero portraits are blocked on `GEMINI_API_KEY` (memory, #1995 pipeline); current hero imagery is interim.
5. Internal identifier `MarketDataOrigin = "live" | "demo" | ...` at `components/app/market-map/market-map-model.ts:87,101` contradicts the doctrine 18 "preview" vocabulary (identifier, not copy). Legacy `playerCard` keys and `player-card` directory names remain (allowed by the guard; not user copy).
6. Visual snapshots exist only for the #2110/#2125 public slice (`public-slice-visual`, `public-premium-visual`). Main has no equivalent screenshot baseline for the product shell (**U**).

## 7. Older visual worlds to retire

Rule: nothing is closed or deleted until its canonical home exists and the owner approves. **This document recommends closing no design PR.** "Home exists? No" means keep the PR open.

| World | Useful capability or content to absorb | Canonical home | Home exists? |
|---|---|---|---|
| #1166 Living Opportunity World R5 (3D plus Goteborg journey; R&D under `docs/design/living-world-r5/`, no production change) | Terrain-from-real-counts idea; photography-dolly journey; vendored Natural Earth geometry tool | World node, `lib/market-map/*`, WORLD write domain (frozen contract P8, TARGET) | **No.** P8 is TARGET and requires the 1M-point validation. Keep open as archive. |
| #1211 Art-direction spec and pipeline audit (DRAFT, PARKED) | `docs/design/living-world-v2/ART_DIRECTION_AND_PIPELINE.md` capability audit and art-direction spec (the live deliverable) | `docs/design/` plus the final design pass brief | **No.** The spec is not on main. Keep parked until the owner decides the pipeline. |
| #1225 FOCUS = previous production landing (DRAFT, owner visual gate) | Recovered previous landing (`7179882`, 2026-08-20) as rollback reference and A/B baseline | Landing in `app/[locale]/(marketing)`, after the owner chooses between previous, #2110 and #2125 cinematic | **No.** Choice not made. Landing stays frozen until then. |
| #1994 player-card world (three + react-three-fiber; DIRTY) | Satellites sized by real counts; evidence-plinth lines; adjacent directions from evidenced skills; lazy WebGL with a no-WebGL fallback | Identity/CV/provenance surface (`components/app/identity/*`, `player-card/identity-stage.tsx`), IDENTITY write domain | **Partial.** The identity card exists only in unmerged #2110/#2125; the spatial mode exists nowhere else. Keep open. |
| `docs/design/living-world-rd/` (a-workday-ledger, b-terra-viva, c-evidence-atelier) | Rejected-visual record; ledger and atelier ideas for evidence display | Archive under `docs/design/` | Already docs. No action until owner review. |
| Landing freeze docs (`landing-freeze-baseline-update-2026-08-09`, `-18`) | Freeze rationale | Superseded only after the owner picks the landing | **No.** |
| `components/app/player-card/*`, `worker-player-card.tsx`, `historical-player-card.tsx` | Readiness and gap display; six-mode tablist | `components/app/identity/*` identity card | **No** on main (identity components are in unmerged #2110). |
| `design-lab/` V3 and `design-sprint/` boards (untracked in the owner's main checkout, not in the pnpm workspace) | Concept boards; Vismantas and Rexora concepts recorded as REJECTED; LabourMarket and Agentai awaiting review | Owner review; commit under an explicit concepts folder only after review | Not in git. Status taken from the consolidation matrix, not re-read here (**U**). |

## 8. What waits for the owner's next design direction pass

The final redesign is deferred. Undecided:

1. Landing choice among previous (#1225), #2110 public, #2125 cinematic, and design-sprint landing A/B/C.
2. Whether #2110, #2125 or neither becomes the shipped design, and in what order or split (a 377-file draft cannot be reviewed as one unit).
3. Navigation chrome and Discover versus the map tab (NAV gate).
4. A single identity family (identity card or player-card), and whether the 3D spatial mode from #1994 is wanted at all.
5. World and Field visual scene, and the P8 scale validation.
6. Concept boards: Vismantas and Rexora replacements, LabourMarket world map, Agentai.
7. Tooling: `@xyflow/react`, `toHaveScreenshot` and `@axe-core/playwright` adoption (`docs/design/design-intelligence-2026-10.md`).
8. Photoreal hero pipeline (needs `GEMINI_API_KEY`).
9. Light-theme decorative accents and primitive elevation language.
10. Disposition of #1166, #1211 and #1225, only after the homes in section 7 exist.

Until these are decided, ship only against the frozen contract, tokens and guards, and do not describe this baseline as a visual lock.
