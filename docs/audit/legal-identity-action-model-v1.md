# Legal identity / action model cleanup v1

**Branch:** `fix/cc/legal-identity-action-model-v1`
**Date:** 2026-06-15
**Builds on:** #413 / #414 (core-UX). **Copy/UX only — NO schema/enum/migration/Supabase.**

## Goal
Stop presenting "agentūra / pirkėjas / darbuotojas" as separate top-level systems.
Frame everything around **two legal identities** and **actions/capabilities**:
- **Asmuo** (person / individual account) — *worker* is a person's direction, not a permanent silo.
- **Įmonė** (company / organization account).
- Buying, selling, hiring, offering workers/teams, agency/staffing, subcontracting, project
  management = **actions/capabilities**, not separate identities. Buyer can be a person OR a company.
  Agency = a company operating mode / partner capability.

## Fixed at UI / copy / navigation level (this PR)
1. **Role-switch clarity note** (`auth.roleSwitcher.clarityNote`, en/lt/ru) — rewritten to:
   "One account, two identities — you as a person and your company. Switching only changes which
   actions you see … agency and buying are actions, not separate systems." (was: "Switching role
   changes the workspace view … company, agency and buyer workspaces …").
2. **Role catalogue descriptions** (`roles.{worker,company,agency,customer}.description`, en/lt/ru) —
   removed "space/erdvė/пространство" silo language; reframed as identities/capabilities/actions
   (worker → "Working as a person…"; agency → "A company capability — …"; customer → "An action —
   submit and manage requests…"). Also `account_roles.description` + `role_expansion.description`.
3. **Onboarding role picker** (`auth.onboarding.rolePicker.*`, en/lt/ru) — the two choices are now
   the legal identities: **Asmuo / Person** vs **Įmonė / Company**, each described by its actions.
   Heading → "Are you starting as a person or a company?"; multiNote → "Person and company are
   identities; hiring, buying, offering workers or running projects are actions you add later."
   Removed the 💡 emoji from the info box. (Person desc keeps studies/activity breadth — the
   "every human, not just workers" guard.)
4. Prior PRs (#413/#414) already reframed `spaces.{agency,buyer}.name` + agency/buyer workspace
   titles to capability/action framing — kept.

## Guard
`lib/guards/role-no-silo-framing.test.ts` extended (two-identity / action model):
- `roles.{agency,customer}.description` carry no silo framing (`space`/`erdvė`/`пространство`/`workspace`);
- onboarding `rolePicker.worker.title` is the **person** identity (matches `person|asmuo|человек`);
- `auth.roleSwitcher.clarityNote` is account/action framed, not "workspace view".
(Existing `room-based-account-spaces`, `account-space-clarity`, `role-dashboards`,
`universal-capability-flow`, `company-role-simplicity` all still green.)

## Exact routes / surfaces checked
- Onboarding (`components/app/onboarding-wizard.tsx` → `auth.onboarding.rolePicker.*`)
- Role switcher (`components/app/role-switcher.tsx` → `auth.roleSwitcher.*`, `auth.signup.role.*`)
- Account "My spaces" (`app/[locale]/dashboard/account/page.tsx`) + role catalogue
  (`components/app/role-catalogue-card.tsx` → `roles.*`)
- Current-space header (`components/app/current-space-header.tsx` → `spaces.*`)
- Role dashboards (`roleDashboards.{company,agency,buyer}.*`)

## Validation
`typecheck` ✅ · `lint` ✅ · `test` ✅ (277 files / 4023 tests) · `build` ✅ ·
`check:public-seo-indexing` ✅. i18n active-locale parity (lt/en/ru) preserved.

## Still requires LATER schema / enum cleanup (NOT this PR)
- DB `Role` enum + `profile_roles.role` still has `agency` / `customer` as first-class rows; the
  `spaces.buyer.*` i18n key still says "buyer" (≠ DB `customer`). A future migration would collapse
  these into identity (person/company) + capability flags. **RED, human-gated** — out of scope here.
- `current-space-header` / account still map roles 1:1 to a "space" key; a fuller IA that renders
  capabilities under one identity is a follow-up.
- Company legal-change request workflow + admin verification queue (already documented).
- Localization NL/DE/DA/NO/SV/FI.

## Safety
No DB migration · no Supabase apply · no auth · no billing/payments · no DNS/env/secrets ·
no fake data · no enum/role-key rename. SEO (#410/#411/#412) intact.
