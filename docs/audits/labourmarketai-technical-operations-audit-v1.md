# Labourmarket.ai — Technical architecture, quality & operations audit v1

> **Date:** 2026-07-22 · **Repo HEAD:** `664b9ab9` (branch `main`, clean tree)
> **Production:** https://labourmarket.ai (Vercel, auto-deploy from `main`)
> **Supabase prod ref:** `gorgitwvdzxbnaxhrsrw`
> **Audit loop:** 7 of a full product audit — technical architecture, quality, operations.
> **Mode:** READ-ONLY. No commits, no migrations, no source edits. This file is the only artifact written.

## Method

1. Static inspection of `apps/web` (app router, lib, components), `supabase/`, `.github/workflows`, `docs/`.
2. Four real local checks executed at HEAD: `pnpm -F web typecheck`, `pnpm -F web lint`,
   `pnpm -F web test`, `pnpm -F web build`. Exact exit codes and timings reported below.
3. Read-only Supabase MCP `execute_sql` (SELECT only) against the production project for the
   migration ledger, table inventory, RLS policies, storage buckets and telemetry volume.
4. Supabase security advisors pulled and fully parsed (252 lints).
5. Scripted key-diff of all 11 locale catalogs.
6. Bundle sizes parsed from the real `next build` output (136 route entries).

**Baseline corrections.** Three assumptions in the audit brief are wrong and are corrected here with evidence:

| Brief said | Reality | Evidence |
|---|---|---|
| "There is NO `.env.example` committed" | **It exists**, 5,886 bytes, 40 variables, tracked at repo root | `C:\Users\Mano\Documents\labourmarketai\.env.example`; `git ls-files` tracks it |
| "pnpm workspace: apps/web + services/transcribe" | Workspace is **`apps/*` only**. `services/transcribe` has no `package.json` — it is a standalone Docker service | `pnpm-workspace.yaml` (2 lines: `packages: - "apps/*"`); `services/transcribe/` contains only `Dockerfile`, `docker-compose.yml`, `server.mjs`, `README.md` |
| "~12 migrations committed-but-unapplied" | **10 genuinely unapplied** + 1 false positive (`20260612091000_journal_entry_photos.sql` — its objects DO exist in prod under ledger names `journal_entry_photos_table` / `_rpc`) | `to_regclass('public.journal_entry_photos')` → `journal_entry_photos`; `register_journal_entry_photo` exists (1 proc) |

## Headline assessment

**The build quality is genuinely high and the checks are genuinely green** — typecheck, lint,
11,356 tests and a full production build all pass at HEAD with zero failures, zero ERROR-level
Supabase security advisories, perfect 7,355-key i18n parity across all five live locales, and a
privacy-by-design telemetry contract that does not over-collect. This is not a codebase in trouble.

**The risk is concentrated in one place: the product cannot see itself in production.**
Three independent blindness axes compound:

1. **No analytics.** All 224 rows in `pilot_events` came from **one** profile; **zero** anonymous
   events have ever been recorded. The landing→signup funnel is unmeasurable (T-01).
2. **No error monitoring.** No Sentry, no OTel, no Datadog — 136 `console.error` calls into Vercel
   logs (T-10).
3. **No behavioural coverage of the edges.** 14 of 17 API route handlers have zero executed-code
   test coverage, and 131 of 132 route segments have no error boundary (T-23, T-06).

A broken signup flow in production today would be invisible on all three axes simultaneously.

**Second concentration: the docs actively lie about the database.** `docs/DEPLOYMENT.md` states the
production DB is empty (it has 126 tables and 156 applied migrations) and instructs
`pnpm db:push`, which every policy doc bans as destructive (T-02). `CLAUDE.md` and `AGENTS.md` —
both auto-loaded into every agent session — state opposite rules for applying production
migrations (T-03).

**Top 6 by risk:** T-01 (analytics blind) · T-02 (destructive runbook) · T-03 (contradictory
migration policy) · T-10 (no error monitoring) · T-23 (no route coverage) · T-04 (10 unapplied
migrations, 8 dead features).

**Cheapest high-value fix:** T-14 — two Supabase dashboard toggles, ten minutes.

---

# 1. Factual system map

## 1.1 Frontend

| Item | Fact | Evidence |
|---|---|---|
| Framework | Next.js **15.5.18**, React **19.1.0**, App Router only | `apps/web/package.json` |
| TypeScript | 5.x, `strict` | `apps/web/tsconfig.json`, typecheck exit 0 |
| Styling | Tailwind **3.4.19** + custom brand preset + CSS-variable token layer | `apps/web/tailwind-preset.ts`, `apps/web/tokens/{colors,gradients,motion,radii,shadows,typography}.ts` |
| i18n | `next-intl` 4.12, plugin bound to `lib/i18n/request.ts` | `apps/web/next.config.ts:3` |
| Motion | `framer-motion` 12.39 | `package.json` |
| Maps | `leaflet` 1.9.4 + `topojson-client` + `world-atlas` | `package.json`; `app/[locale]/dashboard/market-map` |
| Doc parsing | `unpdf` (PDF), `mammoth` (DOCX) — CV extraction | `app/api/cv/extract/route.ts` |
| Config surface | Deliberately minimal: `reactStrictMode` + legacy-host 308 redirects only | `apps/web/next.config.ts:31-38` |

**Route inventory (verified counts):**

- **115** `page.tsx` files, **17** `route.ts` files, **7** `layout.tsx` files.
- **846** static pages generated at build (`✓ Generating static pages (846/846)`).
- Top-level segments under `app/[locale]/`: `(marketing)`, `auth`, `business`, `cv`, `dashboard`, `design`, `invite`, `onboarding`, `[...rest]`.
- `app/[locale]/dashboard/` has **43** entries (41 sub-routes + `layout.tsx` + `loading.tsx`); `dashboard/admin/` has **22** sub-routes.
- `(marketing)` has **27** pages.

**Server vs client split:**

| Metric | Count |
|---|---|
| Files with `"use client"` | **215** |
| Files with `"use server"` | **119** |
| Total `.ts/.tsx` under `app` + `components` + `lib` | **1,802** (app 150 / components 312 / lib 1,340) |
| Total source LOC (incl. tests) | **301,607** |
| Non-test source LOC | **78,975** |

Server-first is genuinely the default: page components are server components and mutations run
through `"use server"` actions in `lib/**/actions.ts`. Client boundaries are pushed into
`components/app/*` leaves.

**i18n payload engineering (a real strength, worth recording).** `lib/i18n/client-messages.ts`
implements route-group message subsetting so `NextIntlClientProvider` only serializes the
namespaces a given route group's client components can reach — root layout gets
`BASE_CLIENT_MESSAGE_ROOTS`, `(marketing)` gets `MARKETING_CLIENT_MESSAGE_ROOTS`, auth/onboarding
get `AUTH_CLIENT_MESSAGE_ROOTS`, dashboard/design get the full union. The file documents the
original problem verbatim: the root layout "previously let NextIntlClientProvider inherit the FULL
runtime message tree (~440 KB minified per locale)". `lib/guards/client-messages-allowlist.test.ts`
re-derives every list from the import graph on each CI run.

## 1.2 Server routes & actions

All 17 `route.ts` handlers:

| Route | Purpose |
|---|---|
| `app/[locale]/auth/callback/route.ts` | Supabase OAuth / magic-link code exchange (128 LOC) |
| `app/[locale]/auth/logout/route.ts` | Session teardown |
| `app/[locale]/dashboard/finance/export/route.ts` | Finance CSV export |
| `app/[locale]/dashboard/journal/export/route.ts` | Journal export |
| `app/[locale]/dashboard/privacy/export/route.ts` | GDPR data export |
| `app/[locale]/dashboard/projects/[id]/operations/report/route.ts` | Ops report |
| `app/api/auth/google/route.ts` | Google ID-token sign-in |
| `app/api/billing/test-checkout/route.ts` | Stripe **test-mode only** checkout |
| `app/api/billing/webhook/route.ts` | Stripe webhook receiver |
| `app/api/cv/extract/route.ts` | PDF/DOCX → text extraction |
| `app/api/dashboard-search/route.ts` | Universal search |
| `app/api/leads/route.ts` | Lead intake (only non-`env.ts` service-role consumer) |
| `app/api/professions/[professionId]/skills/route.ts` | Taxonomy read |
| `app/api/waitlist/route.ts` | Waitlist capture |
| `app/api/workers/[workerId]/skills/route.ts` + `[skillId]/route.ts` | Worker skill CRUD |
| `app/questions-sitemap.xml/route.ts` | Answer-engine sitemap |

Middleware: `apps/web/middleware.ts`, 235 LOC, matcher
`["/((?!api|_next|_vercel|.*\\..*).*)"]`. It does locale resolution + Supabase session refresh +
the auth gate only; the onboarding check was deliberately removed to save a round-trip per
navigation (documented at `middleware.ts:~215`). **Built size: 118 kB** — large for edge middleware.

## 1.3 Database

| Fact | Value |
|---|---|
| Migration files in repo | **161** (`supabase/migrations/*.sql`) |
| Rollback files | **93** (`supabase/rollbacks/*.down.sql`) |
| Rows in prod ledger (`supabase_migrations.schema_migrations`) | **156** |
| Public base tables in prod | **126** |
| Largest tables | `esco_labels` 1,045,186 · `esco_occupation_skills` 126,051 · `esco_skills` 13,939 · `esco_occupations` 3,039 |
| Real business data volume | `profiles` **27** · `workers` **27** · `companies` **6** · `journal_entries` **32** · `worker_skills` **33** · `organizations` **9** · `projects` **5** |

Filenames and ledger `version` values deliberately diverge (MCP `apply_migration` stamps its own
timestamp) — documented at `docs/APPLIED_LEDGER.md:11-13`. Matching therefore has to be done by
**name**, which is how the drift figures below were computed.

## 1.4 Supabase usage

- **Client factories:** `lib/supabase/client.ts` (browser), `lib/supabase/server.ts` (RSC/actions,
  cookie-bound), `lib/supabase/admin.ts` (service role), `lib/supabase/types.ts` (generated, 7,024 LOC).
- **Service-role key** is referenced in exactly **3** non-test files: `lib/env.ts`,
  `lib/sales/lead-intake.ts`, `app/api/leads/route.ts`. Tight blast radius — good.
- **RPC-heavy design:** 193 `SECURITY DEFINER` functions are `EXECUTE`-able by `authenticated`
  (advisor `authenticated_security_definer_function_executable`).
- **Storage buckets (all 4, all private, all capped):**

| Bucket | Public | Size limit | MIME allowlist | Created |
|---|---|---|---|---|
| `conversation-attachments` | false | 10 MB | pdf, jpeg, png, webp, text/plain | 2026-07-12 |
| `customer-request-attachments` | false | 10 MB | pdf, jpeg, png, webp, text/plain | 2026-05-29 |
| `journal-entry-photos` | false | 5 MB | jpeg, png, webp | 2026-06-12 |
| `profile-avatars` | false | 5 MB | jpeg, png, webp | 2026-06-23 |

## 1.5 Authentication

`lib/auth/` — 9 non-test modules: `actions.ts`, `admin-signal.ts`, `admin-ui-actions.ts`,
`admin-ui-pref.ts`, `context.tsx`, `google-id-token.ts`, `oauth-trace.ts`, `redirect.ts`,
`require-role.ts`, `session-profile.ts`, `superadmin.ts`.

Flow: email/password + Google ID token → `app/[locale]/auth/callback/route.ts` exchanges the code →
middleware refreshes the session on every non-API navigation → `dashboard/layout.tsx` reads the
profile row and redirects to `/onboarding` when `onboarded_at` is null → `require-role.ts` gates
role-scoped surfaces → `superadmin.ts` + `is_admin()` gate `dashboard/admin`.

## 1.6 Stripe touchpoints

29 files reference Stripe. The gate chain is genuinely closed:

- `lib/billing/lmc-flags.ts:21-27` — six literal `false as const` constants including
  `LIVE_PAYMENTS_ENABLED` and a `LMC_SPENDING_ENABLED` kill switch.
- `lib/billing/plans.ts:18` — `PAYMENTS_ENABLED = false as const`.
- `lib/billing/config-core.ts` — hard-blocks live mode.
- Only a **test-mode** checkout route exists (`app/api/billing/test-checkout/route.ts`).
- Six `STRIPE_*` env vars declared in `lib/env.ts`, all optional.

## 1.7 AI services

`lib/ai/` — provider registry with adapters for `anthropic`, `openai`, `gemini`, `xai`, `deepl`,
plus `mock.ts` and `disabled.ts`. `lib/ai/runtime/config-core.ts:8-10`: "OFF by default: the runtime
is `disabled` unless AI_PROVIDER_MODE is set"; `live` additionally requires a known provider **and**
a real key. Tier-based routing in `task-routing.ts` with an explicit `fallbackTier` that must set
`fallbackApplied=true` — "no silent quality drop".

Self-hosted STT lives in `services/transcribe/` (whisper.cpp + ffmpeg in Docker, bearer-token
server-to-server, 25 MB / 10 min caps, no transcript logging). Reached from the web app via
`lib/voice/transcribe-action.ts` using `VOICE_TRANSCRIBE_URL` + `VOICE_TRANSCRIBE_TOKEN`.

## 1.8 Admin area

`app/[locale]/dashboard/admin/` — 22 sub-routes (billing, matching, project-truth, telemetry,
support, language-feedback, agent-os, pilots, …) behind `dashboard/admin/layout.tsx` +
`lib/auth/superadmin.ts` + the DB `is_admin()` predicate. `pilot_events` is admin-read-only:
policy `pilot_events_select` is `USING (is_admin())`.

## 1.9 Localization

11 base catalogs in `apps/web/messages/*.json` + per-locale taxonomy subdirectories
(6 files each: `professions`, `skill-names`, `journal`, `relationship-types`,
`productivity-units`, `labour-market`). Canonical set is pinned in `lib/i18n/config.ts:13-25`;
`activeLocales` (routed/build/selector) at `:39` is `["lt","en","ru","nl","de"]`. Full detail in §5.

## 1.10 Analytics & observability

- **Analytics:** first-party only — `lib/telemetry/` (732 LOC across `actions.ts`, `attribution.ts`,
  `funnel-events.ts`, `task.ts`) writing into `public.pilot_events`. **No third-party tracker**
  (no GA, no Plausible, no PostHog anywhere in source). 34 declared funnel events. See §6.
- **Observability:** **no Sentry, no OpenTelemetry, no Datadog** in source (matches were only inside
  `.next/` build artifacts). What exists: **136** `console.error` call sites (surfacing in Vercel
  runtime logs) plus `lib/notifications/telegram-owner-alerts.ts` for owner pings.

## 1.11 Deploy + CI

Two required checks on `main`:

- `.github/workflows/quality.yml` — typecheck → lint → **vitest** → `placeholders:check` →
  4 honesty-copy guards → `primary-route-smoke` → `public-seo-indexing` → `i18n-debt` → `build`.
  20-minute timeout, secret-free, no DB.
- `.github/workflows/migration-safety.yml` — self-tests `.github/scripts/migration-safety.mjs`,
  then statically gates changed migration files. Runs on **every** PR with no `paths:` filter,
  explicitly so a required check never hangs.

Vercel auto-deploys `main`. **Playwright e2e (24 specs in `apps/web/tests/e2e/`) is in NO workflow.**

---

# 2. Check results — exact

All four commands run locally at HEAD `664b9ab9` on Windows 11 / Node 24.14.0 / pnpm 10.33.2.

| Check | Command | Exit code | Result |
|---|---|---|---|
| Typecheck | `pnpm -F web typecheck` | **0** | `tsc --noEmit` clean, zero diagnostics |
| Lint | `pnpm -F web lint` | **0** | `✖ 17 problems (0 errors, 17 warnings)` |
| Unit tests | `pnpm -F web test` | **0** | `Test Files 712 passed (712)` · `Tests 11356 passed (11356)` · 0 failed · 0 skipped · **161.57 s** |
| Build | `pnpm -F web build` | **0** | Compiled in **2.7 min**; total wall clock **506 s** (8 m 26 s); `✓ Generating static pages (846/846)` |

**All 17 lint warnings are unused variables** — 11 in test files (`_args`, `_text`, `_limit`
mock-signature placeholders), 6 real:

| File:line | Warning |
|---|---|
| `components/app/premium-hub/premium-hub-person-card.tsx:10:3` | `'HubProgress' is defined but never used` |
| `lib/economics/economics.ts:8:3` | `'BUDGET_CATEGORIES' is defined but never used` |
| `lib/projects/stages.ts:23:3` | `'STAGE_STATUSES' is defined but never used` |

