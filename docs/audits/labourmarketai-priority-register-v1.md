# Labourmarket.ai — Priority Register v1 (AUDIT LOOP 8)

**Date:** 2026-07-22 · **Baseline HEAD:** `664b9ab9` (main, clean tree)
**Consolidates:** AUDIT LOOPs 0–7. Only findings backed by evidence in those documents
appear here. Anything unverified is in §7, not in the register.

| Loop | Artifact |
|---|---|
| 0 | `labourmarketai-current-state-baseline-v1.md` |
| 1 | `labourmarketai-production-journey-audit-v1.md` |
| 2 | `labourmarketai-usability-and-positioning-audit-v1.md` |
| 3 | `labourmarketai-functional-reality-matrix-v1.md` |
| 4 | `labourmarketai-ai-skills-matching-audit-v1.md` |
| 5 | `labourmarketai-commercial-billing-audit-v1.md` |
| 6 | `labourmarketai-security-privacy-data-audit-v1.md` |
| 7 | `labourmarketai-technical-operations-audit-v1.md` |

Delivery plans: `docs/plans/labourmarketai-delivery-loops-v1.md`,
`docs/plans/labourmarketai-30-60-90-day-plan-v1.md`.

---

## 1. Executive summary

**The platform is technically healthy and unusually honest in its commercial copy, and it
is not being used.** Those two facts are related, and the second is the real problem.

- All four quality gates pass at HEAD: typecheck 0, lint 0 errors, **11,356/11,356 tests**,
  build 0, 846 static pages. CI green. 72 public routes × 3 locales all HTTP 200. No 5xx,
  no console errors, no broken locale page, correct auth gating.
- Production holds **27 profiles, 27 workers, 6 companies, 17 demands, 2 conversations,
  5 projects**. Against that: **115 page routes** (≈80 under `/dashboard`), 161 migrations,
  205 `SECURITY DEFINER` functions, 129 RLS-enabled tables.
- **22 shipped, navigation-linked modules have zero production rows** — bookings, tasks,
  finance, assets, commercial CRM, defects, stages, budgets, marketplace, absences, teams,
  pilots, public profiles and more. Only five features carry real activity.
- LOOP 3 found the likely mechanical cause: **no out-of-app notification exists anywhere in
  the product** — no email, no push, no SMS. `sendMessage` makes no outbound call, and
  guards actively *forbid* mail/push SDKs. Invitation email is code-complete but
  unconfigured, so delivery is permanently `not_sent`. **A two-sided marketplace where no
  side can be told anything has happened cannot generate a second visit.** This single
  finding explains more of the zero-usage pattern than any UX issue in this audit.
- One **live P0 security defect** was found, proven, and fixed on a branch (§2).
- The product's biggest credibility risk is self-inflicted: the landing page shows
  **fabricated traction (312 workers vs 27 real)** while the pricing page is scrupulously
  honest, and the two contradict each other on whether matching is even automatic.

**One-line verdict:** stop building surface, close the P0 and the legal gaps, delete the
claims that are not true, give the system a way to notify a human, and prove one journey
end to end before anything else is built.

---

## 2. Scoring method

`Priority Score = Impact × Frequency × Confidence × Strategic Fit ÷ Effort`, each factor
1–5; Effort 1 = XS … 5 = XL. Higher = do sooner. Score orders work *within* a severity
band; it never promotes a P2 above a P0.

Blocker flags: **SEC** security · **LEG** legal · **PAY** payment · **LAU** launch ·
**CNV** conversion · **TRU** trust · **A11Y** accessibility.

---

## 3. P0 — critical

