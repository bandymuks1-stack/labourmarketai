# LabourMarket.ai UX/UI system: tools, current UI, design architecture, three directions (2026-11-03)

> **Status: PROPOSAL (Phase 1). NOT THE CANONICAL ARCHITECTURE.** This is a SUPPORTING design document under
> `docs/OWNER_TARGET_ARCHITECTURE_V1.md`. It installs nothing and changes no production screen. Implementation
> starts only after the owner chooses a direction. It does NOT create a second design system. It extends the
> existing chain `docs/DESIGN_SYSTEM.md` → frozen contract `docs/design/final/00-FROZEN-DESIGN-CONTRACT.md` →
> `apps/web/tokens/*` → `tailwind-preset.ts` → `app/globals.css`, and the frozen design class `4e695e261`.
> The LabourMarket.ai logo and brand identity (LM mark, black + metallic gold, the "LabourMarket.ai" wordmark)
> stay exactly as they are.

Responsible executor: the UX/UI executor session (owner order 2026-11-03), reporting to the coordinator.

## Santrauka savininkui (LT)

- **Įrankiai:** jokios naujos dizaino sistemos. Lieka esami tokenai, `components/ui`, Tailwind 3.4, framer-motion,
  lucide ir Playwright. Siūlomas (dar neįdiegtas) minimalus papildymas turi tris dalis:
  1. `@axe-core/playwright`, automatiniam WCAG 2.2 AA tikrinimui;
  2. Playwright `toHaveScreenshot`, kiekvieno ekrano vaizdo bazei;
  3. vienas be-stiliaus primityvų rinkinys sudėtingiems valdikliams (dialogas, meniu, combobox, skirtukai). Rekomendacija: **Radix Primitives** (MIT); alternatyva Base UI.

  Atmesta:
  - Material, Carbon, Fluent ir Ant kaip antra dizaino sistema;
  - Apple UI kit'ai: licencija draudžia ne-Apple produktus;
  - Storybook kol kas;
  - neaudituoti „Apple HIG skills“.
- **Dabartinė UI:** viešas puslapis tvarkingas. Pagrindinės problemos:
  - tema keičiasi prisiregistravus (šviesus viešas, tamsus darbo plotas);
  - daug smulkaus didžiosiomis raidėmis rašyto teksto;
  - kortelės kartojasi (`card-border` 169 failuose, `<Card>` – 69);
  - darbo skelbimų sąraše trūksta vietos ir darbdavio;
  - registracijoje telefonu pagrindinis mygtukas yra po pirmuoju ekranu;
  - ~40 darbo ploto skyrių be aiškios vaidmens navigacijos.
- **Kryptys:**
  - **A „Ramus darbo stalas“** (šviesus vienas produktas, obsidiano rėmas): **rekomenduojama**;
  - B „Obsidiano dirbtuvė“ (tamsus produktas, užšaldyta klasė);
  - C „Stiklo laukas“ (HIG/Liquid Glass).
- **Reikia savininko sprendimų:** kryptis, darbo ploto numatytoji tema, PR #2828 ir #2370 vizualinis patvirtinimas.

---

## 1. What was checked, and what was not

| Area | Method | Verdict |
|---|---|---|
| Public site, 16 routes × desktop 1440 + phone 390, LT/EN/RU | Playwright against production, signed out, plus measured metrics (interactive count, targets < 24 px, page height, horizontal overflow) | VERIFIED 2026-11-03 |
| Signed-in workspace (worker, company, agency, institution, marketplace, chat, plans) | Code reading, the 2026-10-14 audit (`docs/design/DESIGN_MOBILE_COMPLETION_AUDIT_2026-10-14.md`) and memory of earlier walks. No sign-in: no real password was used and none was asked for. No synthetic signed-in screenshots exist from the last 14 days. | **NOT VERIFIED VISUALLY (NEPATIKRINTA)**. The findings in §3.2 are code-measured, not seen. |
| PR #2828, #2370 | Offline render harness: the PR's own component files + its own Tailwind preset + globals.css, rendered with React 19 SSR, screenshotted dark/light × 1280/390. Fonts fall back to system fonts (`next/font` does not run in the harness). | VERIFIED as components. Not verified on their real pages. |
| Tool facts | Official sites, GitHub API, npm registry, 2026-11-03 (see §2 and the register) | VERIFIED unless marked n/v |

