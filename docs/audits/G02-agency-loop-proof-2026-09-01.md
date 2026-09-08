# G-02 — the agency loop, walked end to end

**Date:** 2026-09-01
**Baseline:** `main = 31bb4f04 = production` · tree clean · CI green
**Database:** production (`gorgitwvdzxbnaxhrsrw`), probed inside a transaction
that rolls itself back. **Zero rows were added to production.**
**Status of this document:** finding + owner decision. **No fix has been
applied, merged, or proposed for merge.**

---

## 1. What was asked

The master audit records G-02 as `IMPL+VERIF / P1`: the agency model is
"correctly designed, freshly hardened, and completely unexercised" — five
tables at zero rows and **zero E2E specs**. The instruction was to **prove the
existing model before adding capability**, preserving the doctrine
**CONFIDENTIALITY WITHOUT CAPTIVITY**.

## 2. Method

`scripts/db-proof/g02-agency-loop.sql` walks the loop **twice** in one
transaction, calling the same production RPCs the web client calls, as the same
five actors, under the same RLS (`set local role authenticated` plus a
transaction-local `request.jwt.claims` carrying **`sub` and `email`** — two of
these RPCs gate on the verified JWT email). No gate is patched and nothing is
re-implemented; the probe measures the product as deployed.

- **Pass 1** — the world as it ships: the worker reaches the agency **only**
  through the canonical invitation flow, `invite_agency_worker` →
  `accept_agency_worker_invitation`.
- **Pass 2** — the identical walk plus **one row**: a `company_workers` row on
  the agency's `companies.id`. No DDL, no new table.

Five identities per pass (agency A owner, client C owner, worker W, **client C2
and agency A2 as negative-control readers**), disjoint between passes (`9921*` /
`9922*`). The transaction ends in a deliberate `raise exception`, so it cannot
commit; the exception message is the report.

**Negative controls are first-class.** A confidentiality proof that only ever
checks the permitted reader proves nothing, so every disclosure stage is paired
with a reader who must see **zero** — a second client, a second agency, and the
same client after revocation — checked through the RPC **and** through raw RLS
on the table, because the RPC can be right while the policy behind it leaks.

## 3. Result

| Stage | Pass 1 (as shipped) | Pass 2 (+ roster bridge row) |
|---|---|---|
| S1 agency invites worker | ✅ `invited` | ✅ |
| S2 worker joins agency roster | ✅ `linked`, 1 row | ✅ |
| S2b agency assigns operations role | ✅ `assigned` | ✅ |
| S2c agency tries to enable journal review | ✅ **refused** `review_not_allowed` | ✅ refused |
| S3 agency invites client | ✅ connection created | ✅ |
| S4 client accepts | ✅ `accepted` | ✅ |
| S5 client shares the demand | ✅ share created | ✅ |
| S6 agency sees shared demand (A2 sees 0) | ✅ 1 / **0** | ✅ 1 / **0** |
| S7 agency offers a candidate | ❌ **`worker_not_on_roster`** (42501) | ✅ offer created |
| S8 client sees candidate (C2 sees 0) | ❌ cascade | ✅ 1 / **0** rpc / **0** rls |
| S9 no captivity | ✅ | ✅ |
| S10 client revokes | ✅ `revoked` | ✅ |
| S11 disclosure withdrawn | ✅ (vacuously — no offer existed) | ✅ **0** rpc / **0** rls, offer → `withdrawn` |
| S12 worker untouched by revocation | ✅ | ✅ |

**12 of 13 stages already work in production, unchanged.** One stage breaks,
and everything downstream of it is a cascade, not an independent failure.

### Confidentiality — PROVEN

In pass 2, with the loop closed:

```
client C   sees 1 candidate   (the one offered to C's own request)
client C2  sees 0 via RPC     (unrelated client, live connection of its own)
client C2  sees 0 via raw RLS (the policy, not just the function)
agency A2  sees 0 shared demands (unrelated agency)
after revoke:
client C   sees 0 via RPC · 0 via raw RLS
offer      status = withdrawn      share status = revoked
```

The #1395 property holds under measurement: **a severed client does not retain
the candidate identity**, at the policy level and not merely in the read RPC.

### Captivity — PROVEN ABSENT

Four measured properties, not four assertions:

```
captivity columns in the whole public schema        = 0
  (no *owned_by_agency*, *exclusiv*, *captiv*, *locked_to*)
rosters the SAME worker sits on simultaneously      = 2   (agency A and agency A2)
worker still owns their own record while represented = true
after A's client connection is revoked:
  rosters still active = 2 · worker record rows = 1   (revocation reached neither)
```

And S2c: an agency that asks to switch on journal review over a worker it
represents is **refused** (`review_not_allowed`), with the stored flag verified
still off. The agency can represent the worker; it cannot surveil them, cannot
hold them exclusively, and cannot follow them out of the relationship. That is
the doctrine, measured.

## 4. Root cause of the one break

**There are two disjoint agency key spaces, and the loop crosses between them
without a bridge.**

| Arm | Entity | Keyed on | Written by | Read by |
|---|---|---|---|---|
| Roster | `agency_workers` | `agencies.id` | `accept_agency_worker_invitation` | `owns_agency`, `assign_agency_worker_role` |
| Client bridge | `company_workers` | `companies.id` (`company_type='staffing_agency'`) | company roster ops | **`submit_agency_candidate_offer_v1`** |

