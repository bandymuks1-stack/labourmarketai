# Design intelligence, Phase 0 research (2026-10-02)

Scope: review of current, maintained design/QA/graph/motion sources for the premium work platform (workers, companies, teams, projects, calendar, journal, evidence, Living CV). Research only. Nothing was installed and no other file was changed.

Evidence rules: versions, licenses, peer deps and unpacked sizes come from the npm registry `latest` manifest fetched on 2026-10-02. Statuses come from the GitHub or vendor page named in the Source column. "n/v" means not verified. Release DATES were not available from these fetches and are not stated. Unpacked size is NOT bundle size; only Motion publishes real gzip figures (docs page). Real bundle cost must be measured with the repo's own analyzer before any adoption.

## 0. What the repo already has (apps/web/package.json, code scan)

| Item | Present | Note |
|---|---|---|
| framer-motion | `^12.43.0`, imported in 13 component files | `layoutId` already used (historical-workspace mode underline). npm `latest` is now 13.5.0, so the repo is one major behind. |
| react / next / tailwind | 19.2.3 / 15.5.24 / 3.4.19 | Next docs page seen is for Next 16.3.8; the repo is on Next 15, so ViewTransition details must be re-checked against 15 docs (n/v). |
| @playwright/test | `^1.62.1` plus `apps/web/playwright.config.ts` | Visual and a11y capability exists without any new tool. No `toHaveScreenshot` usage found. |
| axe-core / @axe-core/playwright | not present | |
| Graph libs (xyflow, d3, elk, dagre, cytoscape, sigma) | none | Hand-built SVG already exists: `labour-market-world-map.tsx`, `journey-timeline.tsx`, `readiness-ring.tsx`, `company-score-ring.tsx`, `historical/historical-marks.tsx`. |
| Calendar lib | none | `/dashboard/planning` is a custom canonical calendar (per project memory). |
| Design contract | `docs/design/final/00-FROZEN-DESIGN-CONTRACT.md`, `ANTI-SLOP-REVIEW-CHECKLIST.md` | Any adopted principle must fit these. |

## 1. Agent skills and guidance (principles, not dependencies)

| Candidate | Verified facts | Verdict | Reasoning |
|---|---|---|---|
| Anthropic `frontend-design` skill (anthropics/skills, `skills/frontend-design`; also in the claude-code-plugins marketplace) | First-party; repo page lists SKILL.md and LICENSE.txt. Push toward distinctive type pairs, committed palette, motion and composition, away from template defaults. The SKILL.md body and license text could not be read through the fetch; the summary comes from secondary sources. | ADAPT PRINCIPLE | Already installed as a local skill in this environment. Useful as an anti-generic check. Its "bold/maximalist" latitude can conflict with the frozen contract, so the contract wins. |
| Local skills already available: design-taste-frontend, high-end-visual-design, make-interfaces-feel-better, baseline-ui, fixing-motion-performance, fixing-accessibility, a11y-audit | Listed in the session. | ADAPT PRINCIPLE | Covers polish, motion-performance and a11y reviews with no new dependency. |
| Diagram Design skill (cathrynlavery/diagram-design) | Per third-party listings (not read at source): 41 diagram types, outputs HTML/SVG/PNG, onboarding maps site palette and fonts to tokens with a WCAG AA text-contrast check, repo updated Aug 2026. License n/v. | REFERENCE ONLY | Good reference for token-driven editorial SVG and node-count caps (24/12/7 per detail level). It generates static diagrams, not an interactive runtime graph. |
| Third-party WCAG skills (aiskillstore accessibility-wcag, pramoddutta qaskills, merceralex397 accessibility-audit) | Discovered via search listings only; contents, licenses and provenance not verified. | REJECT (as dependency) / REFERENCE ONLY | Unvetted community skills should not be installed into a repo with RLS and secrets. Use the already-present `a11y-audit` and `fixing-accessibility` skills. |
| WCAG 2.2 | W3C Recommendation, 2024-12-12. New SCs that bite this product: 2.4.11 Focus Not Obscured (AA), 2.5.7 Dragging Movements (AA), 2.5.8 Target Size Minimum (AA), 3.3.7 Redundant Entry (A), 3.3.8 Accessible Authentication (AA), 3.2.6 Consistent Help (A). | ADOPT (as acceptance criteria) | Graph and calendar drag must have non-drag alternatives (2.5.7); sticky headers and sheets must not hide focus (2.4.11); node and chip targets at least 24 CSS px (2.5.8). |

