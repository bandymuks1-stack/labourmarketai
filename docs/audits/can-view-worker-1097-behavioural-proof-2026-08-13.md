# #1097 `can_view_worker` — the behavioural proof that was still missing

**Date:** 2026-08-13 · **Production:** `gorgitwvdzxbnaxhrsrw` · **main:** `b993caec`

#1097 was merged and applied to production (prod ledger `20260812214302`), but the
record carried a catalog-level proof only: the function exists, is `SECURITY
DEFINER`, has a pinned `search_path`. Nobody had measured **who can actually read
what**. This note closes that, and closes the one requirement the existing
harness never touched.

## 1. Behavioural proof — VERIFIED_DB, 62/62

`scripts/db-proof/can-view-worker-booking-engagement.sh`, run 2026-08-13 against a
**throwaway `postgres:15-alpine` container** (never production, never the shared
local stack). It executes
`supabase/migrations/20260809120000_can_view_worker_booking_engagement_v1.sql` and
its paired rollback **verbatim** — nothing is re-implemented — and probes under
`set local role authenticated` / `anon`, so RLS genuinely decides every answer.

**RESULT: 62 passed, 0 failed.** Full transcript:
`docs/audits/evidence/can-view-worker-1097/db-proof-run-2026-08-13.txt`.

The run is a real negative control by construction: every "AFTER" expectation is
measured against a **reproduced BEFORE**, then against a **rollback**, then a
**re-apply**.

| Scenario (§5 of the release train) | Result |
|---|---|
| 1. engaging company owner sees allowed worker data | PASS — name, bio, 1 skill, 1 profession, 2 languages |
| 2. unrelated employer sees nothing | PASS — predicate `f`, `NOROWS` |
| 3. sibling / detached row isolation | PASS — a `worker_id IS NULL` row grants E2 nothing, and no read beyond its own roster |
| 4. ended engagement grants nothing | PASS — predicate `f` before *and* after |
| 5. withdrawn consent does not accidentally widen | PASS — see §3, this is the honest finding |
| 6. worker self-access unchanged | PASS — byte-identical to BEFORE |
| 7. anonymous denied | PASS — base table `DENIED`, predicate EXECUTE `DENIED` |
| 8. unrelated organization member denied | PASS |
| 9. documents / private journal / private absence reason inaccessible | **NOT COVERED by the harness — closed separately in §2** |
| 10. only the intended four-table exposure exists | PASS + §2 |

Also measured, and worth keeping: **revocation is immediate.** When the worker
ends the engagement themselves, the predicate flips to `f` and name, skills,
professions and languages all disappear in the same transaction.

## 2. Requirement 9 — the blast radius, measured against PRODUCTION

The harness proves the four gated tables behave. It never proved that widening
`can_view_worker` fails to reach *anything else*. That is the requirement that
actually matters for privacy, so it was measured directly against production
(read-only catalog queries, zero DML).

**Every policy anywhere referencing `can_view_worker`, in `qual` OR `with_check`:**

| table | policy | cmd |
|---|---|---|
| `workers` | `workers_select` | SELECT |
| `worker_skills` | `worker_skills_select` | SELECT |
| `worker_professions` | `worker_professions_select` | SELECT |
| `worker_languages` | `worker_languages_select` | SELECT |

Exactly four. Nothing else in the database keys on it.

**The sensitive tables key on independent predicates** — so the #1097 widening
cannot reach them:

| table | RLS | SELECT predicate |
|---|---|---|
| `worker_documents` | on | self (`w.profile_id = auth.uid()`) OR `is_admin()` |
| `journal_entries` | on | `owns_worker` OR `is_admin()` OR `manages_organization` via `engagement_contexts` |
| `worker_absences` | on | self OR (`caller_manages_worker` AND **`status = 'requested'`**) OR `is_admin()` |
| `profiles` | on | `id = auth.uid()` OR `is_admin()` |

Note the absence row: an employer reaches only requests in `requested` status, so
the **private reason on a decided absence is not exposed** by any of this.

**VERIFIED_PRODUCTION**, same read-back: the live `can_view_worker` is
`SECURITY DEFINER`, `STABLE`, `search_path=public`, carries **both** the
engagement branch and the consent branch, `anon` holds **no** EXECUTE,
`authenticated` holds EXECUTE. The production body matches what the proof ran.

## 3. The honest finding: withdrawal is overridden by relationship

Scenario 5 does not mean "withdrawal is respected". Measured (`§7.1` in the run):

* W3 granted discoverability, **withdrew it**, then accepted a booking from E4.
* E4 **can** read W3 — `WITHDRAWN-W3`.
* Every *other* employer still cannot — `NOROWS`.
* `worker_profile_discoverable(W3)` still returns `f`.

So the read is restored on a **relationship** basis, not by reviving the withdrawn
consent. That is the design, and it is defensible — you accepted a booking from
this specific employer — but a worker who withdrew discoverability may not expect
it. This is exactly why the memo's condition **C1 (accept-screen copy)** exists.
**C1 is still unshipped**, and it should be treated as the open follow-up.

## 4. Second caveat, measured: ending an engagement does not always revoke

Also proven in the run: when an **active project assignment** exists alongside the
engagement, the worker clicking "End engagement" gets `{"outcome": "ended"}` — and
the employer **still sees them**, because the assignment branch of the predicate is
independent. The worker will reasonably believe access ended. It did not.
Tracked as follow-up **F2**; not a regression from #1097 (the assignment branch
predates it), but it is a real honesty gap in the worker-facing action.

## 5. Indirect consumer, checked

One other function calls `can_view_worker`:
`propose_contact_disclosure_request_v1` (SECURITY DEFINER). Reviewed in full: it
uses the predicate as a **gate to propose**, and #1097 therefore lets an engaging
employer *ask* an engaged worker to disclose contact fields. It is not a
disclosure — the request is created in `status='created'`, the **worker must
accept**, fields are restricted to a 7-value allowlist, and it is rate-limited
(10 open, 30 per 24 h). Fails closed. Not a privacy defect; recorded so the reach
is not rediscovered later.

## 6. Status

**#1097 behavioural privacy proof: COMPLETE.** No P0 found. Two honest
follow-ups remain (C1 accept-screen copy, F2 end-engagement revocation honesty),
both pre-existing and neither blocking controlled beta.
