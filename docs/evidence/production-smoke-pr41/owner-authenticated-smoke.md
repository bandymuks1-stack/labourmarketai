# Owner authenticated smoke — PR #41 production

**Status: PENDING — owner action only.**

This document covers the dashboard checks that **cannot** be performed
from an agent sandbox because they require a real Supabase session
against the production project. The unauthenticated public-surface
checks for PR #41 are documented in `public-routes-smoke.md` and have
PASSED on production.

Companion / superseded-by:

- `docs/evidence/post-merge-production-smoke-pr30.md` — still PENDING.
- `docs/evidence/super-max-cosmo-pilot-readiness-v1/owner-production-smoke-checklist.md` (PR #39) — still PENDING.
- `docs/evidence/supergrand-vision-os-leap-v1/owner-review-checklist.md` (PR #40) — still PENDING.

Do **not** flip any of those status blocks based on this document
alone. This is the routing of what's still owed.

## What the owner must check

Open Chrome → DevTools → Toggle device toolbar (Ctrl+Shift+M) →
iPhone 13. Sign in (Google OAuth is fastest, since the owner account
already has the worker role). Then walk:

### `/lt/dashboard`

- [ ] Layout renders cleanly. No horizontal overflow.
- [ ] Header chrome shows the active role chip + the bell icon.
- [ ] First-use panel reads "Pradėkite nuo savęs" (PR #34 → #38 copy).
- [ ] Role catalogue grid (PR #38) shows Darbuotojas AKTYVU + Įmonė /
  Agentūra / Pirkėjas RUOŠIAMA. No freelancer / team_lead /
  service_provider rows.
- [ ] Feature availability grid (PR #36) shows the active + preparing
  feature cards with no broken CTA on the preparing side.
- [ ] Bottom nav (Apžvalga / Profilis / Žurnalas / Mano paskyra)
  doesn't cover the primary CTA.

### `/lt/dashboard/profile`

- [ ] First visible block is the **text-first composer**
  ("Papasakokite, ką mokate") with the universal placeholder.
- [ ] CV input panel below it.
- [ ] Manual chip picker is the secondary "Pridėti rankiniu būdu"
  link inside the flow — not the first surface.
- [ ] After applying confirmed suggestions, the trail says **Confirmed
  by you · Added to your profile · Needs external confirmation
  later**. Never "Verified".

### `/lt/dashboard/journal`

- [ ] First labelled field is **"Ką šiandien dirbote?"** with the
  universal placeholder.
- [ ] The **`pilotBackboneNote`** (PR #39) is visible above the
  composer — "Pilotinė versija: jūsų įrašai šiuo metu privatūs…".
- [ ] Submitting a paragraph leads to `Sistema rado` cards with the
  explicit "Tai pasiūlymai…" intro line.
- [ ] After save, the success card ("Įrašas išsaugotas") stays on
  the form until the next submit.

### `/lt/dashboard/account`

- [ ] Active worker-space message ("Šiuo metu aktyvi jūsų darbuotojo
  erdvė…") visible at the top of the roles section.
- [ ] User's own roles list reads the catalogue: worker → AKTYVUS,
  others → `RUOŠIAMA`.
- [ ] Locale switcher visible on mobile.
- [ ] Logout works.

### Notification + role switcher (any route)

- [ ] Bell icon opens a bottom sheet sliding up from the bottom on
  mobile (NOT a top-anchored popover). Hero is dimmed but visible.
  ESC / tap-out / X all close it.
- [ ] Role switcher dropdown carries the non-locking intro paragraph
  inside the menu and tags every non-worker row with `RUOŠIAMA`.

### `/lt/vision` end-to-end (already verified unauthenticated above)

- [ ] Banner above the hero reads "VIDINĖ PERŽIŪRA" + the "do not
  share publicly until smoke PASSED" copy.
- [ ] Catalogue-driven sections all render: Workflow, Today live,
  Roles, Activities, Preparing, Control room, Future layers.
- [ ] Control room shows owner smoke PENDING + PR #18 BLOCKED + fake
  claims "Niekada nenaudojama" / "Never used".

## Fail criteria — STOP if any is true

- Any non-worker role renders an "active" chip or a navigating link.
- Pricing / checkout / subscription surface appears anywhere.
- Any "AI verified" / "AI matched" / "automatic approval" /
  "guaranteed match" / "trust score" / "patent" claim.
- Mobile horizontal overflow.
- Bottom nav covers a CTA.
- Owner cannot understand what to do next within 10 seconds of
  opening the dashboard.

If any fail row is true, open a small fix branch off `main`. Do not
flip any smoke status to PASSED. Re-run this checklist on the next
deploy.

## After all three smokes pass

When PR #30 + PR #39 + PR #40 owner-review checklists are all PASSED,
the next action is the one-line flip:

```ts
// apps/web/lib/config/vision-publication.ts
export const VISION_PUBLIC: boolean = true;
```

That ships in its own PR. The page automatically becomes publicly
indexable, the nav link re-appears, the internal-preview banner
disappears. **Do not bundle that flip with any other feature** — keep
the publish decision visible on its own.

## Status block

```
Owner authenticated smoke status: PENDING
Date:                              —
Performed by:                      —
Production deploy SHA:             28b9a88 (PR #41)
Result:                            —
```
