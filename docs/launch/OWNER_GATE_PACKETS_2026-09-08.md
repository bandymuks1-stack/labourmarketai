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

---

# APPENDIX C — EVID-7 · the subject can see a record about them and can never refuse it

Opened by a later window on 2026-09-08, after Appendix B. **Nothing applied.**
This appendix exists because Appendix B's own follow-up work was mis-sized: the
journey register and the EVID-1 capability row both described this gap as
"UI work, not a migration", and that is wrong.

## What was measured, at three levels

Against production, 2026-09-08, read-only:

**1. RLS — no INSERT policy can ever admit the subject.**
`organization_evidence_events` carries exactly two:

| policy | `with check` | admits the subject? |
|---|---|---|
| `organization_evidence_events_attest` | `manages_organization(organization_id) and actor_profile_id = auth.uid() and event_type <> 'independently_verified'` | **No.** The subject of an imported record is precisely a person who does *not* manage the recording organization — that is what the import is for. |
| `organization_evidence_events_verify` | `event_type = 'independently_verified'` … `and not exists (… op.linked_profile_id = auth.uid())` | **No**, and deliberately so: it excludes the subject by name, and admits only one event type that is not `disputed`. |

**2. No `SECURITY DEFINER` route around it.** No function in `pg_proc` writes to
`organization_evidence_events`. The three dispute RPCs that do exist —
`open_experience_dispute`, `review_experience_dispute`,
`resolve_experience_dispute` — belong to `experience_records` (EVID-6), a
different table with a different meaning. Reusing them here would collapse two
evidence models into one.

**3. No application writer.** The only two writers are in `import-core.ts`: the
importing organization's rollback/reinstate, and its own attestation. Nothing in
the repository emits `event_type = 'disputed'`.

## Why this is worse than an ordinary missing feature

`deriveEvidenceStanding` ranks **DISPUTED second in precedence**, above
CORRECTED, above INDEPENDENTLY_VERIFIED, above every attestation. The model
therefore computes a state that **no actor in the system can cause**. The
reader half is complete and the causer does not exist.

Concretely: an employer, an agency or an institution can write a record about a
person, attest it in its own name, and the person can read it — and has no act
available to them at all. SEP-3 (EVIDENCE ≠ VERIFICATION) survives, but the
weaker guarantee that a record about a person is answerable *by that person*
does not.

**Consequence for the plan:** a UI-only slice would ship a refuse button that
returns `42501` to the one person it exists for. That is worse than no button —
it converts a silent absence into a visible broken promise. The register now
says so.

## The proposed change (written, NOT applied, NOT yet in a branch)

A narrow `SECURITY DEFINER` RPC, `dispute_organization_evidence_record_v1(p_record_id uuid, p_note text)`:

* inserts exactly one row, with `event_type = 'disputed'` **hard-coded** — the
  caller cannot choose the event type, so this is not a general event writer;
* admits the caller **only** when `is_evidence_record_subject(p_record_id)` — the
  boolean the owner already approved and applied as ledger `20260908080950`,
  reused rather than duplicated;
* `actor_profile_id = auth.uid()`, no `actor_role` (the check constraint forbids
  one on this event type), no `actor_organization_id`;
* `EXECUTE` to `authenticated` only; `public` and `anon` revoked by name;
* returns the event id, no rows and no columns of any other table.

**Nothing widens.** No existing policy, table, column or grant is altered. The
record itself is never mutated — `disputed` is an append-only lifecycle event,
exactly as `withdrawn` and `corrected` already are, so a dispute cannot delete
or edit what an organization recorded. Both sides stay on the record, which is
the point.

Rate limiting is deliberately **not** in this packet: one dispute row per
subject per record is the natural bound, and it should be a unique constraint if
the owner wants it, not application logic.

## Class and risk

**RED** — a new `SECURITY DEFINER` function is a write path, and this repository
gates those regardless of how narrow they are. Reversible: `drop function`, with
a rollback shipped beside it. All eight import tables hold **0 rows**, so there
is no data to migrate and no back-fill.

**Recommendation: APPLY.** It is the only act that makes an already-computed
state reachable, and it is the person's half of a chain whose organization half
is already live.

## If the owner declines

Then the honest product change is the opposite one: **stop computing DISPUTED**
until a causer exists, so the model does not carry a state the world cannot
produce. That is a GREEN change and an agent may do it — but it should be an
owner's choice which way this closes, not a default.

