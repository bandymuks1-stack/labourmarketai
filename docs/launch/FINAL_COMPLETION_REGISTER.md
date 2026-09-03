# FINAL COMPLETION REGISTER — LabourMarket.ai

> **Status:** canonical train-level register of the FINAL COMPLETION stage.
> Opened 2026-09-02 from the owner's control-window handoff, reconciled against
> `main = 428d013a` (= production, `#1416`) and the live Supabase project
> `gorgitwvdzxbnaxhrsrw`. Companion command:
> [`FINAL_COMPLETION_COMMAND.md`](FINAL_COMPLETION_COMMAND.md).
>
> **Authority:** this file supersedes
> [`LAUNCH_CRITICAL_COMPLETION_TRACKER.md`](LAUNCH_CRITICAL_COMPLETION_TRACKER.md)
> (last verdict 2026-08-05) and
> [`launch-readiness-status-board-v1.md`](launch-readiness-status-board-v1.md)
> (2026-07-06) as the *train-level* ledger. Capability-level proof stays in
> [`docs/CAPABILITY_INVENTORY.md`](../CAPABILITY_INVENTORY.md) §2/§5 — this
> file does not duplicate it, it points at it. Architecture authority is
> unchanged: [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md).
>
> **States (owner vocabulary, binding):** `PRODUCTION_PROVEN` ·
> `E2E_PROVEN` · `IMPLEMENTED_UNPROVEN` · `PARTIAL` · `MISSING` ·
> `OWNER_GATE` · `EXTERNAL_GATE`. Final completion of any train requires
> real E2E proof, not a merged PR.

---

## 0. Reconciliation of the handoff against the repo and production (2026-09-02)

| Handoff § | Handoff claim | Reconciled fact | Delta |
|---|---|---|---|
| 3 Auth | PRODUCTION_PROVEN, #1412/#1413 | Confirmed. `#1414` (Server-Timing), `#1415` (journal.list entryId), `#1416` (audit doc) merged since; `main` = prod | none |
| 4 Owner ChatGPT test | works in prod | Confirmed by auth log 11:49 UTC (fresh grant, 1 session, 1 refresh token) | none |
| 5 New user | grant/tool E2E_PROVEN; UI walk IMPLEMENTED_UNPROVEN | Confirmed — **and the owner's §6 change alters the UI path**: signup now returns no session → the form's `check_email` branch → email link → `/auth/callback?code=` → onboarding. Two new facts: (a) `emailRedirectTo` carries **no `next`**, so a pending external authorization is not resumed after confirmation (it expires in 10 min anyway); (b) the callback is PKCE-`code` based, so a confirmation link opened in a **different browser/device** than the signup will fail `exchange_failed` (no `token_hash`/`verifyOtp` path exists). | **Train A slice 1 scope grew** |
| 6 Email gate | owner set Confirm email = ON | **VERIFIED LIVE.** `/auth/v1/settings`: `mailer_autoconfirm=false`, `disable_signup=false`, `external.google=true`, linkedin_oidc/facebook false, anonymous false, passkeys false. Behavioural probe 12:42 UTC: signup 200 with **no session**, `confirmation_sent_at` set, auth log `user_confirmation_requested`, password login → `400 email_not_confirmed`. No mailer error in the log window. | **Delivery unproven**: whether the mail reaches a real inbox depends on SMTP configuration, which is not readable from here (see gate G-1) |
| 7 Latency | warm p50 213 ms / p95 316 ms; cold 1.56 s | Confirmed from `#1416` §B.1; SLO proposal unchanged | none |
| 8 Work Journal | external E2E proven | Confirmed (`#1416` §E; `#1415` fixed the read-back field) | none |
| 9–10 DB | 789 MB; gates A–D open; nothing executed | Confirmed; ledger unchanged since; no destructive op run | none |
| 11 Connected Apps | surface required | **MISSING** in the web app (only the logout route mentions `revokeGrant`). Server side is ready: GoTrue exposes `GET /user/oauth/grants` + `revokeGrant`, `auth-js` has `listGrants`/`revokeGrant`. Live data: 2 DCR clients (ChatGPT, `lm-oauth-proof-temp-20260830`), 2 consents, 2 OAuth sessions. No new table needed. | build in Train A |
| 12 Social auth | inventory first; Google may exist | Google PRODUCTION_PROVEN (owner 11:48 hop; `external.google=true`). LinkedIn/Facebook: **zero provider config** (settings false); buttons are settings-driven and fail-closed (`lib/auth/enabled-providers-core.ts`). Manual linking OFF (owner-observed). | LI/FB = EXTERNAL_GATE (provider apps + Supabase config) before any proof train |
| 13 Payments | must be real | Stripe **test-mode** chain implemented (checkout → webhook → subscription → entitlement → admin, `stripe-test-mode-final-report.md`); **LIVE is hard-blocked in code** (`lib/billing/config-core.ts` → `stripe_live_blocked`); billing is RED class verbatim; commercial PRs #895/#896/#897 draft since July; canonical prices = closed #754 + LMC catalogue #894. Production env for payments not readable from this window. | live payments = MISSING by design; Train D lifts it under the RED gate |
| 14–19 Actors | complete E2E all actors | From `CAPABILITY_INVENTORY.md` §5.3: WORKER_READY yes; EMPLOYER_READY (web core) yes; STUDENT / EDUCATION PARTIAL (learner ACCEPT in a browser with a 2nd identity); MARKETPLACE NO (reachability M7/M8); PROJECT_MANAGEMENT: M3 closed 2026-08-31 (allocations + compute applied) → regrade **PARTIAL**; CALENDAR PARTIAL (no write path); XLSX import: `lib/timesheet-import/*` (read, grid parse, preview, confirm) is on `main` but unproven on production with a real company file. | trains E–H |
| 20 Visual/UX | old SaaS UI still visible | No production screenshot audit exists after 2026-08-24; M10–M12 open (two home identities only; 11 routes 800–1,500 lines under back-arrow chrome; attention split across 4 surfaces). | Train I |
| 24 Languages | LT/EN/RU | `LANGUAGE_MATRIX.md`: 5 routed (`lt en ru nl de`), 11 catalogs, Georgian absent, 15 of 26 required languages absent | Train J |
| 25 Security | gates | Advisors: 1 ERROR (`worker_absence_scheduling` SECURITY DEFINER view — recorded 2026-09-01 as intentional, do **not** "fix"), 375 WARN (363 authenticated-executable SECDEF functions by design, 7 anon-executable public-read functions by design, 3 RLS-no-policy tables = deny-all by design, 2 mutable search_path). No Sentry / error monitor, no `/api/health`. | Train K/L |
| 27 Mobile | real mobile testing | Android + iOS builds and runtime proven vs prod backend; product data on mobile ≈ zero (MOBILE_READY NO) | Train J |
| 28 Observability | before real users | MISSING as a system: funnel telemetry exists (`lib/telemetry/*`), Server-Timing on `/api/mcp`, no error monitoring, no alerts, no health probe | Train L |
| — Open PRs | — | 12 open, all draft except #1166: 6 RED migrations (#1355 ESCO, #1266 ai_runs, #1046, #1045, #883, #740), 3 commercial RED (#895–#897), 3 landing/visual parked (#1225, #1211, #1166) | owner queue §3 |
| — Worktrees | — | ~60 worktrees on disk. **Not touched** (owner rule: no pruning in this stage) | none |

