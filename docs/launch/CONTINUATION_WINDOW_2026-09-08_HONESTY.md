# Continuation window — 2026-09-08 · what a failed read was telling people

A takeover window that ran alongside an active one. It did **not** touch the
other window's area (the public vacancy board, `#1572` / `#1644` / `#1649`) and
worked only in disjoint files, from its own worktree.

Everything below was measured, not inferred. Where something is claimed as
proven, the measurement is named; where it is only test-proven, it says so.

---

## 1. SHIPPED AND MERGED

| PR | What it changes | Evidence |
|---|---|---|
| **#1645** | The journey register and `EVID-1` said the subject's refusal gap was *"UI work, not a migration"*. It is not. | Measured on production at three levels |
| **#1647** | `EDU-6` was recorded MISSING; the employer-demand read is built, reachable and correct. | Measured on production |
| **#1650** | The GDPR export stops presenting a failed read as an empty one. | 7 tests + negative control |
| **#1651** | A failed fact read stops ranking a worker as if the fact were absent. | 9 tests, both directions |
| **#1652** | A trust count we could not read stops reading as *"you have none"*. | 9 tests + negative control |
| **#1653** | The education owner-gate packet, beside the evidence one. | Docs only |

**None of these is HUMAN_UI_PROVEN.** They are unit/behaviour-proven and CI-green.
The failure paths they fix are, by construction, hard to stage in a browser — a
walk would prove the success path, which already worked.

### The one thing that IS production-verified this window

The public board at `/en/jobs` and `/lt/jobs`, loaded as an anonymous visitor
after `#1644` merged: it renders fast, reports **47,710 vacancies**, and the
Lithuanian surface carries no raw message keys. The count matches
`public_vacancy_supply_counts` exactly, and the singleton is fresh — an active
10-minute `pg_cron` job, `computed_at` five minutes before the check.

**A correction worth recording.** This window first read that number as a 40%
understatement, comparing it against 80,048 `is_active` rows. That was wrong:
the refresh, the count function and the list function all also exclude expired
rows, and under that identical predicate the live count *is* 47,710. There is no
drift and no regression. The gap is 32,338 rows that are `is_active` **and**
expired — a data-lifecycle fact for the size question, not a correctness one.

---

## 2. THE DEFECT CLASS THIS WINDOW WENT AFTER

`FAILED` rendered as `EMPTY` — SEP-7, at surfaces that **claim completeness**.

A sweep for reads whose error is never inspected returned **71 candidates**.
Exactly three were user-facing lies. The ranking question was always the same:
*does this surface claim completeness to a person?*

1. **The GDPR export.** Six unchecked reads. The bundle carries an `excluded`
   list naming what was deliberately left out — so a reader is entitled to
   conclude everything *not* on that list *is* included. A failed read did not
   merely lose data; it made the bundle assert something false about itself.
   Worst case: a failed `workers` read emptied `workerIds`, **skipped** the
   journal/skills/documents branch, and handed someone a subject-access response
   saying they had no work history at all.
2. **Matching.** `worker_skills` / `worker_professions` unchecked, so a fully
   skilled person could be ranked as unskilled — confidently and silently.
3. **The person's own trust block.** Every count fell back to `0`, so a timeout
   told someone with twelve confirmations they had none, and then offered them
   the how-to-get-started hint.

**Left alone, deliberately:** background scanners that retry on the next run,
and feature-detected reads for human-gated stores that map errors to `null` on
purpose. Turning those into warnings would cry wolf wherever a migration is
simply unapplied. A guard now asserts their count so they stay that way.

**Found on the way:** six locales (`pl`, `sv`, `da`, `et`, `lv`, `no`) carried a
`scouting` namespace with **no `pool` object at all**, and `next-intl` has no
fallback configured — so the retrieval notice rendered its own key as visible
text on every scouting load in those languages. Fixed in `#1651`.

---

## 3. OWNER-GATED — two RED drafts, nothing applied

Both packets are in `OWNER_GATE_PACKETS_2026-09-08.md` (Appendix C and E), so
they can be judged from one document.

### #1646 — EVID-7 · the subject can see a record about them and cannot refuse it

`deriveEvidenceStanding` ranks **DISPUTED second** in precedence, above
CORRECTED and above every attestation — and **no actor in the system can cause
it**. Measured at three levels: no INSERT policy admits a subject (one requires
`manages_organization`, the other admits only `independently_verified` and
excludes the subject by name); no `SECURITY DEFINER` function writes the table;
no application code emits `event_type = 'disputed'`.

