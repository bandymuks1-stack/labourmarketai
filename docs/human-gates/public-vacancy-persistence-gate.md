# HUMAN GATE — public vacancy persistence v1

Migration: `supabase/migrations/20260809160000_public_vacancy_persistence_v1.sql`
Rollback:  `supabase/rollbacks/20260809160000_public_vacancy_persistence_v1.down.sql`

State: `APPLIED_TO_PRODUCTION_2026-08-09` — prod ledger version `20260809175828`.

## OWNER DECISION — GIVEN 2026-08-09

The owner approved the architecture in the continuation command that opened
this session ("#1107 ARCHITECTURE APPROVED"), conditional on a 9-point
re-verification immediately before apply. All nine were verified and recorded
in the APPLIED_LEDGER entry: head unchanged, checksums byte-identical, DDL
surface exactly as reviewed, no activation, no import caller, no anon SELECT,
governance `owner_review`, kill switch closed, CI green. Post-apply read-back:
both tables exist with 0 rows, RLS on, grants exactly as designed. The same
decision explicitly does NOT activate any source: "NEAKTYVUOK mokamų ar
teisiškai nepatvirtintų šaltinių" — source activation remains a separate
owner gate.

## Checksums this gate binds to

- migration sha256 `00d9cd878a008c40b283550ca3fad181a8a06d8d1c5a3415c45cf0004e1f3143`
- rollback sha256 `c91fbe7505509f68e95c3985924c1e3ae664165789b0facdd8ef4b152ec5aa6a`
- comment-stripped **executable** sha256
  `c7e99beaa2b202796e7372d93b08678016307594ca349e6358c12d0228c4ddb6`
  (recompute: `grep -v "^\s*--" supabase/migrations/20260809160000_public_vacancy_persistence_v1.sql | sha256sum`)

## Why this exists

Measured against `origin/main` `0d8de71d`, not inferred:

- The public-vacancy pipeline is COMPLETE — provider registry, bounded adapter,
  parser, normalizer, categorizer, validator, deduper, cursor arithmetic,
  accounting and the importer itself all exist and are tested.
- It has **zero non-test callers**, and `runVacancyImport`'s `persist` callback
  has **no implementation anywhere in the repo**.
- There is **no vacancy table**: 194 migration files, none of which creates one.

Read from the live production database on 2026-08-09:

| table | rows |
|---|---|
| `job_demands` | 0 |
| `marketplace_listings` | 0 |
| `customer_requests` | 19 total, 11 `submitted`, all first-party, 8 with `country IS NULL` |

There is no real EU job supply. A worker who searches finds nothing, because
there is nothing to find. This migration is the missing floor under a pipeline
that is otherwise finished.

## What applying it does — and does not do

Applying it creates two empty tables. **It imports nothing.** Import still
requires BOTH gates, and both remain closed after this migration:

1. **Source governance** — `arbetsformedlingen` is `activation: "owner_review"`
   in `apps/web/lib/intelligence/source-governance.ts`. Its `legalStatus` is
   already `confirmed` (JobTech APIs are free, keyless, need no prior
   notification, and the data is CC0), but activation is a separate owner
   decision and is NOT part of this gate.
2. **Runtime env kill switch** — `VACANCY_SOURCE_ARBETSFORMEDLINGEN_ENABLED`
   is unset in production.

So the blast radius of approving this migration alone is: two empty tables and
one bumped ledger row. That is deliberate — it lets the schema be reviewed and
applied on its own merits, separately from the decision to start ingesting.

## Security shape, stated explicitly

**`public_vacancies` is readable by `authenticated` only**, for rows where
`is_active`. **`anon` gets nothing.**

An earlier draft of this migration also granted `SELECT` to `anon`, reasoning
that these are already-public CC0 ads and a job board should not demand a login
to admit a job exists. That reasoning is sound for a *public* job board and
wrong for this one today: the controlled-beta worker journey begins at
registration, so every worker meant to see these rows is authenticated by the
time they look. An `anon` grant would have bought the product nothing while
being the single most sensitive line in the file.

The CI migration-safety gate agreed — it raised `rls-to-anon` and
`grant-anon-public` against the earlier draft. Those two findings are now
**gone entirely rather than bypassed**; only `grant-or-revoke` and
`alter-drop-policy` remain, and those are structurally unavoidable for any new
table with row-level security.

Opening this to `anon` later is a real product decision (public,
SEO-indexable job pages) and deserves its own migration and its own gate
record, rather than arriving as a side effect of provisioning storage.

Withdrawn ads (`is_active = false`) are readable by **no one** but
`service_role` — a removed ad stops being findable the moment the publisher
withdraws it.

Writes are `service_role` only, enforced twice on purpose:

- **privileges** — `REVOKE ALL` first (including `anon`, which is never
  re-granted), then `GRANT SELECT` to `authenticated` only. Granting without
  revoking leaves Supabase's default privileges in place, which is how a table
  ends up wider than its migration reads; and
- **RLS** — no `INSERT`/`UPDATE`/`DELETE` policy exists at all, so even a role
  holding the privilege is still refused.

**`vacancy_import_cursors` has RLS enabled and NO policies.** Every
non-`service_role` request is denied by default, and there is no policy to
misread later.

No `SECURITY DEFINER` function is added. No DML runs. No existing object is
altered or replaced — in particular, **no `CREATE OR REPLACE FUNCTION`**, so
this migration cannot silently revert an earlier function body.

**No personal data.** Every column holds publisher content. There is
deliberately no foreign key to `profiles`, `workers` or `companies`.

## Rollback

Safe at any time. Both tables hold only re-fetchable public data: every
vacancy row can be re-imported with one snapshot run, and a lost cursor costs a
single re-read — the cheap failure the cursor design already names. Nothing
authored on the platform lives here.

## What the owner is being asked

> Apply `20260809160000_public_vacancy_persistence_v1` to production?

This is a schema-only decision. Activating Sweden (or any other source) is a
SEPARATE decision and needs its own gate record.

## Verification performed before this gate was written

- `apps/web/lib/vacancy-store/vacancy-repository.test.ts` — 17 behaviour tests
  covering exact insert/update/unchanged accounting, withdrawal handling,
  translation honesty, determinism, and the rule that a **failed run never
  advances the cursor**. The steady-state test is a negative control: it fails
  against the naive single-`upsert` implementation.
- `apps/web/lib/guards/vacancy-source-boundary.test.ts` — extended with
  section (j). Persistence lives in a THIRD directory (`lib/vacancy-store/**`)
  rather than beside the importer, because `lib/vacancy-import/**` is the
  network layer and the guard already pinned that it holds no database client.
  The new pins mirror that: the store layer may hold a client but may never
  call `fetch`, never import the adapter/importer/kill-switch, must be
  `server-only`, and may name ONLY the two tables this migration creates — so
  it cannot quietly learn to write `customer_requests` and turn an external ad
  into a platform demand record.
- Migration-count ratchets re-pinned 194 -> 195 in
  `lib/guards/product-readiness.test.ts` and
  `lib/guards/market-map-read-layer-v1.test.ts`, RECOUNTED against
  `origin/main` rather than summed.
- NOT_VERIFIED: this migration has not been executed against any database.
  Applying it to a Supabase branch or local stack is the next verification
  step and is not claimed here.