## 2. Visual QA and screenshot diffing

| Candidate | Maintenance | License | Cost and fit | Verdict |
|---|---|---|---|---|
| Playwright `toHaveScreenshot` | Already a devDependency (`^1.62.1`) | Apache-2.0 (n/v this session; Playwright is widely Apache-2.0) | Zero new deps. Docs warn rendering varies by OS, browser, headless mode and hardware, and baselines are keyed per platform, so baselines must be generated in the same CI image. Options: `maxDiffPixels`, `maxDiffPixelRatio`, `animations`, `mask`, `stylePath`, `--update-snapshots`. | ADOPT |
| `@axe-core/playwright` 4.13.0 (axe-core ~4.13.0) | Current | MPL-2.0 | devDependency only, peer `playwright-core >=1`. Catches a subset of WCAG; not a replacement for keyboard and screen-reader walks. MPL-2.0 is file-level copyleft; fine for unmodified dev use. | ADOPT (dev only) |
| Lost Pixel | Repo archived by the owner on 2026-04-22 (team joined Figma) | MIT | Dead. | REJECT |
| reg-suit | Not archived; 1,519 commits, open PRs and issues (last-commit date n/v) | MIT | Needs S3 or GCS for snapshot storage and the cloud wiring; extra moving parts when Playwright already diffs. | REFERENCE ONLY |
| BackstopJS 6.3.25 | Current on npm | MIT | 15 direct deps incl. Puppeteer and Playwright; a second browser harness duplicates Playwright. | REJECT (duplication) |
| Hosted (Chromatic, Percy, Argos) | n/v | Commercial or mixed | Per-snapshot SaaS and external image upload. Not verified; not needed at this stage. | REFERENCE ONLY |

## 3. Live Work Graph rendering

React Flow facts (verified): `@xyflow/react` 12.12.0, MIT, deps `zustand ^4.4.0`, `classcat`, `@xyflow/system 0.0.83`; peers react and react-dom `>=17`; unpacked 1.2 MB. Repo 38.6k stars, monorepo active. Accessibility (docs): nodes and edges are Tab-focusable (`tabIndex=0`, `role=button`), Enter/Space select, Escape deselects, arrow keys move nodes (Shift faster), `aria-describedby` instructions, `ariaLabel` per node and edge (nodes have no default label, so set it), props `nodesFocusable`, `edgesFocusable`, `disableKeyboardA11y`, plus `ariaLabelConfig`. Attribution: the library is MIT, so the badge is not legally required, but the maintainers ask users to keep it unless subscribed to React Flow Pro (Starter 169 USD/month, Professional 289 USD/month per their page); the repo README also asks commercial users to sponsor. Treat the badge and sponsorship ask as a policy decision for the owner, not a legal blocker.

