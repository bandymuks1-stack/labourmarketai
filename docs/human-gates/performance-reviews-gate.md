# Human gate — Development & Performance Reviews v1 (`20260817231000`)

Status: **PENDING APPLY BY LEAD**
Route pre-approved by the owner mandate 2026-08-17 (autonomous functional
completion train V2, §4 migration authority).

## What is being asked for

Apply `supabase/migrations/20260817231000_performance_reviews_v1.sql` to
production via Supabase MCP `apply_migration`. It has no hard dependency on
another unapplied migration (the `training_assignment` evidence kind
degrades to `invalid_reference` while the training tables are absent, by an
explicit `to_regclass` check).

## Why it is migration-safety RED

4 new RLS-bearing tables, SELECT policies, GRANT/REVOKE, 8 SECURITY DEFINER
functions and 2 trigger guards. Every object is a NEW name; nothing existing
is modified or recreated; zero DML at apply time.

## The doctrine this module is built to obey

The audit records `performance` as MISSING **deliberately**: the product's
rule is "record count, never a competence score". That rules out a
conventional performance module. It does not rule out the honest half — a
recorded, evidence-linked development conversation with a follow-up plan.

So, binding and enforced in code rather than in prose:

* **No rating, score, grade, rank, stars, points or competence level exists
  in the schema, in any spelling.** No command accepts one. The guard test
  `apps/web/lib/guards/training-development-decisions.test.ts` parses this
  migration's `CREATE TABLE` bodies and FAILS if such a column ever appears.
* **Three information classes stay apart and are labelled as such:**
  FACT (append-only server stamps), EVIDENCE (pointers to rows that already
  exist elsewhere, re-checked server-side), SUBJECTIVE OBSERVATION (free
  text by ONE named person, stored with their id and the time they wrote it,
  rendered under an explicit author label).
* **No calibration, ranking, distribution or comparison across people.**
* **No AI anywhere.**

## Privacy posture (narrower than the rest of the product)

`review_can_view_v1` admits the subject, the reviewer, the org's governance
owner/admin and a platform admin — and nobody else. It deliberately does
NOT use `has_org_demand_access`: a manager who is not the reviewer sees
nothing. A development conversation is not org-wide reading material.

A closed review is frozen against every further write, including the
superuser (trigger-enforced), and closing refuses unless both people have
written their own words.

## Proof

`scripts/db-proof/training-development-v1.sh` — the review sections of the
127/127 run, including: the subject cannot write the reviewer's text and the
reviewer cannot write the subject's; the stored author id is the caller's,
never a form value; an arbitrary uuid is refused as evidence; an unrelated
org member reads nothing; a closed record refuses further writes even as
superuser; the ledger is append-only.

## Rollback

`supabase/rollbacks/20260817231000_performance_reviews_v1.down.sql` —
**refuses while real rows exist**. A recorded development conversation is
somebody's personal record; dropping the tables would destroy it.
