# User Journey Root-Cause Audit & Repair v1

Branch: `feat/user-journey-root-cause-repair-v1` · Date: 2026-07-12
Input: owner-reported user feedback (delete copy, in-app browser geolocation,
work-entry location, passive completeness warning, passive operation cards,
text-only messaging).

This audit groups findings by SHARED ROOT CAUSE, not by screenshot. Every
high/medium finding below is repaired in this branch; deferred items carry a
concrete reason.

---

## Root causes found

### RC1 — Stat/operation cards rendered as passive `<div>`s while looking tappable

- **Affected**: `components/app/project-operations-board.tsx` (`Counter`, 8
  cards: Priskirta / Pasiruošę / Nėra nurodytų įgūdžių / Nėra darbo įrodymų /
  Reikia susisiekti / Trūksta dokumentų / Patikrinta dokumentų / Išsiųsti
  nurodymai) on `/dashboard/projects/[id]/operations`.
- **Root cause**: the counters grid and the worker filter chips were built as
  two disconnected systems with duplicate labels; the counters had no action
  contract at all.
- **User impact**: manager taps a card that visually promises filtering —
  nothing happens (high; silent interaction failure, especially mobile).
- **Reproduced**: yes (static: `Counter` had no onClick/href/role/keyboard).
- **Repair**: every counter is now a full-surface `<button>` applying the
  matching worker filter + scrolling the list into view (`aria-pressed`,
  `aria-label` with action hint, focus ring, pressed state); the
  instructions counter is a real `<Link>` to `/dashboard/instructions`; new
  filters `needsEvidence` / `docsChecked` added so every card has a real
  destination; zero-result filters render an explained empty state + "Rodyti
  visus" recovery; the no-workers state offers the assign action.
- **Proof**: `lib/guards/user-journey-interaction-contract.test.ts` (RC1
  block); existing board guards stay green.

### RC2 — Status/warning components with visual emphasis but no action contract

- **Affected**: `components/app/my-zone.tsx` — "Jūsų informacija dar nepilna"
  (`StatusChip variant="attention"`) on the worker dashboard.
- **Root cause**: the design system split ActionCard (always a link) from
  StatusChip (never clickable), but the incomplete-profile state was mapped
  to the passive primitive even though its content demands an action.
- **User impact**: user is told their information is incomplete with no path
  to fix it; the fix actions sit in a separate grid with no connection
  (high; the exact owner-reported complaint).
- **Reproduced**: yes.
- **Repair**: when incomplete, MyZone now renders the exact missing items
  (derived from real data: no profession / no first journal entry) as
  full-surface deep links — profession → `/dashboard/profile#profile-edit`,
  first entry → `/dashboard/journal#journal-composer` (both anchors exist,
  `scroll-mt` set) — plus a progress line. Routes are passed from the page
  (MyZone still hard-codes no route, per the control-room guard). The ready
  state stays a plain informational chip.
- **Proof**: `user-journey-interaction-contract.test.ts` (RC2 block);
  `my-zone-control-room.test.ts` stays green.

### RC3 — Destructive action wording leaked implementation terms and promised
      behaviour that did not exist

- **Affected**: `messages/{lt,en,ru,nl,de,fi}/journal.json` `entry.deleteConfirm`
  ("soft-delete", "мягкое удаление", "zacht verwijderd" …);
  `components/app/journal-entry-row.tsx`; `lib/journal/actions.ts`.
- **Root cause**: the confirmation copy was written from the implementation's
  point of view (soft delete, history retention) while the product had no
  restore path — label, copy, persistence and UI result disagreed.
- **User impact**: confusing technical jargon at the scariest moment; a
  promise ("stays in history") the user could never act on (high).
- **Reproduced**: yes.
- **Repair**: copy rewritten in all six journal locales — plain consequence
  ("nebebus rodomas jūsų sąraše"), no implementation terms; delete now swaps
  the row to a visible "removed" placeholder with a REAL restore (undo)
  button; new draft migration `20260712120000_journal_entry_restore.sql`
  (mirror of 0018's soft-delete contract: security definer, owns_worker,
  idempotent, refuses superseded entries) + `restoreJournalEntry` action.
