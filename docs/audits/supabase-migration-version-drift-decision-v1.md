# SUPABASE MIGRATION VERSION DRIFT — DECISION RECORD v1

**Date** 2026-08-03 · **Decision** owner (D5, PR #995 approval) · **Status** ACCEPTED
· **Scope** the `Supabase Preview` check on `main` and the 151 version-label
mismatches between the repo's migration filenames and production's
`supabase_migrations.schema_migrations` versions.

Related records:
[`usage-cost-migration-drift-inventory-2026-08-03.md`](./usage-cost-migration-drift-inventory-2026-08-03.md) (§7.3–§7.4) ·
[`post-merge-production-readiness-baseline-2026-08-03.md`](./post-merge-production-readiness-baseline-2026-08-03.md) ·
`docs/APPLIED_LEDGER.md` (header doctrine).

---

## 1. The decision, in one paragraph

The `Supabase Preview` check on `main` is red with
`Remote migration versions not found in local migrations directory`, and it
will **stay red for now, by decision**. The mismatch class it reports is the
repository's own documented apply doctrine, not an error introduced by any
recent PR. The production ledger is **not** rewritten, a mass rename of
~151 migration files is **not** performed, and the check is treated as a
known-red with this document as its authority. What *was* fixed (PR #995) is
the only part of the mismatch that was **content** drift — four applied
migrations whose SQL existed in no repo file at all.

## 2. Why the 151 mismatches exist

Every production migration in this repository is applied **manually via
Supabase MCP `apply_migration`** — never `supabase db push`. The MCP tool
stamps its own apply-time timestamp as the ledger `version`, while the repo
file keeps its authored `YYYYMMDDHHMMSS_*` prefix. Example:
`20260720190000_lmc_ledger_foundation_v1.sql` (file) was recorded as version
`20260721133338` (ledger). Both identify the migration by **name**; the
**version strings** differ.

`docs/APPLIED_LEDGER.md` has stated this since long before the usage-cost
work:

> "Migrations are applied **manually via Supabase MCP `apply_migration`** —
> there is no automated apply step, and `supabase db push` is never used (the
> repo filenames don't match the ledger versions)."

The Supabase Preview integration compares **version strings**. After PR #995,
**19 of 170** remote versions match a local filename version (the 13 numbered
`0001–0013` legacy migrations, the four restored `usage_cost_events` rows, and
two early same-version applies); **151 do not**. The check was red on `main`
at `426e87aa` (2026-08-01) — before the W9/ai_runs applies and before the
drift work — and by this arithmetic it has been structurally red for as long
as the MCP-apply doctrine has been in force.

## 3. Why the production ledger is not rewritten

Aligning the ledger to the filenames means `supabase migration repair` /
UPDATE against `supabase_migrations.schema_migrations` — rewriting the
authoritative record of what production actually ran, dated when it ran.
That record is the *evidence base* for every applied-state claim in this
repository (APPLIED_LEDGER rows cite ledger versions; audits verify against
them). Rewriting it would:

- falsify apply timestamps (the minted version IS the apply time);
- break every existing cross-reference between docs and ledger versions;
- violate the standing constraint under which the reconciliation ran
  ("production ledger neperrašyti");
- convert a cosmetic check into a mutation of production state — the wrong
  direction of risk for zero behavioural gain.

## 4. Why a mass rename is not performed now

Renaming ~151 files to their minted ledger versions would make the version
sets equal without touching production, but:

- it churns the largest evidence surface in the repo — file names are cited in
  `APPLIED_LEDGER.md`, audits, PR bodies, guard tests, rollback pairings and
  the migration-safety baselines; every citation goes stale at once;
- authored-time prefixes carry real information (when the migration was
  written and reviewed), which the repo's naming doctrine (`PLATFORM_DOCTRINE`
  §16) deliberately preserves;
- the rename is irreversible in practice (git history survives, but every
  external reference breaks);
- and the payoff is one green check whose red state is already fully
  characterised and documented here.

If it is ever done, it must be a dedicated, owner-approved PR that renames
files, updates every rollback pairing, recounts both pinned baselines, and
sweeps every doc citation in the same commit — nothing else mixed in.

## 5. Long-term alternatives (recorded, none chosen now)

| Option | What it is | Cost | When it becomes right |
|---|---|---|---|
| **A. Accept red + documented** *(chosen)* | This document is the authority; the check is a known-red | Zero; reviewers must read this doc | Now |
| B. Mass rename local files to minted versions | Version sets converge repo-side | Large one-time churn (§4) | If the repo ever moves to `db push`/CI-applied migrations, where version parity becomes load-bearing |
| C. Ledger repair (remote rewrite) | Version sets converge production-side | Falsifies history; forbidden by standing constraint | Effectively never, under current doctrine |
| D. Change the apply mechanism | Future applies use `supabase migration up`/`db push` so minted version = file version | Process change + owner decision; does not fix the historical 151 | If/when the apply doctrine itself is revisited |
| E. Disable/ignore the check | Remove the integration's check from the repo | Loses the signal entirely — including the *content*-drift signal that caught usage_cost_events | Not recommended; the check found a real problem once |

## 6. Criteria for a green Preview in the future

The check can only go green when **every** remote version has a local filename
match. Concretely, all of:

1. a decision between options B, C or D above (B being the only one compatible
   with current constraints);
2. the 151 historical mismatches resolved under that decision in one dedicated
   PR, with both pinned migration baselines and all rollback pairings updated;
3. the going-forward rule in §7 already in force, so the set cannot regrow;
4. re-verification that no *content* drift exists at that moment (every remote
   version's SQL byte-derivable from a repo file, as PR #995 established for
   the usage-cost four).

## 7. The going-forward rule — new migrations must not widen the gap

Effective immediately, recorded here as the rule the next session inherits:

- **Every future production apply must record its minted ledger version in the
  migration's `APPLIED_LEDGER.md` row at apply time** (this is already the
  ledger's format — the rule makes it mandatory, not customary).
- **If the applying tool permits specifying the version, the apply SHOULD use
  the repo filename version** so new rows match their files (the four
  usage-cost restores prove same-version rows are possible: their MCP applies
  recorded `20260728114008` etc., which are now the filenames).
- **A migration whose SQL is applied to production must exist as a repo file
  BEFORE or IN THE SAME SESSION as the apply.** The usage-cost incident —
  applied SQL existing in no file anywhere — is the failure mode this rule
  exists to prevent; it must not recur.
- **No new migration may be applied under a name that differs from its repo
  filename** (name, not version, is the human-matching key the whole doctrine
  relies on).

## 8. What this decision does NOT cover

- It grants no production apply, DDL, or data-mutation right of any kind.
- It does not change the status of the three owner-gated unapplied migrations
  (W6 / W11 / W12).
- It does not merge, close or otherwise decide Draft PR #898 (that is D4).
- It does not modify the Supabase integration's configuration.
