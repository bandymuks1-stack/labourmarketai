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

### #1/#2 — Company identity: verified-legal lock (safe app-layer slice, no migration)
A normal user can no longer silently overwrite a **verified** company's legal-registry data.
- `lib/company/company-legal-lock.ts` (PURE) — `resolveCompanyLegalParams`: when the company is
  verified, the stored legal fields (legal name, registration code, country, address) are forced;
  input is ignored (`locked: true`). Unit-tested in `lib/company/company-legal-lock.test.ts`.
- `lib/company/company-setup.ts` `saveCompanySetup` reads the current row and applies the lock
  before the RPC — server-side enforcement (contacts / website / company type / role stay editable).
- `components/app/company-setup-form.tsx` renders the legal fields **read-only** when verified +
  a `legalLockedNotice` banner (new i18n key in en/lt/ru). The page passes the label.
This is the spec's accepted minimum ("aiškus read-only verified state"); the full pending-change
request workflow + admin verification queue remain the next slice.

### #6 — Universal skills: explicit evidence states + dry-run backfill (read-only)
- `lib/profile/skill-evidence-state.ts` (PURE, +unit test): one honest state per skill —
  `verified / manager_confirmed / work_supported / self_declared / unclassified`. Never
  over-stated; a skill the system could not map to the taxonomy is **unclassified (needs review)**,
  not silently classified. `aggregateSkillEvidenceStates` + `hasUnreviewedSkills` drive an honest
  "not everything is confirmed yet" summary.
- `scripts/skills-evidence-report.ts` (`pnpm -F web skills:evidence-report`): **dry-run, read-only**
  inventory of the state breakdown (incl. how many need review). NO DB writes, NO network, NO
  migration — it never overwrites a confirmed state (file-based, mirrors `recognition:unknown-report`).
The existing `evidence-status-strip` already renders per-skill states; an aggregate "N need review"
banner in the skills UI remains a small follow-up.

### #5 — CV profession-tile glyph
Replaced the `🟫` placeholder emoji with a neutral lucide `Wrench` icon in
`components/app/capability-profile-section.tsx` + `components/app/cv-engagement-cards.tsx`
(slug registry kept; richer asset set is M3).

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

1. **Company legal-change request model** — additive migration + RLS: the full pending change-request
   workflow + admin verification queue (this PR ships the read-only-verified lock as the safe minimum).
2. **Skills aggregate "N need review" banner** in the skills UI (state classifier + dry-run report
   ship in this PR; the in-page aggregate banner + its i18n is the small remaining bit).
3. **Role copy sweep** — replace "Agentūra"/"Pirkėjas" nouns with action framing
   (Mano poreikiai / pasiūlymai / užklausos).

## Validation

`typecheck` ✅ · `lint` ✅ · `test` ✅ · `build` ✅ · `check:public-seo-indexing` ✅
(SEO from #410/#411/#412 intact). `skills:evidence-report` runs dry-run, read-only.
