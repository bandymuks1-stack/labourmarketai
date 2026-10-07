# HUMAN GATE — historical work photos get a real relationship to evidence, places and people

Migration: `supabase/migrations/20261007100000_evidence_record_media_link_v1.sql`
Rollback:  `supabase/rollbacks/20261007100000_evidence_record_media_link_v1.down.sql`
Reader scaffold (used by nothing yet): `apps/web/lib/organization-evidence/evidence-media-read.ts`

State: `PROPOSED_AWAITING_OWNER_DECISION` — **not applied to any database.**

## The gap (owner-confirmed, stays explicit until the apply below happens)

Historical work photos have **no** relationship to `organization_evidence_records`
or to projects / work objects. A photo exists only as
`journal_entry_photos(entry_id -> journal_entries)`, and the project gallery
shows photos of journal entries that were auto-linked to a project. The evidence
tables carry `work_object_id`, `context_label` and `organization_person_id` but
no media relationship.

**The gap is closed only after a human-approved apply of the migration above
AND a separate importer/serving slice. Merging this PR does not close it.**
Until then, no screen, copy or report may claim imported photos are attached to
evidence, a project or a person.

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

## Follow-ups this deliberately does not do

Private bucket + `storage.objects` read policy (RED, separate gate); the
importer that computes sha256 and writes rows; UI; wiring the reader.
