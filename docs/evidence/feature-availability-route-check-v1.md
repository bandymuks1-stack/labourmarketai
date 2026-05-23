# Feature availability + route check v1

> **Sprint:** `feat/cc/neutral-dashboard-feature-availability-v1`  
> **Base commit:** `767abb4` (PR #35)  
> **Status:** PASS at source + build. Authenticated production mobile
> smoke remains **PENDING** — owner action, see
> `docs/evidence/post-merge-production-smoke-pr30.md`.

## Method

- Every route below was inspected at source level on this branch.
- Feature mapping comes from `apps/web/lib/config/feature-availability.ts`.
- Primary-nav inclusion comes from `apps/web/lib/config/navigation.ts`
  (`PRIMARY_NAV_ITEMS` / `VISIBLE_PRIMARY_NAV_ITEMS`).
- "CTA active?" = does the page render a navigating link backed by a
  feature whose `availability === "active"`?

## Routes

| Route | Feature key | Availability | In primary nav? | CTA active? | Reason |
| --- | --- | --- | --- | --- | --- |
| `/lt/dashboard` | n/a (host page) | n/a | Yes (`overview`) | Yes — surfaces the worker first-use panel + the `<FeatureAvailabilityGrid>` | Host for first-use panel, journey rail, canonical cards. Renders for both worker and non-worker users; non-worker branch is the pilot cockpit + the same grid. |
| `/lt/dashboard/profile` | `profile_text_first` | active | Yes (`profile`) | Yes — opens `ProfileTextFirstFlow` | First block "Papasakokite, ką mokate" + CV input panel. Manual chip picker is the secondary "Pridėti rankiniu būdu" link inside the flow. |
| `/lt/dashboard/journal` | `journal_text_first` | active | Yes (`journal`) | Yes — opens `JournalEntryComposer` | First field "Ką šiandien dirbote?", universal placeholder, collapsible cross-domain examples, suggestion review with explicit "Tai pasiūlymai…" intro. |
| `/lt/dashboard/account` | `account_roles` | active | Yes (`account`) | Yes — roles list + `rolesIntro` paragraph | Worker tagged AKTYVUS; non-worker rows tagged `RUOŠIAMA` via `ROLE_BY_ID`. |
| `/lt/dashboard/discover` | — | preparing (M3, honest empty state) | No | No | Route exists in case of bookmark; not surfaced in `VISIBLE_PRIMARY_NAV_ITEMS`. Replaced by Profile in nav by PR #25. |
| `/lt/dashboard/search` | — | preparing (M2, honest empty state) | No | No | Route exists in case of bookmark; not surfaced in nav. Replaced by Journal in nav by PR #25. |
| `/lt/dashboard/inbox` | — | manager-only (active for users with a manager engagement) | No (only linked from account when relevant) | Conditional | Manager / external-manager confirmer inbox. Worker users see no entry point. |
| `/lt/design/text-first` | — | dev-only | No | No — preview-only | Gated by `NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS=true`. Mounts the production composers with mock data for the capture script. |
| `/lt/onboarding` | — | active (auth wall handles redirect) | No (auth-flow only) | Yes — wizard advances | Multi-select role picker + display name / country step. |

## Feature → route lookup

| Feature key | Availability | Primary route | UI surface |
| --- | --- | --- | --- |
| `profile_text_first` | active | `/dashboard/profile` | `ProfileTextFirstFlow` |
| `journal_text_first` | active | `/dashboard/journal` | `JournalEntryComposer` |
| `account_roles` | active | `/dashboard/account` | Account page + role switcher |
| `role_expansion` | preparing | — | Card in `<FeatureAvailabilityGrid>` |
| `external_confirmation` | preparing | — | Card |
| `company_workspace` | preparing | — | Card |
| `agency_workspace` | preparing | — | Card |
| `customer_workspace` | preparing | — | Card |
| `document_records` | preparing | — | Card |
| `team_offers` | preparing | — | Card |
| `work_needs` | preparing | — | Card |
| `service_offers` | preparing | — | Card |
| `matching` | hidden | — | Not rendered anywhere. Catalogue entry kept so the honesty guard has a canonical home. |
| `marketplace` | hidden | — | Not rendered anywhere. |

## Open items

- **Authenticated production mobile smoke** — still PENDING (PR #30 /
  owner action). Guard test keeps the checklist's `Status: PENDING`
  line stable.
- **PR #18 migration review** — does not affect any route; tracked at
  issue #32.
