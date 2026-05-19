# labourmarketai — Product Constitution v1

This is the governing document for the product. It locks the direction, the
visual quality bar, the app-interior standard, the one-function / one-canonical-
place principle, the reusable-component structure, and the foundation for fast
visual change.

Companion documents:

- `docs/product/labourmarketai-route-map.md` — the locked route map.
- `docs/product/labourmarketai-component-map.md` — the locked component map.

Where any other document disagrees with this one, **this one wins**. An
explicit owner instruction for a specific task is the source of truth for that
task and may override an article — but only that task, only explicitly, and
never silently. Everything not overridden stays in force.

---

## 1. What the project is

labourmarketai is a work market where workers and companies meet directly.

- A worker creates one work profile, shows real skills, and gets found by
  companies that are hiring.
- A company creates one company profile, posts what it needs, finds suitable
  workers, compares fit clearly, and starts the right conversation faster.
- A recruiter / agency moves between both sides on the same surfaces.

It is a product for people looking for work and people looking for workers.
It is not a dashboard demo, not a template, and not an internal tool.

## 2. Visual direction (locked)

- Premium, cinematic, dark. High contrast, strong type hierarchy, controlled
  depth and glow. Draft / scouting energy — people and opportunities, not
  technical UI objects.
- It must feel human and emotional, closer to a high-end sports-draft or
  scouting interface than a SaaS template.
- Controlled density: no dead space, no empty hero, no filler blocks.
- Motion-ready layout (entrance and hover states), reduced-motion respected.
- A generic SaaS card-wall is not acceptable and is grounds to reject a PR.

## 3. App-interior quality rules

The inside of the app is held to the same bar as the landing.

- Every screen uses the shared shell, the shared page-header pattern, and the
  shared section/panel primitives. No raw, unstyled, "technical" screens.
- Every screen states its one purpose clearly in human language.
- Sample/preview data is always labelled as preview and never shown as real.
- No screen is a data owner unless it is that concern's one canonical place
  (see §4). Overviews summarise; they do not own or duplicate data.

## 4. One function / one canonical place (locked)

Each concern has exactly one canonical place. Nothing may create a second.

| Concern | One canonical place | Notes |
| --- | --- | --- |
| Who a user is | `Profile` model + `/app/profile` | The single user information source. |
| Visual identity | player card / avatar | Visual projection of the profile only — not a separate data model and not a separate editing flow. |
| Role | role selection at `/role` | Asks "Who are you?": Worker / Person, Company / Employer, Recruiter / Agency. Never asks what you are looking for. |
| Job-search status | a field on the profile | Belongs to the profile. It is not a separate route. |
| Company info | `CompanyProfile` + `/app/company` | The single company information source. |
| Hiring need | `HiringNeed` + `/app/hiring-needs` | The single source of a worker/team need. |
| Matching | `/app/matches` | Compares profile data with hiring-need data and shows plain-language fit. No invented intelligence wording. |
| Discover / draft | `/app/discover` | Reuses the same profile / player-card and hiring-need data. No duplicate candidate data. |
| Communication | `/app/communication` | One communication area. Contact leads to one conversation path. |
| Operations | `/admin` | A management shell only. No approval, screening, sign-off, or curation queues. |

## 5. Reusable component principle (locked)

- Each visual idea has one component. People/companies render through one
  shared visual surface entered only via `ProfilePlayerCard` and
  `CompanyPlayerCard`.
- Discover, matches, hiring and company surfaces **compose** those components.
  They never fork or re-implement them and never copy candidate data.
- Shared primitives (shell, page header, section block, panel/card, status
  chip, CTA/button, layout block) live once and are reused. A second version
  of any of them is forbidden.
- The full map and the "do not recreate" rules are in
  `docs/product/labourmarketai-component-map.md`.

## 6. Human UI text rules

User-facing text speaks to workers and companies in plain words.

