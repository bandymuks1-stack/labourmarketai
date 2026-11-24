# HUMAN GATE — Document & Evidence Engine file layer v1

Migration: `supabase/migrations/20260817140000_document_file_layer_v1.sql`
Rollback:  `supabase/rollbacks/20260817140000_document_file_layer_v1.down.sql`
State: `PENDING APPLY BY LEAD` — pre-approved by owner mandate 2026-08-17
(autonomous functional completion train V2, §4 migration authority). The
train LEAD session applies it to production via Supabase MCP
`apply_migration` after CI is green; never `db push`, never auto-apply.

## What it changes
1. `document_types` category constraint widened (`+ 'organization'`) and
   seven org-category slugs seeded (policy / procedure / instruction /
   correspondence in+out / internal / agreement attachment). Additive.
2. NEW tables, all default-closed, SELECT-only for authenticated, writes
   RPC-only: `org_documents` (org register), `org_document_events`
   (append-only), `document_files` (version rows — the file truth for both
   worker and org scope), `document_acknowledgements` (version-bound,
   fill-once; acknowledging v N never covers v N+1).
3. Four SECURITY DEFINER authority helpers + seven SECURITY DEFINER RPCs
   (create/archive/revoke org document, register file version, assign
   acknowledgement, acknowledge, record classified download). All revoke
   anon + public; grant execute to authenticated only.
4. PRIVATE storage bucket `document-files` (public = false, 5 MB cap,
   MIME allowlist) + four `storage.objects` policies: read delegates to the
   `document_files` RLS truth; insert/delete only under the canonical
   parent-scoped path prefix; delete only for UNREGISTERED orphans.
5. `worker_document_events` event_type constraint widened
   (`+ 'file_uploaded'`). Additive.

`worker_documents` stays canonical for worker scope — no data migration,
no parallel registry, `file_path` stays dead (document_files is the truth).

## Why
The registry is metadata-only: no bucket, no file rows, an honest "upload
is not available yet" note. Organizations have no document register and no
read-confirmation mechanism at all.

## What the lead applies
> `20260817140000_document_file_layer_v1` (this file), then
> `20260817140100_notification_document_types_v3`.
No further storage console steps are needed: the bucket + policies are
created by this migration itself.