No check failed. **CI quality is genuinely green, not green-by-exclusion** — the workflow runs the
same four gates plus eight extra static guards.

Not run (out of scope / would require live infra): `pnpm e2e` (Playwright — needs
`SUPABASE_TEST_URL` and a browser install), `pnpm check:*` scripts individually (they run inside CI
and inside the same vitest suite).

---

# 3. Technical debt

## 3.1 Debt table

| # | Debt | Evidence | Severity |
|---|---|---|---|
| D1 | **674 `supabase as any` / `asAny(` casts across 176 non-test files** — the DB access layer is largely untyped | `grep -rn "supabase as any\|asAny(" lib app --include=*.ts --include=*.tsx \| grep -v '\.test\.'` → 674 hits, 176 files | **High** |
| D2 | **Generated `lib/supabase/types.ts` is stale**: 5 live prod tables absent (`lmc_accounts`, `lmc_lots`, `lmc_lot_consumptions`, `lmc_settings`, `lmc_transactions`) | types.ts mtime `2026-07-19 12:55`; `20260720190000_lmc_ledger_foundation_v1.sql` mtime `2026-07-21 16:27`; `grep -c "^      lmc_settings: {" lib/supabase/types.ts` → 0; prod `information_schema` lists all 5 | **High** |
| D3 | **10 committed migrations never applied to prod**; 8 of them back code paths that query non-existent tables | see §3.3 | **High** |
| D4 | **53 DDL-touching migrations have no rollback file at all** (69 total unpaired; 161 files vs 93 `.down.sql`) | see §3.4 | **Medium-High** |
| D5 | **Guard-test sprawl: 514 test files / 76,273 LOC in `lib/guards/` alone** vs only **3** non-test files there. 25 % of all repo source LOC is guard tests | `find lib/guards -name "*.test.ts" \| wc -l` → 514; `cat` all → 76,273 lines; non-test → `i18n-debt.ts`, `landing-freeze.ts`, `primary-route-smoke.ts` | **Medium** |
| D6 | **19 non-test source files >800 LOC; 59 >500 LOC.** Worst: `components/app/journal-entry-composer.tsx` at **2,621 LOC** | see §3.2 | **Medium** |
| D7 | **Parallel translation system**: 180 inline `lt:`/`ru:`/`nl:`/`de:` object-literal copy lines in 6 components, bypassing `messages/*.json` entirely | see §5.4 | **Medium** |
| D8 | **Orphan locale directory `messages/fi/`** — 6 taxonomy files, 62 KB, but `fi` is not in the canonical 11-locale set and has no `fi.json` | `ls messages/` shows `fi/` dir, no `fi.json`; `lib/i18n/config.ts:13-25` has no `"fi"`; `lib/guards/localization-launch-scope.test.ts:67` asserts `expect([...locales]).not.toContain("fi")` | **Low** |
| D9 | **Six dormant locale catalogs are 25 % complete**: `da/et/lv/no/pl/sv` have 1,860 keys vs EN's 7,355 — 5,505 missing each, with 831–1,459 `[EN]` markers | see §5.1 | **Medium** (blocks market expansion, not current users) |
| D10 | **Billing has 3 overlapping entitlement modules**: `entitlements.ts` (97), `entitlements-v1.ts` (136), `effective-entitlements.ts` (116) — plus `config.ts`/`config-core.ts` and `provider.ts`/`providers/*` splits | `wc -l lib/billing/*.ts` | **Medium** |
| D11 | **`/design` dev gallery is built and shipped**: `/[locale]/design/text-first` appears in the production route table at **288 kB First Load JS** (2nd heaviest route) | build log route table; guarded at runtime by `notFound()` in `app/[locale]/design/page.tsx:32` and `text-first/page.tsx:24`; robots-disallowed at `app/robots.ts:36` | **Low-Medium** |
| D12 | **Env drift between `.env.example` and `lib/env.ts`** (3 declared-but-undocumented, 4 documented-but-unread) | see §7.2 | **Low** |
| D13 | **`docs/` is 566 markdown files across 41 subdirectories** with no index; multiple stale files actively contradict code (see §8) | `find docs -name "*.md" \| wc -l` → 566 | **Medium** |
| D14 | **340 `any` occurrences + 45 `as unknown as` + 3 `@ts-expect-error` + 336 `eslint-disable`** in app/components/lib | grep counts | **Medium** |
| D15 | **`/api/*` routes are excluded from middleware** (`matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"]`) — every API route must do its own auth | `apps/web/middleware.ts` config block | **Medium** (informational; verify per-route in the security loop) |
| D16 | **N+1 query loop on the core worker page**: `dashboard/journal/page.tsx:422` runs a 10–18-query pipeline per entry over 5 entries — ≈50–90 sequential queries per render | see §3.5 | **High** |
| D17 | **18 sequential independent awaits on `dashboard/company/page.tsx`**, 11 on `profile`, 10 on `admin`, 9 on `journal` — the `Promise.all` pattern exists and works on `dashboard/page.tsx:189` but was not applied | see §3.5 | **High** |
| D18 | **217 `const { data } = await supabase…` sites drop the `error`** in non-test code | see §3.6 | **Medium-High** |
| D19 | **14 of 17 API route handlers have zero executed-code test coverage** — including the Stripe webhook, CV extract, waitlist, leads and all 3 exports | see §3.7 | **High** |
| D20 | **131 of 132 route segments have no `error.tsx`; 129 have no `loading.tsx`; 5 `<Suspense>` elements total** — and the existing guard explicitly exempts SSR pages | see §4.3 | **High** |

## 3.2 The 20 largest non-test source files

| # | LOC | File |
|---|---|---|
| 1 | 7,024 | `apps/web/lib/supabase/types.ts` *(generated — excluded from the human-debt count)* |
| 2 | **2,621** | `apps/web/components/app/journal-entry-composer.tsx` |
| 3 | 1,492 | `apps/web/lib/navigation/command-registry.ts` |
| 4 | 1,368 | `apps/web/lib/market/match-v1.ts` |
| 5 | 1,268 | `apps/web/lib/profile/skill-claim-extractor.ts` |
| 6 | 1,178 | `apps/web/app/[locale]/dashboard/journal/page.tsx` |
| 7 | 1,162 | `apps/web/app/[locale]/dashboard/company/page.tsx` |
| 8 | 1,151 | `apps/web/lib/journal/actions.ts` |
| 9 | 1,113 | `apps/web/app/[locale]/dashboard/opportunities/page.tsx` |
| 10 | 999 | `apps/web/lib/structuring/keywords.ts` |
| 11 | 999 | `apps/web/app/[locale]/dashboard/profile/page.tsx` |
| 12 | 951 | `apps/web/components/app/demand-advanced-sections.tsx` |
| 13 | 916 | `apps/web/app/[locale]/dashboard/page.tsx` |
| 14 | 893 | `apps/web/app/[locale]/dashboard/admin/matching/page.tsx` |
| 15 | 892 | `apps/web/app/[locale]/dashboard/admin/project-truth/page.tsx` |
| 16 | 888 | `apps/web/components/app/demand-request-button.tsx` |
| 17 | 873 | `apps/web/components/app/project-operations-board.tsx` |
| 18 | 837 | `apps/web/components/app/journal-entry-compact-editor.tsx` |
| 19 | 805 | `apps/web/app/[locale]/dashboard/company/scouting/page.tsx` |
| 20 | 792 | `apps/web/lib/journal/skill-pipeline-actions.ts` |

Largest guard test: `lib/guards/product-readiness.test.ts` at **1,888 LOC**.

`journal-entry-composer.tsx` (2,621 LOC) is the single worst file: it is a `"use client"`
component containing at least three distinct editor modes (observed `<label>` blocks at lines 1829,
1987, 2490, 2500 repeat the same engagement/date field group), and it sits on the heaviest route in
the app (`/dashboard/journal`, 319 kB First Load JS). It also has a near-duplicate sibling,
`journal-entry-compact-editor.tsx` (837 LOC).

## 3.3 Migration risk — the 10 unapplied migrations

Computed by name-normalised diff between the 161 repo files and the 156 prod ledger rows, then
verified object-by-object with `to_regclass` against production.

| Migration file | Size | Rollback? | Objects it would create | **Present in prod?** |
|---|---|---|---|---|
| `20260713120000_company_locations_v1.sql` | 7.6 KB | yes | `company_locations` + 2 RPCs | **NO** |
| `20260713160000_agency_clients_v1.sql` | 10.4 KB | yes | `agency_clients` + 3 RPCs | **NO** |
| `20260713210000_multi_source_talent_v1.sql` | 26.3 KB | yes | `worker_external_profiles`, `talent_source_records`, `identity_resolution_events` + 6 RPCs | **NO** |
| `20260714150000_ai_runs_audit_v1.sql` | 6.2 KB | yes | `ai_runs` | **NO** |
| `20260714170000_worker_opportunity_seen_v1.sql` | 6.0 KB | yes | `worker_opportunity_seen` + RPC | **NO** |
| `20260714180000_journal_profession_templates_v1.sql` | 7.4 KB | yes | `journal_profession_templates` | **NO** |
| `20260714210000_company_memberships_v1.sql` | 7.7 KB | yes | `validate_active_organization()` | not checked |
| `20260714211000_dashboard_preferences_v1.sql` | 4.9 KB | yes | `dashboard_preferences` | **NO** |
| `20260717130000_open_markets_countries_draft_v1.sql` | 2.5 KB | yes | data-only (no DDL) | n/a |
| `20260717150000_demand_interest_seen_v1.sql` | 6.8 KB | yes | `demand_interest_seen` + RPC | **NO** |
| ~~`20260612091000_journal_entry_photos.sql`~~ | 9.2 KB | **no** | `journal_entry_photos` + `register_journal_entry_photo` | **YES — already live** (superseded file; should be retired) |

**8 shipped code modules query tables that do not exist in production:**

| Module | Missing table |
|---|---|
| `lib/ai/runtime/audit-store.ts:154,185` | `ai_runs` |
| `lib/company/company-locations.ts:41` | `company_locations` |
| `lib/dashboard/preferences.ts:47`, `lib/dashboard/preferences-actions.ts:63` | `dashboard_preferences` |
| `lib/journal/journal-templates.ts:35` | `journal_profession_templates` |
| `lib/opportunities/seen.ts:67` | `worker_opportunity_seen` |
| `lib/agency/clients.ts:37` | `agency_clients` |
| (multi-source talent module) | `worker_external_profiles`, `talent_source_records`, `identity_resolution_events` |
| (demand interest) | `demand_interest_seen` |

**Mitigating fact — this is done well.** Every one of these degrades explicitly rather than
throwing. `lib/company/company-locations.ts:50-53` returns `{ kind: "needs-migration" }` on
Postgres `42P01` / PostgREST `PGRST205`; `lib/dashboard/preferences.ts:54-64` returns
`{ kind: "unavailable" }` and deliberately suppresses the log for those two codes;
`lib/journal/journal-templates.ts:43` latches a module-level `templatesStoreAbsent` flag so it
stops retrying. This is the honest-degradation doctrine actually implemented.

**But there are three real costs:**
1. **Features are invisible in production with no operator signal.** AI run auditing / cost
   tracking (`ai_runs`), dashboard card preferences, journal profession templates, agency clients,
   company locations and opportunity "seen" state are all dead in prod. Nothing alerts on this.
2. **It is the direct cause of D1.** Since the tables are absent from the generated types, every
   access site must cast — `lib/company/company-locations.ts:39` carries an explicit
   `// eslint-disable-next-line @typescript-eslint/no-explicit-any` above `(supabase as any)`.
3. **Ledger drift is invisible to CI.** No check compares repo migrations against the prod ledger,
   so drift can only grow. `docs/APPLIED_LEDGER.md`'s "Deferred" section lists only 9 of the 10.

**One duplicate in the prod ledger:** `conversation_message_language` appears twice
(versions `20260610204051` and `20260611064355`).

## 3.4 Rollback coverage gap

| Metric | Value |
|---|---|
| Migration files | 161 |
| `.down.sql` rollback files | 93 |
| Migrations with **no** paired rollback | **69** |
| ...of which **DDL-touching** (create/alter/drop table/type/function/policy/index/view/trigger) | **53** |

The gap is entirely **historical**: every unpaired migration predates 2026-06-12. Oldest:
`0001_initial_schema.sql`, `0003_multi_role.sql`, `0005_waitlist.sql`, `0008_professions.sql`,
`0009_auth_role_architecture_v1.sql`. Newest unpaired:
`20260612091000_journal_entry_photos.sql`. From 2026-06-12 onward, `.github/scripts/migration-safety.mjs`
hard-fails with `missing-rollback-file`, and coverage is 100 %.

So the honest statement is: **the rollback discipline is fixed going forward, but the 53 DDL
migrations that built the core schema (profiles, roles, journal, ESCO taxonomy, communication,
customer requests, work instructions) have no rollback path at all.** In practice this schema is
established and unlikely to be reverted, so the residual risk is low — but it should be recorded,
not silently carried.

## 3.5 N+1 query patterns and sequential awaits

Method: brace-tracking scan for `await` inside `for`/`for…of`/`while` bodies (20 hits) plus every
`.map(async` (4 hits) across all non-test `.ts/.tsx` in `lib/`, `app/`, `components/`. This is the
complete inventory.

**Worst N+1 patterns:**

| # | Location | Pattern | Estimated cost per render |
|---|---|---|---|
| 1 | `app/[locale]/dashboard/journal/page.tsx:422` | `for (const e of stale) { await processJournalEntrySkills({…` — `stale` is `.slice(0,5)` (L421); the callee (`lib/journal/skill-pipeline.ts:353-690`) issues `createClient` + `auth.getUser` + `workers` + `journal_entries` + 2 recognition reads + `skills` + `worker_skills` upsert + `journal_entry_skills` select+upsert + `skill_candidate_clarifications` upsert + `profile_skill_claims` + 3–4 `journal_entry_metrics` inserts + reconcile | **≈50–90 sequential queries, blocking TTFB on the core worker page** |
| 2 | `app/[locale]/dashboard/projects/page.tsx:113` | `projects.map(async (p) => ({ …, assignments: await listProjectAssignments(p.id) }))` — source is `.limit(100)` (`lib/projects/projects.ts:50`); callee does its own `await createClient()` + query (`:64-72`) | **up to 100 concurrent queries + 100 client constructions** |
| 3 | `app/[locale]/dashboard/company/page.tsx:170` | `managedProjects.slice(0,12).map(async (p) => ({ photoCount: (await getProjectGallerySummary(p.id)).photoCount }))`; callee = `createClient` + 2 head-counts (`lib/journal/project-gallery.ts:81-115`) | **24 queries + 12 clients** |
| 4 | `lib/admin/matching-workbench.ts:652` | `teams.map(async (t) => { const canonical = await buildTeamMatchInput(t.id); …` — callee runs 8 sequential awaits | **≈10 queries × N teams** |
| 5 | `lib/company/team-brigades.ts:453` | `for (const t of teamRows) { await rpc(supabase, "get_team_capability_summary_v1", …` — feeds `dashboard/company/page.tsx:286` | **N sequential RPCs** |
| 6 | `lib/communication/attachments.ts:79` | `for (const row of rows) { await supabase.storage.from(…).createSignedUrl(row.storage_path, 300)` — rows bounded at `.limit(500)` (L55) | **up to 500 sequential storage calls** |
| 7 | `lib/privacy/contact-disclosure-actions.ts:260` | 2 queries per accepted row (`workers` read + `has_employer_data_disclosure` RPC) | 2 × N |
| 8 | `lib/journal/quick-confirm-actions.ts:203` (and fallback `:191`) | `for (const item of withSkills) { await confirmOne(…)` — multi-query chain per item | N sequential chains |
| 9 | `lib/journal/skill-pipeline-actions.ts:170` | same heal loop as #1, admin-triggered, `cap`-bounded | as #1 |
| 10 | `lib/invitations/actions.ts:119` | 3 sequential awaits per email (create RPC → send → mark RPC) | 3 × N |

Bounded runners-up: `lib/projects/operations-actions.ts:144` (`.slice(0,25)`),
`lib/communication/actions.ts:410` (cap 5), `lib/auth/actions.ts:95`, `lib/journal/skill-source-apply.ts:56`.
Correctly batched with `.in(…)` — **not** N+1: `lib/company/worker-readiness.ts:40-73`,
`lib/cv-export/verified-cv.ts:418`.

**Worst sequential-await pages (independent reads not wrapped in `Promise.all`):**

