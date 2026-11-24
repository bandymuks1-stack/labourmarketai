# PR-D1 — Player Card Variant Adoption (implementation note)

**Date:** 2026-06-29 · **Type:** UI-only, one-path · **Owner rule:** no merge, no
production deploy, no DB/auth/route/matching changes. PR opened for owner review only.

Binding context: `docs/product/design-control-formula-v1.md` (§4 Player Card),
`runtime/audits/design-control-formula-source-audit-v1.md` (PR-D1 = variant
adoption, "the gap is adoption, not rebuild").

---

## Source-grounded audit (written before any edit)

- **Route/screen selected:** `/dashboard` — the worker overview, the FIRST
  authenticated identity surface a tester sees after login
  (`app/[locale]/dashboard/page.tsx`, worker branch).
- **Component currently rendering the identity surface:** `components/app/work-card.tsx`
  ("Mano darbo kortelė"). Today its header is a **bare text greeting** (`t("greeting",
  {name})`) + eyebrow + the five dimension rows. It renders **no avatar / no player
  identity tile** — so the dashboard identity looks unlike the profile and CV.
- **Canonical Player Card model already available:**
  - `lib/identity/player-identity.ts` — tokens: `playerInitials`, `PLAYER_AVATAR_PX`,
    `PLAYER_IDENTITY_FALLBACK_SURFACE` (`bg-ink-700 text-text-primary`),
    `PLAYER_IDENTITY_AVATAR_BORDER` (`border border-ink-500`), variant taxonomy
    (incl. `dashboard-compact`).
  - `components/app/avatar-display.tsx` — the shared `AvatarDisplay` that **already
    consumes** those tokens (photo→signed URL, else honest initials monogram). It is
    the SAME tile used by the profile avatar and the map-marker fallback.
- **Exact drift being removed:** the dashboard's primary identity card presents the
  person as plain greeting text while profile/CV/map present a canonical avatar tile.
  PR-D1 converges the WorkCard onto the canonical identity header (avatar tile + name
  + role) using the existing `AvatarDisplay` — formula §4 "Standard card — dashboard/
  profile". No new identity component, no new data model.
- **Why this path first:** the dashboard is the first walkthrough screen; making its
  identity card the canonical Player Card is the highest-leverage single change to
  make the product "feel like one system" before the evening walkthrough.
- **Explicitly out of scope (not touched):** `lib/identity/*` (contract unchanged),
  `lib/player-card/*` (data dims/readiness unchanged), `buildPlayerCardMinimum`,
  profile page identity, `/cv` builder, market map, opportunities matching, any DB/
  RLS/RPC/auth/route/middleware/billing. No new readiness/completion model.

## What is implemented

1. `components/app/work-card.tsx` — new optional `avatarUrl?: string | null` prop; the
   header now leads with a canonical identity row: `AvatarDisplay` (size `md`) +
   greeting/name + the worker's profession as the role line ("who am I here"). The
   existing intro, dimension snapshot, next action, editor and employer preview are
   unchanged. Answers §3: identity (avatar+name+role) → known/missing (dimension
   rows) → next action (editor) → result.
2. `app/[locale]/dashboard/page.tsx` — worker branch fetches the avatar via the
   existing `getOwnAvatar()` (RLS-scoped read; no DB/RPC change) and passes
   `avatarUrl` into `<WorkCard>`. No other change.
3. `lib/guards/work-card-player-identity.test.ts` — small focused guard pinning that
   the WorkCard renders the canonical `AvatarDisplay` (protects the adopted contract
   from silent regression). No scope expansion.

## Data / actions preserved

- Identity uses only existing data (`data.name`, `data.professionName`, the avatar
  signed URL from `getOwnAvatar`). No new fetch architecture, no model change.
- All existing tap targets (next-action editor, employer preview, stale confirm)
  unchanged and functional. No fake/demo content. LT/EN/RU copy unchanged (no new
  user-facing strings — the avatar is visual; role reuses the existing profession
  label).

## Validation

`pnpm -F web typecheck` · `pnpm -F web lint` · `pnpm -F web build` · focused tests —
results recorded in the PR.

## Boundary found → later PR

- A true `dashboard-compact` 40px avatar size would mean adding a `compact` size to
  `AvatarDisplay`; deferred to keep this PR minimal. The standard `md` tile is the
  canonical identity tile and is sufficient. (Candidate for a later polish PR, not
  required here.)
