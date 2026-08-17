# LABOURMARKET_AI_WORK_OS_VECTICUM_COMPLETION_REPORT

Date: 2026-08-17. Operator command: full code+production+DB reality audit
vs the Vecticum capability matrix, then completion of what is safely
completable. Companion documents (same train):
- `docs/audits/full-reality-audit-2026-08-17.md` (Phase 1 evidence)
- `docs/audits/vecticum-capability-matrix-2026-08-17.md` (Phases 2+8)
- `docs/audits/sweden-market-truth-2026-08-17.md` (Phases 6+7)

## 1–5. Train identity

| Field | Value |
|---|---|
| 1. START SHA | `9ecd063b` (origin/main; local main was 179 commits stale and was NOT used) |
| 2. END SHA | see PR head (filled at commit time below) |
| 3. PR | see §PR |
| 4. Merged | see §PR |
| 5. Deployed | Vercel auto-deploy on merge to main (no manual deploy step) |

## 6. Migrations

ZERO new migrations in this train — a deliberate choice. All completion
slices are code-only against RPCs already applied in production. Migration
needs discovered by the audit are listed in §24 as owner decisions
(migration-safety human gates apply to each).

## 7–8. Reality classification (before → after this train)

Counts over the 88 audited items (7 domains, full tables in
`full-reality-audit-2026-08-17.md`):

| Status | Before | After | Change |
|---|---:|---:|---|
| FULL | 34 | 35 | document approval chain: BROKEN → FULL (worker submit wired) |
| PARTIAL | 25 | 25 | AI boundary item hardened (still PARTIAL — runtime off in prod) |
| BROKEN | 1 | 0 | — |
| MISSING | 20 | 20 | parity gaps need migrations → owner-gated (§24) |
| DUPLICATE | 5 | 5 | consolidation needs migrations → owner-gated (§24) |
| DEAD | 3 | 3 | one DEAD RPC revived (verification request); dead tables listed for owner decision |

Corrections to stale repo docs proven against live production:
`caller_manages_worker_engagements_v1` APPLIED (`20260812180224`);
`experience_records` APPLIED (live rows); `save_worker_availability_prefs_v2`
APPLIED; secdef anon-authz fix APPLIED (verified in `pg_proc`). Genuinely
unapplied: `company_locations`, durable workspace pointer, open-markets seed.

## 9–11. Vecticum comparison and value score

Full matrix: `docs/audits/vecticum-capability-matrix-2026-08-17.md`.
Weighted value coverage model (14 categories, weights sum 105):

| | Score |
|---|---:|
| Vecticum | 50.0% |
| 10. LM CURRENT | **63.6%** |
| 11. LM AFTER THIS TRAIN | **65.0%** |

LM's unique categories (external market supply, worker-side network,
matching/skills intelligence — 31 weight points) are unreachable for
Vecticum; Vecticum's lead is depth in internal HR admin (approval chains,
e-signature, OCR finance, trips/procurement/testing/board modules), all
reachable for LM as thin modules on existing engines. LabourMarket.ai
remains an Opportunity Realization / Work OS — NOT a Vecticum copy.

## 12–19. Sweden market truth (production read-back 2026-08-17)

| # | Metric | Value |
|---|---|---:|
| 12 | Total active visible vacancies | **41,606** (41,642 stored; 36 removed; 0 duplicates; 69,840 positions) |
| 13 | Distinct identified employers | **7,669** (7,359 org-number identities + 310 name-only; no fuzzy merge) |
| 14 | Direct employers | ~7,462 (heuristic ceiling — agency detection is name-pattern only) |
| 15 | Staffing agencies | 207 org-ids / 3,944 ads (heuristic floor) |
| 16 | Unknown/anonymous employers | **0** ads (99.0% carry an official org number) |
| 17 | Registered LM organizations | 13 |
| 18 | Active employer accounts | 13 orgs (14 active memberships) |
| 19 | Paying organizations | **0** (billing_subscriptions=0, PAYMENTS_ENABLED=false) |

The previously quoted 37,198 was stale; regions = 21 (all Swedish län).

## 20. EXACT SAFE PUBLIC CLAIM

> **"41,000+ active job opportunities from 7,600+ employers across all 21
> Swedish regions."**

