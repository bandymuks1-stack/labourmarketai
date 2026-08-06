# HUMAN GATE — W6 experience author/subject model v1

Migration: `supabase/migrations/20260806230000_experience_author_subject_v1.sql`
Rollback:  `supabase/rollbacks/20260806230000_experience_author_subject_v1.down.sql`
State:     `W6_AUTHOR_SUBJECT_MODEL_CODE_COMPLETE_PENDING_HUMAN_GATE`

The migration ships with **NO approval annotation** — an agent never approves
its own migration. The owner records the approval on the PR when (and if)
they take the apply decision.

## What it fixes (the recorded W6 modelling defect)

`W1_W22_CURRENT_STATE_MATRIX.md` W6 row: *"an experience about an EMPLOYER is
stored as `subject_type='worker'` + profile id."* Verified root cause on main
`ac6186dc`:

1. The `accepted_booking` arm of `submit_experience_record` recognised only
   profile↔profile parties. Org demand spine v2 (applied in prod) made
   bookings organization-scoped (`booking_requests.organization_id`,
   inherited from the demand) — a worker describing that employer MUST get an
   organization subject, and could not.
2. No row recorded the AUTHOR side: an org manager writing about a worker and
   a person writing as themselves were indistinguishable.
3. The moderation queue and the experiences result rendered subject-blind
   rows (an org-subject row read exactly like a row about a worker).
4. The app-side org-authority read (`getOwnedOrganizations`, owner-only) was
   narrower than the SQL truth (`manages_organization`, membership-widened).

## What the migration does

- Adds `author_side text not null default 'person'` (`person|organization`)
  and `author_organization_id uuid references organizations(id) on delete
  set null` to `experience_records`.
- Backfills author side for existing engagement-kind rows from the engagement
  row itself (**production no-op: 0 experience rows on 2026-08-06**).
- Adds three invariants: author-side/organization shape agreement; an
  organization never reviews itself; ONE org-authored record per interaction
  (partial unique index) — the organization speaks once, whoever types it.
- Replaces `submit_experience_record` (same signature): derives author side
  server-side from the interaction row; org-scoped bookings resolve the
  worker's subject to the booking ORGANIZATION and require LIVE
  `manages_organization()` authority for employer-side authorship (a revoked
  manager is refused; historical rows are untouched).

## Migration-safety findings the owner is asked to accept

1. **grant-or-revoke** — REVOKE/GRANT restated for the replaced RPC (the
   secdef-closure rule requires privileges to be explicit in the redefining
   file). Same privilege state as v1: authenticated EXECUTE, anon/public none.
2. **security-definer-function** — `submit_experience_record` recreated as
   SECURITY DEFINER `set search_path = public` (unchanged v1 property;
   eligibility is re-derived across tables the caller cannot read).
3. **data-dml** — one guarded backfill UPDATE, classifying existing
   engagement-kind rows' author side from canonical engagement rows.
   Production row count is 0, so it updates nothing there.
4. **drop-constraint** — `drop constraint if exists` + immediate matching
   `add constraint` (idempotent re-runnable form, same pattern as v1's
   policies). No constraint is removed without its replacement in the same
   statement pair.

## Proof already on record (local, disposable stack, exact main + this migration)

- DB proof `apps/web/scripts/w6-author-subject-proof.sql`: **35/35 PASS**
  (`W6_AUTHOR_SUBJECT_DATABASE_MODEL_PROVEN`) — the §10 cast: worker W, orgs
  A/B/C, owner/manager/member/revoked actors, both interaction kinds, org
  duplicate-voice, revocation, dispute separation, neighbouring domains
  untouched, CHECK backstops.
- v1 regression `w6-experience-domain-proof.sql`: **43/43 PASS** with the new
  RPC (RLS, grants, moderation, response, dispute unchanged).
- Rollback cycle: down → columns gone + v1 43/43 → up → 35/35 again.
- Browser proof: e2e spec 9/9 + 4 evidence screenshots (1440/375, worker +
  admin queue) in `docs/audits/evidence/premium-rebuild/w6-author-subject/`.
  `W6_AUTHOR_SUBJECT_UI_BROWSER_PROVEN`.

## Between merge and production apply (feature-detected, fail-closed)

- Reads: `author_side` is selected with a 42703 fallback — rows render
  without the author-side label until the column exists. `subject_type` is a
  v1 column and renders immediately.
- Writes: in production (0 bookings, org-scoped bookings impossible today)
  the old RPC keeps answering; nothing can produce a wrong-subject row while
  the gate is pending.

## The owner decisions

- **W6-D1 (this gate): apply `20260806230000` to production** via Supabase
  MCP `apply_migration`, recording the approval marker per procedure. Until
  given, the migration stays unapplied and the PR stays Draft/RED.
- The production WRITE proof of the corrected model is a separate gate
  (PROD_QA package) and is NOT requested here.
