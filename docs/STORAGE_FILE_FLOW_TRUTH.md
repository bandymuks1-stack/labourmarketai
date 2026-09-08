# STORAGE_FILE_FLOW — the file-handling truth

> **This document defines the token `STORAGE_FILE_FLOW`.** Before this PR the
> token appeared nowhere in the repo; from now on it names the platform's
> complete file-handling contract, and `apps/web/lib/guards/storage-file-flow.test.ts`
> is its executable proof.

Verified against source 2026-08-31. If any table row stops matching the code,
fix the code or this doc in the same PR — the guard pins the load-bearing rows.

## The one pattern

Every storage-backed flow follows the same shape:

1. **Upload to an ownership-scoped path** in a **private** bucket (storage RLS
   pins the folder prefix to the caller).
2. **Register** the object — a `SECURITY DEFINER` RPC (or an owner-RLS column
   write for avatars) that re-validates ownership, MIME, size and path
   server-side.
3. **On registration failure, remove the just-uploaded orphan blob** (or, for
   the two pre-send/deferred flows below, surface the failure honestly and let
   the owner-scoped delete policy govern cleanup).
4. **Reads mint short-TTL signed URLs only.** `getPublicUrl` appears nowhere in
   the app (guard-pinned). No bucket is public.

## The five storage-backed flows

| # | Bucket (private) | Upload site | Path contract | Register step | Orphan handling on register failure | Read path (TTL) |
|---|---|---|---|---|---|---|
| 1 | `journal-entry-photos` | `apps/web/lib/journal/photo-upload.ts` | `<profile_id>/<entry_id>/<photo_id>/<filename>` | RPC `register_journal_entry_photo` (re-checks ownership, MIME, size, 1-photo free limit) | `.remove([path])` — proven behaviorally in the guard | `lib/journal/personal-gallery.ts`, `lib/journal/project-gallery.ts` — `createSignedUrls`, 3600 s |
| 2 | `profile-avatars` | `apps/web/lib/profile/avatar-upload.ts` | `<profile_id>/avatar-<uuid>.<ext>` | `setProfileAvatarPath` server action → owner-RLS update of `profiles.avatar_url` (NOT a definer RPC — deliberate, owner-only column) | `.remove([path])` — proven behaviorally | `lib/profile/avatar.ts` — `createSignedUrl`, 3600 s |
| 3 | `conversation-attachments` | `components/app/communication-composer.tsx` (pre-send) | `<conversation_id>/<uploader_id>/<attachment_id>/<filename>` (`conversationAttachmentPath`) | RPC `register_conversation_message_attachment` inside `lib/communication/actions.ts` `sendMessage`, AFTER the message row exists | **Different by design**: a post-send register failure never un-sends the message — it is counted and surfaced as `attachmentsFailed`. Pre-send, the tray's remove control deletes the blob (`.remove([att.storagePath])`, uploader-only storage DELETE policy) | `lib/communication/attachments.ts` — `createSignedUrl`, 300 s |
| 4 | `customer-request-attachments` | `components/app/buyer-request-attachment-uploader.tsx` | `<profile_id>/<request_id>/<attachment_id>/<safe_name>` | RPC `register_customer_request_attachment` via `lib/buyer/request-attachment-actions.ts` → `lib/buyer/customer-request-attachments.ts` | **Honest error, no auto-rollback**: the blob stays under the caller's OWN folder (owner-scoped storage RLS); user-initiated `removeAttachment` deletes blob **then** metadata row (order guard-pinned). Known accepted residue, not silent | `createSignedDownloadUrl` — `createSignedUrl`, 300 s |
| 5 | `document-files` | `apps/web/lib/documents/document-file-actions.ts` (server action, real-bytes size check, server-side sha256) | `worker/<worker_id>/doc/<doc_id>/v<n>/<file>` or `org/<org_id>/doc/<doc_id>/v<n>/<file>` (`buildWorkerDocumentFilePath` / `buildOrgDocumentFilePath` — pinned by RPC AND storage policies) | RPC `register_document_file_v1` (re-checks authority, re-derives monotonic version, re-verifies prefix) | `.remove([path])` — proven behaviorally; the storage delete policy admits ONLY unregistered objects, so a registered file can never be removed this way | `app/api/documents/file/[fileId]/route.ts` — `createSignedUrl`, 60 s (`DOCUMENT_FILE_SIGNED_URL_TTL_SECONDS`) |