---

# APPENDIX D — the security advisor output, re-measured 2026-09-08

Recorded so the same four findings are not re-investigated, and so none of them
is "fixed" into a regression. **Six advisor categories, and not one is
unfinished work.**

| finding | verdict |
|---|---|
| `security_definer_view` — **ERROR** — `public.worker_absence_scheduling` | **DELIBERATE. Do not fix.** Already documented and guarded by `lib/guards/security-train-a-v1.test.ts`. The reason is now measurable: `worker_absences_select` lets a manager read only `status = 'requested'`, while scheduling needs `approved`. The view carries its OWN authorization predicate — `caller_manages_worker(worker_id) OR is_admin() OR the worker themselves` — and exposes six columns. Making it `security_invoker` would not tighten anything; it would break the manager's scheduling read. |
| `function_search_path_mutable` — **WARN** — `usage_cost_events_forbid_mutation`, `usage_cost_events_forbid_truncate` | **BENIGN, and not worth a migration.** Both are `SECURITY INVOKER` (`prosecdef = false`), and each body is a single `raise exception` that references **no database object at all**. There is nothing a mutable `search_path` could shadow, so the warning has no exploit path here. Setting `search_path` would clear the lint and change no behaviour, at the cost of a migration file and the three count ratchets. Recorded rather than shipped. |
| `anon_security_definer_function_executable` — WARN | **DELIBERATE. Do not fix.** The intentional public surface (public vacancy counts, public business profile / listings / services). Revoking would break anonymous browsing. Previously confirmed. |
| `authenticated_security_definer_function_executable` — WARN | Expected: this is how every gated write path in the product is built. |
| `rls_enabled_no_policy` — INFO | **Fail-closed by design.** Verified previously that `anon` and `authenticated` hold no table privileges on those tables. |
| `auth_leaked_password_protection` — WARN | **BLOCKED_BY_PLAN.** The current Supabase plan rejects it. Not unfinished work. |

**Nothing in the advisor output is currently actionable.** If a future window
finds this list shorter or longer, that is a real change worth investigating;
if it finds it identical, it should stop here rather than re-derive it.

---

# APPENDIX E — EDU-7 · an institution cannot correct a programme it created

Opened the same day as Appendix C, from the same kind of measurement. **Nothing
applied.** PR #1648, RED draft, `needs-human-gate`.

## The defect, measured on production 2026-09-08

`education_programs` carries **exactly one policy — a `SELECT`**. Every write
goes through `create_education_program_v1`, and **no update function exists** in
`pg_proc`. A programme is immutable from the moment it is created: name, target
profession, education type and description are fixed forever.

That is not a cosmetic limit, because of what the target profession does:

| check | result |
|---|---|
| `count_public_vacancies_by_profession_v1` | exists, **39 professions** with real active-vacancy counts |
| its grants | `EXECUTE` to `authenticated`, **not** `anon` |
| `readInstitutionPrograms` | already composes it |
| the surface | renders it per programme at `program-demand-<id>` on `/dashboard/company` |
| production's one programme | `target_profession_slug` is **NULL** |

So the employer-demand signal an institution needs is **built, reachable and
correct**, and the one live programme will read "no direction" **permanently**,
because the field that switches it on cannot be set after creation.

The whole point of the education chain is that an institution can *aim* at the
labour market. Today it can miss once, at creation, and never re-aim.

## The change

`update_education_program_v1(uuid, text, text, text, text)` — the exact
counterpart of the create function, with its authorization **copied rather than
re-invented**: a manager of the programme's own organization, that organization
still holding `training_provider`, and both slugs validated against the same
active `professions` / `education_types` catalogues.

Two properties make it narrow rather than a general programme writer, and both
are guarded:

* the **organization is read FROM THE ROW**, never taken from the caller — the
  signature does not accept an organization id at all, so a manager of one
  organization cannot edit another's programme;
* `organization_id`, `created_by`, `created_at` and `id` are **not updatable**,
  so a programme can never be moved or re-attributed.

One refusal (`42501 not_manager`) covers both "not yours" and "no such
programme", so a caller cannot learn a programme exists from the error.

Archival and deletion are deliberately **not** in this packet: removing a
programme with cohorts and members under it is a different decision with a
different blast radius.

## Risk / rollback

