# Market Map — owner smoke + mobile UX polish v1 (post-#462)

**Scope:** product-quality pass on the logged-in owner's real Market Map usage
(mobile + desktop). **No** new architecture: no public aggregated output, no
cross-user read, no SECURITY DEFINER RPC, no DB migration, no auth/billing/env
change, no fake users/signals/coordinates.

**Chain reviewed:** #457 living-signals copy · #458 DB model · #459
visibility-filtered read layer · #460 owner-only UI · #461 single-architecture
cleanup · #462 capture flows.

## Components audited

- `components/app/market-map-shell.tsx` — server shell (hero, foundation notice,
  scope filters, owner `MarketMapMySignals`, demand signal layer, planned-layer
  legend, next actions). Drives the owner view from `getOwnMarketSignals()`.
- `components/app/market-map-my-signals.tsx` — owner "my signals" view: six
  categories + filter chips, login consent-gated, country/region only.
- `components/app/market-map-capture.tsx` — owner entry/management: preferred
  add/edit/disable, login consent, company-need edit/disable.
- `lib/market-map/signals.ts` — RLS-scoped owner fetcher `getOwnMarketSignals`.
- `lib/market-map/signal-model.ts` — pure visibility/aggregation engine.
- `lib/market-map/capture.ts` / `capture-actions.ts` — owner-scoped writes +
  `revalidatePath` server actions.
- `messages/{lt,en,ru}.json` — `marketMap.*`.

## Clarity audit — answers

| Question | Verdict | Notes |
|---|---|---|
| Is "my signals" clear? | ✅ | `mySignals.title` + `note` + country-level notice. Owner-only, no cross-user wording. |
| Are profile / company / login / preferred / need / project distinguished? | ✅ | Six labelled categories, each with its own icon, label and CTA. |
| Is country/region-level meaning clear? | ✅ | `countryLevelNotice` + per-category `countryLevelTag`. |
| Is "exact location hidden until confirmed" clear? | ✅ | `exactHidden` shown in the notice strip. |
| Is "how to add a preferred location" clear? | ⚠️→✅ | **Fixed:** the my-signals CTA used to navigate to `/dashboard/profile` while the real add form sits in the capture panel on the same page. Now it scrolls to `#market-map-add-preferred`. |
| Is "how to manage login consent" clear? | ⚠️→✅ | **Fixed:** the my-signals login CTA used to navigate to `/dashboard/account`; now scrolls to `#market-map-login-consent`, the on-page consent control. |
| Do CTAs go to the right place? | ✅ | profile/company/project → where those are edited; preferred/login → on-page capture; demand create → `/dashboard/company`. |
| Mobile layout not overloaded? | ✅ | Single-column stack on mobile (`lg:grid-cols-[1fr,320px]`); chips wrap; capture fields `w-full`. e2e asserts no horizontal overflow at 390px. |
| Bottom nav not covering actions? | ✅ | Dashboard layout already clears the fixed nav: `pb-[calc(5rem+env(safe-area-inset-bottom))]`. e2e asserts the add button is reachable. |
| Duplicate cards / double signals / misleading empty states? | ⚠️→✅ | **Fixed:** the company-need visibility `<select>` printed raw enum tokens (`company_only`, `region_visible`…) instead of localized labels — fixed to `t(visibility.*)` and added the missing `visibility.company_only` key. Empty states are action-oriented (see below). |

## UX / copy problems found & fixed

1. **Raw enum tokens in UI.** The company-need visibility `<select>` rendered
   `{v}` (e.g. `company_only`) as the option label. → Now renders
   `t(\`visibility.${v}\`)`; added `marketMap.capture.visibility.company_only`
   to lt/en/ru.
2. **Misdirected CTAs.** "Add a preferred location" and "Manage login consent"
   in the my-signals view navigated away from the map even though the real
   controls live in the capture panel on the same page. → Now on-page anchors
   (`#market-map-add-preferred`, `#market-map-login-consent`) with matching
   `id`s + `scroll-mt-24` on the capture sections.
3. **Copy hygiene.** Verified no `fake` / `netikri` / `kol kas tuščias` /
   `ruošiama` / `bus vėliau` / `coming soon` framing anywhere in the Market Map
   components or `marketMap` i18n; empty categories use actionable copy
   ("Add a preferred location", "Refine profile location", "Manage login-location
   consent", "Add a company-need location") — never "no data".

## Empty-but-actionable states

Each empty category renders a real next action, not a dead/empty state:
`empty.profile_location` → *Refine profile location*; `preferred_location` →
*Add a preferred location* (on-page); `login_location` → neutral consent line +
*Manage login-location consent* (on-page); `company_need_location` → *Add a
company-need location* (`/dashboard/company`).

## Privacy / architecture confirmation

- **Owner-only:** shell reads `getOwnMarketSignals()` (RLS, caller's own rows).
  No `marketSignals` / public / cross-user aggregate referenced in any
  component.
- **Login approximate:** `consented_login_location_signals` has no
  lat/lng/address column; the read path selects none; login renders only when
  `consent_status === "consented"` (revoked / not_requested are skipped).
- **No privileged path:** no `service_role`, no `.rpc(`, no `SECURITY DEFINER`
  in any Market Map file.
- **No schema change:** no new `supabase/migrations/*.sql`; no auth/billing/env
  touched.

## Smoke results

See the PR report for the live authenticated harness output (preferred
create→visible→disable; login consented→approximate→revoked→hidden; company-need
visibility edit on the same row; mobile 390px no-overflow + reachable capture).

## Recommendation for the next stage (NOT this PR)

The shell still carries the original **foundation framing** (`foundationNotice`,
planned-layer legend, `schemaPrepared`) alongside the now-working owner signals.
Once owner-only UX is stable, consider a follow-up that reframes those panels so
the page reads as a *working* owner map rather than a scaffold — and only then
plan the public aggregated Market Map (min-bucket threshold + a separate
owner-gated privileged read source/RPC).
