# Premium Design Map v1 — labourmarket.ai

> **Status:** Owner-reviewable audit. NOT an implementation PR.
> **Scope:** Inspect, map, document. Prepare safe next slices.
> **Branch:** `feat/cc/premium-design-v1`. **No product UI changed in this PR.**
> **Companion:** `premium-design-next-slices-v1.md` (small implementation PRs).

This is the design "x-ray" of the product as it exists on `main` today
(post PR #53, with current pilot-draft-flows WIP held untouched on its
own branch). It maps every public-facing and authenticated route, the
existing visual system, the strengths to protect, the risks to address,
and what should NOT be changed yet.

## 1. Product design principle (the test every change passes)

Inherited from `docs/PLATFORM_DOCTRINE.md` §1:

> **Does this make it easier for the smaller party to defend themselves and
> prove what actually happened?**

In design terms: **calm, honest, fast to read, dense without being
dense, premium without overclaiming.** Every visual cue must either
help the user know what's real, know what's next, or know they are not
alone. Nothing decorative may impersonate something live, verified, or
AI-driven (§7, §7.1, §15).

## 2. Current visual system (the strong foundation to protect)

- **Industrial Intelligence aesthetic** (committed visual identity per
  `docs/CHANGELOG.md`). Dark cool ink base (`ink-900` = `#06070D`,
  **never pure black**). Single accent gradient
  (`brand.blue → violet → purple`) applied to ONE word per heading.
- **Tokens are law.** All colors / radii / shadows / gradients /
  fonts live in `apps/web/tokens/*.ts`, exposed through
  `tailwind-preset.ts`. Components consume `text-text-primary`,
  `border-ink-500`, `bg-brand-blue/10` — **no raw hex in components**.
- **Fonts:** display = Geist (`var(--font-display)`), body = Inter
  (`var(--font-sans)`), mono = Geist Mono (`var(--font-mono)`).
  Wired by `next/font` in `app/[locale]/layout.tsx`.
- **Letterspacing:** `tightest` (`-0.02em`) for display headings,
  `label` (`0.12em`) for mono small-caps labels (the eyebrows).
- **Component library** (`components/ui/`): `Button`, `Card`, `Badge`,
  `Avatar`, `Input`, `Label`, `Select`, `Placeholder`, `Stat`,
  `Sparkline`, `MobileSheet`, `LiveDot`. Small, opinionated, no
  feature creep.
- **Honesty primitives** (`components/app/`): `Placeholder` (renders
  `Sample` / `Demo` markers), `DemoChip`, `LiveDot` — the visible
  contract that what the user sees is real-tagged or sample-tagged.
- **Card-border + glow** in `app/globals.css`: gradient-border + radial
  inner glow that gives the dark surfaces depth without saturation.
- **Bottom nav** for mobile (`components/app/bottom-nav.tsx`); sticky
  header reduced to `h-14` with `backdrop-blur-md` on mobile.
- **Locale set is binding** (10 locales per doctrine §2.4) — every
  copy change must land in all 10 JSON files.

These are the design system's strengths. Slices that "modernize"
shouldn't repaint over them.

## 3. Route-by-route map

### 3.1 Public marketing (`/[locale]/(marketing)/`)

| Route | File | Length | Surface character |
|---|---|---|---|
| `/` | `(marketing)/page.tsx` | 273 lines | Hero + LiveMap + LiveTicker + Journey rail + PlayerCardShowcase + DraftBoard + MarketPulse + Secondary 4-card grid + Market intel sparklines + Testimonial. **7 distinct sections** below the hero. |
| `/for-workers` | `(marketing)/for-workers/page.tsx` | (per-role variant) | Role-segmented landing for workers. |
| `/for-companies` | `(marketing)/for-companies/page.tsx` | (per-role variant) | Role-segmented landing for companies. |
| `/for-agencies` | `(marketing)/for-agencies/page.tsx` | (per-role variant) | Role-segmented landing for agencies. |
| `/pricing` | `(marketing)/pricing/page.tsx` | Marketing | Pricing table (`components/marketing/pricing-table.tsx`). |
| `/vision` | `(marketing)/vision/page.tsx` | Marketing | The LabourMarketOsMap surface. **Currently gated by `isVisionPublic()` flag — not in `<SiteNav>` until the flag flips.** |
| `/legal/{terms,privacy,cookies}` | `(marketing)/legal/*/page.tsx` | Legal | Static legal content. |