**Never in public UI copy:** canonical, deterministic, source of truth,
architecture, reusable data model, zero queues, no duplicate flows, connected
board, fabric, living system, technical scaffold, internal model. (These ideas
may exist internally and in these docs; they may not be the user's message.)

**Write like this instead:** Create your work profile · Show your skills · Get
found by companies · Find suitable workers · Compare fit clearly · Start the
right conversation · Save people and opportunities · Build a clearer work
market presence.

Public UI copy is never written like a technical document.

## 7. Fast visual change rules

Visual change must be cheap and safe:

- All visual values come from one place: the token layer in
  `src/app/globals.css` (`@theme` + root tokens) — colour, gradient, shadow,
  radius, spacing rhythm, typography, surface, CTA, status-chip. Components do
  not hardcode their own palette.
- Layout is composed from shared blocks, not bespoke markup, so a screen can
  be restyled or recomposed by changing tokens or block order, not by
  rewriting components.
- Copy lives close to the surface and in plain strings so wording changes do
  not require structural changes.

## 8. Re-orderable UI foundation

The app interior is built so blocks, cards, texts, buttons and widgets can be
reordered later **without rewrites**.

- A typed layout-block model: `src/lib/layout-blocks.ts`
  (`LayoutBlock`, `LayoutRegion`, `orderBlocks`, pure `reorderBlocks`).
- A presentational primitive: `src/components/ui/LayoutBlock.tsx`
  (`LayoutBlockView`, `LayoutRegion`) that renders an ordered list of typed
  blocks.
- How future reordering works: a screen owns an ordered array of typed block
  descriptors. `orderBlocks` sorts by `order`; `LayoutRegion` renders them.
  Reordering = changing that array (or calling the pure `reorderBlocks`
  helper). A future drag-and-drop layer only mutates the array — no component
  changes. **Full drag-and-drop is intentionally not implemented in v1.**

## 9. Prohibitions (duplication and scope)

Forbidden, now and in future PRs:

- A separate avatar route or a separate avatar editing flow.
- More than one profile route or a duplicate profile flow / profile source.
- More than one communication route or a duplicate communication / inbox /
  messages / chat area.
- Duplicate candidate / player-card data, or a second player-card component.
- A duplicate of any shared primitive.
- Approval, screening, sign-off, or curation queues; an operations area that
  gates users.
- Payments.
- Fabricated intelligence claims or any wording that implies a capability
  that is not wired.
- Public UI copy written as a technical document; bare technical screens.
- Production deploy, merge, or pushing substance to the default branch as part
  of normal task work.

## 10. Acceptance criteria for every future PR

A PR may be accepted only if all hold:

1. **Scope** — does exactly what was asked; no unrequested features or routes.
2. **Canonical** — adds no second profile, communication, avatar, or
   player-card source; respects the §4 map.
3. **Reuse** — uses shared shell / primitives / player cards; introduces no
   duplicate primitive and no copied candidate data.
4. **Visual** — premium dark, human, controlled density; not a SaaS card-wall;
   app interior held to landing-level quality.
5. **Language** — user-facing copy is human and free of the §6 banned terms.
6. **Tokens** — visual values come from the token layer, not hardcoded.
7. **Guards** — `npm run typecheck`, `npm run lint`, `npm run check`,
   `npm run build` all pass.
8. **Discipline** — one branch, one PR; no merge, no production deploy, no
   substance pushed to the default branch without explicit owner
   authorization.

## 11. Enforcement and amendment

`npm run check` (`scripts/check.ts`) enforces the machine-checkable rules:
single profile route, no separate avatar route, single communication route,
no duplicate player-card components, no duplicate profile source file, no
duplicate communication area, honest wording (no approval/screening/owner
acceptance phrasing, no fabricated-intelligence claims), and no banned
technical terms in public UI copy. CI must also pass typecheck, lint and
build.

This constitution is amended only by editing **this document together with its
guard in the same pull request**, with explicit owner authorization. A guard
may be tightened to enforce an article better, but never changed to allow the
very anti-pattern an article forbids.
