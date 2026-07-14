# Company Architecture Completion v1 (Sprint v2 §5)

Status: implemented in-repo, 2026-07-14. Two owner-gated migrations pending
(see §6). Guard: `apps/web/lib/guards/company-architecture-v1.test.ts`.

## 1. The membership model — extended, not duplicated

**Finding first (reuse investigation):** the repo ALREADY has a canonical
multi-company membership model. Building the task's proposed
`company_memberships (profile_id, organization_id, role_slug)` table would
have created a second truth for a fact the schema already stores:

| Existing object | What it already does |
|---|---|
| `public.organizations` (0013) | one row per org; `owner_profile_id` lets ONE person own MANY organizations |
| `public.engagement_contexts` (0013) | the profile↔organization membership spine; `relationship_slug` FK → the §10 registry `relationship_types` (`owner`, `manager`, `external_manager`, …) |
| 0035 + 20260530140000 | owner-engagement trigger/backfill + `add_org_member` / `grant_org_manager` RPCs keep the spine complete |
| `public.manages_organization()` | canonical "is this profile a manager-level member?" helper |
| legacy `public.companies` | max ONE row per profile (`getOwnCompany().maybeSingle()`), mirrored into `organizations` |

What multi-company **switching** was actually missing:

1. a server-side "which organization am I acting as" pointer, and
2. a read-only membership slug for future non-managing members.

Migration `20260714210000_company_memberships_v1.sql` adds exactly that:

- seeds `viewer` into the EXISTING `relationship_types` registry
  (idempotent; grants no capability yet — honest absence);
- `profiles.active_organization_id` (nullable FK → organizations,
  `ON DELETE SET NULL`) — the pointer, never localStorage;
- SECURITY DEFINER validation triggers: the pointer may only reference an
  org the profile owns or holds an ACTIVE
  owner/manager/external_manager/viewer engagement in (42501 otherwise —
  default-closed §4);
- idempotent backfill: profiles owning ≥ 1 org default to their OLDEST
  owned org (matches today's de-facto single-company behaviour).

## 2. The company switcher

- `lib/company/organization-switch.ts` — pure logic:
  `shouldOfferOrganizationSwitch` (strictly > 1 membership) and
  `resolveActiveOrganizationId` (membership-validated; stale/foreign
  pointer falls back to the first membership; no memberships → null).
- `lib/company/active-organization.ts` — server read model. Owner-scoped
  memberships via the existing `getOwnedOrganizations()`; the pointer read
  feature-detects 42703 (migration unapplied) and degrades to the first
  owned org with `pointerAvailable: false`.
- `lib/company/organization-actions.ts` — `switchActiveOrganization`
  server action: app-level membership check → UPDATE (DB trigger is the
  second line of defense) → `revalidatePath`. 42703 → `needs-migration`.
- `components/app/role-switcher.tsx` — an "Aktyvi įmonė" section inside
  the existing identity dropdown, rendered ONLY when the server passed a
  real multi-company list (`canSwitch`): single-company users and
  unapplied-migration states see exactly the previous UI. Active org
  marked; names are real organization rows.
- `app/[locale]/dashboard/layout.tsx` — header org name now comes from the
  membership-validated ACTIVE organization; falls back to the legacy
  `getOwnCompany()` read when the org read model is absent.

**v1 scope honesty:** switching covers organizations the profile OWNS
(`organizations` SELECT RLS is owner-scoped). Manager-level members
(engagement-only) are already accepted by the DB trigger, but the read
model cannot list foreign orgs until an RLS widening is owner-approved —
documented follow-up, not faked.

## 3. Company vs personal separation — audit

Audited: `/dashboard/account` (settings), `/dashboard/profile` (person),
`/dashboard` overview, `/dashboard/company` (workspace), header.

Already clean (no move needed):

- Account is settings-only (marketplace IA cleanup 2026-06-25): identity,
  security, plan, privacy links, appearance, language, roles list,
  logout. No company-facing settings live there.
- Company settings (profile form, verification, locations, gallery,
  workers, members) already live under the company workspace /
  `/dashboard/start/company`.
- Header truthfulness: person identity shows the person; company identity
  shows the real organization name (PR earlier; now pointer-backed).

Concrete moves made in this slice:

1. Dashboard card layout is now stored per `(profile, context)` with a
   CLOSED `person`/`company` context slug — a company layout choice can no
   longer leak into the person surface via the shared localStorage key
   (§20 privacy symmetry).
2. The company overview leads with a decisions strip scoped to the
   company's own operational reads (see §5).
3. The active-company pointer moved server-side, so "which company am I
   acting as" is account state, not device state.

Remaining recommendations (documented, not over-refactored):

- `/dashboard/profile` "Valdomos įmonės" list renders every owned org but
  each entry links to the ONE `/dashboard/company` workspace without
  selecting that org. After the pointer migration is applied, these links
  should call `switchActiveOrganization(org.id)` before navigating.
- The company workspace's data reads still resolve through the legacy
  `companies.profile_id` single row (`getOwnCompany*`). The M3
  companies→organizations collapse (0013 header) should reroute them to
  `active_organization_id` so a switched org changes the WHOLE workspace,
  not only the header identity. Until then switching is honest but
  header-level for legacy-companies data.
- Manager-level (non-owner) membership listing needs an owner-approved
  `organizations` SELECT RLS extension (`manages_organization(id)`).

## 4. Server-side dashboard preferences

Migration `20260714211000_dashboard_preferences_v1.sql`:
`dashboard_preferences (profile_id, context ∈ {person, company},
preferences jsonb ≤ 8 KB, updated_at, pk (profile_id, context))`, RLS
owner-only CRUD, grants to `authenticated` only.

Code path (PR #751 grid, now server-backed):

- `lib/dashboard/dashboard-preferences-shared.ts` — ONE bounded ids-only
  shape (≤ 48 ids/list, ≤ 64 chars/id, closed charset; sanitized payload
  fits the 8 KB DB budget by construction).
- `lib/dashboard/preferences.ts` (read) + `preferences-actions.ts`
  (write): 42P01/PGRST205 → `unavailable` → the grid keeps the previous
  device-local localStorage behaviour EXACTLY (honest fallback, nothing
  pretends to persist).
- `components/app/dashboard/dashboard-module-grid.tsx` — accepts
  `context` + `serverPrefs`; server mode renders the stored layout
  server-side (no hydration flash) and persists through the action.
- `app/[locale]/dashboard/page.tsx` — reads prefs once per request for the
  role's context and feeds both grid render sites.

## 5. Decision-first company overview

`/dashboard/company` already led with a counter control bar +
`CompanyNextActions` + action-room steps. Added the missing decision layer:
a compact, count-gated strip (`company-decisions-strip`) of what actually
waits for the owner — pending journal reviews (→ `/dashboard/inbox`),
pending worker invitations (→ `#company-invitations`), claimable public
intakes (→ `#company-claims`). All counts REUSE reads the page already
performed — zero new queries; zero pending renders nothing (no fake
urgency).

## 6. Owner gates (HUMAN GATE — do not apply without explicit owner OK)

| Migration | What applying enables |
|---|---|
| `20260714210000_company_memberships_v1.sql` | active-company pointer persists; multi-company header switcher appears for multi-org owners |
| `20260714211000_dashboard_preferences_v1.sql` | dashboard card layouts persist server-side per (profile, context) |

Both: DRAFT headers, paired rollbacks in `supabase/rollbacks/`, Deferred
entries in `docs/APPLIED_LEDGER.md`. Until applied every consumer
feature-detects (42703 / 42P01) and keeps today's behaviour.
