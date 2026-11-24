# Capacity thresholds v1 — when to act, from measured production data (FINAL COMPLETION Train B3, 2026-09-02)

**Source numbers:** `docs/audits/p0-p1-auth-onboarding-latency-db-audit-2026-09-02.md` §F–J (read-only `pg_*`
catalogs, 2026-09-02) and the register §0. This file turns them into triggers. It does not change anything.

## 1. Three data classes, three growth laws

| Class | What | Size today | Growth law | Who owns growth |
|---|---|---|---|---|
| **Canonical user data** | profiles, workers, organizations, memberships, journal, confirmations, photos metadata, consents, timesheets, allocations, auth | **< 5 MB** for 40 users (≈ 0.15 MB/user) | linear in active users × journal cadence | product |
| **External market data** | `public_vacancies` (Arbetsförmedlingen stream), `esco_*` (release data) | 335 MB + 458 MB | vacancies ≈ **+55 MB/week** (≈ 12 k rows/week); ESCO fixed per release | ingestion cadence / locale scope (gates G-3…G-5) |
| **Derived / cache** | `pilot_events`, `usage_cost_events`, `ai_runs`, `market_intelligence_observations` | < 2 MB | linear in traffic; retention functions exist for `ai_runs` | retention policy |

Database total 789 MB (Free quota 500 MB, warned not enforced). Indexes ≈ 400 MB, bloat negligible.

## 2. Thresholds by user count (canonical class only)

| Active users | Canonical data (measured law) | DB connections / Vercel | What to do at this line |
|---|---|---|---|
| 100 | ≈ 15 MB | nothing | nothing — observe weekly growth of `journal_entries` and `journal_entry_photos` metadata |
| 1,000 | ≈ 150 MB | Supabase pooler default (Free: 60 direct / 200 pooled) is enough for Vercel serverless at this scale | confirm the pooler is in use on every server client (it is: `@supabase/ssr` over PostgREST, no direct pg) |
| 10,000 | ≈ 1.5 GB (if journals scale linearly) | PostgREST p95 must be re-measured; expect the first slow queries on `journal_entries` per worker | Pro plan is REQUIRED by then (8 GB DB); add the per-worker journal index review; move photo files to storage with lifecycle (they already are files, metadata only in DB) |
| 100,000 | ≈ 15 GB | separate read replicas / compute add-on | Supabase compute upgrade + read replica; archive journal history older than N years to cold storage with export first |

## 3. Triggers that fire BEFORE user count matters (market data)

| Trigger | Condition | Action | Gate |
|---|---|---|---|
| T1 vacancy stream | `pg_database_size` > 1 GB (≈ 4 weeks from 2026-09-02 at +55 MB/week) | approve retention G-4 (expired ads → inactive, text stripped after `expires_at` + 30 d) OR upgrade to Pro (G-6) | OWNER |
| T2 unused indexes | any index with `idx_scan = 0` after 30 days of production traffic | drop concurrently (G-3: `public_vacancies_fulltext_idx` 79 MB, `public_vacancies_skill_slugs_idx` 1.5 MB — both 0 scans since 2026-08-09) | OWNER (reversible DDL) |
| T3 ESCO locale scope | product routes 5 locales; 28 locales stored (1.03 M rows) | keep the 12 recognition locales + `en`; archive the rest (≈ 575 k rows / ≈ 235 MB, re-importable from the ESCO release) | OWNER (G-5) |
| T4 WAL | WAL > 512 MB sustained | check long transactions / replication slots; usually the ingestion runner's batch size | engineering |

## 4. Plan-upgrade decision rule (G-6)

- If G-3 + G-4 + G-5 are approved: DB ≈ 380 MB, growth plateaus around the active window (≈ 45 k live ads
  ≈ 150 MB) → Free is technically sufficient **until T1 recurs**; but Free has no PITR, no custom auth domain
  (Google branding, package 0011), and daily-backup-only recovery.
- If any of G-3…G-5 is declined: Pro is required within ≈ 4 weeks (T1).
- **Recommendation:** Pro regardless, for PITR + custom auth domain + SMTP-independent e-mail limits — the
  product objective is not staying free. The optimisations remain worth doing for growth hygiene.

## 5. Where the readouts live

Train L wires `pg_database_size`, weekly vacancy growth, WAL size and the T1–T4 conditions into the health
surface and alerts. Until then this file + the audit §J are the readout; re-measure monthly with the same
queries (recorded in the audit).