| ID | Finding | Evidence | Flags | I | F | C | S | E | Score |
|---|---|---|---|---|---|---|---|---|---|
| **P0-1** | **Anonymous authorization bypass in 7 `SECURITY DEFINER` RPCs.** `if v_owner <> auth.uid()` is NULL-unsafe; for `anon`, `auth.uid()` is NULL → NULL → treated as false → the raise never fires and the write runs with DEFINER privileges. Reachable because 54 of 205 secdef functions kept the default `PUBLIC` EXECUTE grant. | Live probe, rolled back: `set_marketplace_listing_status_v1` as `anon` → `NO_ERROR`, `status_now=closed`. Confirmed twice independently. LOOP 6 §sweep; LOOP 0 §3.3 | SEC | 5 | 3 | 5 | 5 | 2 | **187.5** |
| **P0-2** | **No privacy notice, terms link or consent at signup.** The entire form is heading, Google button, email, password, repeat, submit. GDPR Art. 13 requires the notice *when* data is obtained. | Full a11y-tree capture of `/lt/auth/signup`, LOOP 1 F-1.8 | LEG TRU LAU | 5 | 5 | 4 | 5 | 2 | **250** |
| **P0-3** | **Cookie consent missing while analytics and a `sessionStorage` identifier fire for anonymous visitors** — and the cookie policy page states the opposite. | LOOP 6 §21 | LEG TRU | 4 | 5 | 5 | 4 | 2 | **200** |
| **P0-4** | **Product copy promises retention and deletion controls that do not exist.** Journal copy promises 30-day voice retention and a delete control; `pg_cron` is not installed, there is no CI/Vercel cron, and three expiry RPCs have zero callers. | LOOP 6 §20 | LEG TRU | 4 | 4 | 5 | 4 | 2 | **160** |

