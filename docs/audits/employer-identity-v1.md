# Employer identity v1 — measurement, method, and the persistence boundary

**Date:** 2026-08-18
**Production:** Supabase `gorgitwvdzxbnaxhrsrw` (labourmarket.ai)
**Repo baseline:** `origin/main` @ `c9962f78`
**Module:** `apps/web/lib/employers/employer-identity.ts` (pure, read-only, no writes)
**Tests:** `apps/web/lib/employers/employer-identity.test.ts`

---

## 1. The finding that changes the work

`docs/audits/full-project-truth-2026-08-18.md` §J records the funnel gap as:

> "there is no canonicalisation of vacancy `employer_name` into a company
> entity, no website/domain enrichment, and no qualification step. Conversion is
> 8,124 → 13."

The gap is real. The framing invites a **name-similarity matcher** over ~8.3k
strings, and that would be the wrong tool. Measured against production:

| Measurement | Value |
|---|---:|
| Rows in `public_vacancies` | **46,217** |
| Rows carrying `employer_external_org_id` | **45,744 (98.98%)** |
| Rows with no registry id | 473 |
| Registry id length | **uniformly 10 characters** |
| Distinct registry ids | **7,832** |
| Distinct raw `employer_name` values | 8,317 |
| **Names shared by two different registry ids** | **0** |
| Registry ids carrying >1 raw spelling | 158 |
| … of those, differing by letter case alone | 113 |
| … of those, carrying genuinely different name strings | 45 |
| Distinct names on rows with **no** registry id | 326 |
| … of those, matching a registry name case-insensitively | **1** |

**The source already supplies legal identity.** For `arbetsformedlingen` the
10-character id is the Swedish organisationsnummer. Deriving identity from
spelling would replace an authoritative key with a guess.

And there is nothing for a matcher to win: **no name is shared by two registry
ids**, so there are no collisions to resolve, and across the entire name-only
population exactly **one** name coincides with a registry name. A fuzzy matcher
would buy at most that single link while carrying the one risk that actually
matters — **merging two legal entities because their names look alike**.

## 2. Method

Identity comes from `(provider_key, employer_external_org_id)`. The name is
treated as a **label**, never as evidence of identity.

- Rows **with** a registry id → `confidence: "registry"`.
- Rows **without** one → grouped by `(provider_key, folded name)` and marked
  `confidence: "name-only"`, always carrying an `unresolved` reason. This is a
  labelling convenience, not an identity claim.

### Choosing the display name

Two stages, and the order was corrected by real data:

1. **Which name** — fold spellings case-insensitively, take the group with the
   most rows. The source's dominant label is the best available evidence.
2. **Which spelling of that name** — prefer a form that is not ALL-CAPS, then
   the shortest, then lexicographic.

A first draft applied the casing preference across *all* names rather than
within the winning one. On real data that promoted a branch office over the
company: `K-bemanning Värnamokontoret` (1 row, mixed case) beat
`K-BEMANNING AB` (15 rows) purely because the latter shouts. The regression is
locked by a test.

Real outcomes under the corrected rule:

| Registry group (real spellings + row counts) | Canonical name |
|---|---|
| `FÖRSVARSMAKTEN` 367, `Försvarsmakten` 7 | `Försvarsmakten` |
| `ARBETSFÖRMEDLINGEN` 43, `Arbetsförmedlingen` 1, `Arbetsförmedlingen Norrköping` 1, `SÖDRA GÖTEBORG` 1 | `Arbetsförmedlingen` |
| `K-BEMANNING AB` 15, `K-bemanning Värnamokontoret` 1 | `K-BEMANNING AB` |
| `SAAB AKTIEBOLAG` 122, `SAAB AB` 1 | `SAAB AKTIEBOLAG` |
| `AniCura Sweden AB` 19, `Hänvisning till Arbetsförmedlingen` 1 | `AniCura Sweden AB` |

The last row is a data-quality artifact worth naming: a real vacancy carried
the placeholder label *"referral to the employment agency"* under a real
company's registry id. Frequency handles it; the group is still reported as
`unresolved` so a human sees it.

## 3. Projected outcome on the full population

| | |
|---|---:|
| Rows in | 46,217 |
| Candidates out | **8,158** |
| … registry-identified (authoritative) | **7,832** |
| … name-only (label, always `unresolved`) | 326 |
| Distinct raw names collapsed | 8,317 → 8,158 |
| Rows dropped as unusable | **0** |
| Name-only candidates flagged as coinciding with a registry name | **1** |

**Read the collapse honestly: it is small, and that is the point.** The value is
not deduplication — 8,317 → 8,158 is ~2%. The value is that **an authoritative
company identity for 98.98% of the supply already exists in the data and nothing
in the product uses it.** 7,832 identified employers is the input the contact
funnel has never had.

## 4. What is NOT done, and the exact approval the next step needs

This module **writes nothing**. It is a pure function over rows.

Persisting these candidates requires a table, therefore a production migration,
therefore the owner gate in `CLAUDE.md` §4. Before that step is proposed, the
owner must decide **three** things — the third is not optional:

1. **Table shape and ownership** — a new `employer_candidates` register keyed on
   `(provider_key, registry_id)`, or an extension of an existing organisation
   table. These have different RLS and different blast radius.
2. **Refresh policy** — recompute on each import, or an append-only register
   with supersede semantics like the other ledgers in this schema.
3. **PRIVACY — the registry id is not automatically safe to store.**
   A Swedish sole trader (*enskild firma*) has no separate organisationsnummer:
   **their org number is their personnummer.** So a subset of these 7,832
   identifiers are personal data, and the repo cannot tell which from the number
   alone. Storing all of them in a new table, exposing them through an RPC, or
   rendering them in a UI are three separate decisions with GDPR weight, and
   none of them follow automatically from "the source gave us the field".
   The existing consent/disclosure ledger design in this schema is the right
   precedent to apply, not an exception to it.

Until that decision is made, this module stays a read-side building block.
Nothing in the product calls it yet, and nothing should call it in a way that
renders a registry id to a user.

## 5. How the production numbers here were obtained

Read-only `select` statements through the Supabase MCP connection against
`gorgitwvdzxbnaxhrsrw`. No writes, no DDL, no migration.

**No registry identifier is committed to this repository.** Where the raw data
was inspected, ids were hashed in SQL (`md5(...)`) before leaving the database,
because of the personnummer point in §4.3. The registry ids in the test file are
synthetic; the *name spellings* in the tests are real, and are all public bodies
or companies carrying a legal form.
