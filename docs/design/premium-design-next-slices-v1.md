# Premium Design — Next Implementation Slices v1

> **Status:** Recommended queue. NOT auto-execute. Owner picks the next slice.
> **Branch model:** Each slice = one `feat/cc/<short-name>` branch + one PR (per CLAUDE.md branch strategy).
> **Companion:** `premium-design-map-v1.md` (audit + map).

Each slice below is sized so a single PR can complete and validate it
in one session without touching the protected surfaces listed in §11
of the design map. None of the slices flip `isVisionPublic()`, run
migrations, change billing, mutate `.env`, change service-role grants,
introduce fake AI / matching / verification, or touch the
`feat/cc/pilot-draft-flows` WIP.

## How to pick the next slice

The slices are ordered by **expected first-impression impact per
rollback risk**. Start at Slice 1 unless the owner has a reason to
prefer another. Each slice can ship independently — they do not
depend on each other.

---

## Slice 1 — Landing premium first-impression cleanup

**Goal.** Reduce the landing page from 8 sections to ~5 strong
sections so first-time visitors form a single coherent impression of
"premium work-market operating system" instead of "many demo
surfaces stacked".

**Files likely touched (all under `apps/web/`):**
- `app/[locale]/(marketing)/page.tsx` — section reorder + section
  removal. No new components.
- `messages/{en,lt,...}.json` — `hero.*`, `secondary.*`,
  `market.*`, `journey.*` key tightening (10 locale files; English
  authored, the other 9 may stay as `[EN] <english>` placeholders
  per doctrine §2.4 until human translation lands).
- Optionally `components/marketing/cta-band.tsx` for an end-of-page
  honest CTA-band that replaces the existing testimonial block when
  there's no real testimonial.

**Safety boundaries.**
- Do NOT touch `<LiveMap>`, `<DraftBoard>`, `<MarketPulse>`,
  `<PlayerCardShowcase>` source — they remain protected. The slice
  only reorders / hides their *usage* on the landing.
- Keep the journey rail (it's the visual continuity into the
  authenticated dashboard).
- Keep every `<Placeholder>` marker; never replace placeholder data
  with invented data.
- Do NOT remove the `<MarketCounters>` + `<MicroActivityFeed>` —
  defer their de-densification to a separate slice if needed.

**Acceptance checks.**
- Landing renders one hero block + one journey band + one anchor
  showcase (Player card OR Draft board, owner picks) + one honest
  market-intel band + one CTA / waitlist band. ≤ 5 below-the-fold
  sections.
- All visible data still tagged `Sample` / `Demo` / `<Placeholder>`
  where it isn't real.
- No copy claims "AI matches you" / "verified by AI" / "trusted by
  N companies" until real data backs it.
- 10 locale JSON files updated together (or `[EN] <english>`
  placeholders added) — doctrine §2.4.

**Visual / manual checks.**
- 360 × 640 (Chrome Mobile small): hero fits without horizontal
  scroll; first CTA reachable in one thumb scroll.
- 1440 × 900 (typical desktop): hero `LiveMap` reads as the visual
  anchor; no section feels duplicate of another.
- Inspect Lighthouse Accessibility ≥ 95 on the landing.

**Rollback risk.** Low. The slice is content reorder + section
hides. `git revert` returns to the original landing instantly. No
schema, no DB, no auth path touched.

---

## Slice 2 — Role-entry-is-not-lock-in copy + UX clarification

**Goal.** Make the platform's "you can grow into more roles later"
promise loud and felt during onboarding AND in the dashboard role
switcher, so a first-time visitor never feels trapped in their
initial role pick.

**Files likely touched:**
- `components/app/onboarding-wizard.tsx` — surface the
  "multiNote" text inside step 1 above the role cards (not below);
  add a small persistent "you can add more workspaces anytime"
  ribbon. Keep the multi-select behaviour as-is.
