# Core network / planning / communication — audit & repair v1

Branch: `feat/core-network-planning-communication-v1` (from `main@8fdb6d97`,
post PR #743). Owner command: complete four remaining real-user problems
(A inbox, B invitations/network, C canonical calendar, D locale/theme
continuity) + E technical-copy audit, without redoing PR #743's work.

## Prerequisite state (verified before any work)

- PR #743 squash-merged as `8fdb6d97`; remote branch deleted.
- Both PR #743 migrations APPLIED to prod and verified (ledger
  `20260712092115` journal_entry_restore, `20260712092332`
  conversation_message_attachments) — see `docs/APPLIED_LEDGER.md`.
- WorkCard / EmployerPreview NOT restored (absent from main components).
- Vercel deploy of `8fdb6d97` green; prod smoke 200 on `/`, `/lt`, `/en`,
  `/lt/dashboard`.

## What each area found and changed

### A — Communication inbox (contract: `communication-inbox-contract-v1.md`)
Audit: badge and list already shared ONE unread source
(`conversation_participants.last_read_at` via `getUnreadConversationIds`),
but the list sorted only by `updated_at`, showed no message preview, fell
back to "(be temos)", led with product-explainer notes and a
refresh-mechanism paragraph, and put the support CTA above conversations.
Repair: unread-first stable sort; newest-message preview (sender + first
line, one bounded query); real title fallback chain; "Naujas" mark on the
title row; RefreshOnFocus (focus/visibility + gentle interval
router.refresh — no simulated realtime); technical copy removed; support
launcher demoted below the list. PR #743 attachments untouched
(conversation-attachments guard still pins the whole contract).

### B — Invitations + network (contract: `invitation-network-contract-v1.md`)
Audit: two legacy email-keyed invitation tables with no tokens, no expiry
enforcement, no revoke/resend, no email infrastructure at all; acceptance
created only legacy links; deep links died at onboarding. Repair: ONE
canonical typed invitation model (DRAFT migration
`20260712200000_canonical_invitations_v1`, needs-human-gate, NOT applied)
whose acceptance creates the CANONICAL relationship (engagement_contexts /
project_worker_assignments); hashed single-use tokens; provider-neutral
truthful email adapter behind an owner env gate; `/dashboard/network`
sub-surface; `/[locale]/invite/[token]` landing; onboarding `?next`
continuity.

### C — Canonical calendar (contract: `canonical-calendar-contract-v1.md`)
Audit: `/dashboard/planning` was already an honest agenda over 3 real
sources; no month/day/year views, no date navigation, journal facts
absent, several desired sources have NO data model. Repair: year / month /
week / day / agenda views (pure UTC math, no calendar library), prev/today/
next + native date picker, journal facts as the 4th source (own entries,
deleted/superseded excluded, deep link to the entry editor), owned-org
project scope, real empty-state actions. Missing sources documented as
blockers — never simulated.

### D — Locale/theme continuity (contract: `locale-theme-continuity-v1.md`)
Audit: confirmed defect — the shared LocaleSwitcher used `usePathname()`
alone, dropping `?query`/`#hash` on every language change; theme storage
was already locale-independent and locale switching did NOT flash (soft
navigation preserves `data-theme`); the only flash path was the 404
`<html>` remount. Repair: switcher carries live search+hash; 404 gets the
synchronous pre-paint theme script; guards pin all of it.

### E — Technical copy (guard: `lib/guards/architecture-copy.test.ts`)
Removed/demoted from user-facing namespaces (5 locales): DB-row storage
talk, "data model" as a user-facing status, "waiting for its migration"
chips, build-slice vocabulary, defensive "no fake data / saved for real"
self-reassurance, the communication refresh explainer, the planning
honest-scope paragraph. Kept: real errors, permission explanations,
action-changing methodology notes, the privacy transparency page and the
admin operations vocabulary (technical by purpose — excluded from the
guard by design). The internal `vision` preview namespace was left as-is
(owner-facing marketing shell; documented decision).

## Deliberately NOT done (scope fences honoured)

- No second dashboard, no second calendar; no detached calendar copies.
- WorkCard / EmployerPreview not restored.
- No PR #743 rework (cards / geolocation / journal restore / entry
  location / attachments only integrated + guarded).
- The invitations migration is NOT applied; the email provider is NOT
  configured; no external email was sent.
- No fake sent/read/delivered/realtime states anywhere.
