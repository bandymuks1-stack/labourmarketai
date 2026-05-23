# Role Catalogue Driven Surfaces v1

> The labour-market role is a catalogue row, not a hand-written card.
> Adding, renaming, hiding or activating a role happens at the catalogue
> level — never inside a dashboard component.

## 1. Why the role catalogue exists

Before PR #38, role lists lived in multiple places:

- `RoleSwitcher` used `ROLE_BY_ID` (PR #35) but still mapped icons +
  preview chip itself.
- The worker dashboard's `addMore` card carried its own role-neutral
  copy and a single CTA to `/dashboard/account` — no actual role list.
- `/dashboard/account` listed the user's saved roles via `ROLE_BY_ID`
  but didn't expose the FULL catalogue (so a worker never saw "what
  could I add?" right from the dashboard).
- Future roles (`freelancer`, `team_lead`, `service_provider`) lived as
  hidden rows nobody could discover.

After PR #38, `apps/web/lib/config/roles.ts` is the canonical place to
say which roles exist and what state each is in. The new
`<RoleCatalogueGrid>` + `<RoleCatalogueCard>` server components render
the same rows on the dashboard, with the same i18n copy, the same
RUOŠIAMA chip rules, and the same feature-gated link decisions.

## 2. How to add a future role

```
1. Add the row in lib/config/roles.ts:
     id, labelKey, descriptionKey, availability: "preparing" | "hidden",
     entryPoint, canBeAddedLater, primaryFeatureKey?, primaryRoute?,
     preparingReasonKey?, safeToShowInRoleSurfaces, sortOrder.
2. Add LT + EN copy:
     auth.signup.role.<id>      (short label)
     roles.<id>.description     (long description)
3. (Optional) Map to a feature in lib/config/feature-availability.ts
   so a feature gate can later flip the role from preparing → active.
4. Implement the route / flow.
5. Flip availability from preparing → active ONLY after the route
   exists, the matching feature is active, and validation passes.
```

The grid + the role switcher + the account list all pick up the new
role automatically. No component edits.

## 3. How to make a role active

Two-step gate (intentional):

- The role row's own `availability` must be `"active"`.
- The role's `primaryFeatureKey` must point at a feature that is
  itself `availability: "active"` in `lib/config/feature-availability.ts`.

If either fails, `<RoleCatalogueCard>` treats the role as preparing.
That way role / feature honesty stays in lock-step — accidentally
promoting a role doesn't surface a broken Link, because the feature
catalogue still gates rendering.

## 4. How role availability relates to feature availability

Each role row carries an optional `primaryFeatureKey`. The renderer
computes effective availability as:

```
effective = role.availability === "active" && isFeatureActive(role.primaryFeatureKey)
          ? "active"
          : role.availability;
```

Today's mappings:

| Role | Mapped feature key | Effective state |
| --- | --- | --- |
| worker | `profile_text_first` | active (both active) |
| company | `company_workspace` | preparing |
| agency | `agency_workspace` | preparing |
| customer | `customer_workspace` | preparing |
| freelancer | `service_offers` | hidden (catalogue row hidden) |
| team_lead | `team_offers` | hidden |
| service_provider | `service_offers` | hidden |

Promoting a role means promoting BOTH rows. The mapping makes that
explicit — and the guard tests for both catalogues stay simple.

## 5. Why inactive roles must not navigate to broken flows

Three reasons (priority order):

1. **Honesty** — PLATFORM_DOCTRINE §7. The product's whole value
   proposition is that nothing on it is fake. A clickable card that
   leads to a stub page is a small lie.
2. **Trust compounding** — early-cohort users notice the first broken
   button. They stop trusting the rest of the surface too.
3. **Future readability** — a preparing chip + reason line is a free
   piece of product documentation. It tells users what's coming
   without us needing a roadmap page.

The guard test "RoleCatalogueCard renders <Link> only inside the active
branch" asserts there is exactly ONE `<Link>` tag in the component and
it sits inside the `isActive && role.primaryRoute ? (...)` ternary.

## 6. Why the first role is not a lock

A person is not one fixed category — they can be a worker, founder,
freelancer, customer, agency partner, learner, all of these over time.
Three reinforcing places say so today, all reading from the same i18n
catalogue:

- `roles.nonLockingIntro` paragraph above the dashboard role grid.
- `auth.dashboard.account.rolesIntro` paragraph on `/dashboard/account`.
- The same `rolesIntro` line inside the `RoleSwitcher` menu (PR #35).

Every role row carries `canBeAddedLater: true`.

## 7. What is active today

- **worker** — text-first profile, skills, journal, account roles list.
  `primaryFeatureKey: "profile_text_first"`.

That is the only role with `availability: "active"` AND a matching
active feature. The guard test asserts this single-row active set.

## 8. What is preparing today

- **company** → company_workspace
- **agency** → agency_workspace
- **customer** → customer_workspace

All three render the `RUOŠIAMA` chip + `roles.preparingReason.default`
line wherever they appear. Forward-looking roles (`freelancer`,
`team_lead`, `service_provider`) sit as `hidden` rows — they're in
the catalogue so we can talk about them, but UI does not surface them
yet.

## 9. What must NOT be faked

The PR #31 / #36 honesty guards apply unchanged:

- No `verified` badge on user-declared roles.
- No fake matching / scoring / ranking / trust score / automatic
  approval anywhere in the role surfaces.
- The `externally_confirmed` suggestion status remains preparing — UI
  must not render it for arbitrary records.

The new role guards extend the list:

- Only `worker` is `availability: "active"`. Future PR that flips a
  second role must also touch this assertion + the matching feature
  catalogue.
- Role label + description fields contain only i18n keys (no raw
  English / Lithuanian sentences).

## 10. How this keeps the system easy to change

| Change | Today's effort |
| --- | --- |
| Add a future role (still preparing) | Add a row in `roles.ts` + LT + EN copy. The grid renders it. |
| Promote a preparing role to active | Flip the row's `availability` AND make sure its `primaryFeatureKey` row is also active. Renderers pick up automatically. |
| Hide a role from beta | Flip `availability` to `"hidden"`. The grid stops rendering it. |
| Rename a role | Edit the LT / EN label / description keys. No code edits. |
| Reorder roles | Adjust `sortOrder` on the rows. Grid resorts automatically. |
| Add a brand-new role-flavoured feature workspace | Add a row in `feature-availability.ts` first; map the role row's `primaryFeatureKey` to it; flip both to active when ready. |

## Future architecture path

In dependency order:

1. **Owner production smoke (PR #30)** — still PENDING. Independent.
2. **PR #18 migration review** — issue #32. Once it lands,
   `external_confirmation` flips from preparing → active in
   `lib/config/feature-availability.ts` AND the role catalogue stays
   unchanged — only the chip on user-declared records changes.
3. **First non-worker role promotion** — likely company or agency.
   Requires: a working `/dashboard/<role>` route, a real management
   surface (NOT the pilot cockpit), and validation in the same way
   PR #30 + #31 validated the worker text-first surfaces.
4. **Promote `freelancer` from hidden → preparing** — single row flip
   plus copy review. UI changes are zero because the catalogue is
   the source.
