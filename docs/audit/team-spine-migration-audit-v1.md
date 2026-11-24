# Team-Spine Migration Audit v1 — `20260705220000_team_brigade_org_spine`

**Date:** 2026-07-17 · **Scope:** read-only audit (no migration applied, no rename,
no compensating migration). **Prod project:** `gorgitwvdzxbnaxhrsrw` (labourmarket.ai).

## Terminal classification

> **`LEDGER_DOCUMENTATION_DRIFT`**

The migration **was applied to production** (human-gated, via Supabase MCP, on
2026-07-05) but its row is **missing from `docs/APPLIED_LEDGER.md`**, while its two
dependents were recorded. There is **no production schema risk** and **no
migration to apply** — the only defect is a missing ledger row.

## Question-by-question evidence

**1. Is the migration really DRAFT?**
The repo file `supabase/migrations/20260705220000_team_brigade_org_spine.sql`
carries the header `DRAFT — needs-human-gate — DO NOT APPLY automatically. Apply
ONLY via Supabase MCP apply_migration after explicit owner approval. Never
db push.` That header is a **human-gate marker** ("never auto-apply / never
`db push`"), not a claim that the migration is unapplied. Guard
`apps/web/lib/guards/team-brigades-layer.test.ts:172` asserts this header must
remain — so the header is **correct and must stay** (it is what forced the
owner-gated MCP apply that actually happened).

**2. Why is it not in `APPLIED_LEDGER`?**
Omission at apply time. The two dependents applied later (2026-07-16) each added
their ledger row; the base spine's row was never added. No guard reads
`APPLIED_LEDGER.md` to assert the spine's absence (the ledger mentions in guards
are explanatory comments only), so the drift went unnoticed.

**3. Which later changes depend on it?**
- `20260716130000_team_profile_details_v1.sql` (ledger `20260716195121`, applied
  2026-07-16) — `team_details` 1:1 on a `organization_type='team'` org.
- `20260716131000_team_enquiries_v1.sql` (ledger `20260716195230`, applied
  2026-07-16) — `team_enquiries` + RPCs over team orgs.
Both require the spine's `'team'` enum value and org-spine wiring to function.

**4. Does prod already have the analogous objects? (read-only SQL, 2026-07-17)**
Yes — all present:
```
organizations_organization_type_check =
  CHECK (organization_type = ANY (ARRAY['company','agency','team','other']))
create_team_v1            → exists (1)
save_team_details_v1      → exists (1)
public.team_details       → exists
public.team_enquiries     → exists
```
And Supabase's own migration history confirms the apply:
```
supabase_migrations.schema_migrations:
  version 20260705085611  name 20260705220000_team_brigade_org_spine
  version 20260716195121  name team_profile_details_v1
  version 20260716195230  name team_enquiries_v1
```

**5. Is there drift between repo, ledger and prod?**
Yes, exactly one axis: **repo ↔ ledger**. Prod and the migration *file* agree
(the objects the file defines are all in prod). The **ledger** (the human-readable
record) is missing the spine row. Repo guards/product-readiness comments still
describe the spine as a "deferred / not-applied DRAFT", which is stale relative to
prod — but they are comments, not failing assertions.

**6. Documentation error, missing migration, or dangerous partial state?**
**Documentation error (missing ledger row).** Not a missing migration (it is
applied). Not a dangerous partial state: the objects are present and consistent
with the dependents, and the app degrades honestly if any team object is absent
(`lib/company/team-brigades.ts` maps `42P01/42883/42703` to "prepared, not
enabled") — so even a hypothetical partial state could never render fake data.

## Actions taken by this audit

- **Added the missing `APPLIED_LEDGER.md` row** for `20260705220000` (applied
  2026-07-05, Supabase version `20260705085611`), with the prod-verification
  evidence above. This is the whole fix.
- **Left the migration `.sql` untouched** — its `DO NOT APPLY automatically`
  header is a required human-gate marker (guarded) and is semantically correct.
- **No migration applied, renamed, or compensating migration created.** Only
  read-only `SELECT`s were run against prod.

## Owner note (optional, non-blocking)
Repo guard comments (`product-readiness`, `market-map-read-layer-v1`,
`ops-bridge-migration`) still narrate the spine as "NOT applied / deferred". They
do not fail, but a future cleanup could refresh those comments to match reality.
No action required for correctness.
