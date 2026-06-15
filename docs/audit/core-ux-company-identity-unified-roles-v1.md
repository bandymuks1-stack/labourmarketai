# Core UX correction v1

**Branch:** `fix/cc/core-ux-company-identity-unified-roles-v1`
**Date:** 2026-06-15
**Builds on:** merged SEO work #410 (indexing), #411 (cross-sector brand), #412 (profession/problem SEO).
**Constraints honoured:** no DB migration, no auth/billing/payments/Supabase/DNS/secrets, no fake
companies/workers/offers/approvals, no outbound. Construction kept as one sector.

Owner-review artefact (local, gitignored): `runtime/review/core-ux-company-identity-unified-roles-v1/OWNER-REVIEW.html`.

## Shipped this PR (safe, no schema)

### #7 — Logo / app navigation
`app/[locale]/dashboard/layout.tsx`: the app-shell logo `Link` now points to `/dashboard`
(was `/` → public home). Inside the authenticated app the logo keeps the user in their workspace.
The public marketing logo still points to `/`.

### #5 — Premium icons
Emoji role/action icons replaced with professional `lucide-react` outline icons (uniform stroke +
size) across the app chrome:
- new single source of truth `components/app/role-icon.tsx` (`RoleIcon`): worker→HardHat,
  company→Building2, agency→Handshake, customer→ShoppingCart.
- `app/[locale]/dashboard/account/page.tsx` — role list + skills/journal/inbox links.
- `components/app/role-switcher.tsx` — current role, owned/missing roles, admin badge (Settings).
- `components/app/account-menu.tsx` — player card / skills / projects / instructions / account / sign out.
- `components/app/notification-panel.tsx` — role icons.
- `components/app/onboarding-wizard.tsx` — role cards.

### Guard
`lib/guards/app-chrome-premium.test.ts` — pins (1) logo href = `/dashboard` (and no logo `<Link href="/">`),
(2) a lucide `RoleIcon` exists, (3) the chrome files carry no pictographic emoji (arrows `→` and check `✓`
are allowed UI glyphs).

## Already in good shape (verified, not rebuilt)

- **#1/#2 Company identity** — full company profile + verification state ladder already exist
  (`lib/company/company-setup.ts`, `components/app/company-setup-form.tsx`, `/dashboard/start/company`);
  save never creates verified directly; honest empty state; no seeded requisites.
- **#3 Unified roles** — onboarding is person-first (worker / company only); agency = company type
  (`staffing_agency`), buyer = `client_customer` — not separate products.
- **#4 "Mano erdvė"** — coming-later modules already moved off the dashboard into a collapsed
  account section (Room-based IA, PR #204); dashboard shows real actions.
- **#6 Universal skills** — universal 11-sector model; evidence states modelled + rendered
  (`self_declared / work-journal-supported / manager_confirmed / verified`).

## Next slice (documented, not in this PR — needs schema/RLS or a copy sweep)

1. **Company legal-change request model** — additive migration + RLS: contacts editable freely;
   verified legal fields (legal name / code / country / address) go through a pending change request,
   never silent overwrite. Admin verification queue.
2. **Skills "needs review / unclassified" surface** + dry-run backfill/recalc for old journal entries
   (no auto-overwrite of confirmed states).
3. **Role copy sweep** — replace "Agentūra"/"Pirkėjas" nouns with action framing
   (Mano poreikiai / pasiūlymai / užklausos).
4. **CV profession-tile icon** — replace the `🟫` placeholder glyph in the M1 icon registry
   (`capability-profile-section.tsx`, `cv-engagement-cards.tsx`) with a lucide icon.

## Validation

`typecheck` ✅ · `lint` ✅ · `test` ✅ (274 files / 3979 tests) · `build` ✅ ·
`check:public-seo-indexing` ✅ (SEO from #410/#411/#412 intact).
