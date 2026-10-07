# HUMAN GATE — historical work photos get a real relationship to evidence, places and people

Migration: `supabase/migrations/20261007100000_evidence_record_media_link_v1.sql`
Rollback:  `supabase/rollbacks/20261007100000_evidence_record_media_link_v1.down.sql`
Reader: `apps/web/lib/organization-evidence/evidence-media-read.ts` (now used by the project page and the company person card, see "Surfaces" below)

State (corrected 2026-10-07; this file previously said "not applied to any database", which became stale):
- Table migration `20261007100000_evidence_record_media_link_v1` — **APPLIED to production** (table live, RLS on, select + insert policies, 0 rows; verified read-only in a production proof on 2026-10-07). Its ledger version is not yet recorded in `docs/APPLIED_LEDGER.md` — add it with the version the MCP returned.
- Bucket migration `20261007180000_evidence_media_bucket_v1` — `PROPOSED_AWAITING_OWNER_DECISION`, **not applied.** The private `evidence-media` bucket does not exist in production, so no photo byte can be stored or served yet. See "Bucket + storage policy" below.

## The gap (owner-confirmed, stays explicit until the apply below happens)

Historical work photos have **no** relationship to `organization_evidence_records`
or to projects / work objects. A photo exists only as
`journal_entry_photos(entry_id -> journal_entries)`, and the project gallery
shows photos of journal entries that were auto-linked to a project. The evidence
tables carry `work_object_id`, `context_label` and `organization_person_id` but
no media relationship.

**The gap is closed only when the bucket migration is applied AND an importer
calls the writer. The table alone does not close it, and neither does any UI.**
Until both exist, no screen, copy or report may claim imported photos are
attached to evidence, a project or a person. (The writer exists, but nothing
calls it: no importer UI has shipped, so no photo has ever been stored.)

## What the migration adds

One table, `organization_evidence_media`, additive; no existing table, policy,
function or storage object is touched. It stores metadata only (bytes live in
private storage; no bucket or `storage.objects` policy is created here — that is
a separately gated follow-up and decides who may download bytes).

- Anchors (nullable FKs, tenant-scoped by composite FK to the same organization):
  evidence record, work object, organization person; plus an explicit
  `organization_level` flag. A CHECK requires at least one.
- Provenance: `source_system`, `source_reference`, `original_filename`,
  `original_taken_at` + `taken_at_basis` (`exif | source_metadata |
  organization_stated | unknown`; a null date must be `unknown` and vice
  versa), `imported_by_profile_id`, `imported_at`.
- Idempotency: `UNIQUE (organization_id, content_sha256)` and
  `UNIQUE (storage_path)` — re-importing the same bytes cannot duplicate media.
- Visibility: `private` (default) or `subject`. Private stays private.
- No date-proximity inference exists anywhere; nothing is matched by time.
- No payment / counterparty / owner-confirmation gate and no verification state:
  organization-provided history is reported, not verified.

## RLS (mirrors `organization_evidence_records`)

| Verb | Admission |
|---|---|
| SELECT | `manages_organization(organization_id)`; OR the linked subject, only for `visibility = 'subject'` (`is_evidence_record_subject(evidence_record_id)` or the linked `organization_people` row); OR `is_admin()` |
| INSERT | `manages_organization(organization_id)` AND `imported_by_profile_id = auth.uid()` AND any referenced work object is visible to the caller |
| UPDATE / DELETE | no policy, no grant (append-only) |

`anon` and `PUBLIC` are revoked by name; `authenticated` holds `SELECT, INSERT`
only. No `USING (true)`. No new function (existing `manages_organization`,
`is_evidence_record_subject`, `is_admin` are reused, so no new SECURITY DEFINER).

## Static gate result

`node .github/scripts/migration-safety.mjs` blocks on exactly one finding,
`grant-or-revoke` (two REVOKEs and one GRANT). Nothing else trips. The file
carries `-- @human-gate-approved` as an acknowledgement only; the PR is a draft
with `needs-human-gate`, so that is not an approval.

## Apply procedure (after explicit owner approval only)

1. Verify the production target is the labourmarket.ai project.
2. Confirm `to_regclass('public.organization_evidence_media')` is null and that
   `manages_organization`, `is_evidence_record_subject`, `is_admin` exist.
3. Apply the exact SQL of the migration file through Supabase MCP
   **`apply_migration`**, name `evidence_record_media_link_v1`. **NEVER
   `supabase db push` / `prisma migrate deploy`** — repo filenames do not match
   ledger versions and a push would re-run applied migrations.
4. Verify: `rowsecurity = true`; exactly two policies; `anon`/`PUBLIC` hold no
   privilege; `authenticated` holds exactly `SELECT, INSERT`; read as a real
   manager inside a rolled-back transaction (the evidence tables once shipped a
   policy that existed but could not be read — policy presence is not
   reachability).
5. Record the apply in `docs/APPLIED_LEDGER.md` with the ledger version the MCP
   returns. Rollback, if ever needed, is the paired `.down.sql` (guarded; it
   refuses while any row exists).

## Bucket + storage policy (second gate, RED)

Migration: `supabase/migrations/20261007180000_evidence_media_bucket_v1.sql`
Rollback:  `supabase/rollbacks/20261007180000_evidence_media_bucket_v1.down.sql`
(guarded: refuses while the bucket holds any object).

- One private bucket `evidence-media` (20 MB per object; jpeg, png, webp, heic).
- Path contract: `org/<organization_id>/<sha256>.<ext>` (content-addressed).
- `storage.objects` policies, this bucket only:
  - SELECT: an object is readable iff its registered `organization_evidence_media` row is readable under THAT table's RLS (the table decides, never the path); plus unregistered objects under an organization the caller manages (orphan cleanup).
  - INSERT: only under `org/<organization_id>/` where `manages_organization(<organization_id>)`.
  - DELETE: orphan cleanup only; a registered photo cannot be removed from the client.
- No anon, no PUBLIC, no `USING (true)`, no UPDATE policy, no public bucket.
- Apply via Supabase MCP `apply_migration` only (name `evidence_media_bucket_v1`), after explicit owner approval. Verify: bucket private with the limits above; exactly three `evidence-media` policies; a real manager can upload under their own org prefix and is refused under another's; a signed URL for a registered object mints for the manager and fails for a non-member; rolled-back probes only.

## Surfaces (code, merged independently of the apply)

- `components/app/evidence-media-strip.tsx` on the project page (anchor: the project's work objects) and the company person card (anchor: the roster person). Shows the original date with its basis (`unknown` stays `unknown`), the source system and a fixed reported-not-verified label. A failed read is an error state; an empty read is an honest empty line; a photo whose preview cannot be minted says so.
- Until the bucket exists the table is empty, so the strip shows the empty state. That is true, not a defect.
- `components/app/linked-documents.tsx` lists register documents linked to the project (`project_id`) or the person's worker record (`worker_id`) read-only, through `getOrgDocumentRegister` with a surface filter. No new access path.

## Follow-ups this deliberately does not do

The importer UI that calls the writer (`evidence-media-actions.ts`) with stated anchors and dates; subject-side display of `visibility = 'subject'` photos; EXIF extraction (a date is stored only when the caller states it together with its basis).