The reader is complete and the causer does not exist. A UI-only slice would have
handed the one person it exists for a `42501`.

### #1648 — EDU-7 · an institution cannot correct a programme it created

`education_programs` has exactly one policy, a `SELECT`, one writer, and no
update function. A programme is immutable from creation — and the target
profession is the field that switches on the employer-demand count. Production's
single programme has a null slug, so it reads "no direction" **permanently**.

**Merge-order note:** each bumps the three migration-count ratchets 275 → 276.
Whichever lands second needs a one-line bump to 277.

---

## 4. THE FOUR ACTORS, as measured today

| actor | state |
|---|---|
| **PERSON** | Strongest. 56 profiles, 40 journal entries, 13 confirmations. Three honesty defects on their own surfaces fixed this window. **The gap that remains is the one they cannot act on:** an organization can write a record about them, attest it in its own name, and they have no answer available — #1646, owner-gated. |
| **COMPANY** | Working: 12 open needs, scouting and matching live. Matching now says when it ranked on facts it could not read. Five capabilities stay BUILT_NOT_CONNECTED with no route at all (defects, project economics, procurement, business trips, handover) — those need pages, not links. |
| **AGENCY** | The direction holds: supply is never served as demand, re-measured 2026-09-08 (worker board leaked 0 of 3 `agency_offer` rows). The €99 need-quota defect that once blocked an agency from stating capacity **is fixed on `main`** — verified this window, not re-done. Offered capacity is deliberately **unmetered**; metering it is an owner decision, not a defect. Still NOT_BUILT: offering a brigade as one unit. |
| **INSTITUTION** | Weakest, and the register was wrong about why. It **can** see employer demand — 39 professions with live vacancy counts, rendered per programme, honestly degrading to "unknown". Programmes 1, cohorts 1, **members 0**, accepted student invitations 1: every write control exists and is reachable, so zero members is a human who has not acted. The real blockers are programme immutability (#1648) and the absence of any report or export. |

---

## 5. STILL BROKEN / NOT BUILT — unchanged by this window

From the journey register, and none of it silently: demonstrated capability
recognised against a formal requirement; team/brigade assignment and brigade
matching; competency → qualification or recognised equivalence; the institution
report/export half; and four steps of `J-TIME-FREEDOM` (alternatives, the
override receipt, actual-vs-plan, learned durations).

---

## 6. BLOCKED EXTERNALLY / NOT A CODE GAP

* `auth_leaked_password_protection` — **BLOCKED_BY_PLAN**, unchanged.
* The `worker_absence_scheduling` `SECURITY DEFINER` view (advisor **ERROR**) —
  **deliberate and guarded.** `worker_absences_select` lets a manager read only
  `status = 'requested'`; scheduling needs `approved`. Making it
  `security_invoker` would break the manager's read and tighten nothing.
* `function_search_path_mutable` on the two `usage_cost_events` guards —
  **benign.** Both are `SECURITY INVOKER` and each body is a single
  `raise exception` referencing no database object, so nothing can be shadowed.
  Recorded rather than shipped: it would clear a lint, change no behaviour, and
  cost a migration plus three ratchet bumps.
* The whole advisor output is triaged in Appendix D so it is not re-investigated.
* `Supabase Preview` fails on `#1648`. It is **not** a required check
  (`quality` and `migration-safety` are, and both pass) — an integration, not
  the product.

---

## 7. NEXT HIGHEST-VALUE WORK

1. **The owner's two decisions** (#1646, #1648). Both unblock an actor from
   acting at all, and both are reversible.
2. **`buildEvidenceReport` cannot express "unread".** Deferred on purpose and
   marked at all three call sites: a failed count still reads as `0` there and
   the section still says "empty". Widening it also moves `deriveProvenance`'s
   classes — an evidence-semantics decision that deserves its own slice, not a
   drive-by change.
3. **The institution's report/export half** (EDU-6's remaining gap). Only
   sensible after #1648, because until a programme can be corrected there is
   nothing worth exporting.
4. **The five routeless capabilities.** New pages, so genuinely last.

---

## 8. HOW TO CONTINUE SAFELY

Work happened in the worktree `labourmarketai-wt/evid-subject-refusal`, which is
clean and still holds the two draft branches. Remove it only once #1646 and
#1648 are merged or closed — `git worktree remove`, never `--force`.
