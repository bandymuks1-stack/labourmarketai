# HUMAN GATE — recognised equivalence (RPL) gets a real, assessor-authored object

Migration: `supabase/migrations/20261007120000_competency_recognitions_v1.sql`
Rollback:  `supabase/rollbacks/20261007120000_competency_recognitions_v1.down.sql`
Origin: draft `20260915140000_competency_recognitions_v1` (PR #1741, SKL-9 / ARCH-2), ported onto current `main`.

State: `PROPOSED_AWAITING_OWNER_DECISION` — **not applied to any database.**
The `-- @human-gate-approved` header is an acknowledgement, not an approval.

## The gap

Five years of real work reads on every requirement surface as "certificate
missing". The product has objects for demonstrated capability (journal evidence)
and for formal qualification (worker documents) but none for the middle state,
RECOGNISED EQUIVALENCE. That state is an independent assessor's act and cannot
be derived. Until this is applied, no screen or copy may claim a recognition
exists or is recordable.

## What the migration adds

One table `competency_recognitions` (subject, closed requirement kind
document_type / skill / profession + key + optional country, 1..50 cited journal
entry ids, assessing organization, assessing person, decision recognised /
not_recognised, validity dates, note, `supersedes_id`, revocation with reason),
plus two SECURITY DEFINER commands: `record_competency_recognition_v1` (11 args)
and `revoke_competency_recognition_v1(uuid, text)`. `search_path = public` pinned.

## Authority rule (enforced in the function)

- Assessing org holds the `training_provider` organization role (one named constant).
- Caller manages that org (`manages_organization`). **No `is_admin()` override**:
  admin may read, never forge or revoke an assessment.
- Caller is not the subject.
- The assessing org does not engage the subject as a worker (any non-ended
  `engagement_contexts` row other than `student`; active and paused both count).
- Every cited entry belongs to the subject and carries a confirmation by someone
  other than the subject; a malformed id raises `22023`, not `22P02`.
- Corrections append (`supersedes_id`, own organization only); revoke only sets
  `revoked_at` / `revoked_reason`.

## RLS and grants

RLS enabled and FORCED. `anon` / `PUBLIC`: nothing. `authenticated`: SELECT only,
policy = the subject, managers of the assessing org, or admin. Employers cannot
read. No INSERT / UPDATE / DELETE policy or grant. Both functions: revoked from
`public, anon`; EXECUTE granted to `authenticated`.

## Static gate result

`migration-safety` is expected to block (new SECURITY DEFINER bodies, grants);
the PR is draft + `needs-human-gate`. Exact output is in the PR body.

## Apply procedure (after explicit owner approval only)

1. Verify the production target is the labourmarket.ai project.
2. Confirm `to_regclass('public.competency_recognitions')` is null and that
   `manages_organization`, `is_admin`, `organization_roles`, `journal_entries`,
   `journal_entry_confirmations`, `engagement_contexts` exist.
3. Apply the exact SQL through Supabase MCP **`apply_migration`**, name
   `competency_recognitions_v1`. **NEVER `supabase db push` / `prisma migrate deploy`.**
4. Verify: `rowsecurity` and `forcerowsecurity` true; one policy; `anon` holds
   nothing; `authenticated` holds SELECT only; call the commands as a real
   assessor inside a rolled-back transaction (policy presence is not reachability).
5. Record the apply in `docs/APPLIED_LEDGER.md` with the version the MCP returns.
   Rollback is the paired `.down.sql` (guarded; refuses while any row exists).

## Deliberately not built

Request-for-assessment workflow, scores, ESCO ranking, automatic recognition from
evidence counts, UI. The floor in the model says "could be assessed", never "is recognised".
