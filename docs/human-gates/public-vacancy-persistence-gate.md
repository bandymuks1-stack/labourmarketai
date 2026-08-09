# HUMAN GATE — public vacancy persistence v1

Migration: `supabase/migrations/20260809160000_public_vacancy_persistence_v1.sql`
Rollback:  `supabase/rollbacks/20260809160000_public_vacancy_persistence_v1.down.sql`

State: `AWAITING_OWNER_DECISION` — ships UNAPPLIED.

## Checksums this gate binds to

- migration sha256 `6ab1f00d7b471975df2c94ec63fe2f816758c377a9b3dee79566feb64eb4c5ef`
- rollback sha256 `c91fbe7505509f68e95c3985924c1e3ae664165789b0facdd8ef4b152ec5aa6a`
- comment-stripped **executable** sha256
  `389fef0d2dbb7fc5f5ac9a6c6fa2c031cb28b67fe25a62838b4b0bfecb9721c6`
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

**`public_vacancies` is readable by `anon` and `authenticated`** for rows where
`is_active`. That is a deliberate product decision:

- the rows are already-public CC0 ads that a public employment service
  publishes on its own website, carrying per-row attribution; and
- a job board that demands a login before admitting a job exists is precisely
  what the beta is trying to stop being.

Withdrawn ads (`is_active = false`) are readable by **no one** but
`service_role` — a removed ad stops being findable the moment the publisher
withdraws it.

Writes are `service_role` only, enforced twice on purpose:

- **privileges** — `REVOKE ALL` first, then `GRANT SELECT` to `anon` and
  `authenticated`. Granting without revoking leaves Supabase's default
  privileges in place, which is how a table ends up wider than its migration
  reads; and
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