- `components/app/role-switcher.tsx` — invitational empty state
  for missing-roles section ("Add a workspace — workers also run
  agencies / companies also buy services"). Replace functional
  text with portfolio-of-roles framing.
- `app/[locale]/dashboard/page.tsx` (the **Header** const around
  line 119) — flip the order to `name greeting first`, then
  workspace chip below; promote the chip to mention "workspace,
  not identity".
- `messages/{en,lt,...}.json` — `auth.onboarding.rolePicker.*`,
  `auth.roleSwitcher.*`, `auth.dashboard.greeting`.

**Safety boundaries.**
- Do NOT modify `lib/config/roles.ts` (the catalogue itself stays).
- Do NOT change `requireRoleOrRedirect` or any server-side auth
  gating. UI/copy only.
- No change to `profile_roles` table schema or to the role-add /
  role-switch server actions.

**Acceptance checks.**
- A first-time user sees the multi-role promise in onboarding
  step 1 BEFORE picking a card.
- Role-switcher dropdown empty state (single-role user) shows an
  invitational add-role line.
- The dashboard greeting reads `Hello, {name}` larger than the
  role chip; chip uses "workspace" framing.
- All 10 locale files carry the new keys.

**Visual / manual checks.**
- Onboarding wizard step 1 on mobile: multi-note legible above the
  fold of the role cards.
- Dashboard header on mobile: greeting fits one line; chip wraps
  beneath without overflow.

**Rollback risk.** Low. Copy + small JSX reorders. No data layer
touched.

---

## Slice 3 — Dashboard shell visual hierarchy cleanup

**Goal.** Tighten the authenticated header so the most important
controls (role switcher, notification panel) are visually primary
on mobile, and the brand wordmark + locale switcher are secondary.

**Files likely touched:**
- `app/[locale]/dashboard/layout.tsx` — the `<header>` block.
- `components/app/role-switcher.tsx` — small visual hierarchy
  adjustments (no behaviour change).
- `components/app/dashboard-tabs.tsx` — the desktop-only tab strip.

**Safety boundaries.**
- Do NOT change which server-side props the layout reads
  (`user`, `profile`, `roles`, `isAdmin`).
- Do NOT remove the admin badge separation from the workspace
  switcher.
- Do NOT change the notification panel's data source.

**Acceptance checks.**
- On 360 × 640 mobile, header height stays ≤ 56px and contains:
  brand · spacer · notification icon · role switcher (icon-only
  on `< sm`). Locale switcher hides on mobile (already does);
  consider a footer-locale link if non-EN users surface a need.
- On `md+` desktop, header includes the tabs strip and locale
  switcher inline.
- Bottom-nav clearance (`pb-[calc(5rem+env(safe-area-inset-bottom))]`)
  preserved.

**Visual / manual checks.**
- Toggle locale → verify the locale switcher round-trips.
- Switch role → verify the role chip updates and the route
  navigates to the role-specific dashboard.

**Rollback risk.** Low to medium. Header changes touch every
authenticated screen — manually smoke-test 5+ routes after the
edit. No data layer touched.

---

## Slice 4 — Role dashboard density parity

**Goal.** Bring the agency / company / buyer dashboards closer to
the worker dashboard in informational density so they don't feel
abandoned. Honest content only — no fake matching, no fake
counts.

**Files likely touched:**
- `components/app/role-dashboard.tsx` — extend the shared shell
  with 1-2 optional sections: a "what's coming next" honest
  preparing-features list (using the existing
  `<FeatureAvailabilityGrid>` config) + a "what you can do today"
  section listing real existing actions (Pilot request,
  profile-link, journal access if applicable to the role).
- `app/[locale]/dashboard/{agency,company,buyer}/page.tsx` — pass
  the new optional props.
- `messages/{en,lt,...}.json` — `roleDashboards.{agency,company,buyer}.*`
  for the new section copy.

**Safety boundaries.**
- Do NOT add fake matching, fake leads, fake counts.
- Do NOT remove or weaken the PILOT disclaimer.
- Do NOT add new server actions or DB reads in this slice — read
  only what the shared shell already needs.
- **CONFLICT NOTE:** the `feat/cc/pilot-draft-flows` WIP also
  touches `dashboard/{agency,company,buyer}/page.tsx`. This slice
  is safe to author on `feat/cc/premium-design-v1` but the operator
  must coordinate the merge order — see "Conflict coordination"
  below.

**Acceptance checks.**
- Each role dashboard has ≥ 4 sections (header, PILOT
  disclaimer, first action, what's coming, what you can do today)
  without inventing any data.
- The `<FeatureAvailabilityGrid>` rows render with their existing
  honest status (active / preparing / hidden).
- The "what you can do today" section lists only existing real
  routes / actions (profile, journal, pilot request).

**Visual / manual checks.**
- Each role dashboard on mobile: sections stack cleanly; no
  horizontal overflow.
- Each role dashboard on desktop: 2-column where appropriate.

**Rollback risk.** Medium. Touches 3 dashboard files that the
pilot-draft-flows WIP also touches. Mitigation: the WIP is held on
its own branch; merge `pilot-draft-flows` first, rebase this slice
on top, resolve conflicts at the JSX level (additions, not
overwrites). Document the merge order in the slice's PR description.

**Conflict coordination.** If the owner prefers to ship this slice
**before** `pilot-draft-flows` finishes, branch from current
`origin/main`, ship; then the pilot-draft-flows author rebases on
top and resolves the JSX additions. If the owner prefers to ship
`pilot-draft-flows` first, this slice starts from the post-merge
main.

---

## Slice 5 — Profile / skills evidence trust-language pass

**Goal.** Audit and tighten the trust language on the profile and
skills surfaces so the user sees explicit
"self-declared / supported / confirmed" tiers, matching doctrine
§7.1 (AI as translator, not author) + §15 (confidence_score +
confidence_bin, with "industry-typical, not platform-measured"
framing on aggregates).

**Files likely touched:**
- `app/[locale]/dashboard/profile/page.tsx` — read pass.
- `components/app/capability-profile-section.tsx` — trust-tier
  badges + copy.
- `components/app/cv-preview.tsx` — same.
- `components/app/profile-text-first-flow.tsx` — same.
- `components/app/skills-demand-list.tsx` — confidence-bin
  surfacing.
- `messages/{en,lt,...}.json` — `skills.trust.*`,
  `skills.benchmarks.industryTypical`, similar.

**Safety boundaries.**
- Do NOT change the `worker_skills` schema or its triggers.
- Do NOT change `journal_entries` schema (append-only, hash chain).
- Do NOT add UI that mutates `confidence_score` / `confidence_bin`
  from user input — they are derived server-side.
- AI extraction copy must say "AI suggests, you confirm" — never
  "AI confirms" / "AI verifies".
- Aggregates fed by manager-confirmed entries must carry the
  "industry-typical, not platform-measured" caveat when sample
  size is below the doctrine threshold.

**Acceptance checks.**
- Every skill card surface shows one of: `self-declared`,
  `supported`, `confirmed`. No skill renders without a tier.
- AI-suggestion flow always renders "AI suggests — you confirm"
  before persisting.
- Industry benchmarks render the "industry-typical, not
  platform-measured" caveat below the value.
- Confidence bin (red / yellow / green) renders for the worker's
  own view only (private self-progress motivator); external views
  hide it.

**Visual / manual checks.**
- Walk the profile page as a real worker user; confirm every
  numeric or boolean trust marker has matching framing copy.
- Toggle locale → confirm the trust copy is translated (or
  bracketed as `[EN]` placeholder per doctrine §2.4).

**Rollback risk.** Low to medium. Copy + UI surface changes; no
schema or trigger changes. If a regression surfaces, `git revert`
clears it instantly.

---

## Slice 6 — Mobile comfort pass for main pilot routes

**Goal.** Walk the main pilot routes (landing, login, signup,
onboarding, /dashboard, /dashboard/profile, /dashboard/journal,
/dashboard/{company,agency,buyer}) on a real 360 × 640 viewport and
fix the small mobile-UX papercuts (CTA-overlap with bottom-nav,
header crowding, form field tap-target sizes < 44 × 44, modal
height fits).

**Files likely touched:**
- Targeted JSX padding / `min-h` / `pb-*` adjustments in
  individual pages and components.
- `components/app/bottom-nav.tsx` — verify `safe-area-inset-bottom`
  handling.
- `components/ui/Button.tsx` / `Input.tsx` — verify minimum tap
  targets (`min-h-[44px]` etc.) if not already enforced.
- `components/ui/MobileSheet.tsx` — verify modal scrolling.

**Safety boundaries.**
- No new components, no new design tokens, no schema or DB
  changes.
- No copy changes (those are owned by Slices 1, 2, 5).
- No animation additions — premium tone keeps motion restrained.

**Acceptance checks.**
- Each route renders without horizontal scroll at 360 × 640.
- Every interactive element (button, link, icon, input) has a tap
  target ≥ 44 × 44.
- No CTA is hidden behind the bottom-nav on any pilot route.
- No modal cuts off content on a 568px-tall viewport (smallest
  legacy iPhone).

**Visual / manual checks.**
- Chrome DevTools mobile emulation: iPhone SE, Pixel 5, iPad Mini.
- (Optional) Real device sweep if the operator has one available.

**Rollback risk.** Very low. Per-file Tailwind class adjustments;
each change is independently revertable.

---

## Slice 7 — Vision page premium surface (the system map)

**Goal.** Once the `isVisionPublic()` flag is flipped to `true` by
the owner in a separate one-line PR, polish `/vision` so the
`<LabourMarketOsMap>` is the strongest "About / How it works"
anchor on the brand site. Add a clear journey-into-product CTA at
the bottom.

**Files likely touched:**
- `app/[locale]/(marketing)/vision/page.tsx` — page wrapper +
  CTA band addition.
- Possibly extend `components/marketing/labour-market-os-map.tsx`
  with optional section anchors so the catalogue is scrollable on
  mobile.
- `messages/{en,lt,...}.json` — `vision.*` keys.

**Safety boundaries.**
- Do NOT flip `isVisionPublic()` in this slice — that's a separate
  owner-authored PR after smoke passes (per the existing repo
  convention).
- Do NOT change the catalogue source (`lib/config/feature-availability.ts`,
  `lib/config/roles.ts`, `lib/config/activity-types.ts`).
- Do NOT add a CTA that pretends to be a feature that isn't yet
  active in the catalogue.

**Acceptance checks.**
- `/vision` renders the workflow strip + features × roles ×
  activity types grouped by availability, with `active` /
  `preparing` chips matching the source state.
- Bottom of the page has an honest CTA: "Pradėk įsijungti į
  platformą" (Start engaging with the platform) → `/auth/signup`,
  framed as joining a pilot, not as a launched product.
- All 10 locale JSON files carry the new vision copy keys.

**Visual / manual checks.**
- Open `/vision` on mobile; confirm catalogue sections scroll
  without horizontal overflow.
- Open on desktop 1440px; confirm the system map reads as a
  single coherent surface.

**Rollback risk.** Low. The page renders behind a flag while
that flag stays `false`; visible to a smoke run only when the
operator flips the flag.

---

## Off-list / explicitly NOT in this queue

These are tempting but excluded from v1 of the queue per the goal:

- **A redesign of `<LiveMap>` or `<LabourMarketOsMap>`** — protected.
- **A new design-token palette** — the current Industrial Intelligence
  palette is coherent and tested. Adding a token is fine in a slice;
  replacing the palette is not.
- **Switching emoji role icons to a Lucide / Phosphor sprite** —
  worth doing eventually but it's a cross-cutting visual change
  better as its own dedicated v2 slice after slices 1-6 land.
- **Replacing the journey rail with a different progress
  visualisation** — the journey rail is shared between landing and
  dashboard; keep it as the visual continuity anchor.
- **Adding Telegram / Slack / email delivery for any in-product
  surface** — explicitly out of scope (not a delivery surface
  product).
- **Schema changes, migrations, RLS changes, billing changes,
  `.env` changes, service-role grants** — out of scope for every
  design slice forever.

## Slice ordering summary

| # | Slice | Impact | Risk | Conflicts with pilot-WIP |
|---|---|---|---|---|
| 1 | Landing first-impression cleanup | high | low | no |
| 2 | Role-not-lock-in copy + UX | high | low | no |
| 3 | Dashboard shell hierarchy | medium | low-medium | no |
| 4 | Role dashboard density parity | medium-high | medium | **YES — coordinate merge order** |
| 5 | Profile / skills trust language | medium | low-medium | no |
| 6 | Mobile comfort pass | medium | very low | no |
| 7 | Vision page premium surface | medium | low (flag-gated) | no |

**Recommended order:** 1 → 2 → 3 → 5 → 6 → 7 → 4 (defer 4 until
pilot-draft-flows merges).