> **P0-1 status: FIXED ON A BRANCH, NOT IN PRODUCTION.** PR
> [#845](https://github.com/bandymuks1-stack/labourmarketai/pull/845), branch
> `fix/cc/secdef-anon-authz-bypass-v1`, HEAD `3c60292b`. All gates green (72/72 new
> guard assertions; 713 files / 11,428 tests; typecheck, lint, build, migration-safety all
> pass). **Production apply is an open OWNER GATE — see OG-1.** Blast radius is currently
> zero because all three affected tables hold 0 rows; the path arms on the first real record.

---

## 4. P1 — major product-value problems

| ID | Finding | Evidence | Flags | Score |
|---|---|---|---|---|
| **P1-1** | **No out-of-app notification exists at all** — no email, push or SMS anywhere; `sendMessage` has no outbound call; invitation email is unconfigured so delivery is permanently `not_sent`. The product is manual link-sharing. | LOOP 3 §7, §8 | CNV | **200** |
| **P1-2** | **Fabricated landing metrics.** 312 workers shown vs 27 real (~11.6×); 47 opportunities vs 17. Source comment: *"No real data — the motion is the point."* The ▲▼ deltas are synthetic too. | `market-counters.tsx:8-10`, `:38-43` | TRU LEG | **160** |
| **P1-3** | **Structurally manual-labour-only.** All 39 public work types are physical work; catch-all is *"Kita / **pagalbinis** darbas"*. **31 of 49 professions in the DB (63%) are unreachable** from any public surface. Data mirrors it: 94/153 skills (61.4%) and 18/49 professions are construction; healthcare 3 skills, education 2, creative 1, IT 4. | LOOP 1 F-1.1, LOOP 2 F-2.2, LOOP 4 §3 | CNV | **150** |
| **P1-4** | **Three public surfaces contradict each other on matching.** Landing promises skills matching; pricing states matching is manual; `/match-preview` accepts **no skills input at all**. | LOOP 1 F-1.5/F-1.6, LOOP 2 F-2.3 | TRU CNV | **150** |
| **P1-5** | **False skill provenance.** `skill-pipeline.ts:483-500` auto-writes `worker_skills` on lexicon hits with no confirmation, stamped `source:'self_declared'`. A nursing-medication entry auto-persisted `elderly-care`. Violates the repo's own "no fake verification" doctrine. | LOOP 4 §9 | TRU | **125** |
| **P1-6** | **Decorative confidence + raw i18n keys on the CV.** `confidence_bin` is hardcoded `"yellow"`; all 33 prod rows have `confidence_score = 0`, yet 13 render green/amber. The provenance badge renders raw keys (`journal.cv.verified`) that exist in **none** of the 12 locales; the guard only checks a third key, so CI stays green. | LOOP 4 §10-11 | TRU | **125** |
| **P1-7** | **Cross-sector recognition fails, with two active false positives.** 30 real recogniser runs: teaching (LT+EN) → 0, CNC → 0, hospitality → 0, video editing → 0, "refactored the payment service" → 0, nursing (EN+RU) → 0. *"Photographed a **wedding**"* → `welding-blueprint`; *"**Picked** 240 orders"* → `packaging`. | LOOP 4 §7-8 | CNV TRU | **100** |
| **P1-8** | **Commercial contract incoherent.** 7 plan names across **two disjoint catalogues** (zero shared slugs); all 4 DB plans have `price_eur_monthly = NULL`; the only real prices on the site are five **AI-automation packages €600–€1,900** mapping to no plan, no entitlement, no Stripe price, no terms. | LOOP 5 §5-6, verified independently (`"Nuo 1 900 €"`) | LAU LEG | **100** |
| **P1-9** | **Terms of Service have no commercial clauses.** UAB "Nonstop Group" is declared as seller/invoicer, but there is no price, payment, renewal, cancellation, refund or consumer-withdrawal clause — while €900+ packages are advertised. | LOOP 5 §14 | LEG PAY | **125** |
| **P1-10** | **GDPR erasure is request-intake only.** Zero deletion code; no storage-object cleanup would run even on a manual cascade. | LOOP 6 §19 | LEG | **125** |
| **P1-11** | **Production analytics has never recorded an anonymous visitor.** All 224 `pilot_events` rows come from **one** profile; `profile_id IS NULL` count = **0**. 17 of 34 declared funnel events have zero rows despite live call-sites. Landing→signup is unmeasurable. | LOOP 7 T-01 | CNV | **125** |
| **P1-12** | **No error monitoring of any kind** — no Sentry/OTel/Datadog; 136 `console.error` into Vercel logs; the one real error-recording design writes to `ai_runs` — **CORRECTED 2026-08-19:** that table IS in prod (applied 2026-08-03, ledger `20260803061937`); it is EMPTY because `AI_PROVIDER_MODE` is `disabled`, which leaves the finding standing for a different reason than originally written. With P1-11, a broken signup would be invisible on three axes at once. | LOOP 7 T-10 | — | **125** |
| **P1-13** | **Six announced markets cannot register a company.** GE/BE/FR/ES/AT/CH are advertised; `organizations.country` FKs to `countries(code)` which holds only 10 codes, so `save_company_setup_v2` raises `invalid_country`. | LOOP 3 §6 | CNV TRU | **150** |
| **P1-14** | **`/dashboard/documents` is UI_ONLY** — no insert path to `worker_documents` exists anywhere, so 0 rows is structurally unreachable; yet readiness percentages and the Verified CV read from it. | LOOP 3 §10 | TRU | **100** |

---

## 5. P2 — quality, growth and hygiene (abbreviated)

| ID | Finding | Source |
|---|---|---|
| P2-1 | Entitlement enforcement is effectively zero — 12/19 feature keys unchecked; the one billing gate is bypassed by `if (!ctx.enforced) return true`, never true. Turning Stripe on would take money and grant nothing. | LOOP 5 §8 |
| P2-2 | Stripe `paused` → `past_due` → entitled: a paused subscription keeps paid access indefinitely. | LOOP 5 §11 |
| P2-3 | UNIQUE `(owner_id, plan_key, provider)` vs upsert `onConflict (provider, provider_subscription_id)` — re-subscription errors, swallowed into HTTP 200. Paid-but-not-entitled, invisible in Stripe. | LOOP 5 §12 |
| P2-4 | 47 remaining anon-reachable secdef functions (3 with no authz logic at all). | LOOP 6, PR #845 inventory |
| P2-5 | `organizations_select USING (true)` — any authenticated user reads every org's contact email/phone, ignoring `public_profile_enabled`. | LOOP 6 §14 |
| P2-6 | `audit_logs` is **not** append-only despite two schema comments claiming it is. | LOOP 6 §22 |
| P2-7 | Public intake, `/api/leads` (service-role, RLS-bypassing) and `/api/waitlist` take unbounded anonymous PII; **no captcha or honeypot exists repo-wide**. | LOOP 6 §23 |
| P2-8 | Supabase Auth: leaked-password protection **off**, OTP expiry > 1 h, MFA unenrollable (0 factors/27 users). ~15 minutes of dashboard work. | LOOP 6/7 |
| P2-9 | N+1 on the core worker page: `journal/page.tsx:422` runs ≈50–90 queries per render; `projects/page.tsx:113` maps up to 100 projects × its own query; 18 sequential awaits on `company/page.tsx`. | LOOP 7 T-21 |
| P2-10 | 131 of 132 route segments have no `error.tsx`; 129 have no `loading.tsx`; only 5 real `<Suspense>`. | LOOP 7 T-06 |
| P2-11 | `journal/export/route.ts:64` ignores Supabase errors — a failed read downloads a **valid empty CSV**. 217 sites drop the `error` object. | LOOP 7 T-22/T-24 |
| P2-12 | 14 of 17 API route handlers have zero executed-code coverage; the 11,356-test headline overstates behavioural confidence. | LOOP 7 T-23 |
| P2-13 | 674 `supabase as any` casts across 176 files; root cause is a stale `lib/supabase/types.ts` missing 5 live prod tables. | LOOP 7 T-05 |
| P2-14 | NL/DE are **live routed locales** but AI-seeded and never human-reviewed, while six docs — including the *binding* doctrine — still say the active set is lt/en/ru. | LOOP 7 T-08 |
| P2-15 | 180 lines of inline multi-locale copy bypass next-intl in 6 files, 165 of them in public SEO-indexed marketing pages, invisible to every parity guard. | LOOP 7 T-09 |
| P2-16 | `docs/DEPLOYMENT.md` would damage production: claims the DB "is empty" (126 tables) and instructs `pnpm db:push`, which every policy doc bans. | LOOP 7 T-02 |
| P2-17 | `CLAUDE.md` and `AGENTS.md` give **opposite** production-migration instructions; both auto-load. 11 further doc conflicts found. | LOOP 0 D1, LOOP 7 T-03 |
| P2-18 | **`APPLIED_LEDGER.md` drifts in both directions** — 26 migrations live in prod are absent from it; its last row is `20260718210000` vs prod's `20260721133338`. | LOOP 3 §3 |
| P2-19 | Field examples: 2 of 9 free-entry fields on the need form have one; the field that drives the draft has none. | LOOP 2 F-2.4 |
| P2-20 | `/auth/login` ships 211 kB for a 1.93 kB page; same ~107 kB delta on signup/reset/forgot — the first surfaces every acquired user touches. | LOOP 7 T-07 |
| P2-21 | ESCO loaded at 1,045,186 labels and wired to nothing — `esco_uri` NULL on 100% of 202 local rows. | LOOP 4 §6 |
| P2-22 | Matching ignores documents/permits/visas entirely; Haversine distance is dead code (geography = country string equality); language is a hard block with no proportionality gate (nationality-proxy risk). | LOOP 4 §13-15 |
| P2-23 | Flaky guards: three full-suite runs produced a *different* single failure twice, all passing in isolation, third run fully green. Non-deterministic under parallel load. | This session |
| P2-24 | 8 stale audit/plan PRs open; 2 conflicting (#831, #798). 53 pre-2026-06-12 DDL migrations have no rollback. 24 Playwright specs run in no workflow. | LOOP 0 §5, LOOP 7 T-11/T-13 |
| P2-25 | Dependency audit not in CI: 0 critical / 5 high / 3 moderate / 1 low; `sharp` (HIGH) and `postcss` reach production. | LOOP 6 §24 |

## 5b. P3 — improvements

Auth pages carry the homepage `<title>` and have no footer/nav/language switcher (LOOP 1
F-1.11) · `/{locale}/cv` returns 200 anonymously, content unverified (F-1.7) · Google OAuth
opens in a new tab via a raw Supabase host (F-1.10) · landing ships 26 KB of inline SVG map
plus permanent animation (F-2.7) · `/design/text-first` prerendered at 288 kB despite
`notFound()` (T-20) · `lib/agency/pool.ts` (376 lines) and `lib/talent/provenance*.ts` are
dead code (LOOP 3 §17) · `/dashboard/inbox` is the journal-review queue, not messages
(naming trap) · answer engine ships 45 of 550 registered questions.

---

## 6. Owner gates

| # | Gate | Why it needs the owner | Cost |
|---|---|---|---|
| **OG-1** | **Apply PR #845 to production** (RED migration) | Closes the live P0. Runbook: `docs/security/secdef-anon-authz-bypass-validation-v1.md` §6 | ~20 min |
| **OG-2** | **Supabase Auth: enable leaked-password protection, OTP ≤ 1 h** | Dashboard-only config | **~15 min — best value-per-minute in the audit** |
| **OG-3** | **Provide disposable pilot credentials** (worker + company) | **No authenticated journey was testable in this entire audit.** Largest remaining unknown. | — |
| **OG-4** | Legal wording for signup consent, cookie consent, and corrected retention copy | P0-2/3/4 | — |
| **OG-5** | Decide the served-region claim: "Europe" vs "Baltic & Northern Europe" | P1-3, P1-13 | — |
| **OG-6** | Decide whether the €600–€1,900 AI-automation packages belong on this domain | P1-8 | — |
| **OG-7** | Pricing decisions incl. Worker Plus. **49.98 EUR is configured nowhere** — it occurs once repo-wide, as an intermediate `24.99 × 2` in a table labelled "NOT FINAL", attached to `vip_media`, not `worker_plus`. | P1-8 | — |
| **OG-8** | Add missing commercial clauses to the Terms | P1-9 | — |
| **OG-9** | Approve erasure implementation + per-run approval for live deletion | P1-10 | — |
| **OG-10** | Reconcile `CLAUDE.md` vs `AGENTS.md` migration policy | P2-17 | — |
| **OG-11** | Any payment activation — **only after P1-8, P1-9 and P2-1** | PAY | — |
| **OG-12** | LMC/referral: no payout capability may be communicated. Currently clean — **verified: zero user-facing LMC strings and zero money-withdrawal language in all 11 catalogues.** Preserve that. Before any activation, close: no referral-relationship table, no depth constraint, `referral_reward` exempt from lot expiry (perpetual liability), `lmc_expire_lots_v1` has no caller. | LEG | — |

---

## 7. Explicitly not verified

1. **Every authenticated journey.** No credentials (OG-3). No logged-in feature is marked
   VERIFIED anywhere in this audit.
2. **Behavioural proof of the P0 fix** — static contract only; no local Postgres was
   available (Supabase CLI absent, Docker down) and a dev branch is a paid owner decision.
3. **External HTTP reachability of the vulnerable RPCs** — proven at the DB authorization
   layer; no unauthenticated write was issued to the production REST endpoint.
4. **Whether anonymous telemetry actively fails or simply has no traffic** (P1-11) — needs
   a live incognito visit. Top open question.
5. Vercel production env vars, deploy history, branch-protection settings, Stripe dashboard
   state, Supabase PITR tier.
6. Real-device mobile performance (no RUM exists), contrast ratios, keyboard operability.
7. Whether the three P0-affected tables were ever non-empty since 2026-07-18.
8. Whether invitation email would send if configured.

---

## 8. Recommended first implementation loop

**`L11` / OG-2 — Supabase Auth hardening.** Fifteen minutes, owner-only, no code, no
deploy, no risk. Do it today.

**Then `L0` / OG-1 — apply PR #845.** It is written, reviewed by CI, fully gated, and
closes the only live P0. Reproduce the defect first, apply, re-verify, record the output.

**Then the four cheap P1 copy/config PRs** — L3 (delete the fake counters), L5a (align the
matching claim), L4 (sector breadth), L10 (field examples). All S/XS, no migration, no
owner gate, and together they answer every piece of tester feedback.

### Owner-set ordering (2026-07-22)

The owner has fixed the top of the queue as:

1. **Security** — P0-1 (apply PR #845), then P2-8 (Supabase Auth toggles).
2. **Fake metrics** — P1-2, delete the fabricated hero counters.
3. **Signup legal notice** — P0-2, privacy/terms/consent at registration.
4. **→ Notifications — P1-1.** Promoted by owner directive to *one of the highest P1
   product loops*, immediately after the three items above.

**Rationale, restated from the evidence:** the product can have 22 working modules and
still be dead, because **without email, push or SMS a user never learns that anything
happened.** No outbound channel exists anywhere in the codebase — `sendMessage` makes no
outbound call and the guards actively forbid mail/push SDKs; invitation email is
code-complete but unconfigured, so delivery is permanently `not_sent`. Every one of the 22
zero-row modules depends on someone finding out that something changed. Until that channel
exists, UX work cannot produce a second visit, and no funnel measurement will show
retention because there is no mechanism that could create it.

This is now delivery loop **L14** in `docs/plans/labourmarketai-delivery-loops-v1.md`, and
it is the first *new capability* built after the P0s close — before any new surface.
