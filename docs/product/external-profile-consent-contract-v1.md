# External Profile Consent Contract v1

Status: PREPARED (UI + services shipped, degrade honestly) + OWNER-GATED (migration)
Date: 2026-07-13
Programme: Labour Market OS — P6

## Principle

A worker may hold profiles elsewhere — LinkedIn, GitHub, Behance, a portfolio
site, a certification registry. The platform gives them **one canonical
place** to link those (`worker_external_profiles`, worker profile page
"External profiles" section), fully under the worker's control, **private by
default**, and the link is never treated as truth.

## An external profile is NEVER a second truth model

Living CV canon (`docs/product/living-cv-contract-v1.md`): the canonical
skill stores are `profile_skill_claims` + `worker_skills` — only. Hard
consequences, all shipped:

- Linking an external profile creates **no skill, no claim, no verification,
  no badge**. It is a pointer plus provenance.
- A future file import produces a **reviewable snapshot only**
  (`imported_snapshot`), which feeds REVIEWED suggestions into the existing
  claim flow. **v1 does not even auto-create claims from an accepted
  snapshot** — the worker walks through the same claim flow as with any
  self-declared skill.
- Nothing anywhere may render an external link as "verified by the
  platform". The section carries a permanent self-managed line: the worker
  adds and controls these links; the platform never fetches or checks them.

## Worker controls (the complete v1 + v2 control set)

| Control | v1 state |
|---|---|
| **Add** a link (platform + https URL) | SHIPPED — `save_worker_external_profile_v1`, 20-row cap, https-only, closed platform set |
| **Visibility** private ↔ employers | SHIPPED as a SAVED PREFERENCE — see "Visibility honesty" below |
| **Show** connected links (platform badge + masked host) | SHIPPED — list shows the hostname, not the full URL |
| **Upload** an exported profile/CV file | NOT in this section in v1 — honest note links to the existing CV-file upload (`/api/cv/extract` flow in the profile editor). No new upload path was duplicated. |
| **Import review** (accept/reject an imported snapshot) | RPC `review_external_profile_snapshot_v1` exists in the draft migration as the complete contract; **no UI in v1** because no import path can populate a snapshot yet — nothing pretends otherwise |
| **Confirm / reject** suggestions derived from a snapshot | v2 — goes through the existing claim flow, never a parallel one |
| **Disconnect** | SHIPPED — `disconnect_external_profile_v1` stamps `disconnected_at`, forces visibility back to private, **never hard-deletes** (provenance preserved; no delete path exists in migration, services, or UI) |
| **Hide** | = visibility `private` (the default) |

## Visibility honesty (v1)

The `visibility` column ships now with default `'private'`. The
`'employers'` value is a **stored preference only**: v1 RLS on
`worker_external_profiles` is owner-or-admin — **no employer read path
exists**, and no service exposes one. The UI states this in plain words next
to the toggle ("Employer viewing is not switched on yet — your visibility
choice is saved and will apply once it is."), so the toggle is a real,
honest control (it writes a real preference) without a fake reach claim.
Turning on any employer read is a separate v2 migration + consent review.

## Import review flow (contract for v2, already encoded in the schema)

```
worker uploads exported file (existing CV-extract mechanics)
  → imported_snapshot stored (bounded jsonb), import_status = pending_review
  → worker reviews:
      accept → import_status = file_imported, snapshot kept, snapshot_reviewed_at stamped
      reject → snapshot cleared, import_status = none, snapshot_reviewed_at stamped
  → accepted content feeds SUGGESTIONS into the existing claim flow
    (worker confirms each; nothing becomes a skill automatically)
```

No step of this flow fetches an external site. The platform never initiates
an "official import" in v1 — the section shows an honest "automatic import
is not offered — upload an exported CV file instead" note.

## Enforcement

- Migration: `supabase/migrations/20260713210000_multi_source_talent_v1.sql`
  (DRAFT, human-gated; RLS owner-or-admin, RPC-only writes, soft disconnect).
- Services: `apps/web/lib/worker/external-profiles{,-model,-actions}.ts` —
  needs-migration degradation, https-only validation, no fetch anywhere.
- UI: `apps/web/components/app/external-profiles-section.tsx` on the worker
  profile page — honest "prepared, owner activation pending" state until the
  owner applies the migration.
- Guard: `apps/web/lib/guards/external-profiles-consent.test.ts` — pins
  private default, no employer read path, no hard delete, no auto-import.