| Page | Sequential awaits | Note |
|---|---|---|
| `app/[locale]/dashboard/company/page.tsx:111-286` | **18** | Only ~6 have real dependencies; each loader is itself 1–4 queries |
| `app/[locale]/dashboard/profile/page.tsx` | **11** (+2 before, +1 inline in JSX at `:724`) | |
| `app/[locale]/dashboard/admin/page.tsx:86-140` | **10** | All independent |
| `app/[locale]/dashboard/journal/page.tsx` | **9** | `:279` and `:292` read the **same** `worker_skills` rows twice with different projections |
| `lib/company/team-match-input.ts:92-197` | **8** | Amplified N× by N+1 #4 |
| `app/[locale]/dashboard/inbox/page.tsx` | 4 | |
| `lib/admin/market-analysis.ts` | 4 | All independent aggregates |
| `app/[locale]/dashboard/projects/[id]/operations/page.tsx:116-118` | 3 | Trivially parallelizable |

Also serialized: `getTranslations()` calls — 16 consecutive at `dashboard/profile/page.tsx:104-118`,
13 at `admin/page.tsx:74-83`, 7 at `journal/page.tsx:85-91`, 7 at `cv/page.tsx:64-70`.

**Counter-example worth naming:** `app/[locale]/dashboard/page.tsx:189` batches 6 reads into a
single `Promise.all` with an explicit comment about the prior "~8 network round-trips". The
dashboard root is the *best*-optimised page in the app — the pattern exists and works; it simply
was not applied to `company`, `profile`, `journal` or `admin`.

## 3.6 Unhandled errors in API routes

Of the 17 `route.ts` handlers, **3 have a real try/catch around the whole body**
(`app/api/auth/google/route.ts:123-207`, `app/[locale]/auth/callback/route.ts:43-127`,
`app/api/leads/route.ts:43-65`), plus `auth/logout` by design. **Two present as guarded but are
not** — their only catch wraps `req.json()` / `req.formData()`:
`app/api/billing/test-checkout/route.ts:25-29` (Stripe call at `:37-84` unguarded) and
`app/api/cv/extract/route.ts:38-44`.

Three defects worth calling out individually:

1. **`app/[locale]/dashboard/journal/export/route.ts:64` — silent data corruption.**
   `entriesRes`/`linksRes` errors are never inspected; `(entriesRes.data ?? []).map(...)` means a
   failed read produces a **valid but empty CSV download** instead of an error. The worker believes
   their journal is empty. Three guard tests reference this file
   (`journal-export-honesty.test.ts:54`, `universal-search-reports.test.ts:453`,
   `document-centre.test.ts:307`) and none of them can see this.
2. **`app/api/billing/webhook/route.ts:97` returns HTTP 200 on failure** (`processed:false`), so
   Stripe will never retry. Also `recordWebhookEvent` (`:48`) and `markWebhookProcessed` (`:62`)
   sit outside any try block.
3. **`app/api/waitlist/route.ts:44`** calls `requireSupabaseClientEnv()`, which **throws** when env
   is missing — unguarded, producing a framework 500 on the public lead-capture endpoint.

**Dropped Supabase errors:** **217** occurrences of `const { data } = await supabase…` with no
`error` binding at all in non-test code. Worst files: `lib/journal/skill-pipeline-actions.ts` (10),
`lib/journal/actions.ts` (8), `lib/journal/confirm-actions.ts` (7),
`lib/journal/journal-entry-skills-actions.ts` (7), `lib/market-map/signals.ts` (7),
`lib/scouting/scouting.ts` (7), `app/[locale]/dashboard/profile/page.tsx` (6), `lib/skills.ts` (5),
`lib/admin/matching-workbench.ts` (5), `lib/projects/worker-project-access.ts` (5).

The security-relevant instance is `lib/skills.ts:25` (`ownsWorker`): it returns `Boolean(data)`, so
**a read error is indistinguishable from "not the owner"**. It fails *closed*, so it is safe — but
the resulting 403 misreports the cause, and an outage would present as a permissions bug.
`lib/projects/worker-project-access.ts` repeats the pattern for project access.

## 3.7 Route-handler test coverage — the real picture

**Only 3 route modules in the entire app are imported and executed by any test:**

```
lib/auth/callback-route.test.ts:22  import { GET }  from "@/app/[locale]/auth/callback/route";
lib/auth/google-route.test.ts:36    import { POST } from "@/app/api/auth/google/route";
lib/auth/logout-route.test.ts:27    …                from "@/app/[locale]/auth/logout/route";
```

Everything else is either a **source-text guard** (`readFileSync` + regex over the route file) or a
unit test of an extracted pure helper. Neither executes the handler.

| Critical path | Behavioural coverage |
|---|---|
| `app/[locale]/auth/callback/route.ts` | ✅ `lib/auth/callback-route.test.ts` — exercises exchange / PKCE-race / no-user / onboarding branches |
| `app/api/auth/google/route.ts` | ✅ `lib/auth/google-route.test.ts` — CSRF, malformed body, nonce/audience failure, success routing, rate limit |
| `app/api/billing/webhook/route.ts` | ❌ source-pin only (`lib/guards/billing-readiness.test.ts:155` asserts the string `assertTestEvent` appears). Logic tested separately via `lib/billing/webhook-core.test.ts` + `webhook-signature.integration.test.ts` (real Stripe SDK signing, but calls parsers directly) |
| `app/api/billing/test-checkout/route.ts` | ❌ none. Only the pure gate `evaluateCheckoutRequest` is tested |
| `app/api/cv/extract/route.ts` | ❌ none for the handler. `lib/cv/extract.test.ts` covers `extractCvText`; e2e `tests/e2e/cv-upload-authenticated.spec.ts` skips without `.storage-state.json` |
| `app/api/waitlist/route.ts` | ❌ source guard only (`input-caps-and-log-privacy.test.ts:21`) |
| `app/api/leads/route.ts` | ❌ source guards only (`chat-visibility-rls.test.ts:241,254`) |
| `app/api/dashboard-search/route.ts` | ❌ source guard only (`universal-search-reports.test.ts:71`) |
| `.../journal/export/route.ts` | ❌ source guards only — the empty-CSV bug above is invisible to all three |
| `.../privacy/export/route.ts` | ❌ source guard only (`privacy-self-service.test.ts:72`) |
| `.../finance/export/route.ts` | ❌ source guards only |
| `app/api/professions/…`, `app/api/workers/…` (×2), `questions-sitemap.xml`, `projects/[id]/operations/report` | ❌ referenced by no test at all |

**This is the single most important qualifier on the "11,356 tests pass" headline.** 14 of 17
route handlers — including the Stripe webhook, CV extraction, waitlist capture, lead intake and
all three data exports — have zero executed-code coverage.

## 3.8 Weak typing — counts and worst offenders

| Pattern | Count (app + components + lib) |
|---|---|
| `supabase as any` / `asAny(` | **674** across **176** files |
| `: any` / `as any` / `<any>` / `any[]` | **340** |
| `as unknown as` | **45** |
| `@ts-expect-error` | **3** |
| `@ts-ignore` | **0** |
| `eslint-disable` comments | **336** |

Worst-offender **directories** (non-test files containing `any`): `lib/admin/` dominates —
`billing-actions.ts`, `billing-overview.ts`, `company-need-intakes.ts`, `company-verification.ts`,
`conversion-funnel.ts`, `document-verification-actions.ts`, `launch-readiness.ts`,
`launch-signals.ts`, `league.ts`, `market-actions.ts`, `market-analysis.ts`,
`matching-workbench.ts`, `need-backfill.ts`, `need-backfill-actions.ts`, `pilot-metrics.ts`,
`pilots.ts`. Page-level offenders: `app/[locale]/dashboard/journal/page.tsx`,
`.../profile/page.tsx`, `.../page.tsx`, `.../communication/[conversationId]/page.tsx`,
`.../inbox/page.tsx`, `app/[locale]/dashboard/admin/{telemetry,support,agent-os,language-feedback}/page.tsx`.

**Root cause is structural, not sloppiness.** Two forces produce nearly all of it: (a) tables that
exist only in unapplied migrations (§3.3), and (b) `lib/supabase/types.ts` lagging behind prod
(D2). Regenerating types (`pnpm db:types`) and applying the deferred migrations would let a large
fraction of the 674 casts be deleted mechanically.

---

# 4. Performance, mobile & accessibility (code-level)

## 4.1 Bundle evidence — from the real build

Shared baseline: **103 kB First Load JS** for every route
(`chunks/8903-*.js` 46.4 kB + `chunks/a4caba21-*.js` 54.2 kB + 2.07 kB other).
Middleware: **118 kB**. Median route First Load: **120 kB**. Range: 103–319 kB across 136 entries.

**Top 20 routes by First Load JS:**

| First Load | Own page size | Route |
|---|---|---|
| **319 kB** | 13.50 kB | `/[locale]/dashboard/journal` |
| **288 kB** | 3.09 kB | `/[locale]/design/text-first` *(dev gallery — see D11)* |
| **240 kB** | 16.90 kB | `/[locale]/dashboard/profile` |
| 214 kB | 5.76 kB | `/[locale]/dashboard/buyer` |
| 212 kB | 16.90 kB | `/[locale]` *(landing)* |
| 212 kB | 2.41 kB | `/[locale]/auth/signup` |
| 211 kB | 1.93 kB | `/[locale]/auth/login` |
| 211 kB | 6.12 kB | `/[locale]/dashboard/communication/[conversationId]` |
| 207 kB | 1.35 kB | `/[locale]/auth/reset-password` |
| 206 kB | 4.17 kB | `/[locale]/auth/forgot-password` |
| 202 kB | 1.32 kB | `/[locale]/for-workers` |
| 188 kB | 21.70 kB | `/[locale]/dashboard` |
| 177 kB | 4.69 kB | `/[locale]/for-companies` |
| 176 kB | 3.98 kB | `/[locale]/for-agencies` |
| 152 kB | 7.85 kB | `/[locale]/dashboard/market/recognize` |
| 143 kB | 22.00 kB | `/[locale]/dashboard/company` |
| 141 kB | 22.50 kB | `/[locale]/dashboard/market-map` |
| 131 kB | 12.70 kB | `/[locale]/dashboard/projects/[id]/operations` |
| 131 kB | 2.14 kB | `/[locale]/pricing` |
| 128 kB | 9.35 kB | `/[locale]/dashboard/network` |

**Reading of this:** absolute sizes are respectable for a product of this scope — the median route
is only 17 kB over the shared baseline. But note the **auth pages**: `/auth/login` ships **211 kB**
First Load for a **1.93 kB** page. 107 kB of route-specific JS is being pulled in behind a 2 kB
login form. Same shape for signup (212 kB / 2.41 kB), reset-password (207 kB / 1.35 kB),
forgot-password (206 kB / 1.32 kB) and `/for-workers` (202 kB / 1.32 kB). These are the first
surfaces every acquired user touches, and they carry the third-heaviest payload in the app.

**Caveat the build output does not show:** First Load JS excludes the RSC flight payload, which is
where the i18n messages ride. `lib/i18n/client-messages.ts` documents that the pre-fix payload was
"~440 KB minified per locale". The route-group subsetting fixed the shape; the current per-route
serialized message weight is **not measured anywhere** and should be checked live (loop 8).

## 4.2 Images

| Metric | Value |
|---|---|
| Files importing `next/image` | **3** |
| Raw `<img>` tags | **1** |

The product is deliberately text/SVG-first (`DESIGN_SOUL.md`, `/design/text-first`), so low
`next/image` usage is a design choice, not neglect. No unoptimised image debt found.

## 4.3 Loading states & Suspense

| Boundary | Present |
|---|---|
| `loading.tsx` | **3**: `app/[locale]/cv/`, `app/[locale]/dashboard/`, `app/[locale]/onboarding/` |
| `error.tsx` | **1**: `app/[locale]/error.tsx` |
| `global-error.tsx` | **1**: `app/global-error.tsx` |
| `not-found.tsx` | **1**: `app/[locale]/not-found.tsx` |
| `<Suspense>` **elements** | **5** in `app/`, **0** in `components/` (a raw grep returns 8 — 3 are comments) |

**Gap, measured exhaustively.** The app has **132 route segments** containing a `page.tsx` or
`route.ts`. **131 of 132 have no own `error.tsx`**; **129 of 132 have no `loading.tsx`**. Every
failure anywhere — all 41 dashboard sub-routes, all 22 admin sub-pages, all 26 marketing segments,
all 4 auth pages, `business/[slug]`, `invite/[token]`, `[...rest]` — renders the single generic
`app/[locale]/error.tsx` with no segment context and no partial-shell retention.

The five real `<Suspense>` boundaries:

| Location | Fallback |
|---|---|
| `app/[locale]/auth/login/page.tsx:16` | `null` |
| `app/[locale]/auth/signup/page.tsx:16` | `null` |
| `app/[locale]/dashboard/layout.tsx:186` (`<SpineStream>`) | `null` |
| `app/[locale]/dashboard/page.tsx:568` (intelligence trust card) | skeleton |
| `app/[locale]/dashboard/page.tsx:875` (salary benchmark card) | skeleton |

Three of five use `fallback={null}` — no visible loading signal. Streaming is effectively unused
across 115 pages: a slow server component blocks its whole route.

**Why the existing guard doesn't catch this.** `lib/guards/loading-error-state-coverage.test.ts`
exists but explicitly exempts SSR pages: *"SSR dashboard pages… their failures throw to the
framework error boundary — so they are exempt AS LONG AS they stay server components."* That
exemption is precisely why 131 segments have no boundary while the guard stays green — a good
example of a guard encoding a decision that has since become a liability (see T-16).

## 4.4 `use client` distribution

215 files carry `"use client"` out of 1,802 (11.9 %). That is **not** overuse in itself. The real
issue is concentration: the two heaviest routes (`/dashboard/journal` 319 kB and
`/dashboard/profile` 240 kB) are dominated by single enormous client components
(`journal-entry-composer.tsx` 2,621 LOC, `journal-entry-compact-editor.tsx` 837 LOC). Splitting
those two files is the highest-leverage bundle work available.

## 4.5 Accessibility

| Signal | Count | Assessment |
|---|---|---|
| `aria-label` | **221** | Good coverage |
| `role="…"` | **250** | Good coverage |
| `aria-labelledby` / `aria-describedby` | **35** | Thin but present |
| `<label>` elements | **323** | — |
| `<label htmlFor=…>` | **8** | — |
| `<input id=…>` | **0** | — |
| `onKeyDown`/`onKeyUp`/`onKeyPress` handlers | **8** | Thin |
| focus-visible / focus-ring / outline utilities | **150** | Good |
| Touch-target sizing utilities (`min-h-11/12`, `h-11/12`, `min-h-[44px+]`) | **89** | Present |

**Important correction to a tempting false finding.** 8 `htmlFor` against 323 labels looks alarming
but is **not** a violation: the codebase uses *implicit* label association by wrapping the control.
Verified pattern at `components/app/journal-entry-composer.tsx:1829-1833`:

```tsx
<label className="flex flex-col gap-2">
  <span …>{t("whatDidYouDo")}</span>
  <textarea value={text} …
```

That is valid HTML and valid a11y.

**Where it does break down:** when a `<label>` wraps a *custom* control rather than a native one,
implicit association gives nothing. `journal-entry-composer.tsx:1987-1993` and `:2490-2496` wrap a
`<DarkListbox>` — association there depends entirely on the `ariaLabel` prop being passed (it is,
in these two cases). Any custom control that omits it is silently unlabelled, and nothing in CI
checks for that.

**Also weak:** 8 keyboard handlers across 215 client components means custom interactive widgets
(listboxes, command finder, drag boards like `project-operations-board.tsx`) are very unlikely to
be fully keyboard-operable. This needs live testing, not code reading.

**Contrast tokens** are well-architected: `tokens/colors.ts` resolves every colour through
`rgb(var(--c-*) / <alpha-value>)` so themes are a variable swap with zero component edits, with
semantic `text.primary/secondary/muted` and `state.*` scales. Actual measured contrast ratios were
not verified — that requires the live browser loop.

## 4.6 PWA / TWA readiness

`app/manifest.ts` exists and `/manifest.webmanifest` is emitted in the build. There is **no service
worker**, no offline strategy and no install prompt handling anywhere in source. So: manifest-level
metadata only — **not** installable-PWA ready, and nowhere near TWA-ready. For a product whose
primary worker persona is on a phone on a site, this is a real gap, but it is a product decision,
not a defect.

---

# 5. Localization

## 5.1 Key counts per locale — measured