The site nav (`components/layouts/site-nav.tsx`) shows: `platform`,
`solutions` (→ `/for-companies`), `resources` (→ `/for-workers`),
`pricing`, `company` (→ `/for-agencies`). **Vision is hidden until
the smoke-test flag flips.** Login + Start-now CTA on the right.

### 3.2 Auth (`/[locale]/auth/`)

| Route | Surface |
|---|---|
| `/auth/login` | Login form (`components/app/login-form.tsx`) + Google OAuth (`google-button.tsx`). |
| `/auth/signup` | Signup form (`components/app/signup-form.tsx`) + Google OAuth. |
| `/auth/forgot-password` | Email-only reset request. |
| `/auth/reset-password` | New password after token. |

Layout `auth/layout.tsx`: ambient-glow background, minimal chrome,
locale switcher in the header. Calm and clean — keep as-is.

### 3.3 Onboarding (`/[locale]/onboarding/`)

`onboarding/page.tsx` (60 lines) is a thin shell over
`<OnboardingWizard>` (212 lines):

- **Step 1 — pick one OR MORE roles.** Cards for worker / company /
  agency / customer. Already supports multi-select (the same person
  can be a worker AND run an agency AND buy services). Copy says
  "multiNote" — implies multi but the visible cue could be louder.
- **Step 2 — display name + country.** Country defaults to LT;
  9-market dropdown.
- Submits role set in canonical order; first picked becomes
  `active_role`. **Role-not-lock-in is structurally already in place.**

### 3.4 Authenticated dashboard (`/[locale]/dashboard/`)

Shell: `dashboard/layout.tsx` (110 lines).
- Sticky header on mobile (`h-14`, backdrop-blur), normal flow on
  `md+`.
- Header content: brand wordmark · `<DashboardTabs>` (desktop only)
  · `<LocaleSwitcher>` (desktop only) · `<NotificationPanel>` ·
  `<RoleSwitcher>`.
- Admin badge rendered separately by `<RoleSwitcher>` when
  `profile.active_role === 'admin'`. **Correctly kept out of the
  workspace switcher.**
- Main area: `max-w-container` (1440px), `py-10`, `pb-[calc(5rem+env(safe-area-inset-bottom))]`
  on mobile to clear `<BottomNav>` (`h-16`).

Routes:

