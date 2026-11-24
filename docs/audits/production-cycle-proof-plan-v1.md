# PRODUCTION CYCLE PROOF PLAN v1 — owner decision package

**Status: PLAN ONLY. NOT EXECUTED. NOTHING PROVISIONED.**
No QA account was created, no production data was written, no production
function was invoked. This document exists so the owner can approve or refuse a
single, bounded production exercise — it is not an instruction to an agent to
proceed.

**Date** 2026-08-03 · **Base commit** `2813c78b` · **Production**
`https://labourmarket.ai` (apex; `app.` is `LEGACY_APP_HOST`, 301) ·
**Project ref** `gorgitwvdzxbnaxhrsrw`

Parent record: [`post-merge-production-readiness-baseline-2026-08-03.md`](./post-merge-production-readiness-baseline-2026-08-03.md) §10.1.
Existing single-account harness: [`evidence/premium-rebuild/prod-qa-account.md`](./evidence/premium-rebuild/prod-qa-account.md) (`PROVISIONED: NO`).

---

## 0. Why this exists

`public.booking_requests` holds **0 rows in production**. The buy-side loop the
product is built around has never completed once for a real user. Every
readiness rating in the baseline is therefore an inference from code and local
proofs, not an observation. One bounded production cycle converts the entire
readiness section from inference to fact — and nothing else does.

## 1. The cycle to be proven

```
employer need → candidate discovery → contact/invitation → booking
   → worker accept → assignment/work → journal/evidence → employer confirmation
```

Eight steps, one continuous thread, one pair of counterparties.

| # | Step | Actor | Production surface | What "pass" means |
|---|---|---|---|---|
| 1 | Post a need | Employer | `/dashboard` chat → demand creation, or `/dashboard/company` | A `customer_requests` row exists, owned by the QA employer, with a real request id echoed back |
| 2 | Discover candidates | Employer | `/dashboard/scouting` | The QA worker appears; the ranking shows fit above profile-touch recency (W10 Slice 2) and the pool is not silently capped (W10 Slice 3) |
| 3 | Contact / invitation | Employer | booking proposal path | A `booking_requests` row is created with the QA worker as addressee — **the first such row in production history** |
| 4 | Worker sees and accepts | Worker | `/dashboard` chat booking action | Status transitions to `accepted` via the RPC; the worker's calendar shows the band |
| 5 | Assignment / work | Employer | `/dashboard/projects` | A `project_worker_assignments` row binds the QA worker; **requires M3** (see §6) or the worker cannot read the project at all |
| 6 | Journal / evidence | Worker | chat work-log flow, incl. one photo | A `journal_entries` row with a linked `journal_entry_photos` row; the phone-sized photo is downscaled, not refused (W7 Slice 2) |
| 7 | Employer confirmation | Employer | manager review / confirm spine | A `journal_entry_confirmations` row with the employer as actor |
| 8 | Trust readback | Worker | `?result=player-card`, CV | The confirmation raises the skill's evidence tier honestly — no stars, no score, no fabricated verification |

**Deliberately excluded from v1:** experience records (W6 — migration unapplied),
payments/billing, outreach or messaging to any non-QA party, and any
service-offering request path.

## 2. `PROD_QA_*` accounts required

Three identities. The existing harness covers **one** of them; two are new and
need the same treatment.

| Key | Address | Role | Status today | Purpose |
|---|---|---|---|---|
| `PROD_QA_WORKER` | `qa.worker+goal3@labourmarket.ai` | `worker`, locale `lt` | **harness written, `PROVISIONED: NO`** | steps 4, 6, 8 |
| `PROD_QA_EMPLOYER` | `qa.employer+cycle1@labourmarket.ai` | `company` | **does not exist — needs owner creation** | steps 1, 2, 3, 5, 7 |
| `PROD_QA_MANAGER` | `qa.manager+cycle1@labourmarket.ai` | `company`, org member | **does not exist — optional for v1** | second-actor org-scope proof (only if the org-scope proof is wanted in the same run) |

Non-negotiable properties, inherited from the existing design and extended:

- **Passwordless.** Sessions minted via magic-link OTP. No credential for any QA
  identity exists in the repo, a secret store, a screenshot or a trace.
- **Hard-coded allowlist by equality.** `prod-qa-guard.ts` compares full-address
  equality — never prefix, never pattern. Each new identity is a new explicit
  entry, and the existing `startsWith("qa.")` refusal test must keep passing.
- **Marked in `app_metadata`:** `qa_synthetic = true` plus a purpose string
  naming this plan.
- **Account creation stays with the owner.** An agent may build the harness; it
  must not create accounts or handle credentials.
- **Mint is a script, not a route.** The guard test that walks `app/`,
  `components/` and `lib/` and fails on any reference outside the guard must
  keep passing for the new identities too.

## 3. QA organization

| | |
|---|---|
| Legal / display name | `QA Cycle Proof (SYNTHETIC — NOT A REAL COMPANY)` |
| `organization_type` | `company` |
| Country | `NL` |
| Owner | `PROD_QA_EMPLOYER` |
| Public profile | **disabled** — `public_profile_enabled = false`, no `public_slug`. A synthetic org must never be discoverable, indexable, or visible on the market map to a real user. |

## 4. Test data to be created, and how it is marked

Every row created by this exercise carries a marker in its own free-text field —
not in a separate registry that can drift.