**RED** — one new `SECURITY DEFINER` function. No policy, table, column or
grant on an existing object is altered, and no existing function is replaced.
Cohorts, members and outcomes are untouched, so correcting a programme's own
fields cannot detach a learner. Production holds **1** programme. Rollback:
`supabase/rollbacks/20260908120000_education_program_correction_v1.down.sql`
(drops the one function; corrections already made stay, because reverting them
would discard data an authorized manager deliberately changed).

**Recommendation: APPLY.** It is the smallest change that lets the weakest of
the four actors act at all, and the capability it unblocks is already built.

## Note on merge order

#1646 (EVID-7) and #1648 (this one) each add one migration and each bump the
three migration-count ratchets 275 → 276. **Whichever merges second needs a
one-line bump to 277.** They are otherwise independent and may be approved in
either order, or separately.

---

# APPENDIX G — the four stranded records, reconciled (NO BACKFILL APPROVED)

Owner asked for a per-record packet and said explicitly not to assume all four
need the same repair. **They do not.** Nothing was written.

## What the investigation changed

The four are **not** missing an engagement outright. Every worker already has a
**personal engagement with `organization_id = NULL`**, created by the trigger
`ensure_worker_personal_engagement` on `workers`. That is the PERSONAL CONTEXT
of the multi-actor model — 56 of 79 engagement rows are of this kind, by design,
and they must be preserved. What the four lack is the **employer-org-bound**
engagement, which is why `belongs_to_organization(employer_org)` is false.

The prepared fix is correctly scoped: it matches on `organization_id = v_org`,
so it adds the employer relationship and never touches the personal row.

## Common to all four (FACT, not inference)

* an `accept_company_worker_invitation` audit row with `result: "linked"`;
* an `accepted` row in `company_worker_invitations` for that company;
* `company_workers.status = 'active'`;
* the organization resolves 1:1 through `organizations.legacy_company_id`;
* **no** engagement to that org in any state — so a repair resurrects nothing
  that was deliberately ended. No contradiction exists in any record.

`belongs_to_organization` is false for exactly one reason in all four: the
function accepts an engagement **or** a membership scoped to that organization,
and neither exists. The personal NULL-org engagement cannot satisfy it, and
should not.

## Per record

| # | profile | organisation | nature | accepted | intended relationship |
|---|---|---|---|---|---|
| 1 | `af8cc32f` | **UAB NONSTOP GROUP** | **REAL company** | 2026-06-16 | **FACT** |
| 2 | `70851a66` | E2E Spine UAB (testinis) | test fixture | 2026-09-05 | FACT, but on a test entity |
| 3 | `8cda6488` | E2E Agentūra UAB (testinis subjektas) | test fixture | 2026-09-04 | FACT, but on a test entity |
| 4 | `c267dc8b` | QA-SYNTHETIC Alfa (testinis subjektas) | synthetic QA | 2026-08-06 | FACT, but on a synthetic entity |

Record 3 is instructive: the same person accepted a **second** company on
2026-09-02 and that one DOES have an org-bound engagement — created by a
different path (the institution/provisioning route). So the defect is specific
to the legacy roster accept, not to the person.

## Proposed repair, which differs by record

**Record 1 — recommend repair.** A real person at a real employer, locked out of
their own employer's `organizations` row. One insert:
`engagement_contexts(profile, org, 'employee', 'active', is_primary = false)`.

**Records 2–4 — recommend NO backfill.** Repairing test and synthetic fixtures
buys nothing and risks pinning a fixture into a state a future test did not
choose. The better use of them is to exercise the FIXED forward path once
#1658 is applied, which validates the fix on the very rows that demonstrate the
bug. If they are re-accepted through the repaired function they heal themselves.

## What the repair would grant, exactly

`belongs_to_organization(org)` becomes true, which turns on **six SELECT
policies**: `organizations`, `organization_roles`, `training_programs`,
`review_cycles`, `leave_balance_policies`, `workflow_definitions` — for that one
organization. It grants **no** governance capability: `company_memberships` is
untouched, so `has_org_demand_access`, `is_active_org_member` and
`manages_organization` are unaffected.

## Rollback

Delete the specific inserted `engagement_contexts` row(s) by id. Clean, because
the repair inserts and never updates: no prior value is overwritten, so nothing
has to be reconstructed. The personal NULL-org row is never touched in either
direction.

## The decision

1. Repair **record 1** only, or all four, or none.
2. Whether a backfill happens at all is separate from applying #1658, which
   fixes the forward path and is itself still ungated.
