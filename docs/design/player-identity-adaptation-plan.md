# Player Identity Adaptation Plan

**Status:** Foundation slice (PR 1). Adaptation layer, **not** a redesign.
**Scope of THIS PR:** docs + an additive shared foundation module + one safe
avatar alignment + a guard. No surface is rebuilt.

> **Binding non-negotiables for the whole adaptation:** this is an *adaptation
> layer*. It keeps existing **routes**, **flows**, **auth**, **DB**, **business
> logic**, and **copy meaning**. It only unifies the **visual + component**
> vocabulary of how a person/company is shown.
>
> - **no DB / no database change, no migration**
> - **no auth change**
> - **no route structure change** (`no route` renames, no new/removed routes)
> - **no business-logic change**
> - **no new avatar system** (reuse the existing `Avatar` / `AvatarDisplay` +
>   `personMonogram`)
> - **no copied external code/design**, and **no external reference names** in
>   any branch / PR / file / test / UI copy (principles only, here, brand-free)
> - **no full redesign in one PR**, no unrelated player-card variants without
>   canonical rules

---

## 1. Core idea

The landing player card becomes the **canonical identity component** — one
`PlayerIdentityCard` model with a fixed set of variants — instead of today's
several bespoke person/company cards that each pick their own avatar size,
fallback colour, initials util and radius.

This is convergence, not replacement: every variant reuses tokens that are
**already** the guard-blessed canonical on the worker player card header and the
market-map marker (`bg-ink-700` + `text-text-primary`, 1px `ink-500` hairline,
`personMonogram` initials). Adopting the foundation can only pull surfaces
together; it cannot introduce a new look.

---

## 2. Where the existing landing player card lives

- **Landing / hero player card:** `apps/web/components/app/player-card.tsx`
  (showcased via `apps/web/components/marketing/player-card-showcase.tsx`).
  collectible-style hero card: 96px portrait, tier corner accents, status badge, stats.
- **Canonical authenticated worker card:** `apps/web/components/app/worker-player-card.tsx`
  (leads the Mano CV / `/dashboard/journal` surface) — `personMonogram`,
  `bg-ink-700`/`text-text-primary` tile, `card-border`, readiness ring, honest
  real counts. **This is the closest thing to the canonical today.**
- **Map marker:** `apps/web/components/app/market-map-live.tsx` builds a marker
  whose fallback tile already references the SAME tokens via CSS variables.

The foundation treats the worker player card header + the map marker fallback as
the **reference tile**, and brings the rest in line with it.

---

## 3. Before → after audit (identity inconsistencies)

| # | Inconsistency (before) | Canonical (after) |
|---|---|---|
| 1 | Avatar fallback tile differs: profile `bg-ink-800`/`text-text-secondary`, card+map `bg-ink-700`/`text-text-primary` | One `PLAYER_IDENTITY_FALLBACK_SURFACE` = `bg-ink-700 text-text-primary` |
| 2 | Two initials utils: `avatarMonogram` (`"?"`) and `personMonogram` (`"•"`) | `playerInitials = personMonogram` is the person-scoped canonical; `avatarMonogram` stays as the generic primitive |
| 3 | Avatar sizes ad-hoc: 40 / 48 / 52 / 56 / 64 / 96 | `PLAYER_AVATAR_PX` fixed scale: marker 52, compact 40, strip 44, header 64, hero 96 |
| 4 | Hairline border repeated as literal `border border-ink-500` per surface | One `PLAYER_IDENTITY_AVATAR_BORDER` |
| 5 | `WorkerCard` visual (`components/visual/worker-card.tsx`) uses a separate **zinc** token system | Documented as a **follow-up** migration to ink/brand tokens (NOT touched in PR 1) |
| 6 | Map marker styles are inline HTML strings | Documented follow-up: drive marker tile from the shared surface constant |
| 7 | Landing `PlayerCard` uses a raw `<Image>` with no monogram fallback | Documented follow-up: route its fallback through `playerInitials` |