Evidence: production screenshots and PR captures are in the private record (`matrix/ux-ui-system-2026-11-03/`
in the agent workspace; they are not committed, because the repo is public). Mockups are in this folder under `mockups/`.

## 2. Tool selection (minimal set)

Full source, licence, compatibility and install status: `docs/design/design-intelligence-2026-10.md` §7
(the canonical design-technology register). Summary:

| Need | Choice | Why | Status |
|---|---|---|---|
| Tokens, theme, components | **Existing** `tokens/*` → `tailwind-preset.ts` → `globals.css` (CSS variables, dark + light) + `components/ui` | Already theme-swappable with zero component edits; AA contrast guards exist | in use |
| Hard interactive primitives (dialog, popover, menu, combobox, tabs, tooltip) | **Radix Primitives** (`radix-ui`, MIT, React 19 peer), adopted **per primitive** and styled by our tokens. Not shadcn as a dependency. | The product has hand-rolled `anchored-overlay`, `DarkListbox` and `MobileSheet`; focus trap, `Escape`, roving focus and typeahead are where hand-rolled code fails WCAG 2.2. shadcn/ui is copy-in code that now assumes Tailwind v4 for new components, so use it as *reference code* only. | proposed, not installed |
| Accessibility tests | **`@axe-core/playwright`** (MPL-2.0, dev only) + keyboard-path tests | Automated WCAG 2.2 AA subset on every screen in CI | proposed, not installed |
| Visual regression | **Playwright `toHaveScreenshot`** (already installed, `@playwright/test` 1.62) | No new tool; baselines made in the CI image; matrix 390/1280 × light/dark × reduced motion | in use (feature not yet used) |
| Principles | Apple HIG (hierarchy, clarity, deference, 44 pt targets, Liquid Glass only on the chrome layer), WCAG 2.2, Material 3 *as reading only* | Principles, not dependencies | reference |
| Agent skills | Existing local skills: `design-taste-frontend`, `high-end-visual-design`, `make-interfaces-feel-better`, `baseline-ui`, `fixing-accessibility`, `fixing-motion-performance`, `a11y-audit`, `web-design-guidelines` | Already installed; no unvetted third-party skill | in use |
| Design canvas | Static HTML mockups in-repo (this folder). Figma Starter optional for the owner's own sketching only. | Figma free has 3 files, no Dev Mode and an MCP limited to 20 calls a month, so it is no handoff tool | reference |
| Mobile (Expo) | No UI kit. Share tokens through `packages/client-core` (Style Dictionary only if token drift is proven) | One token source for web and mobile | reference |

**Rejected, with reasons:**
- **Material Web:** in maintenance mode, and its Web Components fight React and Tailwind.
- **Carbon, Fluent 2, Ant Design:** each brings its own styling system, which would be a second design system.
- **Apple Design Resources kits:** the licence restricts mock-ups to Apple-platform software, so they are off-limits for a web or Android product.
- **Storybook (for now):** a critical dev-server advisory was fixed only in 10.6.2, and the visual harness plus Playwright covers the need.
- **GitHub "Apple HIG skills":** unvetted community repos, and some redistribute Apple text.
- **Lost Pixel, BackstopJS:** see the earlier register. Lost Pixel is archived; BackstopJS duplicates Playwright.

## 3. Current UI, concrete problems

### 3.1 Public site (measured, production, 2026-11-03)