| Candidate | Version / license (verified) | Fit for a work graph | Bundle and a11y | Verdict |
|---|---|---|---|---|
| @xyflow/react | 12.12.0, MIT | Interactive node-and-edge editor, pan/zoom, custom React nodes, controls, minimap. Strong for "workers, teams, projects, evidence" nodes as real React cards. Brings a drag-to-edit model the product may not want in a read-mostly graph. | 1.2 MB unpacked, gzip n/v; best a11y of the options (keyboard and ARIA built in). | ADOPT only if the graph needs real interactivity beyond a fixed layout; otherwise ADAPT PRINCIPLE (see recommendation). Must be loaded lazily on graph routes only. |
| d3-force | 3.0.0, ISC, deps d3-timer/dispatch/quadtree, 87 KB unpacked | Physics layout only, no rendering. Renders nicely into native SVG/React. Nondeterministic unless seeded and frozen. | Small. A11y is whatever we build. | ADAPT PRINCIPLE / optional layout engine |
| elkjs | 0.12.0, EPL-2.0 OR GPL-3.0-or-later, 7.7 MB unpacked | Best layered and hierarchical layout (compound nodes, ports). | Very heavy; copyleft-style dual license needs legal review even though EPL is file-level. | REJECT for now (size and license review) |
| @dagrejs/dagre | 3.1.1, MIT, dep graphlib | Simple tree and DAG layouts; the standard companion in React Flow examples. | 1.4 MB unpacked. | ADOPT only together with React Flow, for org-tree style layouts; else REFERENCE ONLY |
| cytoscape | 3.34.3, MIT | Analysis-grade graph engine (canvas). Overkill; imperative API; weak React and a11y story (canvas). | 5.7 MB unpacked. | REJECT |
| vis-network | 10.1.2, Apache-2.0 OR MIT | Quick physics network, canvas, dated look, hard to match a premium design system. | 84 MB unpacked (monorepo artifacts), several peer deps. | REJECT |
| sigma | 3.0.3, MIT, needs graphology | WebGL for thousands of nodes. The Work Graph per user or per org is small. | 0.97 MB unpacked; WebGL has poor accessibility. | REJECT (wrong scale) |
| Native SVG + framer-motion (already in repo) | n/a | Matches existing hand-built SVG components (`labour-market-world-map`, `journey-timeline`, rings). Full control of look, tokens and a11y semantics (real `<a>`/`<button>` hit targets, `<title>`/`<desc>`). | Zero new bytes. | ADOPT as the default for a fixed or lightly interactive graph |

Accessibility rule for any graph: provide a parallel structured list or table view of nodes and edges, since a spatial canvas is not enough for screen-reader users; provide a non-drag way to reposition or connect (WCAG 2.5.7); keep focus rings visible and not obscured (2.4.11).

## 4. Motion

| Candidate | Verified facts | Verdict | Reasoning |
|---|---|---|---|
| framer-motion (repo `^12.43.0`; npm latest 13.5.0, MIT) | Already in use in 13 files, including `layoutId`. Docs: standard `motion` component about 34 KB; `m` + `LazyMotion` about 4.6 KB initial, `domAnimation` +15 KB, `domMax` (drag and layout animations) +25 KB. | ADOPT (keep) | `layoutId` shared-element and layout animations need `domMax` if LazyMotion is used. Prefer `m` + `LazyMotion` on new surfaces. Use `MotionConfig reducedMotion="user"`. |
| `motion` package 13.5.0 (MIT, depends on framer-motion `^13.5.0`) | Same engine under the new name; the framer-motion name is not marked deprecated in the manifest. Docs describe `useAnimate` mini at 2.3 KB (WAAPI) and hybrid at 17 KB. | ADAPT PRINCIPLE | Moving imports to `motion/react` and bumping to 13 is a codemod-sized migration with no design gain by itself; do it as its own chore PR with the repo's tests, not mixed with design work. Read the v13 changelog first (n/v). |
| React `<ViewTransition>` + Next.js | Next docs (page for v16.3.8, last updated 2026-08-25): works in the App Router with no config because it ships React canary; triggered only by Transitions, Suspense, `useDeferredValue` (not plain setState); shared element morph via same `name`; `transitionTypes` on Link; browser support Chromium 125+, recent Safari and Firefox, with graceful no-animation fallback; the `::view-transition` overlay captures pointer events unless set to `pointer-events: none`. A separate Next 15 config page documents `experimental.viewTransition` as experimental and not recommended for production. Repo is Next 15.5.24. | REFERENCE ONLY (route-level only, later) | Valuable for route morphs such as card to profile or journal entry to evidence. It is experimental on the repo's Next version, so do not ship on critical paths. Keep component-level layout animation in framer-motion. |
| Reduced motion | Next guide shows `@media (prefers-reduced-motion: reduce)` zeroing view-transition durations. | ADOPT | Required for every motion pattern. Pair with `fixing-motion-performance` rules (compositor-only properties, no layout thrash). |

## 5. Timeline and calendar