Flattened dotted-key count of `apps/web/messages/<locale>.json`:

| Locale | Keys | File size | Missing vs EN | Extra | `[EN]` markers | Routed? |
|---|---|---|---|---|---|---|
| **en** (source) | **7,355** | 478 KB | — | — | 0 | ✅ active |
| **lt** (default) | **7,355** | 512 KB | **0** | 0 | 0 | ✅ active |
| **ru** | **7,355** | 734 KB | **0** | 0 | 0 | ✅ active |
| **nl** | **7,355** | 514 KB | **0** | 0 | 0 | ✅ **active** |
| **de** | **7,355** | 540 KB | **0** | 0 | 0 | ✅ **active** |
| da | 1,860 | 127 KB | 5,505 | 10 | 831 | ❌ dormant |
| et | 1,860 | 128 KB | 5,505 | 10 | 1,459 | ❌ dormant |
| lv | 1,860 | 130 KB | 5,505 | 10 | 1,459 | ❌ dormant |
| no | 1,860 | 128 KB | 5,505 | 10 | 1,459 | ❌ dormant |
| pl | 1,860 | 130 KB | 5,505 | 10 | 1,456 | ❌ dormant |
| sv | 1,860 | 129 KB | 5,505 | 10 | 1,459 | ❌ dormant |

**LT / EN / RU verdict: perfect structural parity. Zero missing keys, zero orphan keys, zero
`[EN]` placeholder markers, in all three directions.** This is unusually clean and is enforced by
`lib/guards/i18n-lt-en-parity.test.ts` plus the `check:i18n-debt` ratchet in CI.

Untranslated-value leakage (value byte-identical to EN, length > 12 chars — a proxy for
copy-paste rather than translation):

| Locale | Identical-to-EN values | Rate |
|---|---|---|
| lt | 8 / 7,355 | 0.1 % |
| ru | 10 / 7,355 | 0.1 % |
| nl | 31 / 7,355 | 0.4 % |
| de | 32 / 7,355 | 0.4 % |

All four are effectively noise (mostly proper nouns and codes). No translation-debt problem here.

## 5.2 NL and DE — their real state

**The brief's framing ("treat NL and DE as a FUTURE direction, not working languages") does not
match the code.** NL and DE are **live routed production locales**:

- `apps/web/lib/i18n/config.ts:39` — `export const activeLocales = ["lt", "en", "ru", "nl", "de"] as const;`
- The same file's header records: "NL + DE activated 2026-07-11, non-landing launch repair Scope D"
  and "NL and DE were activated only after their message catalogs (base + 6 taxonomy files) reached
  full parity with EN — zero `[EN]` markers".
- `README.md:30` agrees: "Active UI locales: **lt (default) · en · ru · nl · de**".
- The build prerenders `/nl/*` and `/de/*` for every static page (846 pages across 5 locales).
- Both have exactly 7,355 keys — verified full parity above.

**What is genuinely unfinished about them:** `lib/i18n/config.ts:44-46` states RU/NL/DE are
"AI-seeded full translations pending human review (§7.4) — the language selector preview-tags
non-Tier-1 locales", and `tier1Locales = ["en","lt"]`. So NL/DE are *shipped and routed but not
human-verified*. That is a materially different (and more urgent) risk than "future direction":
a paying Dutch or German visitor sees machine copy today, at full site coverage, with no human
having read it.

**Doc conflict.** Five launch/governance docs still claim the active set is `lt/en/ru` only, and
one of them is the *binding* doctrine — see §8, findings 6 and 7.

## 5.3 The dormant six

`da`, `et`, `lv`, `no`, `pl`, `sv` sit at 25 % catalog completeness with 831–1,459 literal `[EN]`
markers each. They are intentionally excluded from routing (`config.ts:39`), the URL↔locale
resolver rejects them, and the selector hides them — so **no user can reach a broken page**. They
are inventory, not a live defect. Promoting any one of them is a one-row change *plus* ~5,500 keys
of translation work.

## 5.4 Hardcoded user-facing strings

**59 `.tsx` files** contain string literals with Lithuanian diacritics. Most are legitimate
(comments, test fixtures). The real finding is a **parallel translation system**: 180 lines of
inline `{ en: …, lt: …, ru: …, nl: …, de: … }` object literals in **6 files** that bypass
`next-intl` and `messages/*.json` entirely:

| File | Inline locale-map lines |
|---|---|
| `app/[locale]/(marketing)/work-opportunities/page.tsx` | **65** |
| `app/[locale]/(marketing)/skills/page.tsx` | **55** |
| `app/[locale]/(marketing)/professions/page.tsx` | **45** |
| `components/marketing/locale-switcher.tsx` | 5 |
| `components/app/demand-advanced-sections.tsx` | 5 |
| `components/app/command-finder.tsx` | 5 |

Example — `app/[locale]/(marketing)/professions/page.tsx:96-105`:

```tsx
construction: { en: "Construction", lt: "Statyba", ru: "Строительство", nl: "Bouw", de: "Bau" },
manufacturing: { en: "Manufacturing", lt: "Gamyba", ru: "Производство", nl: "Productie", de: "Produktion" },
```

and `:67-68`, a full 250-character marketing paragraph in LT and RU inline.

**Why this matters concretely:** these strings are invisible to `check:i18n-debt`, to
`i18n-lt-en-parity.test.ts` and to every translation-review workflow. Three of the six files are
**public SEO-indexed marketing pages** — exactly the copy most likely to need editing. And they are
structurally incapable of supporting a 6th locale: promoting `pl` would leave these three pages
silently falling back while every other page translates.

`locale-switcher.tsx` is a defensible exception (locale names should be in their own language).

## 5.5 Fallback behaviour

