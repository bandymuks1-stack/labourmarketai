# Neutral Shared Dashboard + Feature Availability Audit v1

> **Type:** rigidity / honesty audit for the shared dashboard surface +
> CTA wiring.  
> **Base:** `main` @ `767abb4` (PR #35 merged).  
> **Branch:** `feat/cc/neutral-dashboard-feature-availability-v1`.  
> **Method:** source review of the shared dashboard surfaces + central
> config inventory + guard tests. Authenticated production smoke remains
> **PENDING**.

The 10 audit questions from the sprint brief, scored
`PASS / PARTIAL / FAIL / NOT TESTED`. Failures are not hidden.

| # | Question | Score | Evidence / note |
| --- | --- | --- | --- |
| 1 | Which dashboard strings still imply only worker? | PASS | Shared chrome (`dashboard/layout.tsx`, `BottomNav`, `DashboardTabs`) carries no worker-only copy. The worker dashboard's canonical Identity / Proof cards remain worker-framed by design (this surface IS the worker dashboard for users with `active_role === 'worker'`). The non-worker dashboard branch shows the pilot cockpit + the new `<FeatureAvailabilityGrid>` (no worker-only language). |
| 2 | Which dashboard CTAs are real today? | PASS | The three CTAs that navigate today are `Tęsti profilį` / `Pridėti darbo arba veiklos įrašą` / `Peržiūrėti vaidmenis` — they route to `/dashboard/profile`, `/dashboard/journal`, `/dashboard/account`. Each maps to a feature in the catalogue with `availability: "active"`. |
| 3 | Which CTAs point to preparing / future features? | PASS | None today. `<FeatureAvailabilityGrid>` renders preparing cards WITHOUT a navigating Link — instead it shows a `RUOŠIAMA` chip + the `preparing_generic_reason` line. The guard test asserts there is exactly one `<Link>` in the grid component and it sits inside the `active && f.primaryRoute ? (...)` ternary. |
| 4 | Which nav items are active vs preparing vs hidden? | PASS | `lib/config/navigation.ts` lists the four canonical routes (overview / profile / journal / account); all `availability: "active"`. `/dashboard/discover` + `/dashboard/search` exist as routes with honest empty states but are NOT in `PRIMARY_NAV_ITEMS`. `/lt/design/text-first` stays gated by `NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS=true`. |
| 5 | Which copy should stay worker-specific because the page is worker-focused? | PASS | The worker dashboard's `auth.dashboard.wow.flow.worker.*` + `auth.dashboard.wow.canonical.*` copy is **intentionally** worker-framed — it only renders when the active role is `worker`. The profile + journal pages are also worker-specific surfaces today. |
| 6 | Which copy must become neutral because the surface is shared? | PASS | `dashboard.featuresHeading.*` (the new shared catalogue heading) is universal: "Pradėkite nuo to, kas šiandien tikra…". `auth.dashboard.account.rolesIntro` already neutralised by PR #34 / PR #35. The role switcher menu carries the same neutral framing. |
| 7 | Which CTAs need `isFeatureActive()` or equivalent gating? | PASS | The new `<FeatureAvailabilityGrid>` calls `isFeatureActive(f.key)` for every card it renders. Preparing cards render a chip + reason instead of a Link. The existing top-of-page Identity / Proof cards point at routes (`/dashboard/profile`, `/dashboard/journal`) whose backing features are `active`; they do not need extra gating because there's no preparing path to misrepresent. |
| 8 | Which future features should be documented as preparing only? | PASS | `role_expansion`, `external_confirmation`, `company_workspace`, `agency_workspace`, `customer_workspace`, `document_records`, `team_offers`, `work_needs`, `service_offers` — all live in the catalogue as `availability: "preparing"`. Each carries `safeToShowInPrimaryNav: false`. `matching` + `marketplace` are explicitly `hidden`. |
| 9 | Which tests should prevent future drift? | PASS | `apps/web/lib/guards/product-readiness.test.ts` adds 7 new assertions: required FeatureKey coverage, only `profile_text_first` / `journal_text_first` / `account_roles` may be active, `matching` + `marketplace` must be `hidden`, dashboard page mounts `<FeatureAvailabilityGrid>`, grid gates `<Link>` on `isFeatureActive`, every label + description i18n key exists in LT + EN, shared heading body carries the non-locking promise. Plus the existing PR #35 guard "no new migration files this sprint" still holds. |
| 10 | Can the first user still complete the beta path? | PASS | Worker signup → onboarding → dashboard first-use panel → profile text-first composer → confirm suggestions → journal text-first composer → confirm suggestions → saved-state card. The new feature grid is purely additive (sits below the existing identity/proof cards) and never blocks the existing path. |

## Companion files

- `docs/evidence/feature-availability-route-check-v1.md` — route +
  feature-key + availability + nav-visibility + CTA-active table.
- `docs/product/feature-availability-and-non-locking-dashboard-v1.md` —
  the doctrine this audit scores against.
- `apps/web/lib/config/feature-availability.ts` — central catalogue.
- `apps/web/components/app/feature-availability-grid.tsx` — config-driven
  grid mounted on both worker and non-worker dashboards.
