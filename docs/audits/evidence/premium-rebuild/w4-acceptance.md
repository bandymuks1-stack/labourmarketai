# W4 — PROFESSIONAL IDENTITY: ACCEPTANCE RECORD (2026-08-01)

Closes the W4 stage opened in `w4-baseline.md`. The three implementation
slices are merged (PRs #963, #964, #965); this record holds the production
deploy confirmation, the production smoke at its honest level, the
permission matrix pointer, and the stage verdict.

## 1. Production deploy confirmation

| | |
|---|---|
| Production SHA | **`426e87aa`** (merge of PR #965 — all three W4 slices included) |
| GitHub deployment | **`5703997684`** — environment Production, state **success** |
| Created | 2026-08-01T11:09:30Z |
| Prior W4 deploys | `5703619557` (#963, `658731ed`), `5703885612` (#964, `ce79305e`) — each success |
| CI | `quality` + `migration-safety` green at each merge; CodeQL success on `426e87aa` |
| Migrations applied by these deploys | **none** — slice 2 ships fail-closed `needs_migration`; 20260610170000 / 20260613100200 stay owner-gated |

## 2. Production smoke (2026-08-01, against https://labourmarket.ai at `426e87aa`)

### Unauthenticated — RAN, ALL PASS

| Check | Result |
|---|---|
| `landing-repair.spec.ts` (4 scenarios: hero submit announces, unanswerable announced, nav real, both entries reachable) | **4/4 PASS** (`E2E_BASE_URL=https://labourmarket.ai E2E_NO_SERVER=1`, 20.0s) |
| `/` → locale redirect | 307 → `/lt` → 200 |
| `/lt/cv` (W4 slice 3 middleware backstop) | 307 → `/lt/auth/login?next=%2Flt%2Fcv` — auth-gated in production |
| `/lt/dashboard/documents` (W4 slice 2 surface) | 307 → login with `next` param — auth-gated in production |
| `/lt/dashboard` | 307 → login with `next` param |
| `/lt/business/<unpublished-slug>` | honest **404** (not 500, not a leak) |
| `/lt/auth/login` | 200 |

### Authenticated — BLOCKED, credential (unchanged standing blocker)

`EMPLOYEE_BETA_PRODUCTION_GATE` needs the synthetic QA account
(`qa.worker+goal3@labourmarket.ai`). `prod-qa-account.md` records
`PROVISIONED: NO — owner action pending`, and no `PROD_QA_*` secret exists
in the environment. The stored `employee-gate/gate-results.json` is a
**local** run (target `127.0.0.1:3400`) and is not production proof.

This is blocker class 5 (production secrets unavailable). Reported once
here; not re-probed in a loop. The one-command unblock is in
`prod-qa-account.md` §Provisioning.

## 3. Permission matrix

`w4-permission-matrix.md` (same directory) — viewer-class × field-domain
matrix (worker self / authenticated employer / anonymous) across both
layers: database RLS and app render gates, with file:line evidence.

## 4. Verdict

```text
W4_PROFESSIONAL_IDENTITY_COMPLETE_WITH_OWNER_GATED_ITEMS
```

Accepted: identity honesty fixes live (employer skills render, strict
verified rule, no blanket verification), certificates write path shipped
fail-closed, org identity completed (description write path, ONE
display-name rule), `/cv` middleware backstop live, public landing and
route-gating production-proven.

### The single owner-gated list (reported once — nothing else blocks W5+)

1. `PROD_QA_*` secrets + QA account provisioning (authenticated production proof).
2. `worker_documents` migrations 20260610170000 / 20260613100200 (certificates activation in prod).
3. Certificate file storage bucket (new storage migration).
4. Declared-certificate expiry column (migration).
5. Public worker profile / share route — consent-purpose wording (legal prerequisite).
6. Employer-visible card scope beyond the 7 `DISCLOSABLE_FIELDS` (consent-scope ruling).
7. `is_employer()` org-membership gate (RLS migration).
8. Contact-disclosure delivery scope confirmation (`record_personal_data_disclosure` has zero callers).
9. `country_document_requirements` curation.
10. Column-level privileges on `workers` AND `worker_skills` (matrix finding M1 + W6 finding L4, one migration, same gate): a consented employer session can select at the DB layer more than any surface renders — `workers.bio`/`trust_score`/`preferred_countries` (rendered nowhere), plus `salary_min_eur`/`salary_max_eur`, which ARE rendered in part: the scouting candidate card shows the minimum as a consent-covered pay expectation (corrected 2026-08-02, W8 slice 1 — the earlier wording claimed no surface renders them). The gate is unchanged and still covers all of these columns; only the reasoning for the salary pair is narrower — DB reach beyond the rendered value, not an unrendered field. The gate also covers `worker_skills.verified_by` (the confirming manager's profile UUID — the sharpest edge), `confidence_score`, `confidence_bin`, `verified_at`, `self_rated_level`, `current_pace_value`/`current_pace_unit`. W6 finding L5 recorded alongside (no action, boundary note): org managers can read `journal_entry_confirmations.confirmer_id` + full `confirmation_scope` jsonb while every render deliberately shows role only — inside the manager viewer class the matrix already grants; UI must NOT widen onto those extra fields.

W4 is frozen except real regressions. Next stage: **W5 — Work Journal /
Evidence / Skills pipeline** (`w5-baseline.md`).
