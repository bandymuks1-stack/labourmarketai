# W4 — PERMISSION MATRIX: worker identity / Player Card visibility (2026-08-01)

Who may see which identity fields, across BOTH layers: database RLS and app
render gates. Viewer classes: **A = worker self**, **B = authenticated
employer/company user**, **C = anonymous**. Audited read-only at `426e87aa`.

> **Canonical matrix first.** The repo already has ONE guard-pinned
> role × surface permission matrix: `apps/web/lib/legal/permission-matrix.ts`
> (rendered on `/legal/data-access`; every row carries repo-resolvable
> RLS/guard source pointers, and the guard asserts each pointer resolves).
> This document does NOT duplicate it. It is the W4 field-level addendum for
> the professional-identity surfaces, plus the mismatch findings the
> coarse-grained matrix cannot express. If any row here contradicts the
> canonical module, the module + its guard win and this doc must be fixed.

## 1. Field-domain × viewer-class matrix

| Field domain | A (self) | B (employer, authed) | C (anon) | Enforcement |
|---|---|---|---|---|
| Contact (`profiles` full_name/phone/email) | FULL (own row) | BLOCKED — self+admin RLS; no code path delivers contact even after a granted disclosure (finding M3) | BLOCKED | `0001_initial_schema.sql:406-408`; `worker-profile-visibility.ts:216-218` |
| Display name + headline (`workers`) | FULL | PARTIAL — `can_view_worker()` (consent OR active relation) | BLOCKED | `20260711130000_privacy_consent_and_disclosure_v1.sql:313-316`; `people/[workerId]/page.tsx:58-64,104-106` |
| Availability / available_from / location country / experience years | FULL | PARTIAL — same gate, rendered as chips | BLOCKED | `page.tsx:161-183`; `player-card.ts:427-432` |
| Preferred countries, salary_min/max, bio, trust_score (`workers`) | FULL | **PARTIAL at DB, BLOCKED at render** — RLS exposes the whole row; the app never selects these columns (finding M1) | BLOCKED | `0010_skills_and_worker_skills.sql:90` (broad table grant); `page.tsx:60-62` (8-column select) |
| Skills (`worker_skills` + tier: verified / work-journal / declared) | FULL | PARTIAL — `can_view_worker(worker_id)`; person page renders slug + tier chip | BLOCKED | `20260711130000…sql:318-321`; `page.tsx:80-101,212-231` |
| Professions (`worker_professions`) | FULL | PARTIAL — gate only; not rendered on the person page | BLOCKED | `20260711130000…sql:323-326` |
| Work journal entries / metrics / confirmations | FULL (own) | PARTIAL — ONLY an org manager of the entry's engagement context (`manages_organization`), never a merely-consented employer (finding M8) | BLOCKED | `0013_work_journal_m1.sql:341-349,386-395` |
| Work history (`engagement_contexts`) | FULL (own) | PARTIAL — own-org contexts only | BLOCKED | `0013_work_journal_m1.sql:332-334` |
| Certificates (`worker_documents` + events) | FULL per SQL — **migrations unapplied in prod**; app degrades `needs_migration` | BLOCKED — select is owner+admin only ("Employers/agencies see nothing here") | BLOCKED | `20260610170000_worker_documents_readiness.sql:111-130`; `document-actions.ts:12-16,78` |
| Achievements / education (`worker_achievements`) | FULL (own; `confirmed_by_manager` excluded from write grants) | BLOCKED | BLOCKED | `20260714160000…sql:198-222` |
| Free-text skill claims (`profile_skill_claims`) | FULL | BLOCKED — explicit "DO NOT add is_employer() to the select policy" | BLOCKED | `0015_profile_skill_claims.sql:83-101` |
| CV document | FULL (`/cv` behind middleware auth) | BLOCKED — `cv_document` is a disclosable field NAME only; no delivery path | BLOCKED | `middleware.ts:83`; finding M3 |
| Org identity | FULL (own) | FULL — any authenticated user reads all `companies`/`organizations` rows (directory, by design — finding M7) | PARTIAL — opted-in orgs only, via 3 anon-granted allowlisted RPCs on `/business/[slug]` | `0001:460-462`; `0013:327,409`; `20260719120000_business_public_profile.sql:85-104` |

## 2. The employer consent ladder (what B sees at each level)

| Level | Visibility delivered |
|---|---|
| No consent, no relation | ZERO rows (fail-closed `can_view_worker`); person page renders the honest restricted state (`page.tsx:66-68,241-259`) |
| `profile_discoverability` granted | the `workers` row + skills + professions (`20260711130000…sql:257-265`); consent text promises profession, experience, skills, region, availability, languages, pay expectation, chosen display name (`consent-definitions.ts:87-96`) |
| Active work relationship (accepted company/agency worker, active engagement, active project assignment) | same visibility WITHOUT discovery consent — different legal basis (`…sql:266-294`); org managers additionally see journal entries for their org's contexts |
| `employer_data_disclosure` accepted + granted | **nothing additional is delivered today** — the UI shows `disclosureGranted: true` and no field moves (findings M3/M4) |

