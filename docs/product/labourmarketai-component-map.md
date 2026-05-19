# labourmarketai — Component Map (locked)

Every component below exists once. Each entry states where it is used, what it
renders, which data source it must not duplicate, and that a second version is
forbidden. Composing a component is allowed; forking, copying or re-deriving
its data is not.

The single token source for all visual values is `src/app/globals.css`
(`@theme` + root tokens). No component hardcodes its own palette, radius,
shadow or spacing.

**Visual standard (locked).** Every component follows the premium sports /
draft / scouting visual language in the constitution §2 and uses only the
named token vocabulary in §7.1 (`--color-arena`, `--color-surface-premium`,
`--color-surface-card`, `--color-border-premium`, `--color-accent-draft`,
`--color-accent-match`, `--color-fit-success` / `-warning` / `-neutral`,
`--color-signal-gold` / `-silver` / `-blue` / `-green`, `--shadow-glow`,
`--shadow-depth`). Entity-centric components (player/candidate/company/need
cards and the surfaces that frame them) present information in the locked
order — what it is → why it matters → does it fit → what to do next — with one
clear visual centre and secondary context in a second layer. Bare,
dashboard-grid "technical" screens are not acceptable.

---

## Feature components

### LandingHero — `src/components/landing/LandingHero.tsx`
- **Used in:** `/` only.
- **Renders:** the public hero scene; reuses the real worker player card.
- **Must not duplicate:** profile data or the card visual — it composes
  `ProfilePlayerCard`. No bespoke hero card art.
- **No second version:** one hero component for the public page.

### RoleSelector — `src/components/role/RoleSelector.tsx`
- **Used in:** `/role` only.
- **Renders:** the "Who are you?" choice (Worker / Person, Company / Employer,
  Recruiter / Agency) and continue.
- **Must not duplicate:** profile fields; never asks what the user wants.
- **No second version:** role is captured by this one component.

### ProfilePlayerCard — `src/components/profile/ProfilePlayerCard.tsx`
- **Used in:** profile, discover, matches, landing, overview.
- **Renders:** a person as a player card via the shared visual surface,
  derived from the profile.
- **Must not duplicate:** the profile model — it is a visual projection only,
  never an editor and never a separate data store.
- **No second version:** the only person-card entry point.

### CompanyPlayerCard — `src/components/company/CompanyPlayerCard.tsx`
- **Used in:** company, hiring needs, discover.
- **Renders:** a company on the same shared visual surface.
- **Must not duplicate:** the company model; same visual system as people.
- **No second version:** the only company-card entry point.

### DiscoverCard — `src/components/discover/DiscoverCard.tsx`
- **Used in:** `/app/discover`.
- **Renders:** a `ProfilePlayerCard` plus draft / shortlist actions.
- **Must not duplicate:** candidate data — it reuses profile / player-card
  data and stores no copy of it.
- **No second version:** one discover/draft card.

### MatchResult — `src/components/matches/MatchResult.tsx`
- **Used in:** `/app/matches`, and as the company-side example on `/`.
- **Renders:** a `ProfilePlayerCard` plus plain-language fit (score, reason,
  gaps) from the matching layer.
- **Must not duplicate:** profile/need data or matching logic; no fabricated-
  intelligence wording.
- **No second version:** one match-result component.

### HiringNeedCard — `src/components/hiring/HiringNeedCard.tsx`
- **Used in:** `/app/hiring-needs`.
- **Renders:** a hiring need anchored to its `CompanyPlayerCard`.
- **Must not duplicate:** company data (it references it) or the company
  visual.
- **No second version:** one hiring-need card.

### CommunicationStart — `src/components/communication/CommunicationStart.tsx`
- **Used in:** `/app/communication` only.
- **Renders:** the single start-a-thread surface and recent openers.
- **Must not duplicate:** there is no parallel inbox / messages / chat area.
- **No second version:** the one communication entry point.

### AppShell — `src/components/shell/AppShell.tsx`
- **Used in:** every `/app/*` screen (via the app layout).
- **Renders:** the workspace frame and one nav entry per concern.
- **Must not duplicate:** it owns no data; nav reflects the route map.
- **No second version:** one app shell.

### AdminShell — `src/components/shell/AdminShell.tsx`
- **Used in:** `/admin` only.
- **Renders:** the operational management frame.
- **Must not duplicate:** no approval / screening / sign-off / curation queue;
  not a second app shell.
- **No second version:** one admin shell.

---

## Shared primitives (one of each)

### Shared layout primitives
- **Wordmark** (`ui/Wordmark.tsx`) — the brand lockup; used in shells, header,
  footer, auth. Must not be re-typeset elsewhere.
- **AppShell / AdminShell** — the only frames (see above). Screens never build
  their own shell.

### Shared visual primitives
- **PlayerSurface** (`ui/PlayerSurface.tsx`) — the one shared visual frame for
  any player card. Entered only via `ProfilePlayerCard` /
  `CompanyPlayerCard`. Never rendered directly by feature screens and never
  duplicated. The avatar/identity visual lives here only.
- **Eyebrow** (`ui/Eyebrow.tsx`) — the small label above a heading.

### Status chips — `src/components/ui/StatusChip.tsx`
- **Used in:** anywhere a state is shown (availability, hiring, provider state,
  preview-data notice, match strength).
- **Renders:** a tokenised chip with a tone (neutral / positive / info /
  warn / muted).
- **Must not duplicate:** state styling — ad-hoc chip markup is replaced by
  this. No second chip system.

### CTA / button styles — `src/components/ui/CtaButton.tsx` + `.cta*` tokens
- **Used in:** all primary/secondary actions.
- **Renders:** the one primary and ghost action style from tokens.
- **Must not duplicate:** button styling; no bespoke button variants outside
  the token layer.

### Page header pattern — `src/components/ui/PageHeader.tsx`
- **Used in:** every `/app/*` screen as the top of the page.
- **Renders:** eyebrow + title + lead + optional actions.
- **Must not duplicate:** no screen writes its own header markup.

### Section block pattern — `src/components/ui/SectionHeading.tsx`
- **Used in:** marketing and grouped sections.
- **Renders:** eyebrow + section title + lead, left or centered.
- **Must not duplicate:** no second section-title pattern.

### Panel / card primitives — `src/components/ui/Panel.tsx` + `.glass` tokens
- **Used in:** every surface that needs a glass panel/card container.
- **Renders:** the one surface treatment from tokens.
- **Must not duplicate:** no component hand-rolls another panel style.

### Layout block foundation — `src/lib/layout-blocks.ts` + `src/components/ui/LayoutBlock.tsx`
- **Used in:** the re-orderable foundation (constitution §8). `LayoutRegion`
  renders a typed, ordered list of `LayoutBlock` descriptors.
- **Renders:** `LayoutBlockView` is the titled block container that wraps the
  panel primitive; `LayoutRegion` maps the ordered blocks.
- **Must not duplicate:** the panel primitive (it composes it) and the block
  ordering model (one typed model in `lib/layout-blocks.ts`).
- **No second version:** one layout-block model and one block primitive.
  Future drag-and-drop only mutates the ordered array — it adds no new block
  system.