**Residue created by this reconciliation:** one unconfirmed TEST identity
`e2e-confirm-202609021242@labourmarket.ai` (`251e962c…`) in `auth.users`,
plus the four `e2e-*@labourmarket.ai` identities from the `#1416` audit.
Cleanup is a destructive op → listed under gate G-9.

---

## 1. Train register

Dependencies: A → (C, D, K); B independent; E, F, G, H depend on nothing new
but M depends on all; I depends on the IA decision inside itself; J after I
for the UI parts; L before M.

| Train | Scope (one line) | State 2026-09-02 | Exit evidence required |
|---|---|---|---|
| **A** security / auth / new-user / Connected Apps | confirm-email UX (cross-device link, `next` carry, resend, unconfirmed-login copy), Connected Apps surface, new-user browser walk, all 12 identity cases | **A1 PRODUCTION_PROVEN 2026-09-02** (#1418 = `2a939c83`): token_hash link on a device without the PKCE verifier → session + `next` preserved; replay/garbage/expired → `link_expired`; default template on another device → `confirmed_sign_in`; unconfirmed login refused; resend 200 — [evidence](../audits/evidence/final-completion/a1-email-confirmation-prod-proof-2026-09-02.md). Delivery to a real inbox = EXTERNAL_GATE G-1. **A3 evaluated** — [`docs/security/session-mfa-passkey-evaluation-2026-09-02.md`](../security/session-mfa-passkey-evaluation-2026-09-02.md): TOTP/passkeys = post-launch owner toggles; "my sessions" = DEFERRED (no GoTrue API). **A2** Connected Apps: MERGED #1419 (`289c92ac`) — `/dashboard/account#connected-apps`, GoTrue `listGrants`/`revokeGrant`, two-step disconnect, command-registry entry; **PRODUCTION_PROVEN 2026-09-02** — list → scopes → granted-at → two-step disconnect → client refresh `refresh_token_not_found` → `/api/mcp` 401 → reconnect works ([evidence](../audits/evidence/final-completion/a2-connected-apps-prod-proof-2026-09-02.md), 4 screenshots at 390 px) | **Cases 6 + 7 PRODUCTION_PROVEN 2026-09-02** in a real browser ([evidence](../audits/evidence/final-completion/a-identity-cases-6-7-prod-proof-2026-09-02.md)): consent Deny → the client receives `error=access_denied` with `state` echoed; pending authorizations expire after 10:00 min (measured). Case 9 (Google collision) = owner (G-2). Remaining: G-1 delivery only |
| **B** DB lifecycle / capacity | expired-vacancy semantics in reads (non-destructive), thresholds doc, gate packs for A–D | **B1 CLOSED 2026-09-02 as already-correct + one detail read aligned.** Prod proof: rows flagged `is_active` 70,767; unexpired 45,132; the anon count RPC returns **45,132** — every public read path (5 RPCs, board search, detail-by-id, previews, supply timestamp, market facts) applies `expires_at`; only the RLS policy is `is_active`-only, which is not a read path a user reaches. The one `is_active`-only read (`getPublicVacancy` by publisher key, zero callers) now applies the same predicate. **B2 DONE as a RED draft**: PR #1421 (`needs-human-gate`, unapplied) ships `public_vacancy_retention_run_v1` (dry-run default, stage 1 reversible / stage 2 opt-in), the 0-scan-asserted drop of two unused indexes, and `esco_labels_prune_locales_v1` — pack [`docs/human-gates/db-lifecycle-gate.md`](../human-gates/db-lifecycle-gate.md). **B3 DONE**: [`docs/operations/capacity-thresholds-v1.md`](../operations/capacity-thresholds-v1.md) (T1–T4 triggers, 100/1k/10k/100k lines, G-6 rule). B4 = apply on owner approval; gates OWNER_GATE G-3…G-6 | dry-run + real-run counts recorded after approval |
| **C** social auth | LinkedIn + Facebook full matrix (signup, login, collision, linking, logout, re-login, provisioning, assistant continuation, mobile, cancel) | Google PRODUCTION_PROVEN; **C1 DONE**: gate pack [`docs/human-gates/social-providers-gate.md`](../human-gates/social-providers-gate.md) (exact LinkedIn/Meta console steps; auto-link collision policy recorded). **C2 DONE**: `tests/e2e/social-auth-matrix.spec.ts` — the provider-independent legs (cancel → neutral, expired link → resend, cross-device → confirmed_sign_in, honest provider buttons from the auth server's own settings, hostile `next` never survives) run in the CI e2e subset on every PR (floor 21 → 27). Provider-screen legs = human step per provider. LI/FB EXTERNAL_GATE G-2 | per-provider matrix on prod with bounded identities once G-2 closes |
| **D** payments | canonical price set → live Stripe under RED gate → full chain E2E | **D3 BUILT (RED draft #1441, 2026-09-02)**: the owner-armed live path — `stripe_live` resolves only with STRIPE_MODE=live + complete live keys + `STRIPE_LIVE_ACTIVATION=approved-by-owner` + `PRICING_READINESS_STATE=owner_confirmed`; webhook mode-match, entitlement enforcement, account state under either adapter state; 266 billing tests. Owner requirement reduced to G-7 (one word: Set A recommended) + G-8 (keys/env). test chain IMPLEMENTED_UNPROVEN; **production billing state read live 2026-09-02 = `stripe_live_blocked`** (the env already carries live-shaped Stripe config, so the code block is engaged; no test keys in production, so D2 test-clock proofs need a non-production env with `STRIPE_MODE=test` keys = owner env action). D1 pack written ([G-7/G-8](../human-gates/payments-price-table-gate.md)). Live MISSING; OWNER_GATE G-7, EXTERNAL_GATE G-8 | live checkout/renewal/upgrade/downgrade/cancel/failed/webhook idempotency/entitlement/invoice/refund/VAT proven on prod |
| **E** worker / Living CV / Journal / import | credential validity model, journal input paths, XLSX import proven on a real company file with rollback + receipt | **E1 DONE**: current validity (ACTIVE / EXPIRED / REVOKED / PENDING / REJECTED / UNVERIFIED / UNKNOWN) derived by a pure rule (`lib/documents/credential-validity.ts`) from the stored row + the append-only `worker_document_events` history — read, never rewritten — and shown beside the verbatim verification on the document centre. **E3 PRODUCTION_PROVEN on a synthetic file 2026-09-02** ([evidence](../audits/evidence/final-completion/e3-timesheet-import-prod-proof-2026-09-02.md)): monthly-grid XLSX → preview (5 rows, month detected, labels resolved) → confirm → 5 `work_hour_allocations` rows (`source=import`, `entered_by` set) → same file again = duplicates flagged and refused without explicit acknowledgement. Real owner files (other layouts, split cells, human mapping, session rollback, company-format export) still need the owner's file; **E2 chat path PRODUCTION_PROVEN 2026-09-02** ([evidence](../audits/evidence/final-completion/e2-journal-input-paths-prod-proof-2026-09-02.md)): composer request → work-log card → work-context choice (refused honestly without it) → two-step save → listed on the journal; every path (chat/forms, files, XLSX, MCP) writes through `createJournalEntryCore`; voice = G-10 (#740) | import of an owner-supplied historical file on prod with receipt + rollback proof |
| **F** employer / company / project / timesheet | company control operational loop: project → object → assignment → calendar → work → journal → hours → timesheet → approval → report | **F1 IMPLEMENTED (RED draft #1426)**: the PLAN primitive — `work_plan_entries` (who works on which project/object from D1 to D2; cancel = status, never delete; RLS: org managers + the planned worker; writes only through `create_work_plan_entry_v1` / `cancel_work_plan_entry_v1`, both re-checking `manages_organization` + roster scope), projected as the ninth calendar source, planned on the workforce planning zone with leave-overlap flagging via the existing predicate; degrades to "not available" until applied. Migration `20260902200000` is OWNER_GATE (SECDEF + grants, RED by rule) — apply pack in the PR. **F4 chain PRODUCTION_PROVEN 2026-09-02 on existing features** ([evidence](../audits/evidence/final-completion/f4-company-work-chain-prod-proof-2026-09-02.md)): invite → accept → role → org membership → work object → imported hours → worker timesheet (draft → lines computed from allocations → submitted) → approval pack → manager approves → PATVIRTINTAS → CSV export. **Finding F4-1** (G-01 class): roster accept alone leaves the worker's engagement without an organisation, so timesheet organisation options stay empty until `add_org_member` — the accept RPC should bind the organisation (RED by rule, not fixed here). Still open: plan primitive (gated), hours ↔ project/object/task linkage, M13: PARTIAL | one real company chain on prod, end to end |
| **G** education / student | institution → roster → learner claim → evidence → transition → skills-gap signal | **G3 PRODUCTION_PROVEN 2026-09-02** ([evidence](../audits/evidence/final-completion/g-institution-learner-browser-chain-prod-proof-2026-09-02.md)): institution declares education through the real UI → invites by human relationship name (Studentas) → the learner sees it in-app (delivery = G-1, does not block) → accepts in a real browser → `student` context exists beside the untouched personal `employee` context → learner home brief. G-11 closed by the owner's bounded-identity directive. Open: `can_view_worker` learner-disclosure question (owner), skills-gap feedback loop | prod browser chain with two bounded identities |
| **H** marketplace / matching / engagement | reachability (M7/M8) + two-sided lifecycle to `engagement_contexts` | **M7 + M8 CLOSED as decisions (2026-09-02)**: the loop is reachable — `/dashboard/services` and `/dashboard/service-requests` render directly, the map bridge links both halves, the finder and the activity centre resolve them; not in the global nav BY the compact map-first IA ruling (`compact-nav-marketplace-ia.test.ts`); the customer is a company TYPE (`client_customer`) by the company-role-simplicity ruling. H2 two-sided lifecycle proof on prod still open: PARTIAL | demand → match → contact → booking → engagement proven on prod through native nav |
| **I** visual / UX / design-system | screenshot audit of every actor × route on prod; IA + nav + component hierarchy decision; consolidation (M10–M12) | **I1 DONE**: 26-screen production walk (worker + company routes, 390/1440) — [evidence](../audits/evidence/final-completion/i1-production-ux-walk-2026-09-02.md): ONE visual generation, no overflow, no 2018-CRM pattern on these routes; findings = back-arrow-only inner chrome (M11), technical chip vocabulary for a worker with nothing planned, stale RUOŠIAMA label on projects, Rexora footer, 7–16 s cold first loads. Admin routes + landing not yet walked (need admin identity / owner). **I2**: two of three were implementation-level and are DONE (#1439: planning chips name only present sources; the stale RUOŠIAMA prefix removed in 5 locales); the Rexora footer stays by the owner directive 2026-07-14; the ONE product-semantic decision left = inner-page navigation (A recommended: persistent compact workspace strip; B finder-only) — action sheet item 8 | before/after screenshot pack per actor; no legacy-pattern route left unclassified |
| **J** languages / mobile / accessibility | locale completeness model, language persistence, phone-width walks, a11y basics | **J1 DONE**: launch locale policy = `LANGUAGE_MATRIX.md` §8 (FULL per surface class, launch locales `lt en ru nl de`, persistence proven in code, add-a-locale checklist). **J2 partial**: 26 routes at 390 px with zero overflow (I1 walk). **J3 DONE** (#1435 merged): a real-browser walk of 21 production routes ([evidence](../audits/evidence/final-completion/j3-a11y-basics-prod-walk-2026-09-02.md)) found six structural defects — nested `<main>` on the job/question pages, no main landmark on the chat-first dashboard, unlabelled chat composer, four unlabelled timesheet fields, h1→h3 skip on `/for-*` — all fixed and pinned by guard `a11y-basics-v1`; the `/jobs` landmark fix rides #1433 (G-16). No axe-core in the repo: WCAG-A structural basics only. **Verified live after deploy** ([after-fix walk](../audits/evidence/final-completion/j3-a11y-basics-prod-walk-after-fix-2026-09-02.md)): 21 routes, zero issues except the two `/jobs` pages waiting on #1433 (G-16). Remaining: PARTIAL (contrast / keyboard walk not measured) | matrix updated in `LANGUAGE_MATRIX.md`; mobile walks recorded with screenshots; a11y audit pass |
| **K** privacy / security / SEO / AEO | public-jobs privacy rule audited across HTML/JSON/schema.org/API/metadata/cache; secret scanning; rate limits; MFA/passkey evaluation | **K1 PASS 2026-09-02** — anonymous leak matrix over the anon RPCs, direct table read (401), list + detail HTML, JSON-LD (none), robots, sitemap: **zero protected fields** ([evidence](../audits/evidence/final-completion/k1-public-jobs-leak-matrix-2026-09-02.md)); K3 note: JobPosting schema must NOT be added (needs hiringOrganization). **K2 probe 2026-09-02** ([evidence](../audits/evidence/final-completion/k2-rls-isolation-probe-2026-09-02.md)): profiles / workers / roster / objects / allocations / engagements / organizations isolated across three bounded identities; outsider writes refused — **one finding K2-1 (P1)**: the `companies` row policy admits every signed-in user, so contact columns are readable beyond the consent model; fix = column-level grants + owner/admin definer readers, **RED draft #1430** (app side falls back until applied). **K3 built, OWNER_GATE G-16** (#1433, draft): anonymous-safe JSON-LD on the public job pages (CollectionPage/ItemList + WebPage/Occupation with salary band), never JobPosting. **Secret scanning: enabled + push protection enabled** (repo settings read 2026-09-02; non-provider patterns and validity checks off = owner option). **Rate limits: present** on every anonymous-writable or expensive route (`/api/waitlist`, `/api/dashboard-search`, `/api/cv/extract` → 429 + retry-after via `lib/limits/request-rate-limits.ts`); `/api/health` is read-only and cheap; auth endpoints are rate-limited by Supabase; `/api/mcp` is OAuth-gated. K2 fix apply = G-12: PARTIAL | leak matrix with zero protected fields exposed; findings ≤ P2 |
| **L** observability / backup / scaling | error monitoring, health probe, critical-flow metrics, alerts tied to user impact, backup/rollback drill, thresholds for 100/1k/10k/100k | **L1 DONE**: `/api/health` (auth + db probes, 200/503, booleans + latencies only) and `instrumentation.ts` `onRequestError` → one PII-free JSON line per uncaught server error; alert rule set, drill plan and owner steps in [`docs/operations/observability-v1.md`](../operations/observability-v1.md). **L1 PRODUCTION_PROVEN 2026-09-02**: `/api/health` on `1b64843d` → 200 `{auth 37–249 ms, db 194–366 ms}` (one transient upstream 500 on the first call after deploy → 503, exactly the honest answer). **L2 internal half DONE (#1439)**: `.github/workflows/health-probe.yml` calls `/api/health` every 15 min, 3 attempts; a failed run e-mails the repository owner. External monitor stays optional. **L3 drill = OWNER action**: the Vercel CLI is blocked for the agent (permission classifier), so the promote-previous-deployment drill in `observability-v1.md` §4 must be run from the owner's Vercel dashboard/CLI once | alerts fire on a synthetic failure; rollback drill recorded |
| **M** cross-actor production E2E | the §33 definition run as one chain by an unfamiliar-user protocol | **PARTIAL by composition (2026-09-02)**: legs proven on prod with bounded identities this window — unfamiliar user: register → confirm (A1) → onboarding → journal via chat (E2) → connected apps (A2) → data export (I1 walk); company: register → org → roster → hours → import (E3) → timesheet → approval → export (F4) → plan (F1, G-13); institution → learner (G). The ONE unproven leg is employer demand → worker board → interest → engagement, which needs an admin-verified test employer (**G-14**) and was not simulated. Unfamiliar-user defects found were filed to I2 (chip vocabulary, back-arrow chrome, cold loads) | full chain on prod with bounded identities, zero residue beyond the register |

---

## 2. LAUNCH_READY gate board

| Gate (owner §33) | State |
|---|---|
| security gates passed | PARTIAL — advisors triaged, health + error lines live (L1), K1 PASS, K2 isolation PASS with one P1 finding open (K2-1 companies contact columns) |
| payment E2E | MISSING (live) |
| auth E2E | PRODUCTION_PROVEN (existing) / IMPLEMENTED_UNPROVEN (new-user UI) |
| social auth E2E | Google only |
| mobile E2E | builds + runtime proven; product journeys not |
| backup / recovery | not drilled |
| observability | PARTIAL — health probe + structured error lines shipped (L1); external monitor (EXTERNAL_GATE, free) and the rollback drill open |
| capacity thresholds | numbers exist (`#1416` §J); thresholds not formalized |
| privacy controls | export/consent exist; public-jobs leak matrix PASS (K1); RLS regression suite (K2) open |
| production rollback path | Vercel rollback exists; not drilled in this stage |

---

## 3. Owner / external gates (the only things the trains may stop for)

| # | Gate | Class | What the owner does | What unblocks |
|---|---|---|---|---|
| G-1 | **CORRECTED 2026-09-02 (owner-verified):** production Auth mail ALREADY goes through Resend — Supabase Custom SMTP is enabled (`smtp.resend.com:465`, sender `noreply@labourmarket.ai` / LabourMarket.ai), team `bandymuks1`, domain verified, DNS live (DKIM `resend._domainkey`, `send.` SPF/MX to SES eu-west-1). The Resend dashboard shows today's confirmation traffic to the bounded `e2e-*` identities as BOUNCED (fake mailboxes — expected, not a transport failure) and one SUPPRESSED. Server side: 12 `user_confirmation_requested` events today, zero mailer/SMTP errors. Template = the default `{{ .ConfirmationURL }}` (proven: `/verify` → 303 to our callback with `flow=email_confirm&next=…`), handled on any device by Train A. **Remaining = ONE owner acceptance test on a real external inbox** (`docs/human-gates/email-delivery-gate.md` → "The one real-inbox test"). Keep the existing team; do not transfer the domain | EXTERNAL_GATE (one real-inbox test) | register once with a fresh real address on a phone, report the two screens | Train A complete; CORE_PRODUCT_READY gate 1 |
| G-2 | LinkedIn + Meta developer apps + Supabase provider config (`GOOGLE_OAUTH_BRANDING_RUNBOOK.md` pattern) | EXTERNAL_GATE | create apps, paste credentials into Supabase | Train C |
| G-3 | Drop 2 unused `public_vacancies` indexes (≈ 85 MB, reversible DDL) | OWNER_GATE | approve pack | Train B |
| G-4 | Expired-vacancy retention (deactivate + strip text after `expires_at`+30 d; 25,635 rows / 87 MB) | OWNER_GATE | approve semantics | Train B |
| G-5 | ESCO locale scope (575,407 rows / ≈ 235 MB, re-importable) | OWNER_GATE | approve scope | Train B |
| G-6 | Supabase plan: upgrade vs optimise first | OWNER_GATE | decide | Train B / L |
| G-7 | Canonical price set for live payments (closed #754 + #894 vs #895 draft) | OWNER_GATE | confirm the one price table | Train D |
| G-8 | Stripe live keys + webhook secret + lifting the code live-block (RED class by policy) | EXTERNAL_GATE + RED PR | provide keys; approve the RED PR | Train D |
| G-9 | Delete TEST identities (`e2e-*@labourmarket.ai`, 5 rows) — `pilot_events` FK is NO ACTION, needs a scoped cleanup migration | OWNER_GATE | approve cleanup pack | hygiene only |
| G-10 | Inherited RED drafts — CLASSIFIED 2026-09-02 (no ambiguous bucket): #1046 SUPERSEDED by **#1440** (port, in the batch); #1266 before commercial launch; #1045/#1355/#883/#740/#896/#897 POST_LAUNCH; #895 REJECT/CLOSE — table in `OWNER_ACTION_QUEUE_2026-09-02.md` | OWNER_GATE | approve / close per the table | as listed |
| G-11 | ~~One second real browser identity for learner ACCEPT~~ **CLOSED 2026-09-02** — the owner's execution directive authorised bounded TEST identities in a real browser; used for A, E2, F4, G, J3 | CLOSED | — | — |
| G-12 | **Batch item 1** ([`migration-approval-batch-2026-09-02.md`](../human-gates/migration-approval-batch-2026-09-02.md)) — apply RED draft **#1430** (K2-1 companies contact minimization: column grant + two definer readers; no data change; rollback restores the full grant) | OWNER_GATE | approve + apply via MCP | closes the open P1 |
| G-13 | Apply RED draft **#1426** (F1 `work_plan_entries`: additive table + RLS + two definer RPCs; no data change) | OWNER_GATE | approve + apply via MCP | Train F plan primitive on prod |
| G-15 | Apply RED draft **#1436** so `accept_company_worker_invitation` also binds the organisation membership (finding F4-1; SECURITY DEFINER body; rollback = previous body verbatim) | OWNER_GATE | approve + apply via MCP | worker timesheets without a manual `add_org_member` |
| G-16 | Extend the PR-scoped product-gate waiver `public-acquisition-route-jobs` (`.github/scripts/owner-waivers.mjs`) with **#1433** — anonymous-safe JSON-LD + the nested-`<main>` fix on `/jobs`; every PR touching those files re-opens the 30 A-01 findings by design | OWNER_GATE | one-line approval on #1433 | Train K3 + the last J3 finding |
| G-14 | Admin verification of `E2E Walker UAB` (company `b16e3a86-…`): the ONE admin account (`su***@gmail.com`, `profile_roles.role='admin'`; the owner's own account is not admin) → `/lt/dashboard/admin/company-verification` → Verified. Post-approval proof script ready (`h2-demand-board-proof.mjs`) | OWNER_GATE | one admin click | Train H2 + the last M leg |

Everything else is an engineering decision and is **not** brought back to the owner.

---

## 3a. Target states (owner correction 2026-09-02 — the acceptance definition is NOT weakened)

| State | Definition | Gates that must be closed |
|---|---|---|
| **CORE_PRODUCT_READY** | an unfamiliar person can register, confirm, onboard, work (journal, documents, CV), be invited, be seen; a company can register, claim its organisation, roster, plan, record, approve, export; an institution can link a learner — all proven on production, every core defect fixed or gated with a reversible draft | G-1 (real-inbox confirmation), G-16, G-12, G-15, G-13, G-14 + its M leg |
| **COMMERCIAL_LAUNCH_READY** | CORE_PRODUCT_READY **plus** every mandatory launch capability of the canonical command: social-auth production E2E for the providers in launch scope, payments production E2E for paid entitlements (checkout → subscription → webhook → entitlement → renewal/cancel/failure → idempotency → customer-visible state), critical UX decided (I2), observability + rollback drill done, cross-actor chain (M) complete | + G-7, G-8 (payments), G-2 (LinkedIn/Meta, if in launch scope), I2, L2/L3 |
| **REAL_USERS** | first unfamiliar users admitted; OBSERVE → FIX → SCALE | — |

Neither state is declared by this register until its gates are closed with evidence. The owner action
sheet [`OWNER_ACTION_QUEUE_2026-09-02.md`](OWNER_ACTION_QUEUE_2026-09-02.md) is split accordingly:
DO NOW (unlocks the next execution frontier) · DO BEFORE COMMERCIAL LAUNCH · SAFE TO DEFER AFTER LAUNCH.

## 4. Change log

- **2026-09-03 pilot execution — internship type live, runbooks, RED batch C.** Merged **#1455**: internship / apprenticeship as canonical `opportunity_type` values (the SQL projection `demand_structured_v2_public` re-declared byte-for-byte with two more allowed values; TS union + labels lt/en/ru/nl/de; guard pins union, allowlist, rollback and byte-identity). **APPLIED TO PROD** `20260903130000_opportunity_type_internship_apprenticeship_v1` (ledger `20260903094724`, rollback `supabase/rollbacks/20260903130000_….down.sql`); verified: `{"opportunity_type":"internship"}` and `apprenticeship` project, an unknown value still drops, `employment` unchanged. Production `9a77bd7d`, health 200. **#1456** RED batch C (draft, `needs-human-gate`): `institution_learner_outcomes_v1` — one aggregate function (counts only, suppressed below 3 learners, never a learner row) for institution outcome visibility under the least-privilege ruling. **#1448** now also shows the client's accepted/declined decision on the agency progress view. All three RED drafts (#1448 → 259, #1454 → 258, #1456 → 258) re-based on `main` (257) and MERGEABLE-pending. Production pilot runbooks written: `PILOT_RUNBOOK_LANE_A_RECRUITER.md`, `PILOT_RUNBOOK_LANE_B_INSTITUTION.md` (real people, real rows, the agent records T0 / TTFV / drop-offs / friction; never acts as the pilot).

- **2026-09-03 late — education/student and agency loops (owner priority).** Merged: **#1452** Learning Compass (student home's five answers from real evidence: profession + current education, skills by tier + journal + education counts, the board's strong/possible fits, the engine's own missing-skill gaps or the profession registry as fallback, deterministic next steps — nothing generated). **#1453** live market demand section for agencies and institutions (real public vacancy pool, provenance stated) merged 09:22 UTC — the constitution gate keys standalone cards on `*-card.tsx`; a read-only in-page section of the declared company workspace is the honest shape, so it was renamed rather than self-declared. **#1448** (RED batch A) now carries the client **accept/decline** UI on agency candidate offers (v2 read with v1 fallback, honest not-ready state) and is rebased. **#1454** (RED batch B, draft, `needs-human-gate`): `education_programs` / `education_cohorts` / `education_cohort_members` (institution → programme pointed at a work direction → cohort → learner assigned from accepted invitations; RLS via `manages_organization`; writes only through three definer commands) + `count_public_vacancies_by_profession_v1` (anon-safe, contract in the anon SECDEF allowlist), co-shipped with the full programmes/cohorts UI in honest `needs-migration` state. **TTFV baseline from real `pilot_events`** (14 profiles, same definition as the new admin section): employers 3 people, 2 reached a real action/result, median ≈ 5 h; workers 3 people, 1 reached action in 1 min, result ≈ 5 h; no student/agency yet. Pilot-readiness claims for the five actors rest on CI-green code plus the earlier production proofs; the first external pilot supplies the first real per-actor TTFV.

- **2026-09-03 afternoon — P2-1 PROD_VERIFIED, count made index-only, Track C slice 1, TTFV metric.** Production on `ae3717e6`: `/foo-control.xml`, `.json`, `.txt` → **404** (branded root not-found); `/llms.txt` 200; landing intact. Measured after the covering index: still 26,098 heap fetches (last autovacuum 2026-08-28 — the nightly importer's updates never reach the 20 % threshold); one manual `VACUUM (ANALYZE)` → 0 heap fetches, 618 ms warm, `/jobs-sitemap.xml` cold **200 in 1.86 s**. **#1449 merged; APPLIED TO PROD** `20260903110000_public_vacancies_autovacuum_v1` (ledger `20260903074823`, rollback `supabase/rollbacks/20260903110000_….down.sql`; `reloptions` verified). **#1450** institution learners section (participation under the least-privilege ruling) and **#1451** time-to-first-value per actor on admin telemetry opened with auto-merge. Pilot lanes corrected: #1303 (headcount in any language) merged 2026-08-28. The agency bridge's client side already carries contact + propose-booking on offered candidates, so the agency chain is functionally complete today; #1448 adds the explicit accept/decline record.

- **2026-09-03 — FIRST REAL ECOSYSTEM USE execution opened (owner mandate).** Audit phase closed; execution mode. Merged to `main` and deployed: **#1439** (health-probe cron, SMTP procedure; conflict resolved keeping both register semantics), **#1445** (P0-1 GREEN: constant-cost health probe = PK lookup on `get_public_vacancy_preview_v1`; board index + `work_mem`; `/jobs-sitemap.xml` 503+Retry-After on transient failure; root layout + root not-found; `/llms.txt`), **#1447** (universal first-run router: five intents → two identities; student = current `worker_education` row; agency = `staffing_agency` company type; institution = `training_provider` capability declared by the setup action; `intent` telemetry + `first_real_action` / `first_real_result` events), **#1446** (P0-1 covering index; P2-1 via `dynamicParams = false` on the `[locale]` segment — the frozen landing untouched). **APPLIED TO PROD:** `20260903070000_public_vacancy_board_index_and_count_work_mem_v1` (ledger `20260903070235`, rollback `supabase/rollbacks/20260903070000_….down.sql`) and `20260903090000_public_vacancy_supply_cover_index_v1` (ledger `20260903072912`, rollback `…20260903090000_….down.sql`). Production health after: 200 ×3 with db 31–328 ms (was 503, 503, 200). **L1 re-graded PRODUCTION_PROVEN on the new probe.** New RED draft **#1448** (`needs-human-gate`): supply-counts row + pg_cron (P0-1 constant-cost half) and agency candidate-offer decision (client accept → canonical booking). Owner actions consolidated in `OWNER_ACTION_QUEUE_2026-09-03.md`; pilot lanes in `PILOT_LANES_2026-09-03.md`. Measured facts recorded: the count is CPU-bound (warm seq scan 2,821 ms → index-only 640 ms); `/foo.xml` 500 root cause = `[locale]` segment rendering the landing with `locale="foo.xml"`; the agency bridge is keyed on companies end to end (legacy `agencies` pool unused — the "two key spaces" seam does not affect the canonical chain); `ssh agentai-vps` is denied to the agent (VPS-1 stays owner).

- **2026-09-02 evening — G-1 CORRECTED (owner-verified).** Production Auth mail already flows through Resend (team `bandymuks1`, Supabase Custom SMTP `smtp.resend.com:465`, sender `noreply@labourmarket.ai`); today's `e2e-*` confirmation mails BOUNCED as expected (fake mailboxes), one SUPPRESSED; zero mailer/SMTP errors server-side. Time-expiry proven without a single new send: the unconfirmed 12:42 UTC token verified at ~18:30 UTC → `403 otp_expired`. Root TXT `resend-domain-verification=…` identified as the abandoned new-team claim (optional bounded cleanup). G-1 is now exactly ONE owner acceptance test on a real external inbox (`docs/human-gates/email-delivery-gate.md`). Owner decision: keep the existing team; no transfer, no rotation. Evidence: `docs/audits/evidence/final-completion/g1-resend-smtp-state-2026-09-02.md`.

- 2026-09-02 — register opened; handoff reconciled; §6 email gate verified live; Connected Apps confirmed MISSING; residue recorded.

---

## 5. FULL PRODUCT VISION AUDIT (additive layer, 2026-09-02)

> **This section does NOT revise anything above it.** Sections 0–4 answer
> *launch readiness* and keep their original meaning and authority. This section
> answers a different question — *how much of the FINAL LabourMarket.ai vision
> exists* — against a different denominator (the canonical product vision
> §1–§19 plus the owner's full-vision audit brief).
>
> Full audit: [`docs/audits/FULL_PRODUCT_VISION_AUDIT_2026-09-02.md`](../audits/FULL_PRODUCT_VISION_AUDIT_2026-09-02.md)

### 5.1 Three separate states

| State | Score | Denominator |
|---|---:|---|
| `CORE_PRODUCT_READY` | **78%** | the current core (worker + employer web loop) working for a real user in production |
| `COMMERCIAL_LAUNCH_READY` | **35%** | actually accepting paying users |
| `FULL_VISION_COMPLETE` | **38%** | the canonical vision §1–§19 + the audit brief's domains |

`CORE_PRODUCT_READY` is **not** vision completion. The gap between 78% and 38%
is the honest measure of how much product remains.

### 5.2 Domain scorecard (weights = final product mass, not current code mass)

| Domain | W | % | Headline |
|---|---:|---:|---|
| Identity & multi-context account | 5 | 65 | PROD core; intern/apprentice/graduate/mentor vocabulary missing |
| Worker · Living CV · Journal · evidence | 8 | 70 | strongest domain, PROD_VERIFIED |
| Employer · demand · recruitment | 7 | 55 | core proven; no employer demand since 2026-07-13 |
| **Education & students** | 10 | **18** | substrate only — no programmes/cohorts/qualifications/internships |
| **Agencies & staffing** | 9 | **25** | full RPC loop, 0 rows, no workspace, **no placement object** |
| Workforce OS | 9 | 45 | enterprise skeleton; 19 of 24 operational tables never used |
| Services marketplace + housing | 6 | 20 | housing (vision §8) MISSING entirely |
| Credentials · verification · trust | 4 | 40 | model excellent, `worker_documents` 0 rows |
| Documents · mobility · compliance | 4 | 30 | guidance content, not a rules engine |
| Matching + AI | 7 | 45 | matching strong & explainable; `ai_runs` = 7 lifetime |
| Market intelligence + upstream | 5 | 30 | supply-side imports only; upstream discovery MISSING |
| Payments · LMC · invoicing | 6 | 25 | all 7 flags `false`; invoicing from journal MISSING |
| Communication · notifications · social | 4 | 35 | transport live; LI/FB/IG/TikTok channels absent |
| Language / global reach | 4 | 30 | 5 of 24 routed; Georgian absent |
| Security · privacy · GDPR | 5 | 70 | strongest non-worker domain; one open P1 (K2-1) |
| Automations & autonomous agents | 4 | 12 | Agent OS is 10 static doc cards, no runtime |
| Mobile & multi-surface (incl. MCP) | 3 | 30 | builds + MCP proven; zero product data on mobile |
| **TOTAL** | **100** | **38.4** | |

### 5.3 NEW P0 production finding — **P0-1**

**The anonymous read path sits ON the `anon` 3 s statement timeout, and
`/api/health` flaps RED.** `count_public_vacancies_v1()` measured at **3,758 ms**
(`EXPLAIN ANALYZE`, cold buffers, spills to temp) against `anon`
`statement_timeout=3s`; `search_public_vacancy_previews_v1` — the public job
board — measured **2,747 ms**. Four live probes on `c252fae8`: **503, 503**
(19:59 / 20:01 UTC), then 200, 200 once buffers warmed.

Consequences: the Train-L1 grade "PRODUCTION_PROVEN" was taken on a warm probe
and should read **PARTIAL**; the #1439 health cron will page the owner on
cold-buffer runs; the SEO/acquisition surface is one buffer eviction from
erroring for anonymous visitors. **GREEN class, no owner gate** — this is the
first autonomous action on resume.

### 5.4 Verdicts the brief asked for separately

- **STUDENT + EDUCATION — `PARTIAL` 18%.** Institution → invite → learner accept
  → `student` context beside employment is `PROD_VERIFIED` and the identity model
  is right. Everything an education institution would actually *use* is
  `MISSING`: programmes, courses, cohorts, assignments, teacher validation,
  qualification issuance, internship/apprenticeship management, graduation,
  graduate tracking, outcome analytics, curriculum feedback, Learning Compass.
  Of the seven links in `demand → gap → education → evidence → qualification →
  internship → employment`, **two exist**.
- **AGENCY — `BACKEND_ONLY` 25%.** `agencies` + 6 tables + ~16 RPCs implement a
  complete two-sided loop (client connections, demand shares, candidate offers,
  pool, invitations, docs readiness) — **every table has 0 rows**, there is **no
  `/dashboard/agency` route**, and there is **no placement/assignment object**
  between "offer accepted" and an employment engagement. Worker portability is
  safe by architecture. Blocker to any agency train: `agencies` and
  `staffing_agency`-typed companies are **two disjoint key spaces**.
- **WORKFORCE OS — `PARTIAL` 45%.** Genuinely enterprise-grade skeleton (one
  canonical workflow engine, append-only ledgers immutable even to
  `service_role`, row-level work-hour allocations, proven timesheet→approval→
  export chain). 19 of 24 operational tables have never held a row; the plan
  primitive is owner-gated (#1426); the calendar has no write path.
- **INTELLIGENCE + AUTONOMY — 30% / 12%.** Source governance is exemplary
  (activation gated on owner approval + confirmed legal status; small-sample
  suppression). Signal coverage is supply-side only. No live agent runtime
  exists inside labourmarket.ai — discovery/outreach should stay **Agentai OS**
  authority; what this product is missing is the **user-facing automations
  engine** (vision §12).

### 5.5 Parallelisable lanes

Eight of eleven lanes are **unblocked today**: P0-1 · education model · agency
workspace + placement · invoicing from journal · upstream discovery · lifecycle
vocabulary · housing · marketplace lifecycle. Only live payments, LinkedIn/Meta
auth, chat transcript persistence and the plan primitive are owner-gated.
**The product is scope-bound, not gate-bound.**

### 5.6 What this audit did NOT change

No launch-readiness entry, train state, gate or evidence link in §0–§4 was
edited. No PR touched. No migration applied. No CI or deployment altered.

### 5.7 Continuation 2026-09-03 — fourth score, 20-domain coverage, new domains

Continuation: [`docs/audits/FULL_PRODUCT_VISION_AUDIT_2026-09-03.md`](../audits/FULL_PRODUCT_VISION_AUDIT_2026-09-03.md)
(re-verified at `main` = production = `b9db4431`). §0–§4 and §5.1–§5.6 are
unchanged; `CORE_PRODUCT_READY` and `COMMERCIAL_LAUNCH_READY` keep their
launch-layer meaning.

| State | Score | Note |
|---|---:|---|
| `CORE_PRODUCT_READY` | **78%** | held — P0-1 reproduced unfixed at `b9db4431` (503, 503, 200) |
| `COMMERCIAL_LAUNCH_READY` | **35%** | held |
| `FULL_CANONICAL_VISION_COMPLETE` | **40%** | 39.6 on the brief's 20 material domains (re-normalisation of the 38.4 above, +1.2, no new product) |
| `FULL_CANONICAL_VISION_PROD_VERIFIED` | **24%** | only production-verified credit; the 16-point gap to 40 is tested code with no production row |

Domains first indexed by the continuation: services marketplace `PARTIAL` 30
(real to `accepted`, nothing after) · housing `MISSING` 0 · document engine
`PARTIAL` 35 (inventory model, 0 rows, no rules engine) · invoicing 15 (manual
`finance_records`, nothing generated from work) · automation engine `MISSING`
10 · SEO/AEO `PARTIAL` 45 · admin/observability `PARTIAL` 45 · Telegram/social
10 · **Agentai OS integration `PARTIAL` 30** (contract
`contracts/labourmarket-capability-contract.json` exists, one-way, 9 days
stale; radar/outreach schedules on the owner PC all **Disabled**; VPS state
`UNKNOWN`).

New production findings: **P0-1b** — `/jobs-sitemap.xml` (advertised in
`robots.txt`) returns 500 on cold buffers via the same `count_public_vacancies_v1`
timeout; **P2-1** — apex unknown paths with a file extension (`/foo.xml`,
`/foo.json`, `/llms.txt`) return 500 instead of 404 (locale-prefixed paths 404
correctly). Both `PRODUCT_DEFECT`, both GREEN-class fixes, both folded into
WAVE 0. Also: **#1439 is now `CONFLICTING`** — the only auto-merge PR cannot
merge until its register conflict is resolved (recipe in
`RESUME_CHECKPOINT_2026-09-02.md`).

New owner gates (genuine only): **VPS-1** Agentai VPS scheduler state ·
**TG-1** create the LabourMarket.ai Telegram channel · **AEO-1** (optional)
editorial approval of first answer pages. Resume from
`RESUME_CHECKPOINT_2026-09-03.md`.