Forbidden forever: deriving any "X companies use/trust/joined
LabourMarket.ai" from imported-ad populations. This is now CODE, not
policy: `apps/web/lib/analytics/market-coverage-claims.ts` defines the
four populations (marketplace / registered / active / paying) and
`lib/guards/market-coverage-claims.test.ts` scans every shipped message
catalog for adoption-verb violations (LT+EN vocabularies) on every test
run.

## 21. Tests

- Baseline at `9ecd063b`: typecheck ✓, lint ✓, unit 15,294/15,294 (one
  5s-timeout flake in `extract-hardening.test.ts` under parallel load;
  passes in 1.19s isolated — root-caused, not suppressed).
- New: `lib/guards/worker-doc-verification-request.test.ts` (eligibility
  matrix incl. expiring-but-ready, RPC failure-code mapping, page wiring,
  i18n key presence ×5 locales, AI boundary pins) and
  `lib/guards/market-coverage-claims.test.ts` (population separation,
  claim template, catalog scan). Full gate results: §Gates.

## 22. Security / RLS evidence

- Production advisors: **0 tables without RLS**; 1 ERROR
  (`worker_absence_scheduling` SECURITY DEFINER view — §24), 4
  intentionally-anon SECURITY DEFINER RPCs (public business profile +
  public intake), 229 authenticated SECURITY DEFINER RPCs (the app's
  intended RPC-only write architecture).
- Fixed this train (code): auth + per-user rate limit on
  `aiJournalEntrySuggestions` and `aiCvStructuringSuggestions` (were
  callable unauthenticated with no throttle); public company-need action
  no longer invokes the AI draft for rate-limited callers.
- Verified applied in prod: contract/proposal RPC anon-authz fix
  (null-guard + `is distinct from`, anon EXECUTE revoked).
- Cross-tenant gaps documented for owner decision (§24): `using(true)`
  SELECT on `productivity_units` / `profession_templates` / `skill_icons`;
  person-bound (not org-bound) authority on invitations and
  contact-disclosure; creator-bound legacy authority on `finance_records`.

## 23. Remaining blockers

- No generic Workflow & Approval engine (the #1 architectural gap vs
  Vecticum) — needs schema, therefore owner-gated design+migration train.
- No document FILE storage (bucket+versions), no acknowledgement, no
  correspondence register, no employment-contract entity (legal-control
  doctrine: DB records must never masquerade as signed legal contracts).
- No timesheet primitive / leave balances / shift entity.
- AI runtime `AI_PROVIDER_MODE=disabled` in production (owner env
  decision) — every AI surface honestly off; ai_runs=0.
- Duplication debt: 3 invitation systems, 2 membership truths, 3
  employment-record models, 6 candidate-stage stores.

## 24. Owner decisions required

1. Apply-or-reject list (each needs its own human gate): fix
   `worker_absence_scheduling` view to `security_invoker`; org-scope RLS
   for the 3 `using(true)` registry tables; `company_locations`
   activation; durable workspace pointer; open-markets seed
   (`20260717130000`).
2. Approve the Workflow & Approval Engine design track (P0 in the value
   model; unlocks employee requests, acknowledgement, contract approval,
   expense approval as thin modules).
3. Decide the document FILE layer (storage bucket + versioning on the
   existing registry) — prerequisite for acknowledgement/retention parity.
4. Decide fate of dead schema: `agency_candidate_offers`,
   `talent_source_records`, `candidate_skills`, `job_demands`, LMC app
   layer, `worker_skills.self_rated_level`.
5. AI activation: set `AI_PROVIDER_MODE=live` + provider key (boundaries
   are now hardened; budget caps + audit ledger already in place).
6. Public claim adoption: the §20 sentence is safe to publish today;
   numbers should be re-derived from `public_vacancies` at publish time.

## Gates (this train's head, run 2026-08-17)

| Gate | Result |
|---|---|
| typecheck | ✅ clean |
| lint | ✅ 0 errors (26 pre-existing warnings) |
| unit (vitest, full) | ✅ 15,308 tests (one pre-existing 5s-timeout flake under parallel load, passes isolated — root-caused) |
| check:i18n-debt | ✅ within baseline (de=0, nl=0, ru=0 — new keys kept parity) |
| check:constitution | ✅ 6 probes pass |
| placeholders:check | ✅ 159 entries |
| check:worker-plain-language | ✅ en, lt |
| build (next build) | ✅ |

One guard interaction during the train: the claim template initially used
`Number.toLocaleString("en-US")`, which the W12 UTC-presentation guard
correctly flags as date-shaped; switched to `Intl.NumberFormat` — the
guard did its job.
