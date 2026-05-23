# Feature Availability & Non-Locking Dashboard v1

> A dashboard that adapts to what the same person becomes over time —
> without lying about which capabilities are real today.

This doc explains why `apps/web/lib/config/feature-availability.ts` exists,
how shared dashboard surfaces consume it, and the rules future PRs follow
when adding a new role, activity, or feature.

## 1. Why feature availability config exists

Until PR #36, every dashboard surface decided on its own whether a CTA
should render, what wording to use, and whether to badge something as
preparing. That worked while we had three buttons; it stops working the
moment we want to honestly show a company / agency / customer person
that "your workspace is coming". Without a catalogue, every new feature
required edits in 5+ files and the honesty rules drifted.

`feature-availability.ts` is the canonical place where each product
feature is declared with:

- a stable `key`,
- localized `label` + `description` keys,
- an `availability` (`"active" | "preparing" | "hidden"`),
- an optional `primaryRoute` (the destination when active),
- an optional `preparingReasonKey` (the "why is this preparing?" line),
- a `safeToShowInPrimaryNav` flag.

Pages consult `getFeatureConfig` / `isFeatureActive` / `isFeaturePreparing`
/ `getVisiblePrimaryFeatures` instead of duplicating these decisions.

## 2. Difference between active, preparing, and hidden

| State | What it means | Example | UI behaviour |
| --- | --- | --- | --- |
| `active` | Feature is shipped, the user can actually use it today. | `profile_text_first` | May appear as a primary-nav item (if `safeToShowInPrimaryNav: true`), as an active dashboard card, or as a navigating CTA. |
| `preparing` | Feature is real product direction, openly admitted as not built yet. | `company_workspace` | Renders as a dashboard card with the `RUOŠIAMA` chip + `preparing_generic_reason` line. **No navigating CTA.** Never in primary nav. |
| `hidden` | Feature is explicitly out of scope for now. | `matching`, `marketplace` | Catalogue row exists so the honesty guard has a canonical home; UI does not render the row. Flipping it to `"active"` without shipping real behaviour fails the guard. |

## 3. Active features today

- `profile_text_first` → `/dashboard/profile`
- `journal_text_first` → `/dashboard/journal`
- `account_roles` → `/dashboard/account`

These three are the only `availability: "active"` rows. The guard test
asserts this.

## 4. Preparing features today

- `role_expansion`
- `external_confirmation`
- `company_workspace`
- `agency_workspace`
- `customer_workspace`
- `document_records`
- `team_offers`
- `work_needs`
- `service_offers`

Each renders inside `<FeatureAvailabilityGrid>` with the preparing chip.
None has a navigating CTA. Adding UI for any of them is a one-row flip
plus the matching composer / surface code.

## 5. Why preparing features must not look clickable / usable

Three reasons, in priority order:

1. **Honesty.** PLATFORM_DOCTRINE §7 — the platform's whole value
   proposition is that nothing on it is fake. A clickable button that
   leads nowhere or to a stub page is a small lie, and it's the kind of
   lie that compounds.
2. **First impressions.** The closed-beta cohort is small and engaged.
   If a worker taps "Company workspace" and gets a blank page, they
   stop trusting every other surface on the platform too.
3. **Future readability.** A preparing chip is a free piece of product
   documentation for everyone who sees the dashboard. It tells users
   what's coming without us needing a roadmap page.

The guard at `apps/web/lib/guards/product-readiness.test.ts` checks that
the grid component has exactly one `<Link>` and that the `<Link>` sits
inside the `active && f.primaryRoute ? (...)` ternary.

## 6. How future roles / features should be added

To enable a future role:

1. **Role config** — flip the row in `lib/config/roles.ts` from
   `availability: "hidden"` to `"preparing"` (or `"active"` once the
   real flow ships). Add an i18n label under `auth.signup.role.<id>`.
2. **Feature config** — add (or update) the row in
   `lib/config/feature-availability.ts` for the matching capability
   (e.g. `freelancer_workspace`). Provide `labelKey` + `descriptionKey`
   in LT + EN.
3. **Copy** — add the i18n strings; existing surfaces (role switcher,
   account list, feature grid) pick them up automatically.
4. **Route** — if the role gets its own dashboard surface, add it under
   `app/[locale]/dashboard/<role>/` AND register it in
   `lib/config/navigation.ts` with the matching `availability`. If
   nothing exists yet, leave `primaryRoute` unset — the grid renders a
   honest preparing card.

**Do not hardcode one-off role buttons in page components.** A new role
should never require touching `<RoleSwitcher>`, `<DashboardFirstUsePanel>`
or the worker dashboard directly. If you find yourself adding `if (role
=== "freelancer")` to a page, that's a sign the config is missing a row,
not that the page needs a special case.

## 7. Why the first role is not a user lock

A person is not one fixed category — they can be a worker, founder,
freelancer, customer, agency partner, learner, all of these over time.
The product reflects this:

- Onboarding multi-select.
- `auth.dashboard.account.rolesIntro` paragraph on the account page AND
  inside the role switcher menu: "Šiandien galite pradėti kaip
  darbuotojas, bet tai neužrakina jūsų viename vaidmenyje…"
- Every role catalogue row carries `canBeAddedLater: true`.
- The new feature grid lists all preparing role-flavoured workspaces
  (`role_expansion`, `company_workspace`, `agency_workspace`,
  `customer_workspace`) so the path to "more later" is visible from the
  worker dashboard itself.

## 8. How this supports fast future changes

The patterns above are the actual cost of adding a new feature:

| Change | Today's effort |
| --- | --- |
| Promote a preparing feature to active | One row in `feature-availability.ts` + add a `primaryRoute` + ship the page. |
| Add a brand-new feature | Add a row in `feature-availability.ts` + LT + EN labels. The grid renders it as preparing automatically. |
| Add a brand-new role | One row in `roles.ts` + LT + EN labels. The role switcher and account roles list pick it up. |
| Rename a feature / role | Edit the LT + EN label keys. No code touches required. |
| Hide a feature from beta | Flip `availability` to `"hidden"`. The grid stops rendering it. |

## Example: enabling a `freelancer` role later

1. `lib/config/roles.ts` — flip the `freelancer` row from `"hidden"` to
   `"preparing"`. Optionally add `primaryRoute: "/dashboard"` once a
   freelancer surface ships.
2. `lib/config/feature-availability.ts` — add a `freelancer_workspace`
   key with `availability: "preparing"`, label + description keys.
3. `messages/lt.json` + `messages/en.json` — add the label / description
   strings under `auth.signup.role.freelancer` and
   `features.freelancer_workspace.*`.
4. Profile pages, role switcher, account list, feature grid — no code
   changes. They pick it up.

When the real freelancer surface ships:

5. Promote the row to `"active"` in both `roles.ts` and
   `feature-availability.ts`, set `primaryRoute`, set
   `safeToShowInPrimaryNav: true` if it deserves a tab, and add the
   actual page under `app/[locale]/dashboard/freelancer/`.

That's the entire workflow. No scattered edits.
