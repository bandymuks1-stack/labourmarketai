# Catalogue-Driven Primary Nav v1

> The primary nav is a side effect of the feature catalogue, not a
> hand-maintained list. Adding, renaming, hiding or reordering a tab
> happens at the catalogue level — never inside a renderer.

## Why this exists

Before PR #37, the four primary-nav tabs lived in two hand-listed
arrays (one in `BottomNav`, one in `DashboardTabs`). They encoded the
same routes + labels in two places. Adding a future tab — e.g. a
freelancer surface — meant editing both components AND remembering to
keep them in sync with the feature catalogue.

After PR #37, the tabs are generated from
`apps/web/lib/config/feature-availability.ts` via
`apps/web/lib/config/navigation.ts`. The renderer components are thin —
they translate catalogue rows into JSX.

## How it flows

```
feature-availability.ts
  └─ FEATURES: readonly FeatureConfig[]
        └─ getVisiblePrimaryFeatures()
              └─ filter: availability === "active"
                       && safeToShowInPrimaryNav === true

navigation.ts
  └─ TAB_META: Partial<Record<FeatureKey, { tabLabelKey, iconKey }>>
  └─ getVisiblePrimaryNavItems()
        └─ for each visible primary feature
            └─ if TAB_META has a row for it
                └─ push NavItem { id, href, tabLabelKey, iconKey }
  └─ VISIBLE_PRIMARY_NAV_ITEMS: readonly NavItem[]   ← module-level frozen snapshot

BottomNav.tsx + DashboardTabs.tsx
  └─ import VISIBLE_PRIMARY_NAV_ITEMS
  └─ map ICON ids to lucide components (local presentation concern)
  └─ render <Link> per item
```

The TWO-step gate is intentional:

1. `safeToShowInPrimaryNav: true` in the catalogue declares the
   feature is the kind of thing that *could* be a tab.
2. `TAB_META` in `navigation.ts` then has to opt-in with a short label
   key + an icon.

That way a future feature can opt into being a primary surface (data)
without immediately deciding what it looks like in nav (presentation).

## Adding a future tab

Suppose freelancer workspaces ship. To add a freelancer tab:

1. `feature-availability.ts` — either promote the existing
   `service_offers` row, or add a fresh `freelancer_workspace` row, to
   `availability: "active"` AND `safeToShowInPrimaryNav: true`. Set
   `primaryRoute`.
2. `navigation.ts` — add `{ tabLabelKey, iconKey }` to `TAB_META` for
   that key.
3. `messages/{lt,en}.json` — add the short tab label under
   `auth.dashboard.tabs.<id>` and the long feature label under
   `features.<id>.*`.
4. Build the actual page under `app/[locale]/dashboard/<route>/`.

No component edits required. `BottomNav` + `DashboardTabs` pick it up
automatically.

## Removing or temporarily hiding a tab

Two options:

- Flip the row's `availability` to `"preparing"` or `"hidden"` — the
  catalogue + nav drop it automatically. The route can still exist as
  an honest preparing page.
- Or flip `safeToShowInPrimaryNav: false` — the route stays accessible
  but the tab is gone.

Either way, the visible nav updates on next reload. No deploy gymnastics.

## Reordering tabs

The order of tabs is the order of `safeToShowInPrimaryNav: true` rows
in `FEATURES`. Reordering = moving the row up or down in
`feature-availability.ts`. The `VISIBLE_PRIMARY_NAV_ITEMS` snapshot
reflects the new order on next build.

## What the renderers still own

- Active-state highlighting class (`text-brand-orange` on mobile,
  `bg-ink-700` on tablet/desktop).
- Layout (4 evenly-spaced fixed bottom nav vs horizontal pill row).
- Icon library choice (`lucide-react`).
- The `iconKey → lucide component` mapping. There's a small chance a
  future tab needs an icon we haven't imported; that's a one-line edit
  in both `BottomNav` and `DashboardTabs` — but only because lucide
  components themselves are presentation concerns. The CATALOGUE only
  knows the icon key string.

## Guard invariants

`apps/web/lib/guards/product-readiness.test.ts` adds 6 assertions:

1. `navigation.ts` derives tabs from `getVisiblePrimaryFeatures()` AND
   exposes `VISIBLE_PRIMARY_NAV_ITEMS` + `TAB_META`.
2. `BottomNav` + `DashboardTabs` import `VISIBLE_PRIMARY_NAV_ITEMS` AND
   no longer carry a hardcoded `const TABS = …` array.
3. The four tab features are exactly `{overview, profile_text_first,
   journal_text_first, account_roles}` — adding a fifth requires a code
   review touch on this assertion.
4. The `overview` feature row exists with `availability: "active"` AND
   `safeToShowInPrimaryNav: true`.
5. Every key that has a `TAB_META` row also has `availability:
   "active"` in the feature catalogue.
6. LT + EN expose the new `overview` feature label.

## What this enables

- Future PRs can ship a new role-flavoured surface (`freelancer_workspace`,
  `team_lead_workspace`, …) by flipping rows in two config files. No
  renderer edits, no design regression risk.
- The honest "this is preparing" / "this is hidden" rules are enforced
  by the catalogue, not by ad-hoc nav logic — so a moment of weakness
  can't accidentally surface a broken tab.
- The audit trail of why a tab exists is now legible: it's one row in
  one file, with a description + a label + an availability.

## What it does NOT change

- The DB. No schema, no migrations, no RLS.
- The auth flow. The dashboard layout still redirects unauthenticated
  users to `/auth/login?next=…` exactly as before.
- The four tabs the user sees today. They are visually identical to v1.
- The PR #30 production smoke status (still PENDING).