## In-memory-by-design flows — NOT gaps

> **Warning to future auditors:** "the CV file is not in a bucket" is a
> **designed privacy property**, not a missing feature. Do not "fix" it.

- **CV import — `apps/web/app/api/cv/extract/route.ts`**: an authenticated,
  rate-limited route that turns an uploaded CV into raw text **in memory** and
  returns it ONLY to the caller. No blob is stored, no DB row is written, no
  file touches disk, the text is never logged. The person reviews the text and
  saves it into their own profile through the existing owner-only flow. Input
  cap is **25 MB** (`MAX_CV_BYTES`, `lib/cv/extract.ts` — raised from 5 MB by
  owner audit §10; the route header stating 25 MB is guard-pinned so the
  comment can never go stale again). Negative proof:
  `lib/guards/storage-file-flow.test.ts` ("CV extract route — persists
  NOTHING").
- **Document → journal draft — `apps/web/lib/journal/document-journal-draft.ts`**:
  reads a REGISTERED `document-files` blob back (RLS answers first), extracts
  text with the same pure extractor, and proposes a review-only journal draft.
  Nothing is persisted by the seam (§7.1: machine suggests → human confirms);
  the eventual save goes through the canonical `create_journal_entry_full`.
  Classified org documents and image MIME types are refused honestly (no OCR
  exists in the product).

## Streamed exports — no server-side file generation

CV export is an **HTML print layout** (`components/app/cv/eu-format-cv.tsx` +
`components/app/print-button.tsx`): the browser prints/saves it. There is no
server-side DOCX/PDF generation, no export blob is ever written to storage,
and no generation library (pdfkit / puppeteer / docx) is in the dependency
tree. Documents produced this way are therefore not STORAGE_FILE_FLOW members.

## Dormant columns — deliberate

`customer_request_attachments.extracted_text` and `structured_summary`
(migration `0029`) are **intentionally NULL** — the sprint required honest
metadata-only Level 1 behaviour first. `lib/buyer/attachment-readiness.ts`
parses no PDF and stores no extracted text; guards
`attachment-readiness.test.ts` and `admin-request-review.test.ts` pin that
nothing reads or writes these columns. Do not treat the empty column as a bug
and do not start filling it without an owner decision.

## Proof inventory — what is proven where

| Layer | Proof | Covers |
|---|---|---|
| DB / RLS (live cross-tenant) | `scripts/db-proof/document-file-layer.sh` (+ prelude/seed) | document-files policies, register RPC authority, unregistered-only delete |
| DB / RLS (live) | `scripts/db-proof-journal-photo-continuity.mts` | journal photo storage policies + org-manager select continuity |
| Static + behavioral guard | `apps/web/lib/guards/storage-file-flow.test.ts` (this PR) | orphan-rollback branches of flows 1, 2, 5 (behavioral, mocked client, RPC rejects → exact-path `.remove()`, with success-path negative controls); flows 3–4 orphan story pinned statically; signed-URL-only reads across all five; CV-extract non-persistence; document→journal draft in-memory |
| Static guards (pre-existing) | `conversation-attachments.test.ts`, `journal-photo-continuity.test.ts`, `journal-modes-gallery.test.ts`, `company-role-simplicity.test.ts`, `attachment-readiness.test.ts`, `admin-request-review.test.ts`, `document-file-layer.test.ts`, `cv-upload-no-burden.test.ts` | bucket privacy (`public = false`), migration policy contracts, dormant-column bans, cap coherence |

Non-vacuity: every behavioral rollback assertion in the new guard was
sabotage-tested (the `.remove()` branch deleted locally → 5 test failures
across the three flows; a `.storage` reference injected into the CV route →
guard failure) before being restored to green.