`DISCLOSABLE_FIELDS` — exactly 7, closed set, triple-pinned (TS constant,
shared whitelist, SQL whitelist): `full_name, phone, email, cv_document,
preferred_locations, availability_details, salary_expectation`
(`consent-definitions.ts:71-79`; `contact-disclosure-shared.ts:29-37`;
`20260711130000…sql:483-487`).

## 3. RLS inventory (identity tables, one line each)

| Table | Policy |
|---|---|
| `profiles` | select/insert/update self or admin; delete admin-only (`0001:406-418`) |
| `workers` | select `can_view_worker(id)`; write self/admin (`20260711130000…sql:313-316`, supersedes 0001's broad `is_employer()` read — finding M6) |
| `worker_skills` / `worker_professions` | select `can_view_worker(worker_id)`; write owner/admin (`…sql:318-326`) |
| `profile_skill_claims` | all ops own-row (+admin select) (`0015:83-101`) |
| `worker_achievements` | all ops own `profile_id` (+admin select) (`20260714160000…sql:198-222`) |
| `worker_documents` / `_events` | select owner+admin only; writes RPC-only (`upsert_worker_document`); events append-only; verification: worker requests → admin decides (`20260610170000…sql`, `20260613100200…sql`) — **UNAPPLIED in prod** |
| `journal_entries` / `journal_entry_skills` / `journal_entry_confirmations` | owner / admin / engagement-org manager; entries append-only; confirmations insert = org manager (`0013:341-399`, `20260602120000…sql:38-70`) |
| `companies` / `organizations` | select: any authenticated; write owner-or-admin / admin+definer-mirror (`0001:460-472`; `0013:327-328,409`) |
| org public surface | 3 SECURITY DEFINER anon RPCs, `public_profile_enabled = true` filter, allowlisted columns (`20260719120000…sql:46-104`; pinned by `public-business-profile.test.ts`) |
| `privacy_consent_events` / `personal_data_disclosures` | own-row select; append-only via definer RPCs; disclosure delete forbidden (`20260711130000…sql:116-127,173-182`) |
| `can_view_worker(w)` | self ∨ admin ∨ (employer ∧ discoverable) ∨ active relation; anon EXECUTE revoked (`…sql:245-303`) |

## 4. Render gates

- `middleware.ts:83` — `REQUIRES_AUTH = ["/dashboard", "/onboarding", "/cv"]`; `/dashboard/documents` covered by the prefix. Production-verified 2026-08-01 (`w4-acceptance.md` §2).
- Person page: login redirect, UUID check, then **RLS does the permission work** — zero rows → restricted state; own row → redirect to own profile; selects only 8 safe columns; contact only via the permission-gated message button.
- Player Card: null without a session; all reads RLS-scoped to own rows.
- Visibility module: `PROFILE_SAFE_PREVIEW_FIELDS` (10 non-contact fields) + `assertContactSafe` runtime net; PR #963 deleted the app-layer relation resolver — "the DB predicate is the single visibility truth."
- `/business/[slug]`: anon-safe, RPC null → 404, org's OWN opt-in contacts only, honest `needs-migration` degradation.

## 5. Findings (mismatch rows — the audit's value)

| # | Finding | Disposition |
|---|---|---|
| M1 | `can_view_worker` gates the ROW, not columns: a consented employer session can select `workers.bio`, `salary_min_eur`, `salary_max_eur`, `trust_score`, `preferred_countries` via PostgREST even though no app surface renders them. Column-level privilege fix = migration | **owner-gated item 10** (added to the W4 list) |
| M2 | `FORBIDDEN_PREVIEW_KEY_PATTERNS` forbids `display_name`, yet the person page renders it to employers. Consent text DOES cover "chosen display name", so the shipped render is consent-consistent — the module's forbidden list is the stale side | code-only hygiene, W5 backlog (app-layer only, no exposure change) |
| M3 | `record_personal_data_disclosure` has ZERO app callers (grep-confirmed: generated types, comments, guard test, docs only). No contact field is ever delivered to any employer by any code path at any consent level | matches the W4 audit row "contact disclosure delivery PARTIAL (dead-end)"; delivery scope stays owner-gated item 8 |
| M4 | `docs/launch/commercial-pilot-readiness-train-v1-delivery-truth.md:23` claims `grant_employer_data_disclosure` has zero callers — now false (`grantContactDisclosureAction` calls it). The ask-table migration `20260716120000` is headed `DRAFT — DO NOT APPLY`, so in prod the ask→accept→grant chain degrades to `needs-migration` | stale line corrected in this PR |
| M5 | `worker_documents` RLS exists only in unapplied SQL; production has no table; app degrades honestly | already owner-gated item 2 |
| M6 | Legacy broad reads (`0001` workers, `0008` professions: `… or is_employer()`) superseded by `20260711130000` — an environment missing that migration regresses to every-employer-sees-every-worker | note for environment provisioning; prod has it applied |
| M7 | Any authenticated user reads ALL `companies`/`organizations` rows — org directory by design, asymmetric with the worker side | accepted, by design |
| M8 | Journal privacy is stricter than profile privacy: discovery consent exposes journal-DERIVED skill tiers, never journal entries (those need `manages_organization`). No render surface contradicts it | accepted — exactly the intended model |