Measured in production:

```
agencies                                   = 3
companies WHERE company_type='staffing_agency' = 3
shared ids between them                    = 0      ← disjoint key spaces
agency/company pairs sharing an owner profile = 2   ← not even a total mapping
organizations mirrored from agencies       = 3  (organization_type='agency')
organizations mirrored from companies      = 10
```

So the agency exists as **two entities and two organizations**, related only by
a shared `profile_id` — and for one of the three production agencies not even
that. A worker onboarded through the canonical agency invitation lands in
`agency_workers`; `submit_agency_candidate_offer_v1` looks in `company_workers`
and correctly answers `worker_not_on_roster`.

**This is the G-01 defect class exactly: not a missing feature, but an
unconnected seam between two models that both already exist and both already
work.** Every other stage passed unchanged in both passes.

## 5. Owner decision — three shapes

**This is not resolved here.** All three touch a `SECURITY DEFINER` function or
add a write to one, so all are **RED class** under `docs/PLATFORM_DOCTRINE.md`
§4: no auto-merge, prod apply owner-channel only.

### Option A — bridge on accept
`accept_agency_worker_invitation` also provisions the `company_workers` row for
the agency's staffing company.
- **For:** the worker is bridged once, at the moment of joining, and every
  downstream surface works without knowing about the seam.
- **Against:** it must resolve `agencies` → `companies`, and the only available
  join is `profile_id`, which is **not total** (1 of 3 production agencies has
  no staffing company) and **not unique** (an owner may hold several companies).
  A bridge that guesses is worse than one that refuses.

### Option B — teach the offer RPC the roster arm
OR one additional `exists(...)` into `submit_agency_candidate_offer_v1`'s roster
check, accepting an active `agency_workers` link whose `agencies` row shares the
owner of the offering company.
- **For:** smallest blast radius — one call site, one predicate, grants nothing
  beyond being offerable by the agency the worker already joined.
- **Against:** it teaches one more call site that there are two roster truths,
  which is the parallel-structure risk the doctrine exists to prevent. The next
  agency surface that forgets the second arm is a silent hole.

### Option C — unify the two agency entities (doctrine-canonical)
Make `staffing_agency` a company/organization capability and retire the separate
`agencies` table, as `org_capabilities` already did for `training_provider`.
- **For:** removes the seam permanently instead of routing around it; matches
  the multi-role organization model the platform already chose elsewhere.
- **Against:** far larger, touches `owns_agency` (used by 4 agency RPCs and 5
  policies), and needs a data migration for 3 live agencies. Not a same-slice fix.

### Recommendation

**Option B now, Option C as the standing direction.** B is the minimal change
that closes a loop already proven correct in every other respect, and it is
reversible. A is rejected on evidence: the join it depends on is neither total
nor unique in production today, so it would silently bridge some agencies and
not others. C is right but is its own programme, and should not be smuggled in
under a verification slice.

**None of this is applied.** The decision is the owner's.

## 6. What this changes about the master audit

`docs/audits/labourmarket-master-audit-2026-09-01.md` records G-02 as
`IMPL+VERIF / P1` — "zero E2E specs; entire model unexercised". That was right
about the coverage and understated about the readiness:

- The model is no longer unexercised. **12 of 13 stages run in production.**
- **Confidentiality is proven**, with negative controls that actually fire —
  previously "design, not verified behaviour".
- **Captivity is proven absent** by four independent measurements, plus a
  refused surveillance attempt.
- The remaining work is **one owner decision and one narrow RED change**, not an
  implementation programme.

The `VERIF` half of G-02 is closed by this document. The `IMPL` half reduces to
the seam in §4.

## 7. A defect this probe found in itself

The first run reported `S2b_assign_role` as **ok** while the RPC was actually
answering `invalid_role`: the probe had used a role outside the closed
vocabulary (`worker | foreman | project_manager | company_admin | agency_admin`)
and asserted `result is not null` — a check that **could not fail**.
`assign_agency_worker_role` returns a status string rather than raising, so a
null-check is vacuous against it.

Fixed by comparing the exact string **and** re-reading the stored row. The
corrected stage was re-run and passes for the right reason (`assigned`, role
persisted). Recorded here because it is the same class the audit flags under
E2E rot: an assertion that cannot fail is worse than no assertion.

## 8. Reproduce

```bash
DATABASE_URL='postgresql://...' bash scripts/db-proof/g02-agency-loop.sh
```

The runner deliberately does **not** use `set -e`: the probe exits non-zero on
success (it raises P0001 to force its own rollback), so the completion sentinel
is emitted from an `EXIT` trap. A runner that appends a sentinel after a command
which may legitimately exit non-zero must never rely on fall-through under
`set -e` — otherwise any waiter watching the log hangs forever, and a harness
defect gets read as a product hang.

## 9. Residue

Verified after the run. All zero, and every production total identical to the
audit baseline:

```
probe_auth_users 0 · probe_profiles 0 · probe_agencies 0 · probe_companies 0
probe_organizations 0 · probe_requests 0

agency_workers 0 · agency_worker_invitations 0 · agency_client_connections 0
agency_client_request_shares 0 · agency_candidate_offers 0
company_workers 4 · agencies 3 · companies 10
```

---

*Read-only against production by construction. LabourMarket.ai · 2026-09-01 ·
baseline `main = 31bb4f04`.*