- **Proof**: `lib/guards/journal-delete-honesty.test.ts` (copy scan across
  ALL message catalogs + migration contract + undo wiring).
- **Gate**: the restore migration is DRAFT / needs-human-gate — apply via
  Supabase MCP before deploying this branch (see §Migrations below).

### RC4 — Browser capability failures collapsed into two states with
      non-contextual advice

- **Affected**: `components/app/market-map-base.tsx` (the only
  `navigator.geolocation` call site — worker map + company map contexts).
- **Root cause**: all failures mapped to "denied"/"unavailable"; no secure-
  context, timeout, or in-app-browser distinction, so Facebook/Instagram
  in-app users got "allow location in browser settings" — advice that cannot
  work there. Recovery controls also sat BELOW a screenful of map.
- **User impact**: dead end inside social in-app browsers (high; the exact
  owner-reported flow).
- **Repair**: new pure module `lib/browser/geo-capability.ts` — capability
  classification (insecure-context / unsupported / denied / denied-in-app /
  unavailable / timeout), conservative in-app browser detection (FB,
  Instagram, TikTok, generic webview), `canRetrySucceed` (retry renders only
  when it can succeed) and `needsOpenInBrowserGuidance` (contextual "open in
  your usual browser" instructions). Layout reordered: location action +
  failure hint + manual country/city form render ABOVE the map. Manual
  selection opens automatically on every failure.
- **Proof**: `lib/browser/geo-capability.test.ts` (unit, real UA strings);
  `lib/guards/geo-capability-recovery.test.ts` (UI wiring, copy without
  technical codes, above-the-map ordering); `map-locator-real.test.ts` stays
  green.

### RC5 — Fear: historical records deriving location live from mutable profile data

- **Investigated**: journal entry location vs worker profile/current location.
- **Finding**: the schema is already independent — a journal entry's location
  is its OWN `site_name` metric (worker-typed snapshot on the entry);
  `journal_entries` has no lat/lng columns; device coordinates live only in
  `localStorage` (never written to the DB); profiles carry country-level
  location only. No live derivation exists. The user-observed effect was the
  map's own-location marker being read as the entry's location.
- **Repair (gap)**: entries WITHOUT a saved location rendered nothing — now
  every entry card shows an explicit location line: the saved snapshot or
  "Vieta nenurodyta". The "Sistema suprato" block no longer doubles as the
  location display. No migration needed; no historical data fabricated.
- **Privacy**: exact coordinates remain structurally unexposed (no lat/lng
  columns on entries/profiles; map draws own marker only).
- **Proof**: `journal-delete-honesty.test.ts` (location block: fallback key,
  no location-store import in the entries list).

### RC6 — Messaging lacked the attachment contract real work communication needs

- **Affected**: `communication-composer.tsx`, `lib/communication/actions.ts`,
  thread page, storage.
- **Root cause**: v1 shipped deliberately text-only (guard-pinned "no file
  upload"), but every existing storage pattern was single-owner
  (`auth.uid()` folder) — messaging needed a NEW participant-scoped
  authorization pattern, so the feature was deferred until now.
- **Repair (end-to-end)**:
  - Draft migration `20260712130000_conversation_message_attachments.sql`:
    private `conversation-attachments` bucket (10 MB, MIME allowlist),
    metadata table (append-only, INSERT closed → SECURITY DEFINER register
    RPC validating author + participant + path prefix + MIME + size + 5-cap),
    `is_conversation_participant_path()` safe-cast helper for storage RLS,
    participant SELECT / uploader-folder INSERT / uploader DELETE policies,
    admin read parity with message RLS, body CHECK relaxed to 0..10000 for
    attachment-only messages. Paired rollback.
  - Composer: pick (mobile camera/photo picker via `image/*`), client
    validation, image compression, upload to the private bucket, previews,
    per-file uploading/uploaded/failed states, remove (with blob cleanup) and
    retry, send-button contract from a shared pure model
    (`attachment-model.ts`: text-only / attachment-only / mixed; block while
    uploading or failed-unresolved), typed text preserved on every failure,
    honest partial-failure notice.
  - Send action: text-OR-attachment rule, server-side batch re-validation,
    RPC registration, honest `attachmentsFailed` reporting, honest
    pre-migration degradation messages.
  - Thread: participant-scoped metadata read + 5-min signed URLs (user's own
    client, storage RLS re-checked), inline images, download links, graceful
    "attachment unavailable" state. No `getPublicUrl` anywhere.
- **Proof**: `lib/communication/attachment-model.test.ts` (pure contract),
  `lib/guards/conversation-attachments.test.ts` (migration security pins +
  app-flow honesty), `communication-migration-0021.test.ts` pin evolved
  (upload allowed ONLY to the one private bucket).
- **Gate**: DRAFT / needs-human-gate migration — apply before deploy;
  until applied the composer surfaces honest "not enabled yet" errors and the
  thread renders exactly as before.

### RC7 — Presentational cards advertising interactivity

- **Affected**: `components/visual/worker-card.tsx`,
  `components/visual/job-demand-card.tsx` (hover elevation, no handler).
- **Context**: used only on the guard-contained preview surfaces
  (`/dashboard/talent`, `/dashboard/visual-os` — unlinked from all
  navigation per `preview-surfaces-unlinked.test.ts`).
- **Repair**: hover elevation removed (presentational cards may not
  impersonate buttons); severity low because the surfaces are unreachable
  from navigation. Pages themselves stay parked by explicit owner rule.
- **Proof**: `user-journey-interaction-contract.test.ts` (RC3 block).

---

## Migrations in this branch (both DRAFT / needs-human-gate)

| File | What | Apply order |
|---|---|---|
| `supabase/migrations/20260712120000_journal_entry_restore.sql` | restore RPC (undo of soft delete) | before deploy |
| `supabase/migrations/20260712130000_conversation_message_attachments.sql` | private attachment bucket + RLS + RPC + body CHECK 0..10000 | before deploy |

Apply ONLY via Supabase MCP `apply_migration` after owner approval (never
`db push`); paired rollbacks in `supabase/rollbacks/`. Until applied, both
features degrade honestly (delete works without undo promise being broken —
the restore button surfaces the precise "not enabled yet" reason; composer
uploads fail with "not enabled yet"; thread renders as before).

## Deferred items (with reasons)

1. **Orphan-blob sweeper job** — uploads abandoned before send are already
   minimized (uploader-only DELETE policy + client cleanup on remove), but a
   periodic sweeper for crashed sessions needs a scheduled runtime the app
   does not have yet. Recorded in the migration header; storage paths are
   conversation-scoped so a future sweep is trivial.
2. **`/dashboard/talent` + `/dashboard/visual-os` removal** — sample-data
   preview surfaces; kept by explicit owner rule and containment guard
   (`preview-surfaces-unlinked.test.ts`). Removing them is an owner decision,
   not a repair.
3. **Journal list SQL-side `deleted_at` predicate** — the list filters
   deleted/superseded rows in JS after fetch (functionally correct, slight
   over-fetch). Changing the query shape touches the legacy-fallback
   projection; low value, separate cleanup.
4. **fi journal catalog** — fi is not an active locale; its journal.json was
   updated anyway (same keys), but no fi main-catalog work was done.

## Validation (this branch)

- `pnpm typecheck` — PASS
- `pnpm lint` — PASS
- `pnpm test` — PASS (9,000+ tests; new: 85 across 6 files)
- `pnpm build` — PASS
- Guards: `check:i18n-debt` (ru/nl/de zero-marker ratchet) — PASS

See `docs/launch/user-interaction-inventory-v1.md` for the full inventory of
actionable cards, statuses, destructive actions, location flows, empty
states and dead ends audited.