`lib/i18n/request.ts:24-30` loads the base catalog plus all six taxonomy files per request via
dynamic import. `routing.ts` sets `localePrefix: "always"` (ADR 0004), so every path is
`/{locale}/…` and `/` redirects to `/lt`. The `activeLocales` restriction was introduced
specifically so the build "stops prerendering /lv/... /et/... pages with `MISSING_MESSAGE` warnings"
(`routing.ts:8-11`) — i.e. the fallback strategy is **prevention** (don't route incomplete locales)
rather than runtime fallback. That is the right choice, and it is why the LT/EN/RU/NL/DE experience
has no missing-key holes.

## 5.6 Date / number / currency formatting

| Signal | Count |
|---|---|
| `toLocaleDateString` / `toLocaleString` / `Intl.*Format` call sites | **57** |
| Hardcoded BCP-47 tags like `"lt-LT"` / `"en-US"` | **0** |
| Hardcoded `currency: "EUR"` | 7 |
| **Calls with NO locale argument** (fall back to server/browser default) | **5** |

The 5 locale-unaware calls:

| File:line | Code |
|---|---|
| `components/app/handover-passport-panel.tsx:154` | `new Date(e.createdAt).toLocaleDateString()` |
| `components/app/worker-instruction-card.tsx:64` | `new Date(instruction.createdAt).toLocaleString()` |
| `components/app/market-counters.tsx:79` | `Math.abs(a - b).toLocaleString()` |
| `components/app/admin-launch-board.tsx:21` | `n.toLocaleString()` *(admin-only)* |
| `app/[locale]/dashboard/admin/page.tsx:159` | `n.toLocaleString()` *(admin-only)* |

Only three are user-facing. In a server component these render with the **server's** locale, which
means a Lithuanian worker can see a US-format date on the handover passport and the work-instruction
card. Small, cheap, real. Everything else correctly threads `locale`. `currency: "EUR"` is hardcoded
in 7 places — correct for the current 5 markets, but a hardcode to remember if DKK/SEK/NOK/PLN
markets open.

## 5.7 SEO metadata per locale

| Signal | Value |
|---|---|
| Pages with `generateMetadata` | **23** of 115 |
| `(marketing)` pages with `generateMetadata` | **22** of 27 |
| `dashboard` pages with `generateMetadata` | **0** of ~60 *(correct — noindex surfaces)* |
| hreflang / `alternates` implementation | `lib/seo/metadata.ts`, `app/sitemap.ts`, `app/questions-sitemap.xml/route.ts` |
| CI guard | `pnpm check:public-seo-indexing` (wired into `quality.yml`) |

**5 public marketing pages have no `generateMetadata`** — they inherit whatever the layout sets, so
they have no page-specific localized title/description/canonical/hreflang:

- `app/[locale]/(marketing)/labour-market/[country]/page.tsx` ← **a dynamic per-country landing page; the highest-value SEO surface in the list**
- `app/[locale]/(marketing)/match-preview/page.tsx`
- `app/[locale]/(marketing)/legal/legal-notice/page.tsx`
- `app/[locale]/(marketing)/legal/marketplace-rules/page.tsx`
- `app/[locale]/(marketing)/legal/terms/page.tsx`

## 5.8 Validation-error and email texts

Validation messages are Zod-based (`zod` 4.4.3) and surfaced through `messages/*.json` namespaces —
they participate in the 7,355-key parity, so LT/EN/RU/NL/DE all have them.

Email text is a different story: `.env.example` declares `INVITE_EMAIL_PROVIDER`,
`INVITE_EMAIL_FROM` and `INVITE_EMAIL_API_KEY`, but **none of the three appear in
`apps/web/lib/env.ts`** (§7.2). Transactional email is therefore not wired into the validated env
surface, and the localization state of invitation emails could not be verified from code.

---

# 6. Analytics & measurement

## 6.1 What exists

First-party only, no third-party tracker anywhere. `lib/telemetry/funnel-events.ts` declares
**34** bounded funnel event names; `lib/telemetry/actions.ts` is a `"use server"` action that
server-side-allowlists metadata keys, caps string values at 200 chars, rejects >2 KB payloads and
derives `profile_id` from `supabase.auth.getUser()` (the client never asserts identity).
`lib/telemetry/attribution.ts` captures first-touch UTM.

## 6.2 The measured reality — and it is bad

Production `public.pilot_events` at 2026-07-22:

| Metric | Value |
|---|---|
| Total rows (all time, since 2026-05-31) | **224** |
| Rows from anonymous visitors (`profile_id IS NULL`) | **0** |
| Rows from authenticated users | 224 |
| **Distinct profiles that ever produced an event** | **1** |
| Declared funnel events with **zero** rows | **17 of 34** |

**Every event in the production analytics table came from a single account.** Not one anonymous
visitor event has ever been recorded, despite `pilot_events_insert` explicitly permitting it
(`WITH CHECK ((profile_id IS NULL) OR (profile_id = auth.uid()))`, applied to PUBLIC) and despite
migration `20260702150000_pilot_events_anon_insert_grant` having been applied on 2026-07-02.

`landing_viewed` has exactly **1** row, dated 2026-07-21 — and since `anon_rows = 0`, even that one
came from a logged-in user.

**The 17 zero-row events, all of which have live call-sites in code:**

`cta_clicked` (3 call-sites) · `role_selected` (2) · `registration_started` (5) ·
`login_started` (3) · `onboarding_started` (4) · `onboarding_completed` (4) ·
`onboarding_step_role_completed` (1) · `onboarding_step_profile_completed` (1) ·
`company_need_started` (3) · `company_need_submitted` (5) · `demand_saved` (3) ·
`profile_saved` (2) · `avatar_upload_started` (1) · `avatar_upload_succeeded` (2) ·
`preferred_location_saved` (2) · `preferred_location_add_started` (1) ·
`company_demand_action_clicked` (1)

So the instrumentation is **written but unproven**. Either the anon write path is silently failing
in production, or there has been effectively no traffic. The site is publicly live, so at minimum
the first hypothesis has never been ruled out — and there is no alert, dashboard or check that
would ever surface it.

## 6.3 Measurability table

| Business question | Status | Evidence |
|---|---|---|
| Landing → signup | **Not measurable** | `landing_viewed` = 1 row, `cta_clicked` = 0, `registration_started` = 0, anon rows = 0 |
| Signup → completed profile | **Not measurable** | `onboarding_started` = 0, `onboarding_completed` = 0, `onboarding_step_*` = 0 |
| CV upload success | **Not instrumented** | No CV-upload event in `FUNNEL_EVENTS`; `app/api/cv/extract/route.ts` emits none |
| First recognised skill | **Partially** | `journal_new_skill_added` (13) and `profile_skill_suggestion_confirmed` (1) exist as ad-hoc feature events but are **not** in the funnel registry — so no funnel query can reach them |
| Demand posted | **Not measurable** | `demand_form_viewed` = 9 but `demand_saved` = 0; DB has 4 `demand_interest_signals` rows and 17 `customer_requests` — the DB knows, the funnel does not |
| First suitable candidate shown | **Not instrumented** | No event exists |
| Application / interest submitted | **Partially** | `service_request_started` = 1, `service_request_sent` = 1 |
| Company contact / disclosure | **Not instrumented** | `contact_disclosure_requests` table exists in prod but no funnel event |
| Subscription conversion | **Not applicable yet** | Payments hard-off (`LIVE_PAYMENTS_ENABLED = false as const`); `plans` table has 4 rows, no subscriptions |
| Churn | **Not instrumented** | No retention/cohort event; `return_visit_detected` (10 rows) is the only proxy |
| Errors | **Partially** | `task_error` result type + `error_code` column exist; runtime errors go to 136 `console.error` sites → Vercel logs only; **no Sentry/OTel** |
| Funnel drop-off **by device** | **Not instrumented** | No device/viewport dimension in `FunnelMetadata` |
| Funnel drop-off **by language** | **Instrumented** | `locale` is a bounded column (≤16 chars) on every event |
| Funnel drop-off **by role** | **Partially** | `role_selected` exists but has 0 rows; role is not a persisted event dimension |

## 6.4 Privacy — no over-collection found

This is done correctly and should be stated plainly. `lib/telemetry/funnel-events.ts:18-22`:
"events carry only the bounded, non-PII metadata described by `FunnelMetadata`. NEVER email / name /
phone / address / free-text CV / profile / journal / message bodies." `lib/telemetry/actions.ts`
enforces a server-side key allowlist, per-value 200-char cap and 2 KB total cap, derives identity
server-side, and explicitly does not log "the auth code, cookies, tokens, full URL, or any free-text
profile / journal body". `marketing-funnel-beacon.tsx:22-24` adds: "Never captures a query string
verbatim, a full referrer URL, or any user-entered value." Read access is admin-only
(`pilot_events_select USING (is_admin())`). **No over-collection.** If anything the schema is
*too* restrictive to answer device-level questions.

---

# 7. Operations & documentation readiness

## 7.1 Classification

| Area | Status | Evidence |
|---|---|---|
| README | **Adequate** | `README.md` 108 lines: stack, domains, locales, prerequisites, setup, validate commands, DB, deploy, branch flow, landing freeze, repo map. Accurate on locales and payments. |
| Setup instructions | **Adequate** | `README.md:44-55` gives exact `copy .env.example apps\web\.env.local` + which dashboard page each secret comes from |
| Env example | **Adequate (brief was wrong)** | `.env.example` exists, 40 vars, tracked. Minor drift — see §7.2 |
| Migration instructions | **Contradictory** | `docs/APPLIED_LEDGER.md` is well-maintained, but `docs/DEPLOYMENT.md:42-52` instructs `pnpm db:push` which every policy doc bans. See §8 F2/F3 |
| Deploy process | **Thin** | `docs/DEPLOYMENT.md` (113 lines) is partly M0-era and factually inverted about prod DB state. Vercel side is one paragraph |
| Incident handling | **Thin** | `docs/security/incident-response-v1.md` (62 lines) exists, is honest about being a draft: "Notification wording and legal timelines need lawyer review before any real incident communication" |
| Rollback | **Partial** | Forward discipline enforced by CI since 2026-06-12; **53 DDL migrations have no rollback** (§3.4). No documented *application* rollback (Vercel redeploy) procedure |
| Feature-flag registry | **Adequate** | `lib/config/feature-availability.ts` — typed catalogue of 22 feature keys with `active`/`preparing`/`hidden`, label/description i18n keys, `primaryRoute`, `preparingReasonKey`, `safeToShowInPrimaryNav`. Consumed by nav and cards. Complemented by `lib/billing/lmc-flags.ts` (6 literal-`false` kill switches) |
| Stripe procedures | **Thin** | `docs/audits/stripe-test-activation-runbook.md` exists; live activation is owner-gated and undocumented end-to-end |
| Admin instructions | **Missing** | 22 admin sub-routes, no operator guide for any of them |
| AI fallback | **Adequate** | `lib/ai/runtime/task-routing.ts:20-21` — "Provider-failure fallback may go DOWN a tier only with fallbackApplied=true and an honest reason — no silent quality drop". `lib/ai/README.md` exists. **But** the `ai_runs` audit table is unapplied, so fallbacks are not recorded in prod |
| Data import | **Thin** | `supabase/reference-data.sql`, `supabase/dev-fixtures.sql`, `scripts/db-fixtures-local.ts`; ESCO import (1.04 M label rows) has no documented re-run procedure |
| Support process | **Missing** | `dashboard/admin/support` route exists; no documented SLA, triage or escalation path |
| Observability / alerting | **Missing** | No Sentry/OTel/Datadog. 136 `console.error` → Vercel logs. `lib/notifications/telegram-owner-alerts.ts` is the only push channel, gated on `OWNER_TELEGRAM_ALERTS_ENABLED` |
| Testing docs | **Stale** | `docs/TESTING.md` describes a 1-file e2e suite (now 24 specs) and omits vitest — the actual blocking gate. See §8 F9/F10 |
| Docs navigability | **Thin** | 566 `.md` files, 41 subdirectories, no index or freshness convention |

## 7.2 Env drift

| Declared in `lib/env.ts` but absent from `.env.example` | Present in `.env.example` but not read by `lib/env.ts` |
|---|---|
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | `INVITE_EMAIL_API_KEY` |
| `VOICE_TRANSCRIBE_URL` | `INVITE_EMAIL_FROM` |
| `VOICE_TRANSCRIBE_TOKEN` | `INVITE_EMAIL_PROVIDER` |
| | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` |

Left column = a fresh operator sets up voice transcription and Google sign-in with no idea they
exist. Right column = four documented variables that nothing validated reads — either dead config
or an unwired feature (invitation email is the more worrying case, since `canonical_invitations_v1`
IS applied in prod).

## 7.3 Supabase security advisors (252 lints, full parse)

| Level | Count |
|---|---|
| **ERROR** | **0** |
| WARN | 251 |
| INFO | 1 |

| Advisory | Count |
|---|---|
| `authenticated_security_definer_function_executable` | 193 |
| `anon_security_definer_function_executable` | 54 |
| `function_search_path_mutable` | 1 — `public.customer_requests_status_transition_guard` |
| `rls_policy_always_true` | 1 — `public.waitlist` policy `waitlist_insert_anon`, `INSERT`, roles `["anon"]`, `WITH CHECK true` |
| `auth_leaked_password_protection` | 1 — HaveIBeenPwned check **disabled** |
| `auth_otp_long_expiry` | 1 — email OTP expiry > 1 hour |
| `rls_enabled_no_policy` (INFO) | 1 — `public.company_need_public_intakes` |

**No table has RLS disabled.** Zero ERROR-level findings is a genuinely good result for a 126-table
schema.

The 54 `anon`-executable `SECURITY DEFINER` functions include some that look intentional
(`get_public_business_profile_v1`, `get_public_business_listings_v1`, `submit_company_need_public_v1`)
and some that do not (`create_contract_v1`, `delete_contract_v1`, `set_contract_status_v1`,
`create_asset_v1`, `issue_asset_v1`, `transfer_asset_assignment_v1`, `set_project_budget_v1`,
`delete_project_budget_v1`, `is_admin`, `handle_new_user`, `manages_organization`, `owns_company`).
These almost certainly perform their own internal auth checks — **this audit did not verify that**,
and it belongs to the security loop, not this one.

The two auth settings (leaked-password protection off, OTP expiry > 1 h) are **dashboard toggles,
not code** — cheap, high-value, owner-actionable today.

---

# 8. Doc-vs-code conflicts

Twelve verified contradictions, each with quotes from both sides.

| # | Conflict | Side A | Side B | Truth | Risk |
|---|---|---|---|---|---|
| **F1** | Prod migration apply policy | `CLAUDE.md:55-57`: "Running migrations on production — **NEVER automatic.**" | `AGENTS.md:55-58`: "**PROD APPLY AUTONOMY (conditional — DI decision 2026-06-12).** The old hard blocker … is replaced." | AGENTS.md is newer and matches practice (`docs/APPLIED_LEDGER.md` July rows are stamped "DI … + Claude Code"). But `README.md:77-80`, `docs/APPLIED_LEDGER.md:6-8` and `docs/DEPLOYMENT.md:7-8` all still assert the ban — 4 files vs 1 | **Critical.** Two files loaded into every agent session state opposite rules for irreversible production DB writes |
| **F2** | `supabase db push` | `CLAUDE.md:93-94` / `AGENTS.md:120-122`: "never `supabase db push` (the repo's filenames don't match the ledger versions; a push would re-run applied migrations)" | `docs/DEPLOYMENT.md:42-52`: "`pnpm db:push` runs `supabase db push`, which applies everything in `supabase/migrations/` in order" — and `package.json:23` still ships the script | The ban is correct; filename/ledger divergence is real (`APPLIED_LEDGER.md:11-13`) | **Critical.** A new operator following DEPLOYMENT.md re-runs ~161 migrations against a DB with 156 applied |
| **F3** | Prod DB state | `docs/DEPLOYMENT.md:29-31`: "The Supabase project … already exists but is empty. The migration files are committed and ready; no agent has applied them" | `docs/APPLIED_LEDGER.md:17-96` lists ~35 applied migrations; prod ledger has **156** rows and **126** tables | APPLIED_LEDGER is true; DEPLOYMENT.md's DB section is M0-era text never retired | **Critical.** It is the only end-to-end DB runbook and it is factually inverted |
| **F4** | Domain policy | `docs/DEPLOYMENT.md:3-5`: deploys to "`labourmarket.ai` (public canonical) **and** `app.labourmarket.ai` (auth/dashboard) — … (v2)" | `README.md:21-24` single-domain v3; `apps/web/lib/domain/canonical.ts:16-22`: "`app.labourmarket.ai` must NEVER serve product content again" | README + code | **High.** Re-creates the split-origin session bug the policy was written to kill |
| **F5** | The word "demo" | `CLAUDE.md:146`: "the word 'demo' is banned from all product copy … enforced by `lib/guards/product-copy-forbidden-terms.test.ts`" | `AGENTS.md:174`: "placeholders allowed only when visually marked `Sample` / `Demo`" | CLAUDE.md — the guard at `product-copy-forbidden-terms.test.ts:6-8,36-39` scans every `messages/*.json` | **Medium.** The two paragraphs are otherwise byte-identical, so the divergence is invisible on a skim |
| **F6** | Active locale set (binding doctrine) | `docs/PLATFORM_DOCTRINE.md:66` §2.4: "ACTIVE locales (lt, en, ru)…" — and `CLAUDE.md:3` says the doctrine wins on conflict | `apps/web/lib/i18n/config.ts:39`: `activeLocales = ["lt","en","ru","nl","de"]`; `README.md:30` agrees | Code. The doctrine was never amended after the 2026-07-11 NL/DE activation | **High.** The binding text under-specifies the translation obligation for 2 live locales |
| **F7** | Active locales in launch docs | `docs/launch/real-user-launch-work-project-operations-train-v1.md:13-14` (merged 2026-07-18): "**Active locales:** `lt`, `en`, `ru`" and "**Migration count at baseline:** 115 files" | 5 active locales; **161** migration files | Code. Same stale claim in `docs/launch/README.md:33`, `known-limits.md:32`, `final-launch-readiness-report.md:4`, `full-project-mobile-root-cause-audit-v1.md:232` | **High.** Five readiness docs understate live surface by 2 locales — QA/SEO/i18n work scoped from them silently skips `/nl` and `/de` |
| **F8** | Rollback form | `docs/PLATFORM_DOCTRINE.md:257-259` §16.3 (binding): "a `-- DOWN` block **or** a paired down migration"; `CLAUDE.md:63-64` equally loose | `.github/scripts/migration-safety.mjs:277-284`: "The in-file `-- ROLLBACK` comment (b) is necessary but no longer enough" → `structural("missing-rollback-file")`; `AGENTS.md:82-85` matches CI | CI + AGENTS.md | **Medium.** An agent trusting the doctrine (declared to win) writes a DOWN block and gets a red required check |
| **F9** | Testing gate matrix | `docs/TESTING.md:6-14` lists Type/Lint/Build/Placeholders/**e2e** as the gates | `.github/workflows/quality.yml` has **no** e2e or Playwright step; its real gates are typecheck, lint, **vitest** (`:55-56`), placeholders, 4 copy guards, primary-route-smoke, public-seo-indexing, i18n-debt, build | The workflow | **Medium.** e2e is presented as a gate but enforced nowhere — 24 specs can rot undetected; and the doc omits vitest, the actual blocking gate (712 files, 11,356 tests) |
| **F10** | e2e test surface | `docs/TESTING.md:85-105`: "## Slice 6 test surface — `apps/web/tests/e2e/auth.spec.ts`" + "Re-enable in M1.x" + "M2 will add: … work journal entry" | `apps/web/tests/e2e/` has **24** specs incl. `journal.spec.ts`, `journal-confirm-loop.spec.ts`, `demand-flow.spec.ts`, `market-map-capture-authenticated.spec.ts` | The directory. TESTING.md last changed 2026-06-12 | **Medium.** Contributors can't tell which half of the doc is current |
| **F11** | Roadmap vs shipped | `docs/ROADMAP.md:12,21,61,69,92`: M0 "✅ (current)", M1 "in progress", M3 marketplace, M4 "start of the AI operational layer", "P2 — Billing: Stripe/Montonio" | Shipped on `main`: 41 dashboard modules incl. `service-requests`, `bookings`, `marketplace`, `intelligence`, `candidates`; `lib/ai/` has the agent router + registry + evals; `lib/billing/` has the Stripe scaffold. ROADMAP.md last modified 2026-05-20 | Code — 2 months stale | **Medium.** `docs/PROJECT_ROADMAP.md:3` points at it for sequencing, so planning sessions re-plan shipped milestones |
| **F12** | "Ranked candidate list" | `docs/ROADMAP.md:51-54`: "**ranked candidate list (explained)**" | `README.md:7-9`: "it does not claim automatic matching"; `lib/guards/match-card.test.ts:9` "No fake match, no score/percentage"; `lib/guards/s6-fit.test.ts:78` asserts "recency order, no ranking" | README + guards | **Medium.** A slice scoped from ROADMAP M2 gets blocked by guards *after* implementation |

**F13 (weaker but real).** `docs/APPLIED_LEDGER.md:98` opens "## Deferred (committed/known, NOT
applied)" and `:3-5` calls the file a source of truth for "is it live" — but it lists only **9** of
the **10** genuinely-unapplied migrations. `20260717130000_open_markets_countries_draft_v1.sql` is
missing from the deferred list. Separately, `20260612091000_journal_entry_photos.sql` appears in
neither list — and this audit resolved it: its objects **are** live in prod under different ledger
names, so the file is a superseded duplicate that should be retired rather than tracked.

**Checked and confirmed NOT conflicting** (worth recording so they don't get re-audited):

- **Env / `.env.example`** — no contradiction. The file exists and covers the real `lib/env.ts`
  surface; `README.md:50` and `docs/DEPLOYMENT.md:24` both correctly say to copy it to
  `apps/web/.env.local`. (Minor drift documented at §7.2.)
- **Payments/Stripe** — every doc says payments are off, and code agrees:
  `lib/env.ts:27-29` defaults off, `lib/billing/plans.ts:18` `PAYMENTS_ENABLED = false as const`,
  `lib/billing/lmc-flags.ts:25` `LIVE_PAYMENTS_ENABLED = false as const`.
- **Deploy/merge authority** — `AGENTS.md:88-134` and `CLAUDE.md:67-106` are byte-identical on the
  auto-merge envelope; `docs/PROJECT_ROADMAP.md:40` agrees.
- **Phantom routes** — none evidenced. `PRODUCT_CONSTITUTION.md` and `ROADMAP.md` reference almost
  no literal route paths, so there was nothing concrete to falsify. The roadmap problem is
  staleness (F11), not phantom routes.

---

# 9. Findings

Ordered by **risk**, not by ID — T-21…T-24 were added after the deep-dive pass and sit at their
risk position, so the numbering is deliberately non-sequential. Each finding gives: problem ·
evidence · affected user · affected paths · business impact · risk · fix · acceptance criteria ·
dependencies · effort · suggested loop.

---

### T-01 · Production analytics has never recorded an anonymous visitor — the acquisition funnel is unmeasurable

- **Problem.** All 224 rows in `public.pilot_events` come from **one** profile. `profile_id IS NULL`
  count is **0**. 17 of 34 declared funnel events have zero rows despite all 17 having live
  call-sites in code. The landing→signup funnel — the exact thing paid acquisition needs — produces
  no data.
- **Evidence.** `select count(*) filter (where profile_id is null) … from public.pilot_events`
  → `anon_rows: 0, authed_rows: 224, distinct_profiles: 1, first: 2026-05-31, last: 2026-07-21`.
  Zero-row events with call-site counts: `cta_clicked` (3 sites), `registration_started` (5),
  `onboarding_started` (4), `onboarding_completed` (4), `company_need_submitted` (5),
  `demand_saved` (3), `profile_saved` (2), `role_selected` (2), `login_started` (3), + 8 more.
  `landing_viewed` = 1 row, and since anon = 0 it came from a logged-in user.
  RLS permits it: `pilot_events_insert WITH CHECK ((profile_id IS NULL) OR (profile_id = auth.uid()))`,
  roles = PUBLIC. Grant migration `20260702150000_pilot_events_anon_insert_grant` applied 2026-07-02.
- **Affected user.** The business/owner. Silently — nobody sees an error.
- **Affected paths.** `apps/web/lib/telemetry/{actions.ts,task.ts,attribution.ts}`,
  `apps/web/components/app/marketing-funnel-beacon.tsx`,
  `apps/web/components/app/tracked-cta.tsx`, `public.pilot_events`.
- **Business impact.** Any paid campaign is unattributable. Conversion-rate optimisation is
  impossible. "Are we growing?" cannot be answered from data.
- **Risk.** **Critical.**
- **Fix.** (1) Reproduce in production with an incognito session and capture the actual server-action
  response from `recordPilotEvent` — the action already returns a tagged `{ ok:false, code }`, so the
  failure reason is retrievable. Check `insert_failed` vs the action never firing.
  (2) Whatever the cause, add a standing check: a scheduled query alerting when
  `count(*) where created_at > now() - interval '24 hours'` is 0 while the site is live.
- **Acceptance criteria.** An anonymous incognito visit to `https://labourmarket.ai/lt` produces a
  `landing_viewed` row with `profile_id IS NULL` within 60 s; a click on a `TrackedCta` produces
  `cta_clicked`; a completed signup produces `registration_started` → `login_succeeded` →
  `onboarding_started` → `onboarding_completed` as an ordered chain for one `session_id`.
- **Dependencies.** None (no migration, no schema change).
- **Effort.** 0.5–1 day to diagnose + fix; 0.5 day for the alert.
- **Loop.** Live-browser loop (reproduce), then a dedicated telemetry-repair slice.

---

### T-02 · `docs/DEPLOYMENT.md` gives instructions that would damage production

- **Problem.** Three separate statements in the repo's only DB/deploy runbook are factually
  inverted, and one of them is an actively destructive instruction.
- **Evidence.** `docs/DEPLOYMENT.md:29-31`: "The Supabase project … already exists but is **empty**.
  The migration files are committed and ready; **no agent has applied them**" — prod has 156 ledger
  rows and 126 tables. `:42-52`: "`pnpm db:push` runs `supabase db push`, which applies everything
  in `supabase/migrations/` in order" — banned by `CLAUDE.md:93-94` and `AGENTS.md:120-122`
  precisely because "a push would re-run applied migrations"; the script still exists at
  `package.json:23`. `:3-5` cites the superseded v2 two-origin domain policy that
  `apps/web/lib/domain/canonical.ts:16-22` says "must NEVER" return.
- **Affected user.** Any new operator, contractor or agent session.
- **Affected paths.** `docs/DEPLOYMENT.md`, `package.json:23`.
- **Business impact.** Following the runbook could re-run ~161 migrations against a live database
  with 27 real users' data. Recovery would be a restore.
- **Risk.** **Critical.**
- **Fix.** Rewrite `docs/DEPLOYMENT.md`. Delete the "empty database" section. Replace `db:push` with
  the MCP `apply_migration` procedure that `APPLIED_LEDGER.md` documents. Correct the domain
  section to v3. Strongly consider removing the `db:push` script from `package.json` entirely, or
  renaming it `db:push:LOCAL_ONLY` with a guard that refuses a non-localhost `SUPABASE_URL`.
- **Acceptance criteria.** No repo file instructs `supabase db push` against a remote project;
  `docs/DEPLOYMENT.md` states the true prod DB state and the real apply procedure; a grep for
  `app.labourmarket.ai` in `docs/DEPLOYMENT.md` returns only legacy-alias context.
- **Dependencies.** Resolve F1 first (see T-03) so the rewritten doc states one policy.
- **Effort.** 2–4 hours.
- **Loop.** Documentation-repair loop.

---

### T-03 · `CLAUDE.md` and `AGENTS.md` state opposite rules for production migrations

- **Problem.** Both files are auto-loaded into every agent session. One forbids automatic prod
  migration apply absolutely; the other grants conditional autonomy. Three more docs side with the
  ban.
- **Evidence.** `CLAUDE.md:55-57`: "Running migrations on production — **NEVER automatic.** Agents
  never run `pnpm supabase db push` or `prisma migrate deploy` against production. DI runs migrations
  manually…" vs `AGENTS.md:55-58`: "**PROD APPLY AUTONOMY (conditional — DI decision 2026-06-12).**
  The old hard blocker ('running migrations on production is NEVER automatic') is replaced. The
  executing agent MAY apply a **merged** migration to prod via Supabase MCP `apply_migration` when
  **ALL** hold". Also on the ban side: `README.md:77-80`, `docs/APPLIED_LEDGER.md:6-8`,
  `docs/DEPLOYMENT.md:7-8`. Observed practice matches AGENTS.md (July ledger rows stamped
  "DI … + Claude Code"). Secondary contradictions in the same pair: F5 ("demo" banned vs mandated)
  and F8 (rollback form).
- **Affected user.** Every future agent session, and through it the production database.
- **Affected paths.** `CLAUDE.md`, `AGENTS.md`, `README.md`, `docs/APPLIED_LEDGER.md`,
  `docs/DEPLOYMENT.md`, `docs/PLATFORM_DOCTRINE.md`.
- **Business impact.** Non-deterministic behaviour on the single most dangerous operation in the
  system. An agent reading CLAUDE.md stalls; one reading AGENTS.md self-applies.
- **Risk.** **Critical.**
- **Fix.** Pick one policy by owner decision. Make one file canonical for it and have the other
  `@`-reference rather than restate. Add a guard test that fails if the two files' policy sections
  diverge (they are already near-byte-identical, so a hash comparison of the shared blocks is
  feasible — the same technique `landing-freeze.test.ts` already uses).
- **Acceptance criteria.** Exactly one file states the prod-apply rule; the other references it;
  `README.md`, `APPLIED_LEDGER.md`, `DEPLOYMENT.md` and `PLATFORM_DOCTRINE.md` all agree; a guard
  test fails on divergence.
- **Dependencies.** Owner decision on which policy is current.
- **Effort.** 2 hours + 1 hour for the guard.
- **Loop.** Owner decision, then documentation-repair loop.

---

### T-04 · Ten committed migrations are unapplied; eight shipped features are silently dead in production

- **Problem.** 161 migration files vs 156 ledger rows. Ten migrations were merged to `main` and
  never applied. Eight code modules query the resulting tables. All degrade silently — nothing tells
  the operator the feature is off.
- **Evidence.** Name-normalised diff (§3.3) plus per-object `to_regclass` verification: `ai_runs`,
  `company_locations`, `dashboard_preferences`, `demand_interest_seen`, `worker_opportunity_seen`,
  `journal_profession_templates`, `agency_clients`, `worker_external_profiles` all return `null` in
  production. Consuming code: `lib/ai/runtime/audit-store.ts:154,185`;
  `lib/company/company-locations.ts:41`; `lib/dashboard/preferences.ts:47` +
  `preferences-actions.ts:63`; `lib/journal/journal-templates.ts:35`; `lib/opportunities/seen.ts:67`;
  `lib/agency/clients.ts:37`.
- **Affected user.** Workers (opportunity "seen" state, journal templates), companies (locations,
  agency clients), owner (AI cost auditing), everyone (dashboard card preferences don't persist).
- **Affected paths.** The 10 files in `supabase/migrations/` listed in §3.3 + the 8 lib modules.
- **Business impact.** Shipped, tested, reviewed work produces zero user value. AI spend is
  untracked in prod because `ai_runs` doesn't exist. `docs/APPLIED_LEDGER.md` lists only 9 of the 10,
  so even the tracking is incomplete.
- **Risk.** **High.**
- **Fix.** Owner-gated: triage the 10 into apply / retire. Retire
  `20260612091000_journal_entry_photos.sql` outright (its objects are already live under different
  ledger names — verified). Then add a CI check that compares `supabase/migrations/*.sql` against a
  committed ledger snapshot and fails when a migration has been on `main` for more than N days
  without appearing.
- **Acceptance criteria.** Every migration file on `main` is either in the prod ledger or listed in
  `docs/APPLIED_LEDGER.md`'s Deferred section with a reason; a CI check enforces this; the 8 modules
  either reach live tables or their feature surfaces are explicitly hidden via
  `lib/config/feature-availability.ts`.
- **Dependencies.** Owner approval per migration (hard gate). T-03 resolution defines who may apply.
- **Effort.** 1 day triage + apply; 0.5 day for the drift check.
- **Loop.** Owner-gated migration slice.

---

### T-05 · 674 `supabase as any` casts, driven by stale generated types

- **Problem.** 674 occurrences of `supabase as any` / `asAny(` across 176 non-test files. The
  Supabase client is the primary data boundary in the app and it is largely untyped, so schema
  changes cannot be caught by `tsc`.
- **Evidence.** `grep -rn "supabase as any\|asAny(" lib app --include=*.ts --include=*.tsx | grep -v '\.test\.'`
  → 674 hits / 176 files. Root cause is verifiable: `lib/supabase/types.ts` mtime is
  `2026-07-19 12:55`, but `20260720190000_lmc_ledger_foundation_v1.sql` landed `2026-07-21 16:27`
  and is **applied in prod** — `lmc_accounts`, `lmc_lots`, `lmc_lot_consumptions`, `lmc_settings`,
  `lmc_transactions` all exist in production and **none** appear in `types.ts`. Second cause is the
  unapplied migrations of T-04; `lib/company/company-locations.ts:39` even carries an explicit
  `// eslint-disable-next-line @typescript-eslint/no-explicit-any` above `(supabase as any)`.
- **Affected user.** Developers; indirectly all users, since a schema/code mismatch surfaces as a
  runtime error rather than a build failure.
- **Affected paths.** `apps/web/lib/supabase/types.ts` + 176 consuming files, concentrated in
  `lib/admin/` and `app/[locale]/dashboard/**/page.tsx`.
- **Business impact.** The strongest safety net the stack offers (strict TS + generated DB types) is
  disabled exactly where mistakes are most expensive. Typecheck passing with exit 0 is less
  reassuring than it looks.
- **Risk.** **High.**
- **Fix.** (1) Run `pnpm db:types` and commit — instant, zero-risk, recovers the 5 LMC tables.
  (2) Add a CI step that regenerates types and fails if the committed file differs (secret-free is
  not possible here — it needs the project ref, which is already public in `package.json:22` — but
  it needs no key for a public schema dump; if that proves impractical, a staleness check comparing
  `types.ts` mtime against the newest migration is a cheap proxy).
  (3) Sweep casts in descending file-count order; most will delete mechanically once types are fresh.
- **Acceptance criteria.** `lib/supabase/types.ts` contains every table in the prod `public` schema;
  CI fails when it drifts; the `supabase as any` count drops below 200.
- **Dependencies.** T-04 (unapplied migrations account for a chunk of the remainder).
- **Effort.** 1 hour for (1)+(2); 2–4 days for the full sweep.
- **Loop.** Type-safety slice.

---

### T-06 · 131 of 132 route segments have no error boundary; streaming is unused

- **Problem.** The whole application shares a single error boundary at `app/[locale]/error.tsx`.
  Any uncaught error in any module blanks the whole locale subtree with a generic screen and no
  segment context. With 5 `<Suspense>` elements against 115 pages — 3 of them `fallback={null}` —
  streaming is effectively unused, so a slow server component blocks its entire route.
- **Evidence.** `find app -name "page.tsx" -o -name "route.ts" | xargs -n1 dirname | sort -u | wc -l`
  → **132** route segments. Only **1** has an `error.tsx` (`app/[locale]/error.tsx`); only **3**
  have a `loading.tsx` (`app/[locale]/cv/`, `.../dashboard/`, `.../onboarding/`). Verified absent
  from: all 41 dashboard sub-routes, all 22 admin sub-pages, all 26 marketing segments, all 4 auth
  pages, `business/[slug]`, `invite/[token]`, `[...rest]`.
  `grep -rn "<Suspense" app components --include=*.tsx | grep -v '\.test\.'` → 5 real elements
  (login `:16`, signup `:16`, `dashboard/layout.tsx:186`, `dashboard/page.tsx:568`, `:875`); 0 in
  `components/`. A raw grep says 8 — three are comments.
- **Why CI is green on this.** `lib/guards/loading-error-state-coverage.test.ts` exists but
  explicitly exempts SSR pages: *"SSR dashboard pages… their failures throw to the framework error
  boundary — so they are exempt AS LONG AS they stay server components."* The guard encodes a
  decision that has become a liability.
- **Affected user.** Everyone. Worst for workers on slow mobile connections, where a single slow
  loader stalls a whole page.
- **Affected paths.** `apps/web/app/[locale]/**`.
- **Business impact.** One module's bug reads to the user as "the whole product is broken".
  Perceived performance is worse than actual performance because nothing streams.
- **Risk.** **High.**
- **Fix.** Add `error.tsx` at `app/[locale]/dashboard/`, `app/[locale]/dashboard/admin/`,
  `app/[locale]/(marketing)/` and `app/[locale]/auth/` at minimum, each with a localized recovery
  action. Add `<Suspense>` around the independent data regions of the four heaviest dashboard pages
  (`journal`, `profile`, `dashboard`, `company`) with skeleton fallbacks. Replace the three
  `fallback={null}` boundaries with visible skeletons. Then narrow the SSR exemption in
  `loading-error-state-coverage.test.ts` so the guard starts enforcing the new baseline.
- **Acceptance criteria.** A thrown error in any dashboard sub-route renders a scoped error UI with
  the nav intact; the four heaviest pages stream their shell before their data; the coverage guard
  no longer blanket-exempts SSR pages.
- **Dependencies.** None.
- **Effort.** 1–2 days.
- **Loop.** Resilience/UX slice.

---

### T-21 · N+1 query loop on the core worker page adds ≈50–90 sequential queries per render

- **Problem.** `/dashboard/journal` — the most-used surface in the product — runs a full
  skill-recognition pipeline inside a `for` loop on every page render.
- **Evidence.** `app/[locale]/dashboard/journal/page.tsx:422`:
  `for (const e of stale) { try { await processJournalEntrySkills({ …`. `stale` is `.slice(0, 5)`
  (`:421`). `processJournalEntrySkills` (`lib/journal/skill-pipeline.ts:353-690`) issues
  `createClient` + `auth.getUser` + `workers` + `journal_entries` + 2 reads in
  `loadEntryRecognitionInputs` + `skills` select + `worker_skills` upsert + `journal_entry_skills`
  select+upsert + `skill_candidate_clarifications` upsert + `profile_skill_claims` select +
  3–4 `journal_entry_metrics` inserts + a reconcile — **≈10–18 round-trips per entry**, ×5.
  The same page separately runs 9 sequential independent reads, two of which
  (`:279` and `:292`) read the **same** `worker_skills` rows twice with different projections.
  Second-worst: `app/[locale]/dashboard/projects/page.tsx:113` maps over up to **100** projects
  (`lib/projects/projects.ts:50` `.limit(100)`), each awaiting `listProjectAssignments` which
  constructs its own client. Third: `app/[locale]/dashboard/company/page.tsx:170` — 12 gallery
  summaries × (1 client + 2 head-counts). Full inventory at §3.5.
- **Affected user.** Workers, on the page they use most (`journal_*` events dominate the telemetry
  that exists: `journal_edit_clicked` 21, `journal_new_skill_added` 13, `journal_save_success` 11).
- **Affected paths.** `app/[locale]/dashboard/journal/page.tsx:422`,
  `app/[locale]/dashboard/projects/page.tsx:113`, `app/[locale]/dashboard/company/page.tsx:170`,
  `lib/admin/matching-workbench.ts:652`, `lib/company/team-brigades.ts:453`,
  `lib/communication/attachments.ts:79`, and 4 more.
- **Business impact.** Slow TTFB on the core loop, at 27 users. This scales linearly with entry
  count and user count, so it degrades exactly when the product starts working.
- **Risk.** **High.**
- **Fix.** Move the stale-entry heal off the render path entirely — it is already available as an
  admin-triggered action (`lib/journal/skill-pipeline-actions.ts:170`), so the page should read
  recognition state and enqueue healing, not perform it. Batch the 9 independent reads into
  `Promise.all` and delete the duplicate `worker_skills` read. Batch `listProjectAssignments` into
  one `.in(projectIds)` query. The pattern to copy already exists in-repo:
  `app/[locale]/dashboard/page.tsx:189` batches 6 reads with an explicit comment about the prior
  "~8 network round-trips".
- **Acceptance criteria.** `/dashboard/journal` issues ≤ 12 queries per render (measurable from
  Supabase logs); `/dashboard/projects` issues a constant number regardless of project count;
  existing journal guard tests pass unchanged.
- **Dependencies.** None.
- **Effort.** 2–3 days.
- **Loop.** Performance slice (pair with T-07).

---

### T-22 · Journal CSV export silently downloads an empty file when the read fails

- **Problem.** The journal export route never inspects its Supabase errors and maps over
  `data ?? []`, so a failed read produces a **valid, well-formed, empty CSV** rather than an error.
- **Evidence.** `app/[locale]/dashboard/journal/export/route.ts:64` —
  `(entriesRes.data ?? []).map(...)`; neither `entriesRes.error` nor `linksRes.error` is checked
  anywhere in the file. The route has no try/catch around its body and returns only 401/403.
  Three guard tests reference this file (`lib/guards/journal-export-honesty.test.ts:54`,
  `universal-search-reports.test.ts:453`, `document-centre.test.ts:307`) and none can detect it,
  because all three are source-text assertions.
- **Affected user.** Workers exporting their work journal — often the moment they most need it
  (leaving a job, applying elsewhere, a dispute).
- **Affected paths.** `apps/web/app/[locale]/dashboard/journal/export/route.ts`. Sibling exports
  `privacy/export/route.ts` and `finance/export/route.ts` share the no-try/catch shape;
  `lib/privacy/export-data.ts` has zero `try {` blocks.
- **Business impact.** Direct trust damage on a GDPR-adjacent feature: a worker concludes their
  journal is empty. It is also a data-portability compliance concern, since the export silently
  returns incomplete data rather than failing.
- **Risk.** **High** (low probability, high trust cost, silent).
- **Fix.** Check both `error` fields; return a typed 500 on failure. Wrap all three export routes
  in try/catch. Add a behavioural test (not a source guard) asserting that a mocked Supabase error
  yields a non-200 and no CSV body.
- **Acceptance criteria.** A forced read error on each of the three export routes returns a typed
  error response, never a 200 with an empty payload; a vitest test executes the handler and proves it.
- **Dependencies.** None.
- **Effort.** 4 hours.
- **Loop.** Correctness slice — ship with T-23.

---

### T-23 · 14 of 17 API route handlers have zero executed-code test coverage

- **Problem.** Despite 11,356 passing tests, only **3** route modules are ever imported and run by
  a test. Everything else is covered by source-text guards (`readFileSync` + regex) or by unit tests
  of extracted helpers — neither executes the handler, its auth check, its error paths or its
  response shape.
- **Evidence.** The only three behavioural route tests in the repo:
  `lib/auth/callback-route.test.ts:22` (`import { GET } from "@/app/[locale]/auth/callback/route"`),
  `lib/auth/google-route.test.ts:36` (`POST`), `lib/auth/logout-route.test.ts:27`.
  Uncovered by executed code: `app/api/billing/webhook/route.ts` (source-pin only —
  `lib/guards/billing-readiness.test.ts:155` asserts the *string* `assertTestEvent` appears),
  `app/api/billing/test-checkout/route.ts`, `app/api/cv/extract/route.ts`,
  `app/api/waitlist/route.ts`, `app/api/leads/route.ts`, `app/api/dashboard-search/route.ts`,
  the three export routes, `app/api/professions/[professionId]/skills/route.ts`,
  `app/api/workers/[workerId]/skills/route.ts` + `[skillId]/route.ts`,
  `app/questions-sitemap.xml/route.ts`, `projects/[id]/operations/report/route.ts`.
  Only 3 of 17 have a real try/catch around the whole body; 2 more wrap only `req.json()` and
  present as guarded (`billing/test-checkout/route.ts:25-29`, `cv/extract/route.ts:38-44`).
  `app/api/billing/webhook/route.ts:97` returns **HTTP 200 on failure**, so Stripe never retries.
  `app/api/waitlist/route.ts:44` calls `requireSupabaseClientEnv()` which **throws** unguarded.
- **Affected user.** Everyone. The uncovered set includes payment processing, CV upload, public
  lead capture and every data export.
- **Affected paths.** The 14 route files above.
- **Business impact.** The "11,356 tests pass" signal materially overstates confidence. Combined
  with T-10 (no error monitoring) and T-01 (no analytics), a broken API route in production is
  invisible on three independent axes at once.
- **Risk.** **High.**
- **Fix.** Write behavioural tests that import and invoke each handler with a mocked Supabase
  client — the pattern already exists and works well in `lib/auth/callback-route.test.ts` and
  `google-route.test.ts`. Prioritise: billing webhook, cv/extract, the three exports, waitlist,
  leads. Fix the webhook's 200-on-failure and the waitlist's unguarded throw as part of the same slice.
- **Acceptance criteria.** Every route under `app/api/**` and every export route has at least one
  test that imports the handler and asserts both a success and a failure response; the webhook
  returns a 5xx on processing failure so Stripe retries.
- **Dependencies.** None (all mockable — no live Stripe or Supabase needed).
- **Effort.** 3–4 days.
- **Loop.** Test-coverage slice.

---

### T-24 · 217 dropped Supabase errors, including two access checks

- **Problem.** 217 non-test call sites destructure `data` from a Supabase response without binding
  `error` at all, so failures are indistinguishable from empty results.
- **Evidence.** Regex over all non-test `.ts/.tsx` in `lib/`, `app/`, `components/` for
  `const { data… } = await <supabase call>` with no `error` binding (excluding
  `auth.getUser`/`getSession`) → **217**. Worst files: `lib/journal/skill-pipeline-actions.ts` (10),
  `lib/journal/actions.ts` (8), `lib/journal/confirm-actions.ts` (7),
  `lib/journal/journal-entry-skills-actions.ts` (7), `lib/market-map/signals.ts` (7),
  `lib/scouting/scouting.ts` (7), `app/[locale]/dashboard/profile/page.tsx` (6), `lib/skills.ts` (5),
  `lib/admin/matching-workbench.ts` (5), `lib/projects/worker-project-access.ts` (5).
  One case destructures the error and never reads it:
  `app/[locale]/dashboard/admin/page.tsx:97` (`companyErr`).
- **Affected user.** Workers and companies — silently wrong or empty screens instead of an error.
- **Affected paths.** The 10 files above account for ~67 of the 217.
- **Business impact.** Every dropped error is a place where an outage or RLS change presents as
  "you have no data" instead of "something went wrong". Given T-10 (no monitoring), these are
  permanently invisible.
- **Risk.** **Medium-High.** The two access-check instances deserve separate note:
  `lib/skills.ts:25` (`ownsWorker`) returns `Boolean(data)`, so a read error reads as "not the
  owner" — it fails **closed**, so it is safe, but the resulting 403 misreports the cause.
  `lib/projects/worker-project-access.ts` repeats the pattern.
- **Fix.** Sweep the top 10 files first. Introduce a small `unwrap()` helper that throws or returns
  a tagged result, and an ESLint rule or guard test banning `const { data } = await supabase` with
  no error binding in `lib/**` and `app/**`.
- **Acceptance criteria.** Zero dropped-error sites in the 10 worst files; a guard prevents new
  ones; `ownsWorker` distinguishes "read failed" from "not owner".
- **Dependencies.** None.
- **Effort.** 2–3 days for the top 10 + guard; longer for the tail.
- **Loop.** Correctness slice.

---

### T-07 · Auth pages ship ~210 kB of JS for a ~2 kB form

- **Problem.** The five surfaces every acquired user hits first carry the third-heaviest payloads
  in the app, disproportionate to their content.
- **Evidence.** From the real build route table: `/[locale]/auth/login` **211 kB** First Load for a
  **1.93 kB** page; `/auth/signup` 212 kB / 2.41 kB; `/auth/reset-password` 207 kB / 1.35 kB;
  `/auth/forgot-password` 206 kB / 1.32 kB; `/for-workers` 202 kB / 1.32 kB. Shared baseline is
  103 kB, so ~107 kB of route-specific JS sits behind each. For contrast, `/[locale]/about` is
  120 kB and `/pricing` is 131 kB.
- **Affected user.** Every new visitor, most acutely on mobile data — the core worker persona.
- **Affected paths.** `apps/web/app/[locale]/auth/**`, `app/[locale]/(marketing)/for-workers/`,
  and whatever shared client component they pull in (the 107 kB delta is common to all five, which
  points at one shared import — likely the auth context or a heavy form/animation dependency).
- **Business impact.** Slower first paint on the exact pages where drop-off is most expensive.
  Compounds T-01: the funnel that loses these users is also the funnel that is not measured.
- **Risk.** **Medium-High.**
- **Fix.** Trace the shared 107 kB chunk (`next build` + bundle analyzer, or inspect the shared
  chunk membership for these five routes). Likely candidates given the dependency list:
  `framer-motion` (12.39) pulled into an auth-page animation, or `lib/auth/context.tsx` importing
  transitively. Lazy-load or drop it on auth routes.
- **Acceptance criteria.** `/auth/login` First Load JS ≤ 140 kB with no functional regression;
  the four sibling auth routes and `/for-workers` drop proportionally.
- **Dependencies.** None.
- **Effort.** 0.5–1 day to diagnose, 1 day to fix.
- **Loop.** Performance slice (pair with the live-browser loop for before/after Core Web Vitals).

---

### T-08 · Five stale docs make QA and SEO work silently skip `/nl` and `/de`

- **Problem.** NL and DE have been live routed locales since 2026-07-11 with full 7,355-key parity,
  but the *binding* doctrine and five launch/readiness docs still say the active set is `lt/en/ru`.
- **Evidence.** `apps/web/lib/i18n/config.ts:39` `activeLocales = ["lt","en","ru","nl","de"]`; build
  prerenders 846 pages across 5 locales; measured key parity `nl: 7355 (0 missing)`,
  `de: 7355 (0 missing)`. Against: `docs/PLATFORM_DOCTRINE.md:66` §2.4 "ACTIVE locales (lt, en, ru)"
  — and `CLAUDE.md:3` declares the doctrine wins on conflict;
  `docs/launch/real-user-launch-work-project-operations-train-v1.md:13-14` (merged 2026-07-18);
  `docs/launch/README.md:33`; `docs/launch/known-limits.md:32`;
  `docs/launch/final-launch-readiness-report.md:4`;
  `docs/launch/full-project-mobile-root-cause-audit-v1.md:232` ("Active locales are **lt/en/ru
  only** (`lib/i18n/config.ts:38`)" — wrong line number too).
- **Affected user.** Dutch and German visitors — the two markets where copy has had **zero** human
  review (`config.ts:44-46`: RU/NL/DE are "AI-seeded full translations pending human review";
  `tier1Locales = ["en","lt"]`).
- **Affected paths.** `docs/PLATFORM_DOCTRINE.md`, `docs/launch/*` (5 files),
  `apps/web/lib/i18n/config.ts` (as the truth).
- **Business impact.** Two full-coverage live markets get no QA scope, no SEO scope and no
  human-language review, because every planning doc says they don't exist yet.
- **Risk.** **High.**
- **Fix.** Amend `PLATFORM_DOCTRINE.md` §2.4 to the real 5-locale active set with the 2026-07-11
  date. Add a guard test that asserts the doctrine's stated active set matches
  `lib/i18n/config.ts` `activeLocales` (the repo already has 514 guards of exactly this shape —
  e.g. `lib/guards/localization-launch-scope.test.ts`). Correct or date-stamp the 5 launch docs.
  Separately, schedule human review of NL and DE copy.
- **Acceptance criteria.** No repo doc states an active locale set that differs from
  `config.ts:39`; a guard test enforces it; NL and DE appear in QA and SEO scope.
- **Dependencies.** None for the docs; NL/DE human review needs native reviewers.
- **Effort.** 3 hours (docs + guard). Human copy review is separate and larger.
- **Loop.** Documentation-repair loop; then a localization-quality loop for NL/DE.

---

### T-09 · Public marketing copy is hardcoded in three page files, invisible to every i18n guard

- **Problem.** 180 lines of inline `{ en, lt, ru, nl, de }` object literals across 6 components
  bypass `next-intl` and `messages/*.json` entirely. Three of the six are public SEO-indexed
  marketing pages.
- **Evidence.** `app/[locale]/(marketing)/work-opportunities/page.tsx` (**65** inline locale lines),
  `.../skills/page.tsx` (**55**), `.../professions/page.tsx` (**45**),
  `components/marketing/locale-switcher.tsx` (5), `components/app/demand-advanced-sections.tsx` (5),
  `components/app/command-finder.tsx` (5). Example — `professions/page.tsx:96-97`:
  `construction: { en: "Construction", lt: "Statyba", ru: "Строительство", nl: "Bouw", de: "Bau" },`
  and `:67-68` carries a full 250-character LT/RU marketing paragraph inline.
- **Affected user.** Every visitor to those three public pages, in every language.
- **Affected paths.** The 6 files above.
- **Business impact.** This copy is invisible to `check:i18n-debt`, to
  `lib/guards/i18n-lt-en-parity.test.ts` and to any translation-review workflow — so the platform's
  otherwise-perfect parity guarantee has three holes in exactly the highest-traffic public pages.
  It is also structurally incapable of a 6th locale: promoting `pl` would leave these pages
  falling back while every other page translates.
- **Risk.** **Medium.**
- **Fix.** Migrate the three marketing pages' copy into `messages/*.json` under their own
  namespaces. Extend the i18n guard to fail on inline `{ en: "…", lt: "…" }` object literals in
  `app/**` and `components/**`, with an explicit allowlist for `locale-switcher.tsx` (where
  self-language names are correct).
- **Acceptance criteria.** No user-facing copy literal outside `messages/`; a guard test enforces
  it; the three pages' key counts appear in the parity check.
- **Dependencies.** None.
- **Effort.** 1 day + 2 hours for the guard.
- **Loop.** Localization slice.

---

### T-10 · No error monitoring in production

- **Problem.** Zero application error monitoring. No Sentry, no OpenTelemetry, no Datadog anywhere
  in source. 136 `console.error` sites emit into Vercel runtime logs, which nobody watches and which
  have no retention guarantee, no grouping, no alerting and no release correlation.
- **Evidence.** `grep -rln "sentry\|opentelemetry\|datadog"` across the repo matches only `.next/`
  build artifacts. `grep -rn "console.error" lib app --include=*.ts --include=*.tsx | grep -v test`
  → 136. The only push channel is `lib/notifications/telegram-owner-alerts.ts`, gated on
  `OWNER_TELEGRAM_ALERTS_ENABLED`. The one place with a genuine error-recording design
  (`lib/ai/runtime/audit-store.ts` → `ai_runs`) writes to a table that **does not exist in
  production** (T-04).
- **Affected user.** Everyone — a user hitting a 500 has no path to being noticed.
- **Affected paths.** Whole app.
- **Business impact.** Compounds T-01 catastrophically: with no anon analytics **and** no error
  monitoring, a broken signup flow in production would be completely invisible until someone
  manually tried it. This is plausibly the explanation for T-01 itself.
- **Risk.** **High.**
- **Fix.** Add Sentry (or equivalent) with the Next.js SDK: server + edge + client, release tagging
  from the Vercel commit SHA, and PII scrubbing consistent with the existing telemetry privacy
  contract (`lib/telemetry/funnel-events.ts:18-22` is a ready-made allowlist to mirror).
- **Acceptance criteria.** A deliberately thrown error in a dashboard route appears in the
  monitoring tool within 60 s with a stack trace, release SHA and route — and no email, name, phone,
  CV text or journal body in the payload.
- **Dependencies.** New third-party service — **owner gate** (new vendor, new secret, GDPR
  processor assessment for an EU labour-market product handling worker data).
- **Effort.** 1 day integration; owner decision is the long pole.
- **Loop.** Observability slice (owner-gated).

---

### T-11 · 53 core-schema migrations have no rollback path

- **Problem.** 161 migrations vs 93 rollback files. 69 are unpaired; **53** of those touch DDL.
- **Evidence.** Scripted pairing of `supabase/migrations/*.sql` against
  `supabase/rollbacks/*.down.sql`. All 69 unpaired files predate 2026-06-12. Oldest:
  `0001_initial_schema.sql`, `0003_multi_role.sql`, `0005_waitlist.sql`, `0008_professions.sql`,
  `0009_auth_role_architecture_v1.sql`. Newest: `20260612091000_journal_entry_photos.sql`.
  Everything from 2026-06-12 onward is 100 % covered, enforced by
  `.github/scripts/migration-safety.mjs:277-284` (`missing-rollback-file`).
- **Affected user.** Nobody today; everybody during a failed schema change on the core tables.
- **Affected paths.** `supabase/migrations/` (the 53 files), `supabase/rollbacks/`.
- **Business impact.** The migrations with no rollback are precisely the ones that built the
  foundation — profiles, roles, journal, ESCO taxonomy (1.04 M rows), communication, customer
  requests, work instructions. A bad forward change touching those has no scripted reversal.
- **Risk.** **Medium** (low probability, high consequence — these are settled tables).
- **Fix.** Do **not** retro-write 53 rollbacks. Instead: (a) document explicitly in
  `docs/APPLIED_LEDGER.md` that pre-2026-06-12 migrations are covered by point-in-time restore only,
  (b) verify and document the Supabase PITR window and a tested restore procedure, (c) leave the
  forward-looking CI gate as-is.
- **Acceptance criteria.** A documented, **rehearsed** PITR restore procedure with a measured RTO;
  `APPLIED_LEDGER.md` states the pre-2026-06-12 rollback gap explicitly.
- **Dependencies.** Supabase plan must include PITR — **verify**; this audit did not check the plan tier.
- **Effort.** 0.5 day docs + 0.5 day restore rehearsal (against a branch, never prod).
- **Loop.** Operations/DR slice.

---

### T-12 · `journal-entry-composer.tsx` is 2,621 LOC on the heaviest route

- **Problem.** The single largest hand-written file in the repo is a `"use client"` component on the
  heaviest route, containing at least three duplicated editor modes, with a near-duplicate sibling.
- **Evidence.** `components/app/journal-entry-composer.tsx` = **2,621 LOC**. Sibling
  `components/app/journal-entry-compact-editor.tsx` = **837 LOC**. Their route,
  `/[locale]/dashboard/journal`, is the heaviest in the app at **319 kB** First Load JS, and its
  page file is another **1,178 LOC**. The same engagement/date field group is repeated at
  `:1987-1993` and `:2490-2496`. Supporting logic is spread across `lib/journal/actions.ts`
  (1,151 LOC), `lib/journal/skill-pipeline.ts` (780) and `lib/journal/skill-pipeline-actions.ts` (792).
- **Affected user.** Workers — the journal is the core worker loop and the most-used surface
  (`journal_*` events dominate `pilot_events`: `journal_edit_clicked` 21, `journal_new_skill_added`
  13, `journal_save_success` 11, `journal_viewed` 11).
- **Affected paths.** `apps/web/components/app/journal-entry-composer.tsx`,
  `journal-entry-compact-editor.tsx`, `app/[locale]/dashboard/journal/page.tsx`, `lib/journal/*`.
- **Business impact.** Highest change-risk file in the product sits on the highest-value flow.
  It is also the largest single bundle lever available.
- **Risk.** **Medium.**
- **Fix.** Split by mode into separate lazily-loaded components sharing one field-group primitive;
  extract the repeated engagement/date group; deduplicate against `journal-entry-compact-editor.tsx`.
- **Acceptance criteria.** No journal component exceeds 600 LOC; `/dashboard/journal` First Load JS
  ≤ 220 kB; the existing journal guard tests (`journal-atomic-supersede`, `journal-compact-edit`,
  `journal-photo-continuity`, `journal-evidence-loop`, `journal-cv-recall`) still pass unchanged.
- **Dependencies.** None — the guard coverage here is unusually strong, which makes this refactor
  safer than it looks.
- **Effort.** 3–5 days.
- **Loop.** Refactor slice.

---

### T-13 · Playwright e2e exists, is documented as a gate, and runs nowhere

- **Problem.** 24 e2e specs covering auth, journal, demand, CV upload, RLS visibility, market-map
  and admin flows are in no CI workflow. `docs/TESTING.md` presents e2e as a gate.
- **Evidence.** `apps/web/tests/e2e/` contains 24 `.spec.ts` files. Neither
  `.github/workflows/quality.yml` nor `migration-safety.yml` mentions `e2e` or `playwright`.
  `docs/TESTING.md:6-14` lists e2e in the "Gate matrix" — and omits vitest, which *is* the blocking
  gate (712 files, 11,356 tests). `docs/TESTING.md:85-105` still describes a single-file suite and
  says "Re-enable in M1.x" / "M2 will add: … work journal entry" for specs that already exist.
- **Affected user.** Everyone — integration regressions reach production.
- **Affected paths.** `apps/web/tests/e2e/**`, `.github/workflows/quality.yml`, `docs/TESTING.md`.
- **Business impact.** The unit suite is enormous but the guard tests are overwhelmingly *static
  source assertions* (514 of 712 files live in `lib/guards/` and mostly grep source and message
  files). Actual end-to-end behaviour — can a worker sign up, upload a CV, save a journal entry and
  see a skill? — is verified by nothing automated.
- **Risk.** **Medium-High.**
- **Fix.** Add an e2e job to `quality.yml` against a Supabase preview/branch DB, or a nightly
  scheduled run against a seeded environment. Rewrite `docs/TESTING.md` to describe the real gates.
- **Acceptance criteria.** e2e runs on a schedule at minimum, with failures visible; `TESTING.md`
  lists vitest as a gate and states e2e's real trigger.
- **Dependencies.** A test Supabase project / branch + `SUPABASE_TEST_URL` secret — the specs
  already skip cleanly without it. Adding a secret is an **owner gate**.
- **Effort.** 1–2 days.
- **Loop.** CI slice (owner-gated on the secret).

---

### T-14 · Two Supabase auth hardening toggles are off

- **Problem.** Leaked-password protection is disabled and email OTP expiry exceeds one hour.
- **Evidence.** Supabase security advisors: `auth_leaked_password_protection` — "Supabase Auth
  prevents the use of compromised passwords by checking against HaveIBeenPwned.org. Enable this
  feature to enhance security."; `auth_otp_long_expiry` — "OTP expiry set to more than an hour …
  recommended to set this value to less than an hour."
- **Affected user.** Every account holder.
- **Affected paths.** Supabase Dashboard → Authentication settings. **No code change.**
- **Business impact.** Credential-stuffing exposure and a wide OTP replay window on a platform
  holding worker employment history and identity documents.
- **Risk.** **Medium.**
- **Fix.** Enable leaked-password protection; set OTP expiry to ≤ 3600 s.
- **Acceptance criteria.** Both advisories clear on the next `get_advisors` run.
- **Dependencies.** Owner dashboard access. Two toggles.
- **Effort.** 10 minutes.
- **Loop.** Immediate owner action.

---

### T-15 · Five public marketing pages have no `generateMetadata`

- **Problem.** 22 of 27 `(marketing)` pages define localized metadata; 5 do not, including the
  dynamic per-country landing page.
- **Evidence.** No `generateMetadata` in
  `app/[locale]/(marketing)/labour-market/[country]/page.tsx`,
  `.../match-preview/page.tsx`, `.../legal/legal-notice/page.tsx`,
  `.../legal/marketplace-rules/page.tsx`, `.../legal/terms/page.tsx`.
- **Affected user.** Search engines, and through them every organic visitor.
- **Affected paths.** The 5 files above.
- **Business impact.** `labour-market/[country]` multiplied across 5 active locales is a large
  SEO surface shipping generic inherited titles and no per-page canonical or hreflang.
- **Risk.** **Medium.**
- **Fix.** Add `generateMetadata` using the existing `lib/seo/metadata.ts` helper. Extend
  `scripts/check-public-seo-indexing.ts` to fail when a `(marketing)` page lacks it.
- **Acceptance criteria.** Every `(marketing)` page has localized title/description/canonical/hreflang;
  the CI guard enforces it.
- **Dependencies.** None.
- **Effort.** 0.5 day.
- **Loop.** SEO slice.

---

### T-16 · Guard-test sprawl: 76,273 LOC of static assertions, 25 % of the codebase

- **Problem.** `lib/guards/` holds **514** test files and **76,273 LOC** against **3** non-test
  files. Total repo source is 301,607 LOC, so roughly a quarter of everything written is guard
  tests. The 161.57 s suite runtime is dominated by them (161 s import time for 11,356 tests).
- **Evidence.** `find lib/guards -name "*.test.ts" | wc -l` → 514; concatenated LOC → 76,273;
  non-test files are only `i18n-debt.ts`, `landing-freeze.ts`, `primary-route-smoke.ts`. Largest:
  `product-readiness.test.ts` 1,888 LOC, `planning.test.ts` 701, `matching-dimensions-v2-1.test.ts`
  634, `finance-records.test.ts` 622.
- **Affected user.** Developers and every future agent session.
- **Affected paths.** `apps/web/lib/guards/`.
- **Business impact.** Two-sided. **Positive:** this is why honesty-copy, i18n parity, no-fake-
  matching and migration discipline actually hold — these guards demonstrably catch real
  regressions, and several findings in this audit were *confirmed* by reading them. **Negative:**
  most assert on source-file *text*, so they are brittle against refactors (T-12's 3,458-LOC journal
  split will touch many), they grow monotonically (one per PR), and their volume creates a false
  impression of behavioural coverage — the 11,356 passing tests do not prove a user can sign up.
- **Risk.** **Medium.**
- **Fix.** Do not delete them. Introduce lifecycle discipline: tag each guard with the decision it
  protects and a review date; retire guards whose decision has been superseded; require new guards
  to justify why a *behavioural* test cannot cover the same rule. Track the ratio of behavioural to
  static tests as an explicit metric.
- **Acceptance criteria.** Every guard file carries a header naming the decision and doc it
  enforces; a documented retirement path exists; e2e/behavioural coverage grows (see T-13).
- **Dependencies.** None.
- **Effort.** Ongoing policy, ~2 days to establish.
- **Loop.** Engineering-process decision.

---

### T-17 · Three user-facing dates/numbers ignore the user's locale

- **Problem.** 5 formatting calls omit the locale argument and fall back to the server's default;
  3 are user-facing.
- **Evidence.** `components/app/handover-passport-panel.tsx:154`
  `new Date(e.createdAt).toLocaleDateString()`; `components/app/worker-instruction-card.tsx:64`
  `new Date(instruction.createdAt).toLocaleString()`; `components/app/market-counters.tsx:79`
  `Math.abs(a - b).toLocaleString()`. (The other 2 are admin-only.) The other 52 call sites
  correctly thread `locale`; zero hardcoded BCP-47 tags anywhere.
- **Affected user.** Workers and companies in LT/RU/NL/DE.
- **Affected paths.** The 3 components above.
- **Business impact.** Small but visible credibility damage — a US-format date on a Lithuanian
  worker's handover passport.
- **Risk.** **Low.**
- **Fix.** Pass the active locale. Add a lint rule or guard banning no-arg `toLocale*` in
  `components/` and `app/`.
- **Acceptance criteria.** Zero no-arg `toLocale*` calls in user-facing code; guard enforces it.
- **Dependencies.** None.
- **Effort.** 1 hour.
- **Loop.** Localization slice (bundle with T-09).

---

### T-18 · Env drift: 3 undocumented variables, 4 documented-but-unread

- **Problem.** `.env.example` and `lib/env.ts` disagree in both directions.
- **Evidence.** In `lib/env.ts` but not `.env.example`: `NEXT_PUBLIC_GOOGLE_CLIENT_ID`,
  `VOICE_TRANSCRIBE_URL`, `VOICE_TRANSCRIBE_TOKEN`. In `.env.example` but never read by `lib/env.ts`:
  `INVITE_EMAIL_API_KEY`, `INVITE_EMAIL_FROM`, `INVITE_EMAIL_PROVIDER`,
  `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
- **Affected user.** New operators/contractors; indirectly users if invitation email is genuinely
  unwired (`canonical_invitations_v1` **is** applied in prod, so invitations exist as a feature).
- **Affected paths.** `.env.example`, `apps/web/lib/env.ts`.
- **Business impact.** Voice journal and Google sign-in can't be configured from the documented
  surface. The three `INVITE_EMAIL_*` vars suggest either dead config or an email path that bypasses
  validated env — worth confirming which.
- **Risk.** **Low-Medium.**
- **Fix.** Reconcile both lists. Add a guard test asserting the `.env.example` key set equals the
  `lib/env.ts` schema key set (both are trivially parseable).
- **Acceptance criteria.** The two key sets match exactly; a guard test enforces it.
- **Dependencies.** Decide whether invitation email is live (affects whether the vars are added to
  `env.ts` or removed from `.env.example`).
- **Effort.** 2 hours.
- **Loop.** Documentation/config slice.

---

### T-19 · Orphan `messages/fi/` directory

- **Problem.** `apps/web/messages/fi/` holds 6 taxonomy files (62 KB) for a locale that is not in
  the canonical 11-locale set, has no `fi.json` base catalog, and is explicitly asserted against.
- **Evidence.** `ls messages/` shows the `fi/` directory but no `fi.json`.
  `lib/i18n/config.ts:13-25` lists 11 locales, none is `fi`.
  `lib/guards/localization-launch-scope.test.ts:67`: `expect([...locales]).not.toContain("fi")`.
  Yet `lib/guards/journal-namespace-cvbridge.test.ts:19-20` says "'fi' joined the taxonomy-locale
  set 2026-07-04 (PR3B)" and includes it, and `journal-delete-honesty.test.ts:50` has
  `JOURNAL_LOCALES = ["lt","en","ru","nl","de","fi"]`. `lib/i18n/launch-language-scope.ts:31`
  describes `fi` as awaiting a "full messages/fi.json catalog, routing, and parity guards".
- **Affected user.** Nobody today.
- **Affected paths.** `apps/web/messages/fi/`, `lib/i18n/launch-language-scope.ts`,
  the three guard tests above.
- **Business impact.** Confusion only — but it is confusion inside the i18n system, and guards
  disagree with each other about whether `fi` is a locale.
- **Risk.** **Low.**
- **Fix.** Owner decision: either finish `fi` (base catalog + routing) or remove the directory and
  the three guards' references. Document the intent in `lib/i18n/config.ts` either way.
- **Acceptance criteria.** No guard test asserts a locale set that contradicts another guard's.
- **Dependencies.** Owner decision on Finland as a market.
- **Effort.** 1 hour once decided.
- **Loop.** Localization slice.

---

### T-20 · Dev design gallery is prerendered into the production build

- **Problem.** `/[locale]/design/text-first` appears in the production route table at **288 kB**
  First Load JS — the second-heaviest route in the app — for a page that always 404s in production.
- **Evidence.** Build route table lists `/[locale]/design/text-first` (288 kB) and
  `/[locale]/design`. Runtime guard is real: `app/[locale]/design/page.tsx:32` and
  `text-first/page.tsx:24` both call `notFound()`; `app/robots.ts:36` disallows `"/*/design"`.
  `app/[locale]/design/layout.tsx` comments confirm the intent: "The page is `notFound()` in
  production builds (PR15 hardening), so this weight is dev-only."
- **Affected user.** Nobody — it is correctly unreachable and correctly de-indexed.
- **Affected paths.** `apps/web/app/[locale]/design/**`.
- **Business impact.** Build time and chunk-graph noise only. The chunks are emitted even though no
  one can load them; it also pollutes the bundle-size table used to reason about performance
  (it outranks the real dashboard).
- **Risk.** **Low.**
- **Fix.** Exclude the route from the production build rather than 404ing it at runtime — e.g. a
  `generateStaticParams` returning `[]` in production, or move the gallery behind a separate
  non-deployed entry.
- **Acceptance criteria.** `/design*` routes are absent from the production build route table;
  the gallery still works in `pnpm dev`.
- **Dependencies.** None.
- **Effort.** 2 hours.
- **Loop.** Build-hygiene slice.

---

## 10. What could not be verified

Recorded honestly so no downstream loop assumes coverage that does not exist.

1. **Whether the anon telemetry write path actually fails in production, or whether there has simply
   been no traffic.** This needs a live incognito session with network inspection. It is the single
   most important open question in this audit (T-01) and belongs to the live-browser loop.
2. **Whether the 54 `anon`-executable `SECURITY DEFINER` functions are safe.** Each almost certainly
   performs its own auth check, but this audit did not read all 54 bodies. Explicitly deferred to
   the security loop. Names listed in §7.3.
3. **Runtime query *counts* and their real latency cost.** The N+1 and sequential-await patterns in
   §3.5 were found statically and are certain; the per-render query counts (≈50–90 for
   `/dashboard/journal`) are **estimates derived from reading the callee chain**, not measurements.
   Confirming them needs Supabase query logs or a request-level trace against a seeded environment.
4. **Actual colour-contrast ratios.** `tokens/colors.ts` is well-structured but ratios must be
   measured on rendered pages in both themes. Live-browser loop.
5. **Keyboard operability of custom widgets** (`DarkListbox`, `command-finder.tsx`,
   `project-operations-board.tsx`). Only 8 keyboard handlers exist across 215 client components,
   which is a strong smell, but confirming it requires real tab-through testing.
6. **The Supabase plan tier and PITR window.** T-11's mitigation assumes point-in-time restore is
   available. Not checked.
7. **Whether invitation email actually sends.** `canonical_invitations_v1` is applied in prod and
   `INVITE_EMAIL_*` vars are documented, but nothing in `lib/env.ts` reads them (T-18).
8. **Per-route serialized i18n message weight.** `next build` reports First Load JS but not RSC
   flight payload size, where messages ride. The route-group subsetting in
   `lib/i18n/client-messages.ts` is well-designed, but its actual effect is unmeasured.
9. **`20260714210000_company_memberships_v1.sql`** — its function `validate_active_organization()`
   was not individually probed in prod; the other 9 unapplied migrations were verified object-by-object.
10. **Lighthouse / Core Web Vitals.** No live performance measurement was taken; all performance
    evidence here is build-output and code-level.

---

## Appendix A — commands run, verbatim

```
pnpm -F web typecheck      → exit 0   (tsc --noEmit, no diagnostics)
pnpm -F web lint           → exit 0   (✖ 17 problems, 0 errors, 17 warnings)
pnpm -F web test           → exit 0   (712/712 files, 11356/11356 tests, 161.57s)
pnpm -F web build          → exit 0   (compiled 2.7min, total 506s, 846/846 static pages)
```

Supabase MCP (SELECT only, prod `gorgitwvdzxbnaxhrsrw`): `list_migrations`, `get_advisors(security)`,
and SELECT queries against `supabase_migrations.schema_migrations`, `information_schema.tables`,
`pg_policy`, `storage.buckets`, `public.pilot_events`, plus `to_regclass` / `to_regprocedure` object probes.

## Appendix B — headline numbers

| Metric | Value |
|---|---|
| Routes (`page.tsx` / `route.ts`) | 115 / 17 |
| Static pages generated | 846 |
| Source files (`app`+`components`+`lib`) | 1,802 |
| Total source LOC | 301,607 |
| Non-test source LOC | 78,975 |
| Guard-test LOC (`lib/guards/`) | 76,273 (514 files) |
| Test files / tests | 712 / 11,356 (all passing) |
| API route handlers with executed-code test coverage | **3 of 17** |
| Route segments / with `error.tsx` / with `loading.tsx` | 132 / **1** / **3** |
| Dropped Supabase `error` bindings (non-test) | **217** |
| Migration files / rollbacks / prod ledger rows | 161 / 93 / 156 |
| Unapplied migrations (verified) | 10 |
| Prod public tables | 126 |
| Supabase security ERRORs / WARNs | 0 / 251 |
| i18n keys (en/lt/ru/nl/de) | 7,355 each, 0 missing |
| i18n keys (da/et/lv/no/pl/sv) | 1,860 each, 5,505 missing |
| `pilot_events` rows / distinct profiles / anon rows | 224 / **1** / **0** |
| Shared First Load JS / median route / heaviest route | 103 kB / 120 kB / 319 kB |
| Middleware size | 118 kB |
| `supabase as any` casts | 674 across 176 files |
| `error.tsx` boundaries / `<Suspense>` elements | 1 (+1 global) / 5 |
| Docs markdown files | 566 across 41 directories |