| # | Problem | Evidence | Severity |
|---|---|---|---|
| P1 | **The theme jumps at sign-up.** Public routes open light; `/dashboard`, `/onboarding` and `/cv` open dark (`lib/visual/theme-default.ts`, owner decision 2026-10-28, "until the owner decides otherwise"). On the same day the product feels like two products. Comments disagree as well: `globals.css` says dark is the default, while `[locale]/layout.tsx` says light. | theme-default.ts, globals.css L1-60 | HIGH (owner decision) |
| P2 | **Mono, uppercase, letter-spaced micro-labels everywhere** ("PAVYZDYS", "DARBUOTOJAMS", "ANKSTYVOJI PRIEIGA", step names "TU · KOMANDA · PROJEKTAS"): 1 396 `uppercase` uses and 2 096 `text-xs` uses in `components`+`app`, plus arbitrary `text-[0.5625rem]` (9 px) and `text-[0.625rem]` (10 px). Diacritics and Cyrillic in uppercase mono read poorly, and 9–10 px text fails the readability floor. | code count; screenshots for-workers, pricing | HIGH |
| P3 | **Small targets:** 16–35 interactive elements under 24 px on every public page (footer links, inline links, chips). That is WCAG 2.5.8 risk unless spacing exempts them. | metrics.json | MEDIUM |
| P4 | **The jobs list hides the decision data.** Signed out, a card shows the original-language title (for example a Swedish title on the LT site), the ad language, contract chips and a mono date. It shows no place, no employer, no pay and no "why it fits". Cards are tall, with low information per pixel, at 53 095 rows. | `_lt_jobs-desktop-fold.png` | HIGH (core journey) |
| P5 | **Pricing says "not yet" twice** (hero copy and an "early access" banner), and offers three different CTA styles (underlined link, gold pill, gold button). | `_lt_pricing-desktop-fold.png` | MEDIUM |
| P6 | **On the phone, the sign-up action sits below the first screen.** Legal and controller text sits above the auth choices; the "Registruotis" button is at ~835 px of an 844 px screen. The e-mail placeholder `vardas@pastas.lt` looks like a filled value. | `_lt_auth_signup-mobile-fold.png` | MEDIUM. Auth area: change only with a dedicated review. |
| P7 | **Home is 5 257 px (desktop) / 9 253 px (390)**, with two lifecycle step bands and scroll-revealed sections. 18 blocks start at opacity 0 and appear on scroll (they do appear; verified). | metrics, `_lt-desktop-full-after-scroll.png` | LOW–MEDIUM (landing is frozen) |
| P8 | Header: 5 nav items + login + CTA + theme toggle + language = 9 controls, which is fine on desktop. On the phone, theme + language + menu are three equal 44 px buttons next to the logo, so the CTA is hidden behind the menu. | `_lt-mobile-fold.png` | LOW |
| P9 | Container widths differ per page: the jobs list is 848 px wide under a full-width header; pricing and for-* pages use 1344 px. | screenshots | LOW |

What already works well and must be kept:
- the hero composition and photography;
- the one-gold-action rule on most pages;
- honest "PAVYZDYS" labels;
- AA token contrast in both themes;
- no horizontal overflow at 390 px on any page measured;
- 44 px header controls on the phone;
- correct LT "tu" address on the public pages.

### 3.2 Signed-in workspace (code-measured, NOT seen; NEPATIKRINTA)

