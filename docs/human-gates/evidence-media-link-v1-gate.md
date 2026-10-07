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
attached to evidence, a project or a person. (The writer is now called by the
history-door importer, but it cannot store anything until the bucket exists, so no photo has ever been stored.)

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
Local proof: `scripts/db-proof/evidence-media-bucket.sh` (45 checks, real migrations verbatim on a throwaway Postgres).

- One private bucket `evidence-media` (20 MB per object; jpeg, png, webp, heic). A pre-existing PUBLIC bucket of that id aborts the migration.
- Path contract: `org/<organization_id>/<sha256>.<ext>` (content-addressed). Every policy matches the WHOLE name against one anchored regex (three segments, lowercase uuid, 64 hex, jpg|png|webp|heic), so `..`, extra folders and other filenames are refused; the uuid cast happens only inside a CASE branch that already matched.
- `storage.objects` policies, this bucket only, `to authenticated` only:
  - SELECT: an object is readable iff its registered `organization_evidence_media` row is readable under THAT table's RLS **and** the row's organization equals the path's organization; plus unregistered objects under an organization the caller manages (orphan cleanup).
  - INSERT: only under `org/<organization_id>/` where `manages_organization(<organization_id>)`. No UPDATE policy, so an upload can never overwrite an object.
  - DELETE: orphan cleanup only; a registered photo cannot be removed from the client.
- One BEFORE INSERT trigger on `organization_evidence_media` (invoker, not SECURITY DEFINER) pins `storage_bucket = 'evidence-media'` and `storage_path = org/<organization_id>/<content_sha256>.<ext by mime>`.
- No anon, no PUBLIC, no `USING (true)`, no UPDATE policy, no public bucket.

### Defect found in review and fixed in this file (adversarial pass, 2026-10-07)

The table migration (already applied) admits any `storage_path` string on insert. A manager of organization B could therefore register a row `organization_id = B, storage_path = 'org/<A>/<hash>.jpg'`. That row is visible to B under the table RLS, so the original SELECT delegation ("readable iff the registered row is readable") would have exposed A's bytes to B, and the same row would squat A's content-addressed path (`unique(storage_path)` then blocks A's own registration). Exploiting it needs A's organization id and a file hash, so it was low-likelihood, but it was a real cross-tenant hole. Fixed without touching the applied table: the trigger above refuses such a row, and the SELECT policy additionally requires the row's organization to equal the path's organization. Also tightened: unanchored/looser path checks (extra folders, arbitrary filenames), policies now `to authenticated`, `drop`-free creation, and the public-bucket abort. Proven in the local harness (forged rows refused, traversal refused, cross-org read/insert/delete refused, anon refused, rollback guarded and clean re-apply).

### Apply (reserved for the owner; nothing here applied it)

Apply via Supabase MCP `apply_migration`, name `evidence_media_bucket_v1`, the exact contents of the migration file. NEVER `supabase db push`. Record the ledger version the MCP returns in `docs/APPLIED_LEDGER.md`.

### Post-apply verification checklist (run read-only or inside rolled-back transactions)

1. Bucket config: `select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'evidence-media';` returns exactly one row: `public = false`, `file_size_limit = 20971520`, the four image types.
2. Exactly three policies: `select policyname, cmd, roles from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'evidence-media%';` returns exactly `evidence-media entity read` (SELECT), `evidence-media scoped insert` (INSERT), `evidence-media orphan delete` (DELETE), each with roles `{authenticated}`; no UPDATE/ALL policy and none for anon/public.
3. Trigger present: `select tgname from pg_trigger where tgname = 'organization_evidence_media_path_pin';` returns one row; the function is not SECURITY DEFINER (`prosecdef = false`).
4. Manager upload under OWN org prefix succeeds (real manager session, a 1 KB test JPEG at `org/<own org>/<sha256>.jpg`), then is registered through the app or a row insert, then removed ONLY while still unregistered.
5. The same manager is REFUSED (RLS error) uploading under ANOTHER organization's prefix, under `org/<own>/x/<sha>.jpg`, under `org/<own>/../<other>/<sha>.jpg` and with a non-hash filename.
6. A forged registration (`organization_id = own`, `storage_path` inside another organization's prefix, or a path not equal to `org/<org>/<content_sha256>.<ext>`) is refused with `23514`.
7. Signed URL: a manager of the owning organization can mint a signed URL for a registered object (`createSignedUrl`); a signed-in NON-member is refused for the same object; anon is refused; a manager of another organization is refused.
8. A registered object cannot be deleted by the manager (`delete` affects 0 rows); an unregistered orphan under the manager's own prefix can.
9. Clean up any test object/row created in steps 4-8 (they must be unregistered orphans or removed by the owner), then re-run 1-3 and confirm the object count in the bucket is back to its pre-check value.
10. App check: open `/dashboard/company/history` as a manager, attach one real source image to a stated place with no date, and confirm the project page strip shows it with "date unknown" and the source system; only then claim the importer works.

Rollback, if ever needed: the paired `.down.sql` (refuses while the bucket holds any object; removes policies, trigger, function, bucket).

## Historical photo importer (code, lands independently of the apply)

`components/app/organization/historical-photo-import.tsx` (+ `-form.tsx`) on `/dashboard/company/history`, below "Your imports". A manager picks ONE explicit anchor (an evidence record, a place, a roster person, or the organization itself), names the source system (required) and an optional source reference, optionally gives ONE date with the basis it came from (organization stated / source system metadata / photo metadata; empty = unknown), and selects image files. Each file goes through `uploadEvidenceMediaAction` -> `registerEvidenceMedia` under the caller's own session:

- the organization is resolved server-side; the stale-workspace binding applies;
- provenance = source system + the file name exactly as supplied; the browser's file-modified time is never read, no date or anchor is parsed from a file name, nothing is matched by date proximity;
- visibility is always `private` on this path;
- real-byte MIME sniff, sha256 idempotency (re-attaching the same bytes answers "already attached" and changes nothing; a second anchor for the same bytes is NOT created - one row per bytes per organization);
- refusals are named per code (needs_migration says photo storage is not switched on; nothing is claimed stored);
- in-app files are capped at 4 MB (the server-action body limit is 5 MB). Originals between 4 and 20 MB need a direct-upload path that is not built.

## Surfaces (code, merged independently of the apply)

- `components/app/evidence-media-strip.tsx` on the project page (anchor: the project's work objects) and the company person card (anchor: the roster person). Shows the original date with its basis (`unknown` stays `unknown`), the source system and a fixed reported-not-verified label. A failed read is an error state; an empty read is an honest empty line; a photo whose preview cannot be minted says so.
- Until the bucket exists the table is empty, so the strip shows the empty state. That is true, not a defect.
- `components/app/linked-documents.tsx` lists register documents linked to the project (`project_id`) or the person's worker record (`worker_id`) read-only, through `getOrgDocumentRegister` with a surface filter. No new access path.

## Follow-ups this deliberately does not do

A direct-to-storage upload path for originals above 4 MB; per-file dates in one batch; moving/re-anchoring an existing photo (rows are append-only); subject-side display of `visibility = 'subject'` photos; EXIF extraction (a date is stored only when the caller states it together with its basis).
