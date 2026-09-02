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
| **A** security / auth / new-user / Connected Apps | confirm-email UX (cross-device link, `next` carry, resend, unconfirmed-login copy), Connected Apps surface, new-user browser walk, all 12 identity cases | **A1 PRODUCTION_PROVEN 2026-09-02** (#1418 = `2a939c83`): token_hash link on a device without the PKCE verifier → session + `next` preserved; replay/garbage/expired → `link_expired`; default template on another device → `confirmed_sign_in`; unconfirmed login refused; resend 200 — [evidence](../audits/evidence/final-completion/a1-email-confirmation-prod-proof-2026-09-02.md). Delivery to a real inbox = EXTERNAL_GATE G-1. **A3 evaluated** — [`docs/security/session-mfa-passkey-evaluation-2026-09-02.md`](../security/session-mfa-passkey-evaluation-2026-09-02.md): TOTP/passkeys = post-launch owner toggles; "my sessions" = DEFERRED (no GoTrue API). **A2** Connected Apps: MERGED #1419 (`289c92ac`) — `/dashboard/account#connected-apps`, GoTrue `listGrants`/`revokeGrant`, two-step disconnect, command-registry entry; **PRODUCTION_PROVEN 2026-09-02** — list → scopes → granted-at → two-step disconnect → client refresh `refresh_token_not_found` → `/api/mcp` 401 → reconnect works ([evidence](../audits/evidence/final-completion/a2-connected-apps-prod-proof-2026-09-02.md), 4 screenshots at 390 px) | A2: list/scopes/granted-at/revoke → revoked access refused → reconnect, on prod with a bounded identity; then identity cases 6–8 in a browser |
| **B** DB lifecycle / capacity | expired-vacancy semantics in reads (non-destructive), thresholds doc, gate packs for A–D | **B1 CLOSED 2026-09-02 as already-correct + one detail read aligned.** Prod proof: rows flagged `is_active` 70,767; unexpired 45,132; the anon count RPC returns **45,132** — every public read path (5 RPCs, board search, detail-by-id, previews, supply timestamp, market facts) applies `expires_at`; only the RLS policy is `is_active`-only, which is not a read path a user reaches. The one `is_active`-only read (`getPublicVacancy` by publisher key, zero callers) now applies the same predicate. **B2 DONE as a RED draft**: PR #1421 (`needs-human-gate`, unapplied) ships `public_vacancy_retention_run_v1` (dry-run default, stage 1 reversible / stage 2 opt-in), the 0-scan-asserted drop of two unused indexes, and `esco_labels_prune_locales_v1` — pack [`docs/human-gates/db-lifecycle-gate.md`](../human-gates/db-lifecycle-gate.md). **B3 DONE**: [`docs/operations/capacity-thresholds-v1.md`](../operations/capacity-thresholds-v1.md) (T1–T4 triggers, 100/1k/10k/100k lines, G-6 rule). B4 = apply on owner approval; gates OWNER_GATE G-3…G-6 | dry-run + real-run counts recorded after approval |
| **C** social auth | LinkedIn + Facebook full matrix (signup, login, collision, linking, logout, re-login, provisioning, assistant continuation, mobile, cancel) | Google PRODUCTION_PROVEN; **C1 DONE**: gate pack [`docs/human-gates/social-providers-gate.md`](../human-gates/social-providers-gate.md) (exact LinkedIn/Meta console steps; auto-link collision policy recorded). **C2 DONE**: `tests/e2e/social-auth-matrix.spec.ts` — the provider-independent legs (cancel → neutral, expired link → resend, cross-device → confirmed_sign_in, honest provider buttons from the auth server's own settings, hostile `next` never survives) run in the CI e2e subset on every PR (floor 21 → 27). Provider-screen legs = human step per provider. LI/FB EXTERNAL_GATE G-2 | per-provider matrix on prod with bounded identities once G-2 closes |
| **D** payments | canonical price set → live Stripe under RED gate → full chain E2E | test chain IMPLEMENTED_UNPROVEN (test); live MISSING; OWNER_GATE G-7, EXTERNAL_GATE G-8 | live checkout/renewal/upgrade/downgrade/cancel/failed/webhook idempotency/entitlement/invoice/refund/VAT proven on prod |
| **E** worker / Living CV / Journal / import | credential validity model, journal input paths, XLSX import proven on a real company file with rollback + receipt | **E1 DONE**: current validity (ACTIVE / EXPIRED / REVOKED / PENDING / REJECTED / UNVERIFIED / UNKNOWN) derived by a pure rule (`lib/documents/credential-validity.ts`) from the stored row + the append-only `worker_document_events` history — read, never rewritten — and shown beside the verbatim verification on the document centre. XLSX pipeline IMPLEMENTED_UNPROVEN; E2 input-path proof open | import of an owner-supplied historical file on prod with receipt + rollback proof |
| **F** employer / company / project / timesheet | company control operational loop: project → object → assignment → calendar → work → journal → hours → timesheet → approval → report | **F1 IMPLEMENTED (RED draft PR)**: the PLAN primitive — `work_plan_entries` (who works on which project/object from D1 to D2; cancel = status, never delete; RLS: org managers + the planned worker; writes only through `create_work_plan_entry_v1` / `cancel_work_plan_entry_v1`, both re-checking `manages_organization` + roster scope), projected as the ninth calendar source, planned on the workforce planning zone with leave-overlap flagging via the existing predicate; degrades to "not available" until applied. Migration `20260902200000` is OWNER_GATE (SECDEF + grants, RED by rule) — apply pack in the PR. M3 closed; zero prod usage: PARTIAL | one real company chain on prod, end to end |
| **G** education / student | institution → roster → learner claim → evidence → transition → skills-gap signal | PARTIAL (server-proven; browser accept needs 2nd identity) | prod browser chain with two bounded identities |
| **H** marketplace / matching / engagement | reachability (M7/M8) + two-sided lifecycle to `engagement_contexts` | **M7 + M8 CLOSED as decisions (2026-09-02)**: the loop is reachable — `/dashboard/services` and `/dashboard/service-requests` render directly, the map bridge links both halves, the finder and the activity centre resolve them; not in the global nav BY the compact map-first IA ruling (`compact-nav-marketplace-ia.test.ts`); the customer is a company TYPE (`client_customer`) by the company-role-simplicity ruling. H2 two-sided lifecycle proof on prod still open: PARTIAL | demand → match → contact → booking → engagement proven on prod through native nav |
| **I** visual / UX / design-system | screenshot audit of every actor × route on prod; IA + nav + component hierarchy decision; consolidation (M10–M12) | **I1 DONE**: 26-screen production walk (worker + company routes, 390/1440) — [evidence](../audits/evidence/final-completion/i1-production-ux-walk-2026-09-02.md): ONE visual generation, no overflow, no 2018-CRM pattern on these routes; findings = back-arrow-only inner chrome (M11), technical chip vocabulary for a worker with nothing planned, stale RUOŠIAMA label on projects, Rexora footer, 7–16 s cold first loads. Admin routes + landing not yet walked (need admin identity / owner). **I2 decisions open** (owner-visible): persistent inner nav vs finder-only; role-aware chip vocabulary; label + footer | before/after screenshot pack per actor; no legacy-pattern route left unclassified |
| **J** languages / mobile / accessibility | locale completeness model, language persistence, phone-width walks, a11y basics | PARTIAL | matrix updated in `LANGUAGE_MATRIX.md`; mobile walks recorded with screenshots; a11y audit pass |
| **K** privacy / security / SEO / AEO | public-jobs privacy rule audited across HTML/JSON/schema.org/API/metadata/cache; secret scanning; rate limits; MFA/passkey evaluation | **K1 PASS 2026-09-02** — anonymous leak matrix over the anon RPCs, direct table read (401), list + detail HTML, JSON-LD (none), robots, sitemap: **zero protected fields** ([evidence](../audits/evidence/final-completion/k1-public-jobs-leak-matrix-2026-09-02.md)); K3 note: JobPosting schema must NOT be added (needs hiringOrganization). K2 suite + K3 open: PARTIAL | leak matrix with zero protected fields exposed; findings ≤ P2 |
| **L** observability / backup / scaling | error monitoring, health probe, critical-flow metrics, alerts tied to user impact, backup/rollback drill, thresholds for 100/1k/10k/100k | **L1 DONE**: `/api/health` (auth + db probes, 200/503, booleans + latencies only) and `instrumentation.ts` `onRequestError` → one PII-free JSON line per uncaught server error; alert rule set, drill plan and owner steps in [`docs/operations/observability-v1.md`](../operations/observability-v1.md). **L1 PRODUCTION_PROVEN 2026-09-02**: `/api/health` on `1b64843d` → 200 `{auth 37–249 ms, db 194–366 ms}` (one transient upstream 500 on the first call after deploy → 503, exactly the honest answer). L2 external monitor = EXTERNAL_GATE (free account); L3 drill open | alerts fire on a synthetic failure; rollback drill recorded |
| **M** cross-actor production E2E | the §33 definition run as one chain by an unfamiliar-user protocol | not started | full chain on prod with bounded identities, zero residue beyond the register |

---

## 2. LAUNCH_READY gate board

| Gate (owner §33) | State |
|---|---|
| security gates passed | PARTIAL (advisors triaged; no monitor) |
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
| G-1 | **Confirmation e-mail delivery.** Supabase's built-in mailer is rate-limited and restricted; production needs a custom SMTP provider (Auth → SMTP) and, for product mail, `INVITE_EMAIL_PROVIDER/API_KEY/FROM` (M6). Until proven, **no unfamiliar person can complete registration** — this is now the single hardest launch blocker. | EXTERNAL_GATE | configure SMTP credentials in Supabase Auth; confirm one real inbox receives the mail | Train A slice 1 proof; every other train's browser proofs |
| G-2 | LinkedIn + Meta developer apps + Supabase provider config (`GOOGLE_OAUTH_BRANDING_RUNBOOK.md` pattern) | EXTERNAL_GATE | create apps, paste credentials into Supabase | Train C |
| G-3 | Drop 2 unused `public_vacancies` indexes (≈ 85 MB, reversible DDL) | OWNER_GATE | approve pack | Train B |
| G-4 | Expired-vacancy retention (deactivate + strip text after `expires_at`+30 d; 25,635 rows / 87 MB) | OWNER_GATE | approve semantics | Train B |
| G-5 | ESCO locale scope (575,407 rows / ≈ 235 MB, re-importable) | OWNER_GATE | approve scope | Train B |
| G-6 | Supabase plan: upgrade vs optimise first | OWNER_GATE | decide | Train B / L |
| G-7 | Canonical price set for live payments (closed #754 + #894 vs #895 draft) | OWNER_GATE | confirm the one price table | Train D |
| G-8 | Stripe live keys + webhook secret + lifting the code live-block (RED class by policy) | EXTERNAL_GATE + RED PR | provide keys; approve the RED PR | Train D |
| G-9 | Delete TEST identities (`e2e-*@labourmarket.ai`, 5 rows) — `pilot_events` FK is NO ACTION, needs a scoped cleanup migration | OWNER_GATE | approve cleanup pack | hygiene only |
| G-10 | Six RED draft migrations already open (#1355, #1266, #1046, #1045, #883, #740) and three commercial RED PRs (#895–#897) | OWNER_GATE | approve / close each | as listed |
| G-11 | One second real browser identity for learner ACCEPT and two-user proofs (or approval to use bounded TEST identities in a real browser) | OWNER_GATE | approve TEST-identity browser use | Trains A, G, M |

Everything else is an engineering decision and is **not** brought back to the owner.

---

## 4. Change log

- 2026-09-02 — register opened; handoff reconciled; §6 email gate verified live; Connected Apps confirmed MISSING; residue recorded.