| # | Problem | Evidence |
|---|---|---|
| W1 | **~40 workspace sections** under `app/[locale]/dashboard/*` (absences … work-in-numbers) and a 61-entry command registry. The visible chrome is the `ConversationHeader` only: the catalogue nav renders in the admin chrome alone. Each role has no small, stable primary nav, so findability depends on chat or search. | `ls dashboard`, `lib/navigation/command-registry.ts`, memory "nav catalogue renders only in admin chrome" |
| W2 | **Card duplication:** `card-border` class in 169 files vs `ui/Card` in 69, plus ad-hoc `rounded bg-surface` panels; 9 local stat tiles and ~15 local status chips (2026-10-14 audit §3). The same concept looks different on different screens. | audit §3 "PAŠALINTI DUBLIAVIMĄ" |
| W3 | **Overlong single pages:** the journal page is 2 329 lines, opportunities 2 229 and CV 1 422, with many equal-weight blocks and no single primary action per view. | audit §3 |
| W4 | Projects list and detail are a stack of folding sections with no single clear action (PR #2828 addresses one part). | audit §3, PR #2828 body |
| W5 | Radius drift: `rounded-md` (14 px) 1 947×, `lg` 112×, `xl` 60×, `2xl` 14×, plus four arbitrary radii. There are three radius roles in tokens, but they are not named in use. | code count |
| W6 | Hand-rolled overlays (`anchored-overlay`, `DarkListbox`, `MobileSheet`). Each needs its own focus-trap, `Escape` and screen-reader proof (WCAG 2.4.11, 2.1.2). | `components/ui` |
| W7 | Mobile app (Expo) and web share data through `client-core`, but not the tokens. Visual parity is by hand. | `apps/mobile/package.json` |

## 4. Design architecture

### 4.1 One shell, a role nav of five, and one primary action per view

The same shell for every role:
- **desktop:** left rail;
- **phone:** bottom tab bar with a centre action.

Only the nav items change with the role. Chat stays home (decision 0017): the ask/search field sits at the top of every page, and it is not a nav item that hides the others.

| Role (workspace) | Five primary nav items | The one primary action |
|---|---|---|
| Worker (personal) | Šiandien · Darbo žurnalas · Living CV · Darbai ir pasiūlymai · Pokalbiai | **+ Įrašyti darbą** |
| Company / HR | Šiandien · Žmonių paieška · Projektai · Valandos ir ataskaitos · Pokalbiai | contextual: **Paskirti komandą** (project), **Siųsti pasiūlymą** (shortlist) |
| Agency / subcontractor | Šiandien · Rezervas · Klientai ir pasiūlymai · Projektai · Pokalbiai | **Pasiūlyti kandidatą** |
| Institution | Šiandien · Programos ir grupės · Besimokantieji · Praktika ir darbas · Pokalbiai | **Pakviesti besimokantįjį** |
| Marketplace (inside any role) | Reached from "Daugiau" plus search, not a sixth tab | **Paskelbti** |

All ~40 sections stay reachable, because every function stays: they live under **Daugiau** (grouped) and in the
command palette. The rail shows the workspace switcher at the bottom (personal ↔ organization), because one
person holds several roles (decision 0025).

### 4.2 Design-system spec (extends existing tokens; adds roles, not a second system)

| Layer | Spec | Source / change |
|---|---|---|
| Colour roles | ground, surface, surface-raised, line, text-primary/secondary/muted, **brand (gold) = selection + the one primary action, never confirmation**, state: confirmed (green), evidence (cyan/blue), waiting (amber), danger. Every state carries a word plus a shape (dot = recorded, ring = unconfirmed). | existing `colors.ts` + DESIGN_SYSTEM §5. No new hue. |
| Type | Inter for UI; Bricolage display for page titles only; JetBrains Mono **for numbers and IDs only, never labels**. Scale (existing roles): meta 12 · basis 13 · support 14 · body 16 · card-title 17 · title 22 · title-lg 28 · display 36–44. Floor is 12 px; no uppercase labels; sentence case everywhere. | `typography.ts` roles exist; new rule plus a guard ratchet on `uppercase`/`text-[<0.75rem]` |
| Spacing | 4-px base: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64. Page gutter 16 (phone) / 32 (desktop); card padding 16 / 20. | Tailwind defaults (no new tokens) |
| Sizes | Controls 40 px (desktop) / 44 px (touch); targets ≥ 24 px with spacing, ≥ 44 px on primary touch actions; content max 1200 px, shell 1440 px. | existing `maxWidth` tokens |
| Radius | Three named roles only: control 10–14, card 14–18, sheet 24–28. No arbitrary radii. | `radii.ts` semantic roles |
| Elevation | flat (in-page) · raised (card) · overlay (menu, sheet, dialog). The shadow tokens are reused. No tilt and no 3-D lean on standard cards (see PR #2828). | `shadows.ts` |
| Components (ONE library, `components/ui`) | Button (primary/secondary/quiet/danger) · Card · StatusChip (5 states) · Stat · EmptyState · Table (sortable, sticky header, row actions, mobile → stacked list) · FilterBar (chips + "Daugiau filtrų" sheet) · SearchField (with ask) · Input/Select/Combobox/Textarea with inline error · Dialog · Sheet · Menu · Tabs/Segmented · Toast · InlineConfirm · Skeleton · Identity family (PersonAvatar/TeamStack/CompanyMark/ProjectMark, PR #2370) · ActionTile (PR #2828, renamed) | consolidate the duplicates in audit §3; Radix underneath Dialog/Sheet/Menu/Combobox/Tabs/Tooltip |
| States | Every data view has: loading (skeleton), empty (what it is + the one action), unknown ("NOT MEASURED", never 0), error (what happened + retry + help), partial, offline (phone), confirmation pending/confirmed/declined | `EmptyState`, `*Result` readers; product-truth SEP-7 |
| Themes | Light and dark are both first-class, from the same tokens. **The default is ONE rule for the whole product** (see §5; owner decision). `prefers-color-scheme` is honoured when no choice is saved. | `theme-default.ts` |
| Motion | 90/160/240/420 ms tokens; the motion explains continuity; `prefers-reduced-motion` honoured; compositor-only properties | `motion.ts` |
| Mobile | Bottom tab bar (4 + centre action), sheets instead of popovers, one primary action per screen, sticky action bar above the keyboard, safe areas | Expo + PWA share the nav model |
| Tests | Per screen: Playwright `toHaveScreenshot` at 390 & 1280 × light & dark (+ reduced motion), axe WCAG 2.2 AA zero serious/critical, a keyboard path for every pointer action, an 11-locale overflow check (the longest strings: de, fi, ru) | proposed |

## 5. Three directions

Mockups:
- `mockups/direction-a.html`, `direction-b.html`, `direction-c.html`;
- PNGs `mockups/{a,b,c}-{home,today,talent-search,project-board,mobile-today,mobile-project}.png`.

Regenerate with `node mockups/build-mockups.mjs`. All mockups use fictional people and are labelled "Koncepcija".
They share the same information architecture (§4.1) and the same components. Only the surface treatment and the theme stance differ.

| | **A · Ramus darbo stalas** | **B · Obsidiano dirbtuvė** | **C · Stiklo laukas** |
|---|---|---|---|
| Idea | One light product. A warm-paper ground, white cards, hairlines and an obsidian nav rail carry the brand. Gold appears only on the one primary action and the ".ai". Dark is a first-class opt-in. | The owner-frozen dark class, extended: obsidian ground, ivory text and champagne edges in the workspace. The public site stays light (as today). | The HIG / Liquid Glass principle: content-first, with a translucent chrome layer (header, rail, tab bar) floating over it, larger radii and a native-phone feel. |
| Readability (daylight, sites, long tables) | **Best**. Workers on sites and HR on spreadsheets-like tables | Good indoors; weaker in sunlight; tables need care | Good on content; glass chrome lowers contrast and needs an opaque fallback |
| Continuity first visit → work | **Seamless** (public is already light) | Theme jump at sign-up (P1 stays) | Seamless (light) |
| Brand strength | Medium-high (obsidian rail plus gold) | **Highest** (black + gold everywhere) | Medium (gold diluted by translucency) |
| Fit with frozen class 4e695e261 | Grammar kept (four regions, identity family, evidence states); surface goes light | **Identical** | Grammar kept; surface changes most |
| Performance | **Best** (no blur, flat) | Best | `backdrop-filter` costs on low-end Android; it must be limited to chrome |
| Accessibility (WCAG 2.2 AA) | Easiest to hold | Holdable (tokens already AA) | Hardest: contrast over moving content; `prefers-reduced-transparency` support is limited |
| Mobile app parity (Expo) | Easy | Easy | Hard (blur in RN costs, iOS ≠ Android) |
| Build effort | Medium: token swap of the workspace default and component consolidation | **Lowest** | Highest |
| Commercial B2B credibility | **High** (calm, document-like, trustworthy) | High (premium) | Medium (consumer-app feel) |

### Recommendation: **A · Ramus darbo stalas**, with B kept intact as the dark theme

Why:
- It closes P1 without changing the brand: the logo, the black and gold, and the obsidian chrome all stay.
- It is the most readable for the actual users: field workers on phones outdoors, and HR and managers in dense tables.
- It continues the owner's own 2026-10-28 move to a light public site.

Direction B is not thrown away. Because the tokens are theme-swappable, B *is* the dark theme of A, with the same components and zero component edits. C's single good idea is kept: on the phone, the sticky tab bar and the action sheets may use a light translucent chrome, with an opaque default and a fallback under `prefers-reduced-transparency` / `forced-colors`. Content never goes glass.

This needs one owner decision: **change the workspace default from dark to light (the saved choice still wins)**. If the owner prefers B, the same staged plan applies, without stage S1.

## 6. Open PRs that wait for owner visual approval

Captures: private record `matrix/ux-ui-system-2026-11-03/pr-visuals/pr2828-*.png`, `pr2370-*.png`.

| PR | Visual result | Fits the recommended system? | What it needs before merge |
|---|---|---|---|
| [#2828](https://github.com/bandymuks1-stack/labourmarketai/pull/2828) premium action cards (Work page) | Three feature cards (382–397×96, primary = gold-filled icon, active = gold edge + check) and three compact tools (62 px). Gold fills on the page drop from 18 to 2. Readable in both themes. | **YES, with changes.** One primary per view and ≥ 56 px targets match §4. | (1) Drop the 3° lean and hover lift: elevation via shadow tokens only (W2 / §4.2), so cards do not get a second depth language. (2) Treat it as the library's `ActionTile`, not a `*-card` (also resolves the A-09 gate question without a rename trick: an owner `distinctSurface` ruling is still needed). (3) **i18n gap:** it adds `deck.*` keys to 6 locales only (de, en, lt, nl, pl, ru); da, et, lv, no and sv are missing. (4) Draft, untouched since 2026-10-26. |
| [#2370](https://github.com/bandymuks1-stack/labourmarketai/pull/2370) D2 identity family | Calm low-chroma plates with initials at every size; a faint figure appears from 64 px; the veiled person is a hatched figure; company and project marks are monogram plates. No gold or green on marks. | **YES.** It is the identity layer of §4.2, used in all three mockups. | (1) **Merge conflict** with main (DIRTY, untouched since 2026-10-14): needs a re-port. (2) At 64–96 px the figure behind the initials makes the plate busy; recommend initials only, with the figure kept for the anonymous state. (3) In the TeamStack the overlap hides most of each initial; increase the offset or add a 2 px ground ring. |

Neither PR was merged or changed by this session.

## 7. Staged implementation plan (after the owner picks a direction)

Each stage is its own GREEN PR, with visual proof before/after at 390/1280 × light/dark. No stage removes a function.

| Stage | Scope | Gate |
|---|---|---|
| S0 (allowed now) | Test foundation: `toHaveScreenshot` baselines for 10 key screens; the axe check is added after the owner approves the dev dependency | owner OK for `@axe-core/playwright` |
| S1 | **Theme rule:** one default for the whole product (A: light). Remove the route split; fix the comment conflict. | owner decision (theme) |
| S2 | Typography and labels: sentence case and a 12 px floor; mono for numbers only; ratchet guard on `uppercase` / sub-12 px. Public pages are touched under the landing-freeze rule (baseline refreshed in the same PR, with the reason). | product gate (owner-waived pages) |
| S3 | One library: StatusChip, Stat, EmptyState, Card and ActionTile consolidation (audit §3 table); land #2370 (re-port) and #2828 (with the §6 changes) | owner visual approval of #2370 and #2828 |
| S4 | Role shell: left rail + phone tab bar, five items per role, a "Daugiau" group, and the workspace switcher; the command registry unchanged | owner visual approval of the shell on real pages |
| S5 | Radix under Dialog/Sheet/Menu/Combobox/Tabs (one primitive per PR), a keyboard proof each | owner OK for the dependency |
| S6 | Screens in value order: worker Today + journal → talent search + shortlist → project board + hours → jobs list (P4) → Living CV → agency / institution / marketplace → pricing (P5) → sign-up (P6, auth review) | per-screen visual approval |
| S7 | Mobile app: tokens shared from `client-core`; tab bar parity | after S4 |

## 8. Owner decisions needed

1. Choose the direction: **A (recommended)**, B or C.
2. Choose the workspace default theme under A: light, with dark as an equal choice and the saved choice winning.
3. Give visual approval for PR #2828 (with the §6 changes) and PR #2370 (re-port, initials-only plates).
4. Allow the two dev/runtime additions when their stage comes: `@axe-core/playwright` (dev) and `radix-ui` (runtime, per primitive).
