# Mobile evidence — feat/cc/text-first-profile-skills-journal

Captures from a Playwright iPhone 13 viewport (390 × 844, locale `lt-LT`)
against a `next start` of this branch. Source script:
`apps/web/scripts/capture-mobile.ts`.

The screenshots are organized around the six checks DI listed for the
pre-merge gate. The authenticated dashboard pages (`/dashboard/profile`,
`/dashboard/journal`, `/dashboard/account`) cannot be reached without a real
Supabase session, which this sandbox cannot create against the production
project (see `apps/web/scripts/db-fixtures-local.ts` hard guard). Instead, the
new dashboard components are mounted with mock data on the dev-gated
`/lt/design/text-first` preview using the production import paths — no design
fork.

## Files

| # | File | Surface |
|---|------|---------|
| 01 | `01-homepage.png` | Public homepage — brand check |
| 02 | `02-auth-login.png` | `/lt/auth/login` |
| 03 | `03-auth-signup.png` | `/lt/auth/signup` |
| 04 | `04-design-preview-top.png` | Profile / Skills text-first composer (first screen) |
| 05 | `05-design-preview-full.png` | Full preview page (scrolled-to-bottom render) |
| 06 | `06-design-preview-journal.png` | Work Journal composer (first field = "Ką šiandien dirbote?") |
| 07 | `07-design-preview-suggestion-cards.png` | Stand-alone TextFirstComposer + CvInputPanel + DetectedSuggestionCard variants |
| 08 | `08-design-preview-mobile-sheet-open.png` | MobileSheet sliding up from the bottom |
| 09 | `09-design-preview-notification-sheet.png` | Notification sheet bottom-anchored (NOT covering the hero) |
| 10 | `10-design-preview-role-switcher.png` | Role switcher tagging non-worker roles as "RUOŠIAMA" |
| 11 | `11-design-preview-bottom-nav.png` | Bottom-nav clearance — CTA + form inputs visible above the nav |

## Pre-merge gate — check-by-check

### 1. Bottom nav doesn't cover CTA / forms

See `11-design-preview-bottom-nav.png`. The Apžvalga / Profilis / Žurnalas /
Mano paskyra nav sits below the "Open mobile sheet" CTA and the "Pasiūlyti
pagal CV tekstą" submit button. Layout level: dashboard `<main>` uses
`pb-[calc(5rem+env(safe-area-inset-bottom))]` (see
`apps/web/app/[locale]/dashboard/layout.tsx:88`).

### 2. Notification sheet doesn't cover hero content

See `09-design-preview-notification-sheet.png`. The sheet is anchored to the
bottom (page hero is dimmed but visible above it). The fix was to portal the
sheet to `document.body` (`apps/web/components/ui/MobileSheet.tsx:53`) so
`position: fixed` is anchored to the viewport, not to the auth header's
backdrop-blurred ancestor.

### 3. Role screen no longer misleads

See `10-design-preview-role-switcher.png`. Įmonė / Agentūra / Pirkėjas each
carry a "RUOŠIAMA" badge next to them; only Darbuotojas has the AKTYVUS state.
Code: `apps/web/components/app/role-switcher.tsx:71-128` and the account list
at `apps/web/app/[locale]/dashboard/account/page.tsx:81-117`. Honest intro
copy ("Šiuo metu aktyvi jūsų darbuotojo erdvė…") added to the account page
header — `apps/web/messages/lt.json:447` (`auth.dashboard.account.rolesIntro`).

### 4. Work Journal first action is text

See `06-design-preview-journal.png`. The composer's first field is the
"Ką šiandien dirbote?" textarea with the spec placeholder. Site / quantity /
unit / direction selectors only surface AFTER the worker submits the
paragraph and reviews the suggestion cards — they are not first-class
on-load fields. Code: `apps/web/components/app/journal-entry-composer.tsx`,
copy: `apps/web/messages/lt/journal.json:3-9`.

### 5. Manual skill picker is not the first path

See `04-design-preview-top.png`. The Profile / Skills page opens on
"Papasakokite, ką mokate" (TextFirstComposer) + the CV input panel. The
"Pridėti rankiniu būdu" link is the secondary action; the legacy chip picker
only renders when the user explicitly chooses that path
(`apps/web/components/app/profile-text-first-flow.tsx:158`). The profile
server page wraps `WorkerTradeProfile` as the `manualSlot` of
`ProfileTextFirstFlow` — never first.

### 6. No old project names anywhere in the new UI / copy

Audit (grep, `apps/web` only):

| Pattern | Hits in `apps/web` |
|---|---|
| `LABMA OS` / `LABMA-OS` / `labma os` | 0 |
| `LABMA` / `labma` (any case) | 0 |
| `tiler.ai` / `workforceos` / `tradeapp` / etc. | 0 |
| `tiler` as a hardcoded brand / form | 0 (the only remaining occurrence is the `"tiler"` profession slug in `professions.json`, which is taxonomy data — not a project name. The legacy tiler-only `journal-entry-form.tsx` was removed in this branch.) |

`LABMA OS` still appears in `docs/` (PRODUCT_CONSTITUTION, PLATFORM_DOCTRINE,
PROJECT_VISION, ADR 0008, CLAUDE.md, AGENTS.md) — those are internal naming
docs, not user-facing copy. The marketing tagline "The labour market OS" in
`messages/*.json` is the NEW positioning, not the legacy name.

## How to reproduce locally

```bash
pnpm -F web build
cd apps/web && npx next start -p 3001 &
# In another terminal:
cd apps/web && E2E_BASE_URL=http://127.0.0.1:3001 npx tsx scripts/capture-mobile.ts
```

PNGs land in `docs/evidence/text-first-mobile/`. The preview route is dev-only
and dies (404) if `NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS` is anything other
than `true`.

## What's still NOT captured here

Authenticated `/dashboard/{profile,journal,account}` against a real worker
session. Reason: this sandbox cannot create a Supabase session against the
production project without explicit DI authorization — the `db:fixtures:local`
guard refuses to write, and signup requires email confirmation. The dev
preview renders the same components from the same import paths, so the
behaviour reflects production once a worker is logged in. **Manual mobile QA
of the real dashboard surfaces is still recommended before merging.**