| Route | File | Surface |
|---|---|---|
| `/dashboard` | `dashboard/page.tsx` (419 lines) | The **rich** dashboard. Branches on `role`: worker → "work cockpit" (profession + skills + journal counts, next-steps stepper); company/agency/customer → "operating cockpit" (define → pilot, 3 action lanes, PilotRequestButton). |
| `/dashboard/agency` | 30 lines | Thin `<RoleDashboard>` wrapper: header + pilot disclaimer + first-action card + profile link. |
| `/dashboard/company` | 31 lines | Same `<RoleDashboard>` wrapper. |
| `/dashboard/buyer` | 32 lines | Same `<RoleDashboard>` wrapper. Note: DB slug is `customer`, UI label is "Pirkėjas / Buyer". |
| `/dashboard/admin` | 179 lines | Pilot control panel + manual-add (per PR #51). |
| `/dashboard/admin/users/[id]` | (admin detail) | Per-user admin view. |
| `/dashboard/profile` | 304 lines | Worker "Profession & skills" page — profession + skills + CV preview. Owner-only `profile_text` from migration 0014. |
| `/dashboard/journal` | (journal) | Universal Work Journal (per PR #12 / migration 0013). |
| `/dashboard/inbox` | (inbox) | Notification + thread inbox. |
| `/dashboard/discover` | (discover) | Discovery surface. |
| `/dashboard/search` | (search) | Search surface. |
| `/dashboard/account` | (account) | Account settings + role expansion. |

### 3.5 Design demos (`/[locale]/design/`)

`design/page.tsx` + `design/text-first/page.tsx` — internal design
preview routes. Useful for component QA; not user-facing. Leave alone.

## 4. The two existing maps to PROTECT

1. **`<LiveMap>`** (`components/app/live-map.tsx`, 316 lines) —
   the hero right-side mission-control Europe map with country tiers,
   intensity glow, hover tooltips, and a live UTC clock. Works without
   network calls (static `EUROPE_GEO` + `geoPayloads` from
   `content/placeholders`). **DO NOT TOUCH** in this PR or any
   landing-cleanup slice.
2. **`<LabourMarketOsMap>`** (`components/marketing/labour-market-os-map.tsx`,
   412 lines) — the `/vision` page's catalogue-driven system map
   (features × roles × activity types, grouped by `active` /
   `preparing`). Reflects `lib/config/*.ts` source state. **DO NOT
   TOUCH.** If the vision page surfaces in future slices, it's the
   anchor.

## 5. Current design strengths

- **Token discipline.** A new contributor can find every color in
  `apps/web/tokens/colors.ts`. The brief's "ONLY allowed colors" rule
  is enforced visually because the gradients/shadows compose tokens.
- **Live + Demo + Placeholder honesty.** The `live-dot`, `<DemoChip>`,
  and `<Placeholder>` primitives + the explicit `DEMO_TO_REAL_DATA_POLICY.md`
  + the visible "PILOT" eyebrow on role dashboards mean a careful
  reader can tell sample from real instantly. This is rare and
  valuable.
- **Role-not-lock-in is structurally true.** `lib/config/roles.ts`
  carries `canBeAddedLater: true` on every row. `<RoleSwitcher>` is
  always visible. Onboarding allows multi-select. The doctrine
  (§5.5) demands a portfolio-of-relationships model and the code
  follows.
- **Journey rail consistency.** The same 4-stage stepper renders on
  the landing journey band and inside the dashboard. The user
  recognizes their location moving from outside → inside.
- **Mobile-first chrome.** Sticky header collapsed, bottom-nav with
  safe-area padding, MobileSheet for overlays. Real mobile attention.
- **Admin badge separation.** `isAdmin` is a sibling of the workspace
  role list, never mixed in. The role switcher dropdown shows only
  worker/company/agency/customer — admin lives on its own chip.
- **Auto-commit + branch hygiene** (CLAUDE.md). Design work flows
  through small PRs on `feat/cc/...` branches with green typecheck /
  lint / build gates. Discipline already established.

## 6. Current design risks (premium-tone tension)

Each item below is **observation only**. Concrete fixes live in the
companion `premium-design-next-slices-v1.md`.

### 6.1 Landing density
The `/` route has 7 sections after the hero (Live ticker, Journey
band, Player card showcase, Draft board, Market pulse, Secondary
4-card grid, Market intel sparklines, Testimonial). Each is a strong
visual on its own. Stacked, they read as "many things at once" rather
than "one premium product". First-impression risk: dilution.

### 6.2 Live-cue inflation
`live-dot` appears in: hero chip, dashboard role chip, dashboard
section eyebrows, journey rail stages, LiveMap, LiveTicker,
MicroActivityFeed. When everything pulses, nothing reads as
particularly live. Premium tone reserves the live cue for one or
two anchor surfaces.

### 6.3 "Trusted by" with placeholder logos
Hero's trusted-by strip renders 6 `<Placeholder>` logo slots. The
honesty markers are correct, but the visual pattern reads as "no
logos yet" to a first-time visitor. Premium pages either show real
logos or skip the strip entirely.

### 6.4 Secondary card grid is mostly placeholders
The 4-card row (Team / Comm / Companies / Shortcuts) uses
`<Placeholder>` for every content slot. Honest, but in aggregate it
tells the visitor "this is mostly empty". Until real data lands per
card, the section could collapse to a single "what's coming" panel.

### 6.5 Role dashboard density asymmetry
Worker → 419-line cockpit with profession, skills, journal counts,
next-steps stepper, FeatureAvailabilityGrid.
Agency / company / buyer → 30-line `<RoleDashboard>` shell with
header + PILOT disclaimer + first-action card + profile link.
The asymmetry signals "we built the worker side; the rest is still
being thought through." For a premium B2B audience hitting the
company dashboard, this can feel underwhelming even with the honest
PILOT chip.

### 6.6 Role icon set
Onboarding cards (🔨 🏢 🎯 👤) and role-switcher chips (🔨 🏗️ 🤝 🛒)
use different emoji sets for the same four roles. Beyond
inconsistency, emoji glyphs render unpredictably across OSes and
fonts; premium B2B design generally prefers a consistent
glyph/icon set (e.g. lucide / phosphor / custom SVG sprite).

### 6.7 Site nav semantic mismatch
The header link labels are `platform / solutions / resources /
pricing / company`, but the routes are `/ → platform`,
`/for-companies → solutions`, `/for-workers → resources`,
`/for-agencies → company`. The user clicks "Company" expecting an
About page and lands on agency-segmented marketing. Cognitive
friction.

### 6.8 Vision page invisible
`/vision` is gated by `isVisionPublic()` and not surfaced in nav.
The `<LabourMarketOsMap>` is one of the strongest brand-confidence
anchors in the codebase. While the flag is `false`, premium
visitors looking for an "About / How it works" find nothing.

### 6.9 Greeting + role chip dyad on dashboard
The dashboard `<header>` is `role chip + greeting headline`. Premium
tone usually leads with the human's name and tucks the role chip
into a secondary line. Right now the chip is above the headline,
which puts process before person.

### 6.10 Pilot CTA buried in cockpit panel
`<PilotRequestButton>` is the **real action** that posts to
`/api/leads`. On the company/agency cockpit it lives at the bottom
of a long cinematic panel (3 action lanes above it). Premium tone
surfaces the real-action above the educational scaffold so
intent-driven visitors get to the action in one screen.

## 7. Mobile concerns

- **Sticky header `h-14` + bottom-nav `h-16`** sandwich the viewport.
  On 360 × 640 (smallest real-phone width), forms with sticky CTAs
  benefit from the `pb-[calc(5rem+env(safe-area-inset-bottom))]`
  padding already in `dashboard/layout.tsx`. Marketing pages don't
  have the bottom nav but also have no sticky header dismissal —
  long landing scrolls are fine.
- **Locale switcher hidden below `md`** in both site-nav and
  dashboard header. Acceptable for v1 (10 locales × dropdown =
  noise), but a long-tap or footer location is worth a slice if
  non-EN users complain.
- **Journey rail on `sm` collapses to a column with the connector
  bars hidden.** Good — keep that pattern.
- **`<MicroActivityFeed>` + `<LiveTicker>`** on landing: scroll
  performance is fine in the dev preview; profile in real Chrome
  Mobile before any animation-heavy slice.

## 8. Trust + copy concerns

- **No fake AI / fake matching / fake verification.** Verified by
  reading the worker dashboard logic (`dashboard/page.tsx:233-260`):
  `skillsCount` / `entriesCount` are SQL `count: 'exact'` on
  real `worker_skills` / `journal_entries`. Matching has no UI
  surface yet. Trust holds.
- **Skill trust language** (doctrine §15): every `worker_skill`
  should carry `confidence_score` + `confidence_bin` and surface
  with explicit "self-declared / supported / confirmed" framing.
  The `<CapabilityProfileSection>` + `<CvPreview>` + the new
  `<ProfileTextFirstFlow>` are the surfaces to audit in slice 5.
- **"Industry-typical, not platform-measured"** caveat (§15) on
  benchmarks: confirm the landing's `MarketPulse` + market-intel
  sparklines carry this caveat under each chart. They use
  `<Placeholder>` IDs — good, but the visible caveat copy needs
  a sweep.
- **No fake social proof.** The hero "trusted by" + the testimonial
  block are placeholder-only today (good honesty) but read as
  "social proof is being prepared" rather than "the founders made a
  promise to be honest about what's verified". A short caption near
  these blocks could change the read.
- **Copy tone in role dashboards:** the PILOT chip says "PILOT" in
  state-warning amber — clear. The pilot disclaimer text below it
  should consistently include "no automatic actions, owner reviews
  everything" so a returning B2B visitor remembers the contract.

## 9. Role-entry-not-lock-in doctrine (UX recap + status)

The platform-doctrine §5 model says one person ↔ one profile, with a
portfolio of engagement contexts and any combination of profession
identities. Today the UI honours this:

- `lib/config/roles.ts` ✓ `canBeAddedLater: true` on every row.
- `OnboardingWizard` ✓ multi-select role picker in step 1.
- `RoleSwitcher` ✓ always visible; dropdown lists every role; the
  user can `addRole(r)` for any missing role from the dropdown.
- `dashboard/layout.tsx` ✓ resolves `activeRole` from `profile_roles`
  with `active_role` as the **workspace** chip — not an identity
  lock.
- `RoleDashboard` ✓ uses "workspace" framing (dashboard for THIS
  role-context), with a `profile-link` back to the universal
  `/dashboard/profile`.

What still risks reading as lock-in to a new user:

- **Onboarding step 1 cards** can be selected but the multi-note
  message is below them. A first-time user might pick one card and
  hit Next without realising they could pick three. The "you can
  always add more later" promise needs to be louder *during* the
  click.
- **Role-switcher dropdown empty state** when the user holds only
  one role — the missing roles render as "add" actions, but the
  framing is functional, not invitational. A premium dropdown would
  say "Add a workspace — workers also run agencies" or similar
  invitational copy.
- **Workspace chip on the dashboard header** is small and quiet.
  The user may forget which role-context they're looking at.

These are surfaced as Slice 2 in the next-slices doc.

## 10. Screenshots & evidence

No live screenshots were captured in this PR. **Reason:** the
authenticated routes require Supabase credentials (`NEXT_PUBLIC_SUPABASE_URL`,
auth session) to render anything beyond a redirect-to-login, and
`.env*` changes are out of scope per the goal. The marketing pages
*could* be screenshotted from a no-secrets build, but per the goal
"do not fake screenshots" and per the brief's preference for static
analysis when boot needs secrets, the design map was produced from
source inspection of the 1100+ files in `apps/web/`.

If the owner wants real screenshots, the simplest non-secret-touching
path is:

1. The operator runs `pnpm -F web dev` locally with their own
   `.env.local` (already present per the `dev` script).
2. Captures the marketing routes (`/`, `/pricing`,
   `/for-companies`, `/for-workers`, `/for-agencies`,
   `/vision` if locally flipped) and authenticated routes
   (`/dashboard`, `/dashboard/agency`, `/dashboard/company`,
   `/dashboard/buyer`, `/dashboard/profile`, `/dashboard/admin`).
3. Drops the PNGs into `runtime/review-evidence/labourmarketai/premium-design-map-v1/`
   (gitignored per the repo pattern).
4. Future implementation slices reference those PNGs by relative path.

Evidence-folder convention (gitignored if the repo supports it) was
mentioned in the goal as optional. **No screenshots are pretended
to exist; this map is honest about what's in source vs. what's
unverified in a running browser.**

## 11. What should NOT be changed yet

- **`<LiveMap>` + `<LabourMarketOsMap>`** — the two map components
  are the brand's strongest visual anchors. Out of scope for every
  slice in the companion doc.
- **`tokens/*.ts` + `tailwind-preset.ts`** — token discipline is the
  reason the system feels coherent. Adding tokens is fine; renaming
  or removing breaks every component.
- **`lib/config/roles.ts`** — the role catalogue. Adding rows is
  fine; reordering or changing `canBeAddedLater: true` is a
  doctrine-level change.
- **Append-only schema for `chat_messages`, `journal_entries`,
  `work_proofs`** (doctrine §3.1) — design changes never touch
  these tables.
- **PILOT / DEMO / `<Placeholder>` honesty primitives** — never
  remove or weaken; only extend.
- **The `feat/cc/pilot-draft-flows` branch state** — per the goal's
  "do not touch unrelated current WIP" + owner instruction, that
  branch's WIP stays on its own branch. None of the proposed slices
  will introduce a conflict with the pilot-draft-flows files
  (`dashboard/{agency,company,buyer}/page.tsx`,
  `components/app/pilot-draft-form.tsx`, `lib/pilot/`,
  `supabase/migrations/0016_pilot_drafts.sql`) — see the next-slices
  doc for the slice-by-slice file lists.
- **`isVisionPublic()` flag** — keep flipping it as a separate
  owner-authored one-line PR after smoke passes. Design slices do
  not flip flags.
- **No production DB writes, no migrations, no billing/payment
  changes, no `.env`/secret changes, no service-role grants** —
  out of scope for every design slice.

## 12. Verdict

The visual system is coherent, the honesty primitives are in place,
the doctrine is followed in code, and the role-not-lock-in model is
**already structurally true**. The risks that hold the product back
from feeling premium on first impression are **density, live-cue
inflation, role dashboard asymmetry, and a small set of copy/UX
clarifications** — none requiring a redesign, all addressable in
small per-slice PRs with low rollback risk.

The companion doc `premium-design-next-slices-v1.md` lists 7 such
slices ordered by impact-per-risk.