**This PR fixes #1 (+ adopts #2/#4 names in the shared avatar) and lays the
foundation (#3) + records #5/#6/#7 as explicit follow-ups.** Nothing is
rewritten.

---

## 4. Canonical `PlayerIdentityCard` anatomy

One identity model. Each field is optional per variant; nothing is fabricated —
every value is a real, owner-consented signal or it is omitted.

- **Avatar** — consented photo, else `playerInitials` monogram on the canonical
  tile. Never a synthesised face. Size from `PLAYER_AVATAR_PX`.
- **Name** — `font-display`, `text-text-primary`.
- **Role / sector** — `text-text-secondary` / `text-text-muted`.
- **Location / preferred markets** — neutral chip; omitted if unset.
- **Trust / verification status** — silent-trust: the gold `trust-ring` appears
  only for an actually-confirmed work card; no badge invented for the map.
- **Skills / work signals** — real counts only (self-declared vs
  journal-supported vs manager-verified kept distinct, per existing honesty
  guard).
- **Availability** — status pill only for an actual state.
- **Company relation** — optional line; omitted if none.
- **Primary action** — one scarce CTA (or none).

### Variants (the only allowed identity surfaces)

| Variant | Surface | Avatar | Typical fields |
|---|---|---|---|
| `hero` | public landing / market hero | hero 96 | name, role, signals, one CTA |
| `profile` | owner profile (editable avatar) | header 64 | avatar (upload), name, role |
| `cv-header` | Living CV / Mano CV header | header 64 | name, role, readiness, availability, skills |
| `work-strip` | work-record / journal entry strip | strip 44 | avatar, name, role |
| `dashboard-compact` | authenticated dashboard card | compact 40 | name, role, one signal |
| `map-marker` | market-map marker + hover card | marker 52 | avatar/initials, name, role, neutral status |
| `request-provider` | marketplace request / provider card | compact 40 | provider/requester name, status pill |

Adding an identity surface = pick a variant + its field set. **No bespoke card.**

---

## 5. Zone principles (applied as surfaces adopt the foundation)

**Public / landing zone** — keep the existing landing structure; the player card
is the clear market-identity centre. Cinematic, hard-edge; one clear accent
colour; no random gradients/shadows.

**Authenticated / dashboard zone** — dark control-room logic: compact panels,
1px borders, one consistent card radius (`card-border` → 18px / `radii.lg`),
tabular numerals for hours / rates / counts / signals, status pills only for
real states.

**Market map** — the marker is a simplified `PlayerIdentityCard` (`map-marker`
variant). Avatar/initials use the SAME system as the profile / player card; the
click/hover card shows the same identity model, not a separate popup. (Already
true for initials + tile tokens; the follow-up removes the inline-HTML drift.)

---

## 6. What THIS PR changes

- `apps/web/lib/identity/player-identity.ts` — **new**, additive foundation:
  `PLAYER_IDENTITY_VARIANTS`, `PlayerIdentityVariant`, `PLAYER_AVATAR_PX`,
  `PLAYER_IDENTITY_FALLBACK_SURFACE`, `PLAYER_IDENTITY_AVATAR_BORDER`,
  `playerInitials` (= `personMonogram`). Pure constants/types; no JSX, no I/O.
- `apps/web/components/app/avatar-display.tsx` — adopts the shared border +
  fallback surface, so the profile monogram tile matches the card + map
  (`bg-ink-800`/`text-text-secondary` → canonical `bg-ink-700`/`text-text-primary`).
  Keeps `avatarMonogram` + the monogram testid (honesty guard unchanged).
- `apps/web/lib/guards/player-identity-foundation.test.ts` — **new** guard
  pinning the contract + the avatar adoption + this doc.
- `docs/design/player-identity-adaptation-plan.md` — this plan.

No component is rebuilt; the only rendered change is the profile avatar fallback
tile colour, aligning it to the existing canonical.

---

## 7. Surfaces intentionally left UNCHANGED in this PR

- Landing `player-card.tsx` + `player-card-showcase.tsx` (extraction/adaptation
  is a follow-up).
- `worker-player-card.tsx` (already canonical; untouched).
- `market-map-live.tsx` marker rendering (initials/tokens already match; the
  inline-HTML refactor is a follow-up).
- `components/visual/worker-card.tsx` (zinc token migration is a follow-up).
- `marketplace-loop-section.tsx` (no identity rendered today; the
  `request-provider` variant is planning-only here).
- Dashboard, profile-page layout, CV, journal, company, candidates/talent/admin
  layouts — **structure, routes, copy and data untouched.**

---

## 8. Confirmation

- **No DB / no migration.** No schema, RLS, RPC, or data change.
- **No auth change.** No `no auth` policy, session, or gate change.
- **No route change.** No route added, removed, or renamed.
- **No business-logic change.** Server actions, flows and validation untouched.
- **No copy-meaning change.** No UI string added/removed in this PR (so no i18n
  parity impact); the avatar change is a CSS-class alignment only.

---

## 9. Source notes (principles only)

External references were used **only** as principle sources — design-token
discipline, spacing/radius logic, card + surface hierarchy, CTA scarcity,
dashboard density, and avatar/player-card behaviour. No external code, layout,
asset, text, class name, component, or brand/product name is copied or referenced
anywhere in the product, files, tests, or commits. The principles are recorded
here in the abstract so the team shares the intent without importing anyone's
identity.
