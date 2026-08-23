# Wagon C2 — document → journal UI wiring blueprint (value train 2)

**Status:** C2a (this PR) ships the invisible half — `createJournalEntry`
accepts a verified `source_document_file_id` and records the provenance
metric rows. C2b (the visible half) is FULLY DESIGNED below but deliberately
NOT shipped from the 2026-08-23 managed session: that environment has no
Docker daemon, so the local Supabase stack and a real browser pass are
impossible there, and the doctrine verification rule (doctrine-guard §5: a
user-visible change is merged only after a real browser pass) is not
negotiable. This document is the complete implementation contract so the
next session with a browser executes, verifies, and ships it without
re-auditing.

## The guard-pinned constraint C2b must respect

`/dashboard/journal` renders the composer in EDIT MODE ONLY —
`journal/page.tsx` (`editingEntry ? <JournalEntryComposer/> : …`), pinned by
`lib/guards/journal-profile-single-path.test.ts`. A fresh record starts in
the chat (`/dashboard?intent=log-work`). **Never add a create-mode composer
branch to the journal page.**

## Wiring plan (audited 2026-08-23, file:line-verified)

1. **`components/app/worker-document-file-slot.tsx`** (server component) —
   one plain `Link` next to the existing `DownloadLink`, rendered only when
   `info.current` exists AND `isExtractableDocumentMime(mime)`:
   `/dashboard/documents?draftFrom=<document_files.id>`. No dialog, no
   client boundary.
2. **`app/[locale]/dashboard/documents/page.tsx`** — add `draftFrom?: string`
   to the existing free-form `searchParams` bag ("searchParams only, no
   route" is that page's stated pattern). When present:
   `await draftJournalSuggestionsFromDocument(draftFrom)` and render an
   inline review section by `kind` — honest one-line notices for
   `refused`/`empty`/`failed`/`not-found`, and for `ok` the extracted text
   in an EDITABLE textarea (the worker's review), the detected suggestions,
   an engagement selector, and one save.
3. **Engagement options** — reuse `listWorkLogEngagements()`
   (`lib/conversation/worklog-engagements.ts`), the canonical reader the
   chat worklog flow already uses. Never re-derive engagements.
4. **Save** — the EXISTING `createJournalEntry` server action, via a small
   client form (labels passed as props, the `WorkerWorkLogFlow` precedent —
   avoids the client-messages-allowlist question entirely). Hidden fields:
   `locale`, `source_document_file_id`. C2a already parses + RLS-verifies
   the id and appends `documentProvenanceMetrics` rows; the extractor
   version is stamped server-side and never read from the client.
5. **Component naming (product-gate traps, verified against
   `.github/scripts/product-gate.mjs`):** modified files are never scanned;
   a NEW component must avoid `*-card.tsx` names, `role="dialog"`/modal
   markup, and `currentStep`/`activeStep`/wizard vocabulary. Safe name:
   `components/app/document-journal-draft-review.tsx`. No new route — any
   new `page.tsx` under `/dashboard/journal/` is a certain
   `new_journal_module` finding.
6. **i18n** — keys under the existing `documentFiles` namespace
   (`documentFiles.journalDraft.{action,intro,refusedClassified,refusedNoOcr,refusedType,empty,failed,engagementLabel,save}`),
   all 11 UI locale files in the same PR, REAL translations at least for
   lt/en/ru/nl/de (parity + untranslated-ratchet guards). Refusal copy stays
   honest: "photos are not read — no text recognition exists".

## Browser proof plan (acceptance §27 of the train mission)

Local env per `docs/TESTING.md`: `npx supabase start` → `db reset` →
`pnpm db:fixtures:local` → `pnpm -C apps/web e2e:local` (seeded worker
`dev.worker@local.test`/`password`). **Fixture gap:** `dev-fixtures.sql`
seeds two `worker_documents` but no `document_files` rows and no storage
objects — the spec must upload its own small generated PDF through the real
UI (`doc-file-input` → `doc-file-upload-submit`), which is the honest E2E
path and exercises the C1 RLS predicate for real.

New spec `apps/web/tests/e2e/document-journal-draft.spec.ts` (skips cleanly
without `SUPABASE_TEST_URL`; model auth/upload on
`cv-upload-authenticated.spec.ts`, save assertions on
`journal-confirm-loop.spec.ts`):
1. anonymous `?draftFrom=` → login redirect;
2. happy path: upload text-bearing PDF → draft link → inline review →
   save → `journal-saved-banner` → entry visible on `/dashboard/journal` →
   manager confirm via `/dashboard/inbox/quick` (closes the §27 chain);
3. image upload → `image_no_ocr` refusal copy, NO entry created;
4. random uuid → `not-found` notice, no leak;
5. keep `w3-row16-identity-actions.spec.ts` green.

Evidence bar: screenshots 1440+375, lt+en, zero console errors, zero
hydration warnings, no horizontal overflow, both themes.

## What stays out of C2 entirely

Persisted extraction proposals (`journal_entry_extractions` writer RPCs) and
the durable `journal_entries.source_document_file_id` column are RED,
owner-gated follow-ups (C3) — see the import-chain audit's S5/S4b. Bulk
multi-year import is designed only AFTER the representative proof passes.
