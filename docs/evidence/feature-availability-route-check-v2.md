# Feature-availability + route check v2

> **Sprint:** `feat/cc/catalogue-driven-primary-nav-v1`  
> **Base commit:** `2ce3fa4` (PR #36)  
> **Status:** PASS at source + build. Authenticated production mobile
> smoke remains **PENDING** — owner action, see
> `docs/evidence/post-merge-production-smoke-pr30.md`.

## What changed since v1

- `feature-availability.ts` adds an `overview` feature row
  (`availability: "active"`, `primaryRoute: "/dashboard"`,
  `safeToShowInPrimaryNav: true`).
- `navigation.ts` derives `VISIBLE_PRIMARY_NAV_ITEMS` from
  `getVisiblePrimaryFeatures()` via a small `TAB_META` table (short tab
  label + icon key).
- `BottomNav` + `DashboardTabs` consume `VISIBLE_PRIMARY_NAV_ITEMS`
  instead of their own hand-listed `TABS` arrays.

The visible nav is byte-identical to v1: same four tabs, same labels,
same order.

## Feature → route lookup (after PR #37)

| Feature key | Availability | Primary route | In primary nav? | TAB_META icon | Notes |
| --- | --- | --- | --- | --- | --- |
| `overview` | active | `/dashboard` | Yes (first) | `home` | NEW — host page for the worker / non-worker dashboard. |
| `profile_text_first` | active | `/dashboard/profile` | Yes | `idCard` | `ProfileTextFirstFlow`. |
| `journal_text_first` | active | `/dashboard/journal` | Yes | `fileText` | `JournalEntryComposer`. |
| `account_roles` | active | `/dashboard/account` | Yes | `user` | Account roles list + role switcher. |
| `role_expansion` | preparing | — | No | — | Card in `<FeatureAvailabilityGrid>`. |
| `external_confirmation` | preparing | — | No | — | Card. |
| `company_workspace` | preparing | — | No | — | Card. |
| `agency_workspace` | preparing | — | No | — | Card. |
| `customer_workspace` | preparing | — | No | — | Card. |
| `document_records` | preparing | — | No | — | Card. |
| `team_offers` | preparing | — | No | — | Card. |
| `work_needs` | preparing | — | No | — | Card. |
| `service_offers` | preparing | — | No | — | Card. |
| `matching` | hidden | — | No | — | Not rendered anywhere. |
| `marketplace` | hidden | — | No | — | Not rendered anywhere. |

## Routes (unchanged)

| Route | Feature key | Availability | In primary nav? | CTA active? |
| --- | --- | --- | --- | --- |
| `/lt/dashboard` | `overview` | active | Yes | Yes — host + grid |
| `/lt/dashboard/profile` | `profile_text_first` | active | Yes | Yes |
| `/lt/dashboard/journal` | `journal_text_first` | active | Yes | Yes |
| `/lt/dashboard/account` | `account_roles` | active | Yes | Yes |
| `/lt/dashboard/discover` | — | preparing | No | No |
| `/lt/dashboard/search` | — | preparing | No | No |
| `/lt/dashboard/inbox` | — | manager-only | No (conditional) | Conditional |
| `/lt/design/text-first` | — | dev-only | No | — |
| `/lt/onboarding` | — | active | No (auth-flow only) | Yes |

## Open items (unchanged from v1)

- **Authenticated production mobile smoke** — still PENDING (owner-only).
- **PR #18 migration review** — does not affect any route; tracked at
  issue #32.