| Candidate | Verified facts | Verdict | Reasoning |
|---|---|---|---|
| FullCalendar `@fullcalendar/react` 7.1.0 | MIT for the standard packages; peers react 17-19 and `temporal-polyfill ^1.0.1`; 1.2 MB unpacked. License page: non-premium plugins and the `fullcalendar` bundle are MIT, premium plugins and the scheduler bundle require a paid commercial license for for-profit use. The page did not list which plugins are premium (resource timeline is the usual one; confirm before use). | REFERENCE ONLY | A canonical custom calendar already exists at `/dashboard/planning` with proven worker, owner and manager parity; a second calendar would duplicate it and the premium tier is a licensing risk. |
| `@schedule-x/react` 4.1.0 | MIT, 16 KB wrapper, peer `@schedule-x/calendar`. Core size n/v. | REFERENCE ONLY | Lightweight reference for modern calendar UX; same duplication argument. |
| react-big-calendar 1.20.0 | MIT, 1.7 MB unpacked, react 16-19. | REJECT | Dated styling; duplication. |
| vis-timeline, other timeline libs | Not verified. | n/v | Not evaluated. Existing `journey-timeline.tsx` covers the Living CV and journal case. |

## 6. Recommendation

Work graph
- Default: native SVG plus the existing framer-motion for the Live Work Graph. Reuse the repo's SVG idioms and design tokens, give nodes real focusable elements and `<title>`/`<desc>`, add a list/table alternative view, and offer a keyboard path for every pointer action. If a layout is needed, use seeded, frozen d3-force or a precomputed layout stored with the data; do not add physics that jiggles on load.
- Escalation path: if product later needs user-editable, zoomable, large node-edge canvases, adopt `@xyflow/react` (MIT, built-in keyboard and ARIA) loaded via dynamic import on that route only, with `@dagrejs/dagre` for hierarchical layouts. Decide the attribution-badge policy first. Measure gzip with the repo's analyzer before merging.
- Reject cytoscape, vis-network, sigma (scale and a11y mismatch) and elkjs (7.7 MB and EPL/GPL license review).

Motion
- Keep framer-motion. On new surfaces use `m` + `LazyMotion` (`domMax` only where `layoutId` is needed), `MotionConfig reducedMotion="user"`, compositor-safe properties, and the asymmetric timing pattern (fast exit, gentler enter). Treat the framer-motion 12 to `motion` 13 move as a separate chore.
- Route-level View Transitions: trial behind a flag on one low-risk route only after confirming the Next 15 support level; not a dependency of the design work.

Visual QA
- Use what exists: Playwright `toHaveScreenshot` with baselines generated in the same CI image, `animations: "disabled"`, masked dynamic regions (dates, avatars), and a small fixed matrix (mobile, desktop, light, dark, reduced motion). Add `@axe-core/playwright` as a dev dependency for automated WCAG checks, with keyboard-path tests alongside, and the WCAG 2.2 criteria in section 1 as explicit acceptance lines.
- Do not adopt Lost Pixel (archived), BackstopJS (duplicates Playwright) or an unvetted third-party skill.

Open items to verify before adoption (not checked in this pass): gzip sizes of xyflow and dagre in this app, the Next 15 ViewTransition support level, framer-motion 13 changelog, FullCalendar premium plugin list and pricing, source licenses of the diagram and WCAG skills, and release dates of all packages.

## Sources
- npm registry `latest` manifests: @xyflow/react, motion, framer-motion, d3-force, elkjs, @dagrejs/dagre, cytoscape, vis-network, sigma, @fullcalendar/react, @schedule-x/react, react-big-calendar, @axe-core/playwright, backstopjs (fetched 2026-10-02)
- https://github.com/xyflow/xyflow ; https://reactflow.dev/learn/troubleshooting/remove-attribution ; https://reactflow.dev/learn/advanced-use/accessibility
- https://motion.dev/docs/react-reduce-bundle-size
- https://nextjs.org/docs/app/guides/view-transitions ; https://nextjs.org/docs/15/app/api-reference/config/next-config-js/viewTransition
- https://playwright.dev/docs/test-snapshots
- https://github.com/lost-pixel/lost-pixel ; https://github.com/reg-viz/reg-suit
- https://www.w3.org/TR/WCAG22/
- https://fullcalendar.io/license
- https://github.com/anthropics/skills/tree/main/skills/frontend-design ; https://github.com/cathrynlavery/diagram-design (via search listings)
