# Owner-decision packets — 2026-09-08

Three RED drafts are open and none may be self-approved by an agent. Each was
re-verified against **production** on 2026-09-08 rather than taken from the
branch description, because a previous window's status claims had drifted from
what the database actually contains.

Nothing in this document has been applied. Production is unchanged.

---

## EVID-1 — PR #1618 · the RLS recursion that takes the evidence import down

**Migration** `20260907220000_evidence_parties_recursion_fix_v1`
**Class** RED — a new `SECURITY DEFINER` function plus one policy replacement.

### The defect, re-measured on production 2026-09-08

Confirmed still live, unchanged:

* `organization_evidence_records_select` subqueries `..._parties`, and
  `organization_evidence_parties_select` subqueries `..._records`. The cycle is
  mutual, so four of the import's eight tables raise
  `42P17 infinite recursion detected in policy` on **every read**:
  records, parties, events, competency_signals.
* The resolver `is_evidence_record_subject` **does not exist** (`to_regprocedure`
  returns null) — the earlier production proof was rolled back as documented.
* All eight tables hold **0 rows**.

This takes the import **down**, not merely degrades it: `commitImport` ends in a
`.select()`, and an `INSERT ... RETURNING` must evaluate the SELECT policy, so
the write dies with the read.

### What the schema already has (applied, ledger `20260907180944`)

The import schema itself is live and its guarantees are enforcing:

* `organization_evidence_records_evidence_state_check` admits only
  SELF_REPORTED, ORGANIZATION_REPORTED, LEGACY_IMPORTED, UNVERIFIED, NEEDS_REVIEW
  — **an import cannot write an attested or verified state** (SEP-3 held at the
  schema, not by code convention).
* `organization_evidence_competency_signals_method_check` admits only
  `exact_term_match` and `synonym_term_match` — `ai_inference` is refused 23514.
  Inference cannot masquerade as evidence.

