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

## 2. Visual direction (locked) — premium sports / draft / scouting

The visual language is built on top-tier sports, draft, scouting and premium-
arena aesthetics. Every landing and in-app screen must read like a high-end
scouting dashboard or draft board — never a generic SaaS template.

**Aesthetic basis**

- Dark premium foundation: deep navy / graphite / black tones.
- Strong contrast and a confident type hierarchy.
- Sport-energy accents used with restraint; electric / neon only as
  highlights, never as the whole surface.
- High-value player-card / candidate-card feel — each entity looks scouted,
  rated and worth a decision.
- Controlled density: no dead space, no empty hero, no filler blocks.
- Motion-ready (entrance and hover), reduced-motion respected.
- Emotional and human, closer to a sports draft than a dashboard demo.
- A generic SaaS card-wall is grounds to reject a PR.

**Colour & signal direction**

- Base: arena background and premium surfaces (dark navy / graphite / black).
- Decision accents: a draft accent and a match accent, used sparingly to
  signal energy and fit — not decoration.
- Fit & status signals use a gold / silver / blue / green family: gold/silver
  for tier and standout signal, green for strong/open/confirmed, blue for
  active/available, amber for partial/caution, neutral for unrated.
- All of the above resolve from the named token vocabulary in §7.1 — screens
  never invent their own palette.

**Information hierarchy (locked order)**

Every entity-centric surface presents information in this order:

1. **What it is** — the person, company or need, as the clear visual centre.
2. **Why it matters** — headline signal: tier, rating, key strengths.
3. **Does it fit** — fit / match read in plain language.
4. **What to do next** — the primary action, unmistakable.

Less important context (secondary metadata, history, fine print) lives in a
second visual layer and never competes with the centre.

**Interior screens as a scouting / draft board**

- The person, company or need has one clear visual centre (the player /
  candidate card).
- Skills, statuses, fit, actions and context are arranged around that centre.
- Secondary information is de-emphasised into the second layer.
- The same standard as the landing applies inside the app — no bare,
  "technical", dashboard-grid screens.

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

### 7.1 Named token vocabulary (single source)

Defined once in `src/app/globals.css` (`@theme`). These names are the locked
vocabulary for the §2 visual language; future work uses these, never raw hex
and never a parallel token. They are aliases of the primitives — change a
primitive once and the language follows.

| Concept | Token | Use |
| --- | --- | --- |
| Arena background | `--color-arena` | App / page base |
| Premium surface | `--color-surface-premium` | Panels, sections |
| Player-card surface | `--color-surface-card` | Player / candidate card body |
| Premium border | `--color-border-premium` | Hairline edges |
| Draft accent | `--color-accent-draft` | Draft / discover energy |
| Match accent | `--color-accent-match` | Match / fit energy |
| Success fit | `--color-fit-success` | Strong / good fit |
| Warning fit | `--color-fit-warning` | Partial / caution fit |
| Neutral fit | `--color-fit-neutral` | Unrated / neutral fit |
| Tier signals | `--color-signal-gold` / `-silver` / `-blue` / `-green` | Tier & status signals |
| Glow | `--shadow-glow` | Focus / highlight glow |
| Depth shadow | `--shadow-depth` | Deep premium-arena elevation |

No duplicate token may be introduced. If a new concept appears, extend this
vocabulary here and in `globals.css` in the same PR.

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
acceptance phrasing, no fabricated-intelligence claims), no banned technical
terms in public UI copy, and no terms contradicting the §2 premium visual
direction in public UI copy. CI must also pass typecheck, lint and build.

This constitution is amended only by editing **this document together with its
guard in the same pull request**, with explicit owner authorization. A guard
may be tightened to enforce an article better, but never changed to allow the
very anti-pattern an article forbids.
