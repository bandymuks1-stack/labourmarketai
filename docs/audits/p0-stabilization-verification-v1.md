# P0 STABILIZATION — VERIFICATION RECORD v1

**Programme:** P0 Stabilization (read-first / fix-second)
**Reference:** FULL PROJECT CANONICAL AUDIT v1
**Baseline:** `main` @ `5eddebac` (W1+W2, PR #908)
**Branch:** `fix/cc/p0-stabilization-v1`
**Date:** 2026-07-29
**Scope rule applied:** verify every finding before changing anything; fix only production drift, broken runtime paths, missing migration wiring, broken RPC wiring. No new functionality, no UX change, no business-logic change, no migration.

---

## 0. HEADLINE

**The canonical audit's two P0 findings do not survive verification.** What the audit called "12 missing tables" and "9 missing RPCs the app calls" is the repo's *documented owner-gate architecture*, not drift, and every one of the 20 affected call sites degrades honestly. Six of the audit's other claims are also wrong and are corrected below.

**One real, previously unreported P0 was found instead:** the generated Supabase type mirror (`apps/web/lib/supabase/types.ts`) had drifted from production by **20 live tables**. That is fixed in this branch.

| Audit finding | Verdict |
|---|---|
| §4.3 — 12 tables missing from production | **PARTLY WRONG** — 2 correctly dropped, 8 owner-gated by design, 2 declared outside `supabase/migrations/` |
| §4.4 — 9 RPCs called but absent (P0) | **WRONG SEVERITY** — all 9 are owner-gated; all 9 callers degrade honestly |
| §4.6 — nothing is scheduled | **CORRECT**, but impact overstated |
| §8.6 — no error tracking | **CORRECT** |
| §7.2 — duplicate AI stack | **CORRECT** |
| §7.3 — three competing payment kill switches | **WRONG** — three *layered* switches with distinct scopes |
| §7.4 — duplicate demand model layers | **WRONG** — five distinct actors/stages over one canonical table |
| §7.5 — three live booking generations | **WRONG** — a version-negotiation fallback chain |
| §7 — two calendars / three timelines | **WRONG** — one calendar engine; three unrelated domains |
| *(new)* generated types drift | **NEW P0 — FIXED HERE** |

---

## 1. VERIFIED FINDINGS

### 1.1 §4.3 — "12 tables declared but missing from production"

Each of the 12 was traced to its declaring migration and classified.

| Table | Declaring migration | Classification |
|---|---|---|
| `messages` | `0001_initial_schema.sql`, then **`20260530120000_drop_legacy_threads_messages.sql`** | **OBSOLETE — correctly absent.** The audit's grep counted the `CREATE` and missed the later `DROP`. |
| `threads` | same | **OBSOLETE — correctly absent.** |
| `agency_clients` | `20260713160000_agency_clients_v1.sql` | **GATED BY DESIGN** — header: `DRAFT — needs-human-gate — DO NOT APPLY` |
| `company_locations` | `20260713120000_company_locations_v1.sql` | **GATED BY DESIGN** |
| `worker_external_profiles` | `20260713210000_multi_source_talent_v1.sql` | **GATED BY DESIGN** |
| `talent_source_records` | same | **GATED BY DESIGN** |
| `identity_resolution_events` | same | **GATED BY DESIGN** |
| `ai_runs` | `20260714150000_ai_runs_audit_v1.sql` | **APPLIED 2026-08-03** (prod ledger `20260803061937`) — was *GATED BY DESIGN* when this audit was written; corrected 2026-08-19 after re-verifying against production. The other rows in this table are unchanged and still correct. |
| `worker_opportunity_seen` | `20260714170000_worker_opportunity_seen_v1.sql` | **GATED BY DESIGN** |
| `journal_profession_templates` | `20260714180000_journal_profession_templates_v1.sql` | **GATED BY DESIGN** |
| `dashboard_preferences` | `20260714211000_dashboard_preferences_v1.sql` | **GATED BY DESIGN** |
| `demand_interest_seen` | `20260717150000_demand_interest_seen_v1.sql` | **GATED BY DESIGN** |

All eight gated migrations carry an explicit owner-gate header, e.g. `20260713210000_multi_source_talent_v1.sql`:

> `██ HUMAN GATE — DO NOT APPLY WITHOUT EXPLICIT OWNER OK ██`
> `Status: DRAFT / DEFERRED. … The consumer UI … detects the missing table/RPCs (42P01 / PGRST205 / 42883 / PGRST202) and shows an honest "prepared, owner activation pending" state until this is applied.`

**The degradation contract is written into the migration itself.** This is deliberate architecture, not drift.

Additionally, `assistant_conversations` / `assistant_messages` — which the audit said were "declared in no migration at all" — **are** declared, at `docs/proposals/assistant-transcript-v1/20260724_assistant_transcript_v1.sql` (a RED proposal deliberately parked outside `supabase/migrations/` so it cannot be applied by accident). The audit only searched `supabase/migrations/`.

**Classification: ARCHIVE the finding. No fix. No migration.**

### 1.2 §4.4 — "9 RPCs the app calls do not exist in production"

Every caller was read. Every one classifies the PostgREST/Postgres absent-object code and returns a tagged state.

| RPC | Caller | Degradation | Verdict |
|---|---|---|---|
| `save_agency_client_v1` | `lib/agency/clients-actions.ts:48` | `isMissingRpcCode` → `needs-migration` | OK |
| `remove_agency_client_v1` | `lib/agency/clients-actions.ts:73` | same | OK |
| `set_demand_agency_client_v1` | `lib/agency/clients-actions.ts:98` | same | OK |
| `save_company_location_v1` | `lib/company/company-locations-actions.ts:40` | `42883` / `PGRST202` → `needs-migration` | OK |
| `remove_company_location_v1` | `lib/company/company-locations-actions.ts:67` | same | OK |
| `save_worker_external_profile_v1` | `lib/worker/external-profiles-actions.ts:87` | `classifyExternalProfilesError` | OK |
| `disconnect_external_profile_v1` | `lib/worker/external-profiles-actions.ts:158` | same | OK |
| `record_talent_source_v1` | `lib/talent/provenance-actions.ts:62` | `isMissingRpcCode \|\| isMissingTableCode` → `needs_migration` | OK (module has no UI consumer) |
| `append_assistant_message` | `lib/assistant/transcript.ts:144` | any error → `{ available: false }` | OK |

The eleven corresponding **read** paths were checked the same way: `lib/agency/clients.ts:37`, `lib/company/company-locations.ts:41`, `lib/dashboard/preferences.ts:47`, `lib/dashboard/preferences-actions.ts:63`, `lib/journal/journal-templates.ts:35`, `lib/worker/external-profiles.ts:66`, `lib/opportunities/seen.ts:107`, `lib/identity/identity-resolution-service.ts:67`, `lib/talent/provenance.ts:48`, `lib/ai/runtime/audit-store.ts:154,185`. All degrade.

The pattern is not incidental: **108 non-test modules** implement an absent-object code check, **88 UI files** render a `needs-migration` state, and the message catalogue carries dedicated keys (`needsMigration`, `statusNeedsMigration`, `outcomeNeedsMigration`, …).

**Classification: FIX = none. REMOVE = none. ARCHIVE the finding.**
The only residual is a *dead-code* question, not a runtime one — see §3.2.

### 1.3 §4.6 — scheduler audit

Verified absent in production: `pg_cron` (not installed), `pg_net` (not installed), Supabase Edge Functions (`supabase/functions/` does not exist), Vercel Cron (no `vercel.json`), external scheduler (none). The only cron in the repo is CodeQL's weekly scan.

**Why lifecycle jobs never execute — verified from the migrations themselves.** They were never meant to be scheduled:

- `20260711290000_booking_lifecycle_v2.sql`: *"Admin-only expiry sweep (enabling function; scheduling is a SEPARATE owner decision — nothing here installs a scheduler)"*
- `20260716131000_team_enquiries_v1.sql`: *"admin-only sweep … to any scheduler is a SEPARATE owner decision (nothing here installs one)"*
- `20260716120000_contact_disclosure_requests_v1.sql`: *"expiry is executed by an admin-only sweep (no scheduler …)"*

Functions depending on out-of-band execution, with their actual invocation path:

| Function | Invocation path | Rows in its table | Impact today |
|---|---|---|---|
| `close_stale_learning_review_items` | **WIRED** — called lazily from `lib/learning/learning.ts:115` | `learning_review_queue` = 0 | none; self-heals on read |
| `expire_stale_booking_requests_v1` | **NONE** — no scheduler, no admin UI, no lazy call | `booking_requests` = 0 | none today |
| `expire_stale_team_enquiries_v1` | **NONE** | `team_enquiries` = 0 | none today |
| `expire_contact_disclosure_requests_v1` | **NONE** | `contact_disclosure_requests` = 0 | none today |
| `lmc_expire_lots_v1` | **NONE** | `lmc_lots` = 0 | none today |

**Verdict: the audit is factually right, and its severity was too high.** Four sweeps have no invocation path of any kind — but every table they act on is empty, so current production impact is nil. Each becomes a real defect on the day its feature takes its first row.

**Classification: no fix (an admin trigger or a scheduler is new functionality — out of scope). OWNER DECISION — see §4.3.**

### 1.4 §8.6 — error tracking

Verified current state:

| | Finding |
|---|---|
| Error-tracking SDK | **none** (no Sentry / Datadog / Logtail / OpenTelemetry in `package.json` or source) |
| Logging | `console.error` × **182** across **94** non-test files; `console.warn` × 6; `console.log` × 5; `console.info` × 5 |
| Error boundaries | present and well built — `app/global-error.tsx`, `app/[locale]/error.tsx` (chunk-error auto-recovery, bilingual hardcoded fallback), `app/[locale]/not-found.tsx` |
| Product telemetry | `pilot_events` (408 rows) via `lib/telemetry/` — a product funnel, not an error channel |

**Missing production visibility, concretely:**

1. Server-side `console.error` reaches Vercel runtime logs only — short retention, no search across deploys, **no alerting**. Nobody is told when a path starts failing.
2. Client-side `console.error` (including `global-error.tsx:17`) reaches the user's browser console and **nowhere else**. Every client crash in production is invisible.
3. There is no request/trace correlation, so a `console.error("[agency-clients] save failed:", error.code)` cannot be tied to a user, a session, or a deploy.
4. `error.digest` — the one correlation id Next.js produces — is rendered but never transmitted anywhere.

**Proposal — ONE canonical solution (NOT implemented; owner approval required):** adopt **Sentry** via `@sentry/nextjs`, configured for server + edge + client, with:
- `tracesSampleRate: 0`, `replaysSessionSampleRate: 0` — errors only, no performance or session replay, so nothing extra about a worker is captured;
- `sendDefaultPii: false` and a `beforeSend` scrubber that drops message bodies, journal text, CV text and any `p_*` RPC argument, consistent with the existing "never log transcript or CV content" rule (`lib/voice/transcribe-action.ts`, `lib/cv/extract.ts`);
- the existing `console.error` prefixes (`[agency-clients]`, `[external-profiles]`, …) kept as-is and used as fingerprint tags;
- one new secret (`SENTRY_DSN`) — **an owner-only gate under CLAUDE.md §4**.

Rationale for Sentry over the alternatives: it is the only option that covers **client** errors (the current total blind spot) as well as server, it needs no infrastructure to run, and `@sentry/nextjs` handles the App Router server/edge/client split without hand-written plumbing. A log drain (Axiom/Better Stack) would capture server logs but leave client crashes invisible; OpenTelemetry would require a collector this project has no place to run.

---

## 2. FIXED FINDINGS

### 2.1 NEW P0 — generated type mirror had drifted from production by 20 tables

**Not in the canonical audit.** Found while verifying §4.3.

`apps/web/lib/supabase/types.ts` is generated (`pnpm db:types`) and was last regenerated in PR #778. Since then the operations, commercial, assets, marketplace and LMC-ledger migrations were applied to production without a regeneration.

**Verified drift — 20 live production tables absent from the type mirror:**

```
agency_candidate_offers   agency_client_connections  agency_client_request_shares
asset_assignments         assets                     company_worker_engagements
contracts                 defect_corrections         defects
lmc_accounts              lmc_lot_consumptions       lmc_lots
lmc_settings              lmc_transactions           marketplace_listings
project_budgets           project_stages             proposals
usage_cost_events         worker_absences
```

**Consequence:** any module touching those tables had to use an `any` escape hatch — the repo carries **504 `supabase as any` / `asAny(supabase)` occurrences across 176 files**. On these 20 tables there was no compile-time protection at all: a renamed column or a wrong filter would ship silently. This is exactly the class of defect the type mirror exists to prevent.

**Fix applied:** regenerated `apps/web/lib/supabase/types.ts` from the live production catalog (read-only), 7,024 → 8,991 lines.

**Verification of the fix:**

| Check | Result |
|---|---|
| All 20 tables now typed | ✅ verified individually |
| Definitions removed by the regeneration | **none** — the single `-learning_signals` hunk in the diff is an alphabetical re-position; it is present at line 3699 of the new file |
| `pnpm -F web typecheck` | ✅ clean |
| `pnpm -F web test` | ✅ **772 files / 12,498 tests passed** |

**Why this is a safe fix and in scope:** it is production drift in the repo's schema mirror, it is purely additive, it is generated (no hand edits), it changes no runtime behaviour, and it was proven green by the full suite. It does **not** apply any migration and does **not** touch production.

### 2.2 Drift record — `usage_cost_events`

`public.usage_cost_events` exists in production with 20 columns and 2 `forbid_mutation` triggers, and is **declared by no migration and referenced by no code anywhere in the repository** (verified: zero hits across `supabase/`, `apps/`, `docs/`, `scripts/`).

```
event_id uuid, occurred_at timestamptz, recorded_at timestamptz, event_type text,
status text, provider text, service text, resource text, workspace_id text,
profile_id uuid, organization_id uuid, session_id text, feature_code text,
plan_key text, payer text, measures jsonb, cost jsonb, revenue_link jsonb,
metadata jsonb, schema_version integer
```

It is now at least *typed* (§2.1) so the repo no longer silently disagrees with production about its existence. **No DDL was issued.** Dropping or back-declaring it is an owner decision — see §4.2.

### 2.3 Migration-ledger hazard (recorded, not fixed)

`supabase_migrations.schema_migrations` in production holds versions such as `20260727183554`, while the corresponding repo file is `20260727180000_journal_entry_skill_provenance_v1.sql`. The timestamps do not correspond, because migrations were applied through Supabase MCP `apply_migration`, which stamps its own version.

**Consequence: "is migration X applied?" cannot be answered from the ledger.** Only a live schema diff is authoritative. Every applied-state claim in this record was therefore derived from `pg_class` / `information_schema`, never from the ledger.

---

## 3. REMAINING FINDINGS (verified, NOT fixed — out of Phase 3 scope)

### 3.1 §7.2 — duplicate AI stack (CONFIRMED)

Two independent AI gates coexist:

| | Stack A (legacy) | Stack B (current) |
|---|---|---|
| Gate | `lib/config/ai.ts` → `AI_ASSIST_ENABLED = false` (source literal) | `AI_PROVIDER_MODE` env + provider + non-empty key |
| Entry | `lib/ai/provider.ts` → `noop-provider.ts` (no live branch exists) | `lib/ai/run-agent-server.ts` → `lib/ai/runtime/` |
| Consumers | **1 feature** — `lib/ai/estimate-clarify-actions.ts` → `components/app/estimate-clarify-assist.tsx` (rendered by `estimate-builder.tsx:185`) | **5** server-action modules |

Stack A is a permanently inert island: `getAiProvider()` can only return the no-op. It is not dangerous, but it is a second answer to "is AI on?", and the two answers can disagree. Not separable in one safe step — `lib/ai/types.ts` is shared with `lib/ai/runtime/task-routing.ts`.

**Merging is a refactor, explicitly outside Phase 3. OWNER DECISION — §4.4.**

### 3.2 Dead modules that call gated objects (CONFIRMED, harmless)

`lib/talent/provenance.ts`, `lib/talent/provenance-actions.ts` and `lib/identity/identity-resolution-service.ts` have **zero consumers** (verified against a non-test import graph). They degrade correctly, but nothing can reach them. They are dead code, not broken runtime paths, so they fall outside "safe fixes". **REMOVE candidates — §4.5.**

### 3.3 Corrections to the canonical audit (verified WRONG — no action)

| Audit claim | Evidence it is wrong |
|---|---|
| §7.3 "three competing payment kill switches" | They are **layered with distinct scopes**: `PAYMENTS_ENABLED` (`lib/billing/plans.ts:18`) governs the pre-payment *plan boundary and copy*; `getBillingConfig()` (env) governs whether the **Stripe test** adapter is reachable vs the noop provider; `LIVE_PAYMENTS_ENABLED` (`lib/billing/lmc-flags.ts:25`) is the LMC ledger's own live-money gate in an unreachable module. Not competing — defense in depth. Residual issue is **naming similarity only**. |
| §7.5 "three live booking generations" | `lib/booking/booking-actions.ts` is a **version-negotiation fallback**: `propose_booking_request_v3` → on `42883`/`PGRST202` falls back to `propose_booking_request`; `respond_..._v3`/`_v2` → `respond_...`. It exists so bookings work whether or not the owner-gated lifecycle-v2/v3 migrations are applied. All versions **are** applied in production, so the fallback arms are now unreachable — harmless dead weight that disappears when the gate is retired, not a duplication defect. |
| §7 "two calendar implementations" | There is **one** calendar engine — `lib/planning/planning-model.ts` + `planning.ts` (`buildAgenda`, `buildWeekView`, `buildMonthGrid`, `buildYearOverview`), consumed by `/dashboard/planning`, `lib/ai-workspace/*` and `lib/conversation/agenda-summary.ts`. `/dashboard/company/planning` contains **zero** calendar-building calls; it is a company demand-planning page. The audit inferred duplication from the route name. |
| §7 "three timeline implementations" | Three **different domains** sharing a word: `lib/intelligence/timeline.ts` = provenance audit chain (source→observation→…→visible); `lib/buyer/request-timeline.ts` = derived activity for a buyer request; `lib/dashboard/activity-centre.ts` = notification-spine row view model. No shared logic. |
| §7.4 "duplicate demand model layers" | Five **distinct actors/stages** over one canonical table: `lib/demand/` (authenticated company/agency submission + drafts + lifecycle), `lib/staffing/` (vacancy structuring model + AI agent mapping), `lib/buyer/` (the buyer role's own request service), `lib/scouting/` (matching supply to a need), `lib/sales/` (superadmin read-only lead intake). The table itself is correctly consolidated on `customer_requests`. |
| §4.3 "assistant_* declared in no migration at all" | Declared at `docs/proposals/assistant-transcript-v1/20260724_assistant_transcript_v1.sql`, deliberately outside `supabase/migrations/`. |
| §8.6 "ai_runs audit fails silently" | It **logs** — `lib/ai/runtime/audit-store.ts` `console.error`s both the insert failure and the count failure. The real defect is different and worse — see §4.1. |

---

## 4. OWNER DECISIONS REQUIRED

### 4.1 P1 — the AI daily-run budget guard cannot fire (VERIFIED)

`lib/ai/run-agent.ts:206`:

```ts
opts.runsToday !== undefined &&
assessRunBudget(opts.runsToday, cfg) === "budget_exceeded"
```

`runsToday` is supplied by `countAiRunsTodayBestEffort()` (`lib/ai/runtime/audit-store.ts`), which returns `null` when `ai_runs` is absent — and `ai_runs` is owner-gated, so it *is* absent in production. `null` → `runsToday` stays `undefined` → **the guard is skipped entirely**.

**If `AI_PROVIDER_MODE=live` is ever set while `20260714150000_ai_runs_audit_v1.sql` is unapplied, there is no daily spend ceiling and no audit trail.**

Three options, all owner-gated:

1. **Apply `20260714150000_ai_runs_audit_v1.sql`** before any live AI. Restores both the audit trail and the counter. *(Recommended — it is the design intent.)*
2. **Make the guard fail-closed in live mode** — block the run when the counter is unavailable. This changes business logic (Phase 3 forbids it without owner instruction) and would make live AI refuse to run until option 1 is done.
3. **Accept the risk** and treat `AI_DAILY_RUN_BUDGET` as advisory. Requires an explicit written acceptance.

No change made.

### 4.2 `usage_cost_events` — undeclared production table

Exists in production, referenced nowhere in the repo. Options: (a) back-declare it with a repo migration marked already-applied, restoring repo/prod agreement; (b) drop it — **destructive, hard owner gate**; (c) leave and accept permanent drift. No DDL issued either way without approval.

### 4.3 Lifecycle sweeps with no invocation path

`expire_stale_booking_requests_v1`, `expire_stale_team_enquiries_v1`, `expire_contact_disclosure_requests_v1`, `lmc_expire_lots_v1`. Options: (a) add an admin-only sweep button per the migrations' stated design — **new functionality, out of this programme's scope**; (b) install a scheduler — new infrastructure plus a secret; (c) accept, and revisit before the first row lands in any of those tables. Recommended: **(c) now, (a) before the booking feature is enabled.**

### 4.4 AI stack consolidation

Retire Stack A (`lib/config/ai.ts`, `lib/ai/provider.ts`, `lib/ai/noop-provider.ts`, `lib/ai/estimate-clarify-actions.ts`, `components/app/estimate-clarify-assist.tsx`) into Stack B, or keep both and document Stack A as frozen. A refactor — needs its own scoped slice.

### 4.5 Dead-module removal

`lib/talent/provenance.ts`, `lib/talent/provenance-actions.ts`, `lib/identity/identity-resolution-service.ts` — zero consumers. Removing them would also strand their owner-gated migration (`20260713210000_multi_source_talent_v1.sql`). Recommended: **keep**, and decide together with that migration's own apply/abandon decision.

### 4.6 Error tracking — new secret

The §1.4 proposal needs `SENTRY_DSN`. New secrets are an owner-only gate (CLAUDE.md §4). Not implemented.

### 4.7 Activate the live SECDEF CI gate

`.github/workflows/quality.yml` currently warns and exits 0 because `secrets.SUPABASE_DB_URL` is unset, so the half of the anon-SECDEF gate that would have caught the 2026-07-22 P0 does not run. Adding a **read-only** connection string is an owner gate. (Verified separately that the live catalog is currently correct: 131/131 tables RLS-enabled, 249 policies, exactly the 4 allowlisted SECDEF functions anon-reachable, no leftover `PUBLIC` grants.)

---

## 5. WHAT WAS NOT TOUCHED

Per the programme's DO-NOT-TOUCH list, verified by the diff: Work Journal logic, Skill Engine, matching algorithms, Conversation UX, W4, W5+, and every experimental feature are unmodified. No migration was created, applied or altered. No production DDL was issued. All database access in this programme was read-only SQL against system catalogs and aggregate counts.

## 6. VALIDATION RUN ON THIS BRANCH

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile` | ✅ |
| `pnpm -F web typecheck` | ✅ clean |
| `pnpm -F web test` | ✅ 772 files / 12,498 tests passed |

CI additionally runs lint, placeholder governance, four honesty-copy gates, primary-route smoke, SEO indexing, the i18n debt ratchet and the Product Gate.
