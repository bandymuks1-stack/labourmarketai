# Labourmarket.ai — Current State Baseline v1 (AUDIT LOOP 0)

**Date:** 2026-07-22
**Repo:** `C:\Users\Mano\Documents\labourmarketai`
**Branch:** `main`
**HEAD:** `664b9ab9fe75887cee8bcfd5917d671239df11f5` — *feat(billing): add canonical immutable LMC ledger foundation v1 (#843)*, 2026-07-21 16:27:31 +0300
**Working tree:** CLEAN — `git status --porcelain` returned 0 lines. No foreign or uncommitted changes were present, and none were introduced by this audit.
**Unpushed commits:** none (`git log origin/main..HEAD` empty)
**Remote:** `https://github.com/bandymuks1-stack/labourmarketai.git`

> This document is LOOP 0 of the full product audit. It records **only verified truth
> sources**. Nothing here is inferred from documentation alone — where a document and
> the running system disagree, both are recorded and the disagreement is a finding.

---

## 1. Identity

The project is **labourmarket.ai**. It is a distinct, active product. It must not be
confused with, or named after, any older abandoned project. The repo's own domain
policy (`docs/policies/domain-truth-v1.md` v3) states the rule explicitly:

> No "Labma" / "Construction OS" branding anywhere in the new system.

---

## 2. Deployment truth

| Item | Verified value | Evidence |
|---|---|---|
| Production origin | `https://labourmarket.ai` (apex, single domain) | `docs/policies/domain-truth-v1.md` v3; live HTTP 200 |
| Legacy aliases | `www.labourmarket.ai`, `app.labourmarket.ai` → 308 to apex | `apps/web/next.config.ts:16-20` |
| Hosting / deploy | Vercel, auto-deploy from `main` | `docs/DEPLOYMENT.md` |
| Single-domain migration | 2026-07-19 (v3 supersedes the earlier split-host v2) | `docs/policies/domain-truth-v1.md` |
| CI on `main` | GREEN — last 8 runs of *Quality Gates* all `success` | `gh run list --branch main` |
| Required checks | `quality`, `migration-safety` | `AGENTS.md` §Merge model |

### Live route sweep (2026-07-22, GET only)

26 public paths × 3 locales (`lt`, `en`, `ru`) = 78 requests. **Result: 72 × HTTP 200, 6 × HTTP 307.**

- All marketing, legal, auth and `/cv` routes return **200 in all three locales** — no
  broken or locale-missing public page was found.
- `/{locale}/dashboard` and `/{locale}/onboarding` return **307** for anonymous callers
  — auth gating works as designed.

Routes verified: `/`, `/about`, `/pricing`, `/for-workers`, `/for-companies`,
`/for-agencies`, `/company-need`, `/professions`, `/skills`, `/labour-market`,
`/work-abroad`, `/work-opportunities`, `/worker-intake`, `/match-preview`, `/questions`,
`/vision`, `/calculators/project-cost`, `/legal/privacy`, `/legal/terms`, `/legal/cookies`,
`/legal/data-access`, `/auth/login`, `/auth/signup`, `/onboarding`, `/dashboard`, `/cv`.

---

## 3. Database truth (Supabase, read-only)

| Item | Verified value |
|---|---|
| Project | `gorgitwvdzxbnaxhrsrw` — name "labourmarket.ai", region `eu-west-1`, status `ACTIVE_HEALTHY` |
| Postgres | 17.6.1.121 |
| Migration files in repo | 161 (`supabase/migrations/*.sql`) |
| Rollback files in repo | 93 (`supabase/rollbacks/*.down.sql`) |
| `SECURITY DEFINER` functions in `public` | **205** |

### 3.1 Actual production scale — the single most important context in this audit

Live row counts (`pg_stat_user_tables`, 2026-07-22):

| Table | Rows |
|---|---|
| `esco_labels` | 1,034,730 |
| `esco_occupation_skills` | 126,102 |
| `esco_skills` | 13,939 |
| `esco_occupations` | 3,039 |
| `profession_skills` | 232 |
| `pilot_events` | 224 |
| `skills` | 153 |
| `journal_entry_metrics` | 82 |
| `market_intelligence_observations` | 76 |
| `professions` | 49 |
| `engagement_contexts` / `profile_roles` | 39 / 39 |
| `worker_skills` | 33 |
| `journal_entries` | 32 |
| `audit_logs` | 31 |
| **`profiles`** | **27** |
| **`workers`** | **27** |
| `profile_skill_claims` | 27 |
| `journal_entry_skills` | 26 |
| **`customer_requests`** | **17** |
| `conversation_messages` | 16 |
| `journal_entry_confirmations` | 12 |
| `countries` | 10 |
| **`organizations`** | **9** |
| `journal_entry_photos` | 8 |
| `lmc_settings` | 6 |
| **`companies`** | **6** |
| **`projects`** | **5** |
| `plans` | 4 |
| `waitlist` | 3 |
| `agencies` | 3 |
| **`conversations`** | **2** |
| `company_need_public_intakes` | 1 |

**Interpretation (evidence-based, not opinion):** the product is at *pilot scale* —
27 people, 6 companies, 17 demands, 2 conversations. Against this, the repo ships
**115 `page.tsx` routes** (≈80 of them under `/dashboard`) and **161 migrations**.
The built surface area is one to two orders of magnitude larger than the validated
usage. This ratio is the central strategic fact of the audit and drives the priority
ordering in LOOP 8.

### 3.2 Supabase advisors

252 lints, **zero at ERROR level**. Breakdown:

| Count | Level | Lint |
|---|---|---|
| 193 | WARN | `authenticated_security_definer_function_executable` |
| 54 | WARN | `anon_security_definer_function_executable` |
| 1 | WARN | `rls_policy_always_true` — `public.waitlist` / `waitlist_insert_anon` |
| 1 | WARN | `function_search_path_mutable` — `customer_requests_status_transition_guard` |
| 1 | WARN | `auth_otp_long_expiry` (> 1 hour) |
| 1 | WARN | `auth_leaked_password_protection` — **disabled** |
| 1 | INFO | `rls_enabled_no_policy` |

### 3.3 CONFIRMED DEFECT — `anon` can reach 54 `SECURITY DEFINER` functions

**Evidence (catalog, read-only):** of 205 `SECURITY DEFINER` functions in `public`,
`has_function_privilege('anon', oid, 'EXECUTE')` is true for **54**.

**Root cause, proven:** the migrations ran `GRANT EXECUTE … TO authenticated` but never
`REVOKE EXECUTE … FROM PUBLIC`, so PostgreSQL's default `PUBLIC` grant survives.

```
add_project_stage_v1        proacl = {=X/postgres,postgres=X/postgres,authenticated=X/postgres}
create_asset_v1             proacl = {=X/postgres,postgres=X/postgres,authenticated=X/postgres}
create_proposal_v1          proacl = {=X/postgres,postgres=X/postgres,authenticated=X/postgres}
report_defect_v1            proacl = {=X/postgres,postgres=X/postgres,authenticated=X/postgres}
request_worker_absence_v1   proacl = {=X/postgres,postgres=X/postgres,authenticated=X/postgres}
submit_company_need_public_v1  proacl = {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres}
```

The leading `=X/postgres` **is** the `PUBLIC` grant. The intentionally-public
`submit_company_need_public_v1` is the control: it has an explicit `anon` grant and
**no** `PUBLIC` entry — i.e. the correct pattern exists in the codebase and was simply
not applied to the other functions.

**Contradiction with documentation:** `docs/APPLIED_LEDGER.md` states repeatedly, for
these same migrations, *"GRANT SELECT + EXECUTE to authenticated only, no anon"* and
*"granted authenticated only, never anon"*. Production disagrees. The post-apply
verification recorded in the ledger did not test the `PUBLIC` grant.

**Exploitability probe (safe, zero rows written).** A `DO` block that set `role anon`,
called `report_defect_v1`, and then aborted the whole block with `RAISE EXCEPTION`
returned:

```
PROBE_RESULT=BLOCKED: P0001 not authorized to manage this project
```

So for that function the in-body authorization check still holds. **Whether every one of
the 54 has such a check is the decisive question** and is assigned to LOOP 6. Until that
sweep completes this is recorded as *at least* a defence-in-depth failure plus a false
documented control; it escalates to P0 only if any of the 54 lacks an effective in-body
check.

---

## 4. Migrations: applied vs deferred

`docs/APPLIED_LEDGER.md` records an explicit **"Deferred (committed/known, NOT applied)"**
list. Migrations committed to the repo but *not* applied to production include:

| Migration | Feature it gates |
|---|---|
| `20260713120000_company_locations_v1.sql` | company operating geography |
| `20260713160000_agency_clients_v1.sql` | staffing-agency client records |
| `20260713210000_multi_source_talent_v1.sql` | worker external profiles, provenance, identity resolution |
| `20260714150000_ai_runs_audit_v1.sql` | AI run audit log + daily AI budget counter |
| `20260714170000_worker_opportunity_seen_v1.sql` | worker opportunity "new" markers |
| `20260714180000_journal_profession_templates_v1.sql` | journal profession templates |
| `20260714210000_company_memberships_v1.sql` | multi-company switching |
| `20260714211000_dashboard_preferences_v1.sql` | server-side dashboard card prefs |
| `20260717150000_demand_interest_seen_v1.sql` | interest-response notification spine |

Plus, from open PRs: `20260721150000` (Stripe/billing DRAFT, PR #844) and
`20260740…`-class drafts in PR #740 (`voice_journal_jobs`).

Each is annotated **"HUMAN GATE: do NOT apply without explicit owner OK"**. Every one is
therefore an **owner gate** in LOOP 8, and every feature depending on one is at best
PARTIAL (LOOP 3 verifies which).

> **CORRECTED 2026-07-22 by LOOPs 3 and 7.** The true count of committed-but-unapplied
> migrations is **10**, not 12: the 9 ledger-declared deferrals above (all verified
> genuinely unapplied by catalog read, not by trusting the doc — e.g. `profiles` has no
> `active_organization_id`, `relationship_types` has no `viewer`), plus **one that appears
> in neither list**: `20260717130000_open_markets_countries_draft_v1`.
> `20260612091000_journal_entry_photos.sql` is a superseded duplicate whose objects are
> live in production.
>
> **Drift runs in BOTH directions, and the reverse direction is worse.** LOOP 3 found
> **26 migrations live in production but absent from `docs/APPLIED_LEDGER.md`** — including
> the ~1,550-line LMC ledger applied 2026-07-21 and `business_public_profile`. The
> ledger's last recorded row is `20260718210000`; production's last apply is
> `20260721133338`. **`APPLIED_LEDGER.md` cannot be used as a source of truth in either
> direction** — only prod catalog reads can.

**Known ledger-drift precedent:** `20260705220000_team_brigade_org_spine.sql` was applied
to production on 2026-07-05 but never recorded in the ledger; the drift was only caught
by a dedicated audit on 2026-07-17. The ledger is therefore **not** a trustworthy sole
source — prod catalog reads are.

**Rollback coverage gap:** 161 migrations vs 93 rollback files. `AGENTS.md` makes a paired
`supabase/rollbacks/<name>.down.sql` *binding* for every DB-touching migration. The 68-file
gap is partly explained by non-DB-touching migrations, but the exact unpaired set is
quantified in LOOP 7.

---

## 5. Open pull requests (12)

| PR | State | Mergeable | Branch | Title |
|---|---|---|---|---|
| #844 | DRAFT | MERGEABLE | `feat/stripe-test-subscriptions-v1` | Stripe TEST subscriptions v1 (owner-gated) |
| #831 | DRAFT | **CONFLICTING** | `fix/legacy-oauth-removal-v1` | Phase 3 — remove legacy Supabase-hosted Google redirect flow |
| #798 | DRAFT | **CONFLICTING** | `feat/cc/official-vacancy-source-nav-norway-v1` | NAV Norway vacancy source (ships OFF) |
| #779 | DRAFT | MERGEABLE | `feat/cc/executive-presentation-system-v1` | Executive presentation system |
| #740 | DRAFT | MERGEABLE | `feat/voice-journal-jobs-migration-v1` | `voice_journal_jobs` draft migration |
| #687 | READY | MERGEABLE | `feat/cc/company-demand-outreach-pipeline-v1` | company-demand outreach (draft-only) |
| #516 | READY | MERGEABLE | `docs/cc/sprint-train-v2` | Sprint Train v2 status doc |
| #511 | DRAFT | MERGEABLE | `audit/approval-permission-readiness-v1` | Approval authority model |
| #510 | DRAFT | MERGEABLE | `plan/product-reality-train-v1` | Product Reality Train plan |
| #507 | DRAFT | MERGEABLE | `audit/visible-product-structure-v1` | Visible product structure audit |
| #486 | DRAFT | UNKNOWN | `docs/cc/full-project-reality-audit-v1` | Full project reality audit |
| #379 | DRAFT | UNKNOWN | `feat/cc/ai-agents-v1-audit-store` | AI run audit log (RED migration) |

**Observation:** 8 of 12 are stale audit/plan/doc branches (#486, #507, #510, #511, #516,
#779). Two are conflicting (#831, #798). This is queue debt, not product debt, but it
obscures which work is actually live. Closing or rebasing the stale set is a cheap P2.

---

## 6. Documentation vs code conflicts found in LOOP 0

| # | Conflict | Evidence |
|---|---|---|
| D1 | **Migration policy contradiction between the two agent contracts.** `CLAUDE.md:55-57` — *"Running migrations on production — NEVER automatic."* `AGENTS.md:55-76` — *"PROD APPLY AUTONOMY (conditional — DI decision 2026-06-12). The old hard blocker … is replaced."* Both files are loaded as binding contracts; they give opposite instructions. | `CLAUDE.md:52-65` vs `AGENTS.md:52-87` |
| D2 | **Ledger claims `anon` has no EXECUTE; production grants it via `PUBLIC`.** | §3.3 above |
| D3 | **`docs/DEPLOYMENT.md` says the Supabase project "already exists but is empty" and "no agent has applied" the migrations.** Production has 161 migrations' worth of schema and >1.1 M rows. The document is stale by months. | `docs/DEPLOYMENT.md` §"Applying the database" vs §3.1 |
| ~~D4~~ | ~~**No committed `.env.example`.**~~ **RETRACTED 2026-07-22 — this finding was WRONG.** My `ls apps/web/.env*` missed it because the file is at the **repo root**, not under `apps/web`. LOOP 7 verified it exists, is tracked, 5,886 bytes, 40 variables. The bootstrap procedure is fine. Retained here rather than deleted, per the same honesty rule this audit applies to the ledger. | LOOP 7 verification |

Fuller doc-vs-code sweep is assigned to LOOP 7.

---

## 7. Feature-flag reality

No general feature-flag registry module exists. `find apps/web -iname "*flag*"` returns
exactly two files:

- `apps/web/lib/billing/lmc-flags.ts`
- `apps/web/lib/market/recognition/risk-flags.ts`

`docs/APPLIED_LEDGER.md` lists `feature_flags` among *"scaffolds (unshipped features)"*.
So "flags" in this codebase mostly means **an unapplied migration** or a hardcoded
constant, not a runtime switch. That matters for LOOP 8 sequencing: features cannot be
dark-launched; they are gated by owner-applied DDL.

---

## 8. What LOOP 0 could NOT verify

| Item | Why | Who unblocks |
|---|---|---|
| Authenticated user journeys | Creating an account is outside what this session may do, and no test credentials were supplied. All logged-in findings are code/DB-derived, not journey-proven. | **Owner gate:** supply a disposable pilot account (worker + company) or run the journeys and share output |
| Vercel project settings, env var inventory, deploy history | No Vercel access in this session | Owner |
| Stripe dashboard state (products, prices, keys, webhook endpoints) | Read-only-by-policy for this audit; no Stripe credentials | Owner (LOOP 5 records what code asserts) |
| Real-device mobile performance (LCP/CLS/INP) | Browser screenshot capture repeatedly timed out on the animated landing page; no field RUM data available | Owner / add RUM |
| Whether branch protection actually requires `quality` + `migration-safety` | GitHub repo settings not readable here | Owner |

---

## 9. LOOP 0 result

- **Status:** COMPLETE.
- **Repo, HEAD, tree:** confirmed and clean; nothing was modified.
- **Baseline established:** production is live, CI is green, the schema is large and
  healthy, and real usage is at pilot scale (27 people / 6 companies / 17 demands).
- **Carried into the priority register:** one confirmed production security defect
  (§3.3), four doc-vs-code conflicts (§6), a 9-migration owner-gate backlog (§4), a
  68-file rollback coverage gap, and 12 open PRs of which 8 are stale.
- **Next:** LOOP 1 (production journeys) — see
  `docs/audits/labourmarketai-production-journey-audit-v1.md`.