| Object | Count | Marker |
|---|---|---|
| `customer_requests` | 1 | title/description prefixed `[QA-CYCLE-1]` |
| `booking_requests` | 1 | note prefixed `[QA-CYCLE-1]` |
| `projects` | 1 | title prefixed `[QA-CYCLE-1]` |
| `project_worker_assignments` | 1 | inherits the project marker |
| `journal_entries` | 1–2 | body prefixed `[QA-CYCLE-1]` |
| `journal_entry_photos` | 1 | a deliberately dull, non-identifying test image (a printed `[QA-CYCLE-1]` card), never a real site photo |
| `journal_entry_confirmations` | 1 | inherits the entry marker |
| `worker_skills` | 1 updated tier | no new marker; the change is the proof |

**Volume ceiling: ≤ 10 rows total.** Any run that would exceed it stops and
reports instead.

## 5. Cleanup, or safe retention

Default: **retain, clearly marked** — do not delete.

Reasoning: `journal_entry_confirmations` is append-only by design and
`usage_cost_events`-class ledgers refuse deletion; a cleanup script that could
remove them would be a more dangerous artefact than the eight rows it removes.
Retention with a hard marker is safer than building a deletion capability that
nothing else needs.

| Object | Disposition |
|---|---|
| `booking_requests`, `customer_requests`, `projects`, assignments | **Retain**, `[QA-CYCLE-1]` marked. Excluded from every analytics and liquidity metric by an explicit marker predicate that must be added **before** the run, not after. |
| `journal_entries`, photos, confirmations | **Retain.** Append-only by design; deleting them would require weakening the very guarantee this cycle exists to prove. |
| QA accounts | **Retain, disabled** after the run (`banned_until` far future), so the evidence stays reproducible and the identities cannot be reused casually. |
| The photo in Storage | **Retain.** It contains no person, no site, no document, no plate — it is a printed marker card. |

**Required before the run, not after:** the marker predicate must be added to
the metric readers, otherwise the first real liquidity number the platform ever
produces will count its own test.

## 6. Migrations that must be applied BEFORE the proof

| Migration | Why the cycle is invalid without it |
|---|---|
| `20260803090000_project_assigned_worker_read_v1` (**M3**, W11 #988) | Without it the assigned worker cannot read the project (step 5), their calendar band is empty, and step 8's continuity cannot be shown. The cycle would "pass" while hiding the exact defect it should expose. |
| `20260802150000_booking_atomic_double_booking_v1` (**M2**, W12) | Without it production has no DB-level double-booking guard. Proving a booking loop while that guard is absent proves the happy path only. |
| `20260802120000_experience_records_v1` (**M1**, W6) | **Not required for v1.** Experiences are excluded from the cycle. Needed only if step 8 is later extended to subjective feedback. |

**Both M3 and M2 are owner gates.** This plan does not apply them and does not
assume they will be applied.

## 7. Production functions exercised

Auth (magic-link OTP mint), demand creation, scouting/discovery read + ranking,
booking proposal RPC, booking response RPC, project creation + worker
assignment, journal write, journal photo upload + `register_journal_entry_photo`,
manager confirmation RPC, `computeConfidence` recompute, evidence-tier render.

Explicitly **not** exercised: payments, outreach, email to non-QA addresses,
admin moderation, service-offering requests, experience submission.

## 8. Stop conditions

The run halts immediately, leaves everything as-is and reports, if any of these
occur:

1. A row would be created outside the `[QA-CYCLE-1]` marker set.
2. Any surface exposes a **real** user's data to a QA identity, or QA data to a
   real user (checked at every step, not only at the end).
3. The row ceiling (§4) would be exceeded.
4. Any step requires entering a credential, payment detail, or personal
   identifier.
5. Any step would send an outbound message to a non-QA recipient.
6. A `500`, an unhandled exception, or a fail-closed `needs_migration` state
   appears on a step the plan expected to pass.
7. A migration turns out to be unapplied mid-run.
8. The QA organization becomes publicly visible or indexable at any point.
9. More than one retry is needed on any single step — a flaky production step is
   itself the finding, and retrying hides it.

## 9. PII prohibitions

- **No real person's data, ever** — no real name, phone, email, address, ID
  document, photograph of a person, licence plate, or site identifiable to a
  real client.
- The photo is a printed `[QA-CYCLE-1]` card. Nothing else.
- **Nothing is entered that would be sensitive if leaked.** No credential, no
  payment detail, no government identifier — for the QA identities or anyone
  else.
- Evidence artefacts (screenshots, traces, HAR) are scrubbed of tokens and
  session cookies before being written, and the minted state file stays
  gitignored, as the existing harness already enforces.
- No real user's row is read, exported, screenshotted or quoted to produce this
  evidence.
- The QA addresses use `+` addressing on a mailbox the owner controls, so they
  are routable but unmistakably synthetic.

## 10. Owner decisions required

| # | Decision |
|---|---|
| C1 | Approve or refuse the cycle in principle |
| C2 | Create `PROD_QA_EMPLOYER` (and optionally `PROD_QA_MANAGER`) — **owner-only**, as with the existing worker identity |
| C3 | Provision the already-built `PROD_QA_WORKER` (`PROVISIONED: NO` since 2026-07-31) |
| C4 | Apply **M3** and **M2** before the run, or explicitly accept a weaker proof without them |
| C5 | Confirm the retention default (§5) rather than deletion |
| C6 | Confirm the marker predicate is added to metric readers **before** the run |

Until C1–C3 are answered, no part of this plan may be executed.