The engine, both transports and the commit gate are **on main** (#1600).

### The change

One `SECURITY DEFINER` boolean, `is_evidence_record_subject(uuid)`, holding the
*exact* predicate the parties policy previously inlined — caller is the roster
record's `linked_profile_id` **and** the link is `linked`. The parties policy
then calls it instead of re-entering `organization_evidence_records`, so
`records → parties → (no further policy)`.

**Nothing widens.** The function takes a record id and returns a boolean: no
rows, no columns. `authenticated` only; `public` and `anon` revoked by name.
`organization_evidence_records_select` is not touched. The alternative —
widening a policy — would expose whole rows instead of one boolean, so this is
the narrower choice, not the looser one.

### Impact of NOT applying

The organization evidence import is the shared spine of four actors: a company
importing its own historical work, an agency importing assignments, an
institution recording practice, and the **person the records are about**. The
subject's own read is the branch the recursion kills, so today the one party who
most needs to see what an organization recorded about them is precisely who
cannot.

### Risk / rollback

Non-destructive: replaces one SELECT policy, adds one function. No table,
column, row, or grant on an existing object is altered, and there is no data to
lose (0 rows). Rollback:
`supabase/rollbacks/20260907220000_evidence_parties_recursion_fix_v1.down.sql`.

**Recommendation: APPLY.** Highest severity of the three, blocks four actors,
and is the only one of the three whose absence takes a shipped capability from
degraded to dead.

---

## #1566 — `notification_events` service-role write grant

**Class** RED — a grant.

### State

The emitters have failed `42501` since July: `service_role` holds no write grant
on `notification_events`. Recorded in memory as a real miss (1 of 5 signals
never delivered live).

**Not re-proven in this window.** The branch carries a documented
reproduce-and-roll-back on production. It needs a fresh measurement before
apply, and the packet should not claim more than was measured today.

### Impact of NOT applying

Notifications are the product's only asynchronous path to a human who is not
currently looking at the screen — an interest expressed, a booking proposed, a
confirmation requested. Every one of those is a cross-actor handoff, so a dead
emitter degrades the loop between actors rather than one actor's surface.

**Recommendation: re-measure, then apply.** A grant is reversible and narrow.

---

## #1635 — six wrong ESCO mappings corrected, two left unresolved

**Migration** `20260830100000_esco_canonical_linkage_67`
**Class** RED — taxonomy data, unapplied.

### State

Removes mappings that were confidently wrong, notably a generic *teacher* that
mapped to a tertiary **politics lecturer**, and a generic *caregiver* that
mapped to **companions/valets**. Two ambiguous cases are deliberately left
unmapped rather than guessed.

### Why the direction matters more than the coverage

ESCO is a semantic interoperability layer, not a score and not permission to
guess. A wrong mapping is worse than an absent one: it tells a person the system
has understood them when it has not, and it propagates into matching. *Unknown*
is the correct answer for an ambiguous occupation; *confidently wrong* is the
defect this migration removes.

**Recommendation: APPLY.** It removes false positives and adds no new claim.
Taxonomy-only, reversible, no privilege change.

---

## Also open, and correctly gated

Verified on production 2026-09-08, still real, still owner-only:

| Gate | Verified state |
|---|---|
| **EVID-6** | **Confirmed live.** `experience_responses_select`'s subquery over `experience_records` resolves `moderation_status` to the **record's**, never the reply's own — both tables have the column. An experience author can therefore read a reply moderation has not published. The surface withholds it today, so this is defence-in-depth, but the policy is wrong and correcting it is a schema change. |
| **EVID-2** | **Re-measured 2026-09-08:** `journal_entry_confirmations` holds 13 confirmations, of which **3 are self-confirmed** (the entry's own worker is the confirmer). Self-confirmation is not blocked; classification is the weaker mitigation. SEP-3 holds only because the tier ladder distinguishes them — the write itself is permitted. |
| **PER-11** | `external_profiles` does **not** exist on production — nothing applied, decision genuinely open. |
| **ORG-2** | `organization_roles` **does** exist; the seven gates still read the industry lock. The decision is whether to migrate them, not whether the table is there. |
| **MKT-7** | Two independent owner acts arm real charging. Untouched. |
| **GOV-1 / GOV-3** | Environment and fixture-strategy decisions, not code. |

## Not a code gap — record as blocked, do not "fix"

* `auth_leaked_password_protection` — **BLOCKED_BY_PLAN**. The current Supabase
  plan rejects it. This is not unfinished work.
* The nine `anon`-executable `SECURITY DEFINER` functions in the advisor output
  are the **intentional public surface** (public vacancy counts, public business
  profile/listings/services). Revoking them would break anonymous browsing.
  Deliberate; previously confirmed as findings that must not be "fixed".

## Supabase usage limits

The earlier "exceeding usage limits" signal is dominated by database size.
**Measured 2026-09-08:** public schema totals **820 MB**, of which **806 MB
(98.3%)** is ESCO plus vacancy tables — up from 789 MB / 96.6% on 2026-09-02, so
the concentration is still growing. Product data is a rounding error against it.
The lever is
data lifecycle (the ESCO locale prune and unused-index drop already drafted in
#1421), not a plan purchase. **No plan should be bought to resolve this**; if a
paid tier is ever the answer it is an owner act, recorded here as a
recommendation only.

---

# APPENDIX A — outcomes, recorded the same day

The point of this file is to stop being true silently. Recorded 2026-09-08,
after the owner's decisions.

| gate | outcome |
|---|---|
| **EVID-1 / #1618** | **APPROVED → APPLIED**, ledger `20260908080950`. Read restored on all four formerly-recursing tables; a full write chain (`records` + `parties` `INSERT … RETURNING`) ran in a rolled-back transaction; a person who manages nothing reads 0 with no error; `anon` is refused EXECUTE on the resolver; residue re-counted at 0. Rollback verified a faithful inverse of a pre-apply snapshot. Merged. |
| **#1566** | **Already applied before the decision** (ledger `20260908061619`, `20260908065654`) — *not* re-applied. The branch's entire executable content is four `GRANT`s that production already held, and `anon` gained nothing. Merged to reconcile repo with database. `notification_events` holds 6 rows, newest 07:28 UTC: the emitters work. |
| **#1635** | **APPROVED → APPLIED**, ledger `20260908082301`. 65 mappings (31 of 161 skills, 34 of 49 professions). `teacher` and `caregiver` deliberately **UNMAPPED**. Verified by fingerprint (`4a86d46c…`, 65 sorted triples) on both sides rather than by eye. |
| **#1355** | **CLOSED as superseded** — `merge-base --is-ancestor` confirmed true before closing. |
| **EVID-6 / EVID-2** | Implementation approved; **nothing applied**. See Appendix B. |
| PER-11 · MKT-7 · ORG-2 | Not approved / deferred by the owner. Unchanged. |
| `auth_leaked_password_protection` | Stays **BLOCKED_BY_PLAN**. |
| anon public functions · fail-closed RLS tables | Unchanged, deliberately. Verified `anon` and `authenticated` hold **no** table privileges on all four RLS-without-policy tables — fail-closed by design, not a defect. |

---

# APPENDIX B — the remaining open RED / draft PRs, triaged

Checked against `main` and production on 2026-09-08. **Nothing here was applied.**

## Still real, and the highest-value of the set

**#1572 — the anonymous jobs board is slow, and the premise is NOT stale.**
Measured on production:

| query | time |
|---|---|
| `search_public_vacancy_previews_v1(null, null, 20, 0)` | **4 743 ms** |
| the identical query without `count(*) over ()` | **1.98 ms** |

`count(*) over ()` is a window over the whole filtered set, so Postgres
materialises every one of ~47 000 matching rows before `LIMIT 20` and the
`public_vacancies_active_published_idx` index cannot stop early. A ~2 400×
penalty on the **worker's public entry point**. #1572's design — take
`total_count` from the supply singleton instead — is correct, and that
singleton (`public_vacancy_supply_counts`) already exists and is fresh
(46 802 active, computed 08:30 today). RED (SECURITY DEFINER): owner-gated.
`count_public_vacancies_v1()` is already fine at 14.8 ms, so the September-06
index fixed the count and left the previews path untouched.

**#1573** depends on #1572 — an honest named state instead of a 500 or a fake
zero. No migration; GREEN-class once #1572 lands.

**#1421 — the lever for the database-size problem, now quantified.**
`esco_labels` is **408 MB / 1 045 186 rows over 28 locales**; the product
serves 11. **617 347 rows (59%) are prunable — roughly 240 MB, about 29% of the
whole 820 MB database.** This is the alternative to buying a plan. It is a
`DELETE`, so it stays RED and owner-gated.

## Superseded or empty — safe housekeeping

* **#1046** is superseded by **#1440** (`worker_demand_org_attribution` **v1**
  vs **v2**, same defect). Not a git ancestor — a re-port — so it needs an
  explicit close rather than an automatic one.
* **#897** has a **zero-file diff against `main`**: its content is already
  absorbed. Closable, but left alone here because it is the billing engine and
  MKT-7 is explicitly deferred.

## Still real, unapplied, no premise change found

`#1577` professions catalogue seed · `#1496` first-party supply bridge
(consent/intent gaps recorded) · `#1475` workspace pins · `#1440` worker-board
org attribution v2 · `#1436` invitation binds org membership · `#1430`
companies contact minimisation · `#1426` work-plan primitive · `#1266` ai_runs
retention de-linking · `#1045` admin-grant service-role repair.

Verified for each that its migration is **absent from the production ledger**.
`#1433` (public-jobs JSON-LD) carries **no migration at all** and is a
GREEN-class candidate rather than a gate.

**Not claimed:** these nine were checked for *applied-state and supersession*
only. Their internal correctness was not re-reviewed in this pass, and this
appendix does not pretend otherwise.
