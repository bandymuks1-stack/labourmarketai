# Historical migration audit trail

This directory preserves the **exact SQL that was applied to production** for
migration files that were later edited in the repository.

Editing a migration file that production has already executed is normally
forbidden: the file stops being a faithful record of what production ran. When
it is done deliberately — to make a fresh `supabase db reset` reproduce the
production end-state — the original bytes must survive somewhere immutable, and
the divergence must be stated in full. That is what these files are for.

`<version>_original-production-applied.sql` is a byte-identical copy of the file
as it existed in the commit that introduced it. Its SHA-256 equals the
`Migration sha256` recorded in `docs/APPLIED_LEDGER.md` for that version — that
equality is the proof the copy is genuine, and
`apps/web/lib/guards/historical-migration-audit-trail.test.ts` enforces it on
every CI run, so these records cannot be silently dropped or altered.

## Risk statement (precise wording — not "none")

For every entry below, all three of the following hold:

- **Production runtime state is UNCHANGED.** No migration was re-applied, no
  grant, function, table, policy or row was touched in production by this work.
- **The production migration ledger is UNCHANGED.** The recorded version, name
  and timestamp are exactly as they were; the version is already present, so
  Supabase will never execute the file again.
- **The canonical historical migration artefact HAS been modified.** The repo
  file no longer matches what production executed, and its SHA-256 no longer
  matches the value recorded in `docs/APPLIED_LEDGER.md`. This is a deliberate
  reproducibility correction, documented here, not an accident.

The residual risk is therefore **not zero and not runtime**: it is an
*archival* risk. Anyone reading `supabase/migrations/` alone would now
reconstruct a slightly different history than production actually ran. This
directory is the mitigation, and the ledger entries point here.

## How the fresh-install schema now differs from the production apply

The two environments start from **different grant baselines**, which is the
whole reason the edits were needed:

| | Production | Fresh `supabase db reset` |
|---|---|---|
| Default privileges on new `public` functions | none — Postgres default `PUBLIC=X` only (proven by the `proacl IS NULL` functions handled in `20260722160000` §2b) | Supabase bootstrap `ALTER DEFAULT PRIVILEGES` grants EXECUTE **explicitly** to `anon`, `authenticated`, `service_role` |
| Effect of `REVOKE ... FROM PUBLIC` | removes anon reachability | does **not** remove anon — the `anon=X` entry is explicit |
| `SECURITY DEFINER` functions in `public` | 205 at the time of the original audit | 235 after the full 166-migration chain |

Consequently a plain `REVOKE ... FROM PUBLIC`, sufficient in production, closes
nothing on a fresh local database. The edits add revokes that name `anon` (and,
for the trigger-only set, `authenticated`) **directly**. Each added statement is
an idempotent no-op against the production grant model, so the two environments
converge on the *same* end-state by different routes.

**Verified end-state on a clean local reset** (`supabase db reset`, exit 0, all
166 migrations): 235 `SECURITY DEFINER` functions in `public`; `anon` reaches
exactly the 4 allowlisted public RPCs and is denied on the other 231;
`service_role` and `postgres` retain EXECUTE on all 235.

---

## Entry 1 — `20260722160000_secdef_anon_reach_revoke_v1.sql`

| Field | Value |
|---|---|
| Original commit | `d9d7d7ff7a0d78451197c265cc2a8b8ab92562f9` (PR #847) |
| Original SHA-256 | `88ea8ef5a8a98cd5da7ea3ba24407a8b3e234c0be4052bc5f22376b086f6a286` (24,890 bytes) |
| Amended SHA-256 | `991640deb81d2fe74228227e5d29af75464dbab44927452e2b282688b244971d` (31,325 bytes) |
| Production ledger version | `20260722093138`, recorded as `secdef_anon_reach_revoke_v1` |
| Applied | 2026-07-22, via Supabase MCP `apply_migration` |
| Preserved original | [`20260722160000_original-production-applied.sql`](20260722160000_original-production-applied.sql) |

**Why it was changed.** The file's §5 fail-closed assertion encodes the
production end-state ("anon reaches exactly the 4 allowlisted RPCs"). On a fresh
local database that assertion could not hold, so `supabase db reset` **failed**
and the migration chain was not reproducible. Two blocks were added:

- **§4b** — revokes `PUBLIC` + `anon` on every `public` `SECURITY DEFINER`
  function except the 4 allowlisted ones, making the migration the canonical
  closure point instead of depending on an out-of-band platform baseline.
- **§4c** — additionally revokes `authenticated` on the 10 trigger-only/dead
  functions that §5d requires to hold no grant. Needed only because the local
  baseline grants `authenticated` explicitly; production never granted it.
  Safe because EXECUTE is checked at `CREATE TRIGGER` time, not when a trigger
  fires, and `owns_customer(c uuid)` backs zero RLS policies (re-verified
  against `pg_policies` on a clean reset).

The §4b header comment was also corrected: it previously asserted that a fresh
database "keeps Postgres's default PUBLIC (hence anon) EXECUTE". That is wrong —
measurement shows the grants are explicit — and acting on the wrong model is
exactly what left the reset failing.

## Entry 2 — `20260723053000_contact_demand_owner_v1.sql`

| Field | Value |
|---|---|
| Original commit | `edc4e43dc85fa0a6fb389e66c873e8f612612547` (PR #853) |
| Original SHA-256 | `eaf846175af66ae10d6e658cd3a18e162b23682973a9c953aa8ce7387c6027d7` (7,077 bytes) |
| Amended SHA-256 | `38bb9c05ffa727f897485bb1bc5f62236a234db008f63c1955391766ffb30fab` (8,299 bytes) |
| Production ledger version | `20260723053000_contact_demand_owner_v1` |
| Applied | 2026-07-23, via Supabase MCP `apply_migration` |
| Preserved original | [`20260723053000_original-production-applied.sql`](20260723053000_original-production-applied.sql) |

**Why it was changed.** The file granted `authenticated` and revoked only
`PUBLIC`. On a fresh reset that leaves the explicit `anon=X` entry in place, so
`contact_demand_owner_v1` became a **fifth** anon-reachable `SECURITY DEFINER`
function — contradicting both the allowlist invariant and this file's own header
("As anon: permission denied (no EXECUTE grant)"). One statement was added:
`revoke execute on function public.contact_demand_owner_v1(uuid) from anon`.

**Severity: grant-posture gap, not a data leak.** The function body is
fail-closed independently — it raises `42501 'Not authenticated'` when
`auth.uid()` is null — so an anon caller could never read data even while
holding EXECUTE.

**Production exposure: believed nil, by inference — not measured.** Production
has no `ALTER DEFAULT PRIVILEGES` for functions, so `anon` there reached
functions only through the default `PUBLIC` grant that the file's existing
`revoke ... from public` already removes. Production was deliberately **not**
queried for this review. If the owner wants certainty rather than inference, a
single read-only check is enough:

```sql
select proacl from pg_proc where oid = 'public.contact_demand_owner_v1(uuid)'::regprocedure;
```
