# LabourMarket.ai — CAPABILITY INVENTORY & GAP MAP

> **Status:** canonical. Derived from **code + production**, 2026-08-27,
> revised 2026-08-28 (closure train #1320-#1324), extended 2026-08-31 with the
> full-product master matrix (§5, six parallel domain sweeps).
> Entry point: [`docs/ARCHITECTURE.md`](ARCHITECTURE.md).
> **A file existing is not proof. A green unit suite is not semantic proof.**

**Classification**

| tag | meaning |
|---|---|
| `PROVEN` | implemented **and** exercised in a browser with DB side effects checked |
| `UNPROVEN` | implemented, tests pass, **no end-to-end evidence** |
| `PARTIAL` | works for some inputs / actors / languages only |
| `MISSING` | not implemented |
| `DEFERRED` | deliberately postponed, architecture preserved |
| `OWNER-GATED` | blocked on an owner decision or approval |
| `ENV-GATED` | blocked on an environment/credential the repo cannot set |

---

## 1. PRODUCTION SNAPSHOT (2026-08-27, project `gorgitwvdzxbnaxhrsrw`)

| table | rows | reading |
|---|---|---|
| `profiles` / `workers` | 36 / 36 | real people |
| `organizations` | 13 | 10 company + 3 agency |
| `organization_roles` | 13 | exactly the backfill (10 employer + 3 workforce_provider) |
| `engagement_contexts` | 53 | all `employee` or `owner` |
| `journal_entries` | 36 | real evidence |
| `journal_entry_skills` | 46 | derivation is live |
| `worker_skills` | 48 | profile really receives it |
| `skills` | 161 | 153 + 8 transversal capabilities |
| `customer_requests` | 17 | real employer demand |
| `demand_interest_signals` | 5 | 2 delivered, 2 correctly suppressed, **1 real miss** |
| `notification_events` | 2 | both are backfill artifacts |
| `projects` | 6 | |
| `service_offerings` | 2 | |
| **`ai_runs`** | **0** | no AI has ever run in production |
| **`usage_cost_events`** | **0** | no AI cost has ever been recorded |

---

## 2. INVENTORY

### Person / worker core
| capability | status | evidence |
|---|---|---|
| Registration / login (incl. Google) | `PROVEN` | live, used by 36 profiles |
| Journal **without an employer** | `PROVEN` | 35/36 profiles hold an active org-less personal context |
| Work Journal entry (chat-first form) | `PROVEN` | browser + DB, `education-pilot-student` |
| Journal → capabilities → worker_skills | `PROVEN` | 3 cases browser+DB; 100% propagation in prod |
| Living CV / Player Card | `PROVEN` (import chain) | Browser-proven end to end 2026-08-28: in the chat, "Įkelk mano CV" produces the import control, a real DOCX goes through `/api/cv/extract` (mammoth), `parseCvSections` proposes the job, and only the explicit per-item confirm writes it — a fresh navigation to `/lt/cv` finds it in `cv-work-history`. Carries a negative control (nothing in the CV **before** the confirm). Renders + EU export unchanged (#1291). |
| CV import from **PDF** | `PROVEN` (was silently broken) | `extract.ts` passed unpdf `mergePages: true`, which collapses all whitespace including newlines. `parseCvSections` splits on newlines, so every PDF CV arrived as ONE line: zero work-history proposals, one nonsense education row. Fixed and guarded behaviourally at both the unit and browser levels; both guards observed failing when the flag is reintroduced. |
| Practice / volunteering as experience | `PARTIAL` | RPC proven under RLS; **no browser proof** (form trigger phrase unknown) |
| Opportunities board | `PROVEN` | browser, `pilot-interest-loop` |
| Express interest | `PROVEN` | browser + DB, state-independent |

### Employer core
| capability | status | evidence |
|---|---|---|
| Company setup / identity | `UNPROVEN` | code live, no E2E this round |
| **Organization multi-capability** | `PROVEN` | browser + DB — one org holds `employer` + `training_provider` |
| Demand intake (`customer_requests`) | `PROVEN` | #1322. The employer types the need ONCE: `/dashboard/market/recognize` now writes the canonical draft (`customer_requests`, `status='draft'`, via `save_demand_draft`) and the wizard's existing auto-continue prefills from it. Browser-proven in **LT / EN / RU / NL**, each with a DB assertion that the row is a draft and never `submitted`, plus a negative control that the form opens EMPTY without the recognizer |
| Worker board visibility | `PROVEN` | requires `companies.verification_status='verified'` |
| Sees waiting candidate + can review | `PROVEN` | browser + DB; status → `reviewed` |
| Contact / next action | `UNPROVEN` | code exists (`contact_demand_owner_v1`); not exercised |
| **Need → matching → ranked shortlist** | `PROVEN` | browser, 2026-08-27: a seeded LT demand recognised its own skills, retrieved and ranked 2 candidates with evidence-tier basis (`2/4 skills, 0 manager-confirmed`), disclosed missing facts, and offered shortlist + review actions. |

### Education
| capability | status | evidence |
|---|---|---|
| Institution declares capabilities | `PROVEN` | browser + DB, fresh database |
| `student` / `volunteer` relationship writable | `PROVEN` | RPC under RLS; `manager` correctly rejected |
| **Institution ↔ learner link** | `APPLIED`, `PROD-PROVEN (server chain)` | Migration 20260827200000 applied 2026-08-27 (ledger `20260827132137`). Re-proven on PRODUCTION in rolled-back transactions: capable org invites → learner accepts → `student` engagement alongside the existing employment; org without `training_provider` refused; `manager` refused; legacy invitation still → `employee`. Browser chain against the deployed app NOT yet run. |
| Learner visibility is NOT employer visibility | `APPLIED`, `PROD-PROVEN` | 20260827210000. Controlled comparison, non-admin org owner: one engagement row, `employee` → visible, same row as `student` → not visible. |
| Transversal capability recognition | `PROVEN` (12 recognition languages) | All 8 slugs classified `core`: LT/EN/RU base lexicon + real per-language needles in all 9 offline packs (da de et fi lv nl no pl sv). Guard-enforced (`offline-language-pack.test.ts`) + real-sentence tests (`lib/structuring/transversal-capability-locales.test.ts`). |
| Practice/volunteering as a matching signal | `SHIPPED (labelled, additive)` | `MatchSubject.practiceEngagements` → `practice_experience` reason in match-v1; NEVER employment, never a score input. Readable by the admin workbench + the worker's own board; an employer scouting session cannot read `engagement_contexts` (RLS 0013) so it degrades to "not stated". |

### Cross-cutting
| capability | status | evidence |
|---|---|---|
| Matching engine | `PROVEN` | browser 2026-08-27 via employer scouting; deterministic, evidence-tiered, no fabricated score |
| Interest → notification | `PARTIAL` | **works on current main** (browser+DB); 1 production miss not reproducible |
| Notifications delivery (email) | `MISSING` | rows only; no channel configured |
| Projects / objects / tasks | `UNPROVEN` | 6 rows, substantial code, no E2E this round |
| Services market | `PARTIAL` | `service_offerings` live, 2 rows |
| Teams / brigades | `PARTIAL` | org type `team` + brigade code exists |
| Documents / approvals | `UNPROVEN` | substantial code |
| Mobility | `PARTIAL` | country/location signals exist; radius YELLOW by design |
| Market intelligence | `PARTIAL` | market map + Eurostat import |
| **AI router** | `IMPLEMENTED`, `ENV-GATED` | one router, chain, privacy gate, cost model — **`ai_runs = 0`, no provider configured**. Reachable from 4 production routes (blocker 4.5); the gate is `AI_PROVIDER_MODE`, not code |
| AI vendorless accounting | `UNPROVEN` | #1294 deployed; needs a user to hit an AI surface. `ai_runs = 0` is now ambiguous between "unused" and "write failing silently" — see blocker 4.5 |
| **LMC ledger engine** | `PROD-PROVEN (rolled back)` | 2026-08-28, production, inside a transaction that was rolled back so no row and no flag persisted: top-up credits · idempotent replay credits nothing twice · spend debits · idempotent replay debits nothing twice · overspend refused with the balance unchanged (no phantom charge) · a foreign actor cannot debit an account · purchase refund claws back only what is left, recording the already-spent remainder honestly · the ledger refuses UPDATE (append-only) |
| **LMC user surface** | `PROVEN` | #1323. The ledger had ZERO application readers until this train — constants and generated types were the entire footprint. `lib/lmc/lmc-account.ts` reads `lmc_account_balances` under the caller's own RLS (no migration was needed; the owner-scoped SELECT policies and the security-invoker views already existed). Browser-proven 4/4 on the local stack: a fresh database shows `no_account` and NO number; a real promotional grant minus a real spend shows the ledger's own figure; no top-up control exists while top-up is owner-gated; 375px has zero overflow. `unavailable` carries no numeric field, so a failed read can never render as "0 LMC" |
| **LMC spend reversal** | `MISSING` | `lmc_reverse_v1` reverses CREDIT transactions only — it resolves the original's lot, and a `spend` has none (`lmc_original_not_reversible: spend has no credit lot`). There is therefore **no in-product remedy for a debited user whose paid action failed or was not delivered** |
| Pricing / LMC / billing (commercial activation) | `OWNER-GATED` | canonical catalogue exists; all six `lmc_settings` flags are false in production and `stripe_lmc_topups_enabled` / `live_payments_enabled` are `owner_only` — the shared setter refuses **every** caller by design, so no agent path can enable them |
| Stripe / payments chain | `UNPROVEN` | webhook + checkout + subscription store exist with signature and idempotency tests; `billing_customers`, `billing_subscriptions`, `payment_webhook_events`, `subscriptions` are all **0 rows** — nothing has ever run |
| Public vacancies / SEO | `UNPROVEN` | live |
| **Languages** | `PARTIAL` | **routes 5 of 26 required** — see [`LANGUAGE_MATRIX.md`](LANGUAGE_MATRIX.md) |
| **Concept-resolution seam** | `IMPLEMENTED` | `lib/structuring/concept-resolution/` — LANGUAGE_MATRIX §4.1 step 2 is done: the needle pack is no longer the only implementation of `expression → concept`, a language may arrive as DATA, and coverage is measured from terms instead of declared in a tuple. Georgian is now REPRESENTABLE and honestly reports 0 coverage |

### Recorded architecture, deliberately unimplemented
| capability | status |
|---|---|
| AI agents / digital workers as subjects | `DEFERRED` — architecture recorded (ARCHITECTURE §5.1) |
| Historical work-report import | `DEFERRED` — pipeline recorded (§5.2); sample-first after pilot |
| Living Profile for team / org / project | `DEFERRED` — generalization recorded (§5.3) |
| Project ↔ capital / investor discovery | `DEFERRED` — extension point preserved; regulated execution out of scope |

---

## 3. KNOWN DEBT (recorded, not cleaned — §9 no destructive cleanup)

| item | class | note |
|---|---|---|
| `journal_entry_extractions` | `DEAD` | 0 rows, no reader/writer; superseded by `journal_entry_skills`/`_tasks`/`_work_items`/`_metrics` |
| `relationship_slug='employee'` on 36 org-less personal contexts | `LEGACY` | phantom employment as an internal selector; user-visible harm closed by #1292; renaming touches many SECDEF RPCs |
| `trust_score` column | `DEAD` | column exists, nothing reads it |
| `job_demands` (0 rows) | `LEGACY` | still read by the market map; `customer_requests` is canonical |
| Catalog-only locales `lv et da no sv pl` | `PARTIAL` | files present, routing disabled |

---

## 4. THE HONEST BLOCKERS TO PILOT_READY

1. **Institution ↔ learner link — APPLIED to production 2026-08-27.** Closed by
   making the relationship an invitation establishes into DATA
   (`invitations.relationship_slug` → `relationship_types`), rather than adding
   a `join_as_student` type. Migration 20260827200000 applied via Supabase MCP
   `apply_migration` under owner ruling §1 (ledger `20260827132137`).

   Re-proven **on production**, inside rolled-back transactions: a legacy
   9-argument invitation still accepts into `employee`; an organization holding
   `training_provider` invites and a learner accepts into `student` alongside
   the employment it already had; an organization without the capability is
   refused `organization_capability_required`; `manager` is refused
   `invalid_relationship`.

   The disclosed `can_view_worker` consequence was **ruled on and closed** the
   same day — see blocker 6 below, which is now a resolved entry rather than an
   open one.

   **The "0 production organizations hold `training_provider`" blocker is
   CLOSED (2026-08-28).** `Labour market ai Sp. z o.o` now holds
   `employer,training_provider`, set through the REAL UI (workspace switch →
   organization-capability card), not SQL — invariant I-2 (one organization,
   many capabilities) proven live in production for the first time. The
   institution↔learner invitation shipped with #1301 and is applied.

   What is still MISSING is one browser step, and it is an OWNER gate rather
   than code: the learner half (institution invites → learner ACCEPTS) needs a
   SECOND signed-in identity against the deployed app. The server chain for
   exactly that step is prod-proven in rolled-back transactions (above).
2. **Employer need → matching → shortlist — PROVEN 2026-08-27.** Exercised in
   a browser against a real demand: the LT demand text was recognised into
   skills, candidates were retrieved and ranked with an evidence-tier basis
   rather than a fabricated percentage, missing facts were disclosed on both
   sides, and shortlist/review actions were reachable. What remained UNPROVEN was
   the step BEFORE it — an employer typing a need in natural language and
   getting a structured demand. **That is now closed (#1322).** The recognizer
   used to read the sentence, score it, and hand over a plain link to an EMPTY
   form; it now writes the canonical draft the wizard already auto-continues
   from, so the employer types the need once. Browser-proven in LT / EN / RU /
   NL, each with a DB assertion that what stands behind it is `status='draft'`
   and never `submitted`, plus a negative control that the form opens empty
   without the recognizer. No new table, no new demand model, and the text
   never travels in a URL.
3. **Cross-actor scenario — CLOSED 2026-08-28 (#1324), locally.** It ran as one
   chain, 7/7, from a `db reset` + fixtures with no leftovers: the institution
   declares what it does → invites a person AS A LEARNER → the learner is told
   what they are accepting and accepts → the employment they already had
   survives untouched (invariant I-1) → their journal becomes evidence and
   capabilities → an admin verifies the employer → the employer's need reaches
   the learner's board → the interest travels back. Plus the negative control:
   an organization that never said it educates cannot name a learner.

   **What had been in the way was never the product.** The spec existed and
   could not have passed on any freshly reset database, for four reasons, and
   the way it failed is the part worth remembering:

   * it pinned `organizations.id` and `workers.id` as string literals, and
     those are GENERATED — every reset mints new ones. A PostgREST filter on a
     nonexistent organization returns an empty set, so the spec reported
     *"fixture drift: the learner must already be an employee"*: a true
     sentence about entirely the wrong thing. Ids are resolved now
     (`tests/e2e/fixture-ids.ts`) and a guard fails any spec that pins one;
   * the chain skipped its own first sentence — it asserted "the institution
     declares what it does" and relied on another spec having done it, which
     alphabetical spec order guaranteed had not;
   * the employer was never verified, and a demand only reaches a worker's
     board once an admin has verified the employer. The guard refuses even
     service_role, so the spec now performs the real act;
   * two education specs gate on `SUPABASE_TEST_URL`, which `e2e-local.ts` sets
     and a hand-rolled invocation does not — four grey SKIPs that read like
     four green ticks.

   **Still open:** the chain is proven on the LOCAL stack and, server-side, on
   production. Production holds its first `training_provider` organization
   since 2026-08-28, so that half is no longer the blocker; what has not been
   run against the deployed app is the learner ACCEPT step in a browser, which
   needs a second signed-in identity (owner gate). Production therefore stays
   `PARTIAL` for that one reason — see blocker 1.
4. **Languages: 5 of 26 routed, Georgian absent entirely.** One narrower gap
   inside this was closed on 2026-08-27: the work-log context selector could
   not NAME a placement, because its base label resolved through
   `conversation.worklog.relationship.*`, which carries neither `student` nor
   `volunteer` — so a learner's placement printed "Kita" / "Other". It now
   resolves through the canonical `relationshipTypes` catalogue in all five
   active locales. The architectural dependence on hand-maintained needle lists
   is UNCHANGED and remains the real language blocker.
5. **AI — CORRECTED 2026-08-28. The previous entry here read the wrong file
   and understated what is built.** It said `apps/web/lib/ai/provider.ts`
   unconditionally returns the inert no-op, therefore AI is CODE-gated and no
   environment variable can turn it on. The first half is true and the
   conclusion does not follow, because that file is the LEGACY assist skeleton
   and it serves exactly ONE surface (`estimate-clarify`). It is not the
   runtime.

   The runtime is `apps/web/lib/ai/runtime/`, and it is **env-gated**:
   `runtime/config.ts` reads `AI_PROVIDER_MODE`, `AI_PROVIDER`, the per-provider
   keys and the local base URL, and `resolveAiRuntimeConfig` returns
   `disabled` / `mock` / `live` from them. Five real adapters exist (anthropic,
   openai, gemini, xai, local) plus DeepL as a secondary, behind a provider
   chain, a cost model, a daily-run budget and the egress gate.

   It is **reachable from four production routes** (verified by import chain,
   2026-08-28), so the surfaces are live and the router really resolves a route
   for every visitor who uses them:

   | route | component chain | agent |
   |---|---|---|
   | `/dashboard/journal` | composer → `journal-ai-suggestions` | `work_journal` |
   | `/dashboard/opportunities` | panel → `market-explanation-request` | `market_explanation` |
   | `/dashboard/profile` | `profile-text-first-flow` | `worker_profile` |
   | `/match-preview` (public) | `match-preview-form` | `matching_explanation` |

   So `ai_runs = 0` does **not** mean "the code cannot run". With
   `AI_PROVIDER_MODE` unset every one of those routes resolves as
   `vendorless_route` and **should already be writing an `ai_runs` row**
   (#1294). Zero rows therefore means one of two things, and they are not the
   same finding: nobody has used those four surfaces since #1294 deployed
   (2026-08-25), or the best-effort audit write is failing silently. That
   question is now the honest open item — not "AI is dead code".

   **What activation actually costs.** Two gates, and only one of them is about
   a key:

   - a **provider**: either a cloud key (`AI_PROVIDER_MODE=live` +
     `AI_PROVIDER=<vendor>` + that vendor's key + its `AI_<VENDOR>_ENABLED`
     flag), or the keyless `local` seam (`AI_LOCAL_BASE_URL` +
     `AI_LOCAL_MODEL`, both validated, plaintext http confined to loopback);
   - the **egress gate** (`runtime/data-egress.ts`), whose grant table is
     EMPTY by owner decision. An external provider with no grant may receive
     `PUBLIC` only.

   The consequence is precise and worth stating, because it is the thing that
   makes a first live run cheap and safe: **exactly one task is classed
   `PUBLIC`** — `explain_market_demand`, aggregate published-vacancy counts for
   one occupation, no data subject. It is served by the
   `/dashboard/opportunities` surface above. A cloud key alone therefore
   activates that ONE route for real, and every other route keeps routing
   vendorless — which is the owner's stated order (`BLOCK external → try local
   → otherwise fail safely`) working as designed, not a failure.

   Nothing here is operational until an owner sets the env. It must still never
   be described as operational.
6. **Learner visibility — RULED AND CLOSED 2026-08-27 (kept for the record).**
   `can_view_worker` treated every active engagement alike, so an education
   relationship would have carried the same scope an employer holds over an
   employee — including `salary_min_eur`, `willing_to_relocate` and
   `needs_accommodation` on `workers`. Owner ruling §2 required least privilege;
   `20260827210000` makes the rule DATA
   (`relationship_types.grants_worker_visibility`, fail-closed, seeded true for
   every slug except `student`) and is applied. Regression-proven on production
   by a controlled comparison with a NON-ADMIN organization owner: one
   engagement row, `employee` → visible, the same row as `student` → not
   visible, worker rows listable unchanged. The institution reaches a learner
   through the purpose-bound project path instead.
7. **LMC — the engine is right; the ONE missing piece is giving credit back.**
   Measured on production 2026-08-28 inside a transaction that was rolled back,
   so nothing persisted and no flag stayed flipped. What the ledger already
   does correctly, proven rather than assumed: a top-up credits; the same
   top-up replayed with the same idempotency key credits nothing twice and
   returns the same transaction; a spend debits; the same spend replayed debits
   nothing twice; an overspend is refused with the balance unchanged, so a
   failed action leaves no phantom charge; an unrelated profile cannot debit
   somebody else's account; a purchase refund claws back only what is LEFT
   (€10 topped up, €3 spent, €7 reversed) and records the already-consumed
   remainder honestly instead of inventing a balance; and the ledger refuses
   UPDATE outright.

   **The gap:** `lmc_reverse_v1` reverses only transactions that CREATED a
   credit lot. It resolves the original's lot and a `spend` has none —
   `lmc_original_not_reversible: spend has no credit lot`. So when a user is
   debited for an action that then fails or is never delivered, **there is no
   in-product way to give the credit back.** The remaining paths are an admin
   grant (a different transaction kind, gated behind
   `lmc_promotional_grants_enabled` and a verified recipient) or nothing.

   That is the specific thing standing between the ledger and LMC_READY, and
   it is a money-ledger migration: RED class, owner-gated, not an autonomous
   change. Every other part of the chain above is already correct.

   **Two things moved on 2026-08-28.** The remedy is written and repaired:
   PR #1305 adds `lmc_compensate_spend_v1` — a compensating CREDIT linked to
   the spend it answers, never a history mutation — and now passes every
   non-owner check (it was RED on three real guards, including a function that
   revoked PUBLIC but not `anon`). Its `migration-safety` red is the RED
   CLASSIFICATION itself, which is the gate, not a defect. **It is not
   applied and must not be.**

   And the other half of "LMC_READY" — that a person could not see a single
   number of any of this — is closed by #1323; see the LMC user surface row
   above.

   Separately, and NOT a defect: all six `lmc_settings` flags are false in
   production, and `stripe_lmc_topups_enabled` / `live_payments_enabled` are
   `owner_only` — `lmc_set_flag_v1` refuses every caller for those, including
   service_role, by design. No agent can switch payments on, which is the
   correct state.

Nothing above is fixed by more code existing. Each needs a real journey run.

---

## 5. FULL-PRODUCT MASTER MATRIX (2026-08-31 master train)

> Method: six parallel source-level domain sweeps (calendar/project/work-mgmt,
> marketplace, messaging/notifications, mobile, social-auth/acquisition,
> role-home UX) on main `60b01541`, cross-checked against the chat-first audit
> ([`chat-first-capability-audit-2026-08-30.md`](product/chat-first-capability-audit-2026-08-30.md),
> G1–G20) and the production ledger. Statuses are evidence-based; this section
> is the ACTOR × GOAL completion lens — the per-capability proof levels in §2
> stand where they overlap.

### 5.1 Actor × platform scorecard

✅ real · ◐ partial · ✗ missing · Ⓖ gated (code exists; a gate or owner action blocks)

| Actor / journey | WEB | ANDROID/IOS | CHATGPT (MCP) | Blocking fact |
|---|---|---|---|---|
| Worker: register→onboard→CV→journal→opportunities→interest | ✅ proven | Ⓖ stale gate (flip train in flight) | ◐ profile/CV-read, journal r/w, interest, work-card via bridge | — |
| Employer: setup→demand→matching→shortlist→contact→booking | ✅ proven | ✗ | ✗ no company.* capability yet | employer workspace resolver is cookie-coupled |
| Student/learner: link→journal→evidence→CV | ✅ local chain 7/7; prod partial | ✗ | ◐ same as worker | gets WORKER home copy (M10) |
| Education institution: declare→invite→learner evidence | ✅ server-proven; first prod `training_provider` org live 2026-08-28 | ✗ | ✗ | learner ACCEPT in a browser needs a 2nd identity (owner gate); gets EMPLOYER home copy (M10) |
| Customer/buyer: register→browse services→request | ◐ | ✗ | ✗ | absent from onboarding (M8); buyer `customer_requests` reach nobody (verified-company gate) |
| Project/team manager: projects→tasks→timesheets→absences | ◐ | ✗ | ✗ | three prod-broken links (§5.2 M1–M3) |
| AI actors | recorded, deferred (ARCH §5.1) | — | transport seam = MCP | — |

### 5.2 New findings beyond G1–G20 (M-series, 2026-08-31)

| # | Finding | Class | Evidence anchor |
|---|---|---|---|
| M1 | ~~Absence review dead in production for booking-engagement employers~~ **CLOSED — STALE FINDING.** The fix migration was ALREADY APPLIED to prod 2026-08-12 (ledger `20260812180224`); this finding cited the never-struck deferred entry at `APPLIED_LEDGER.md:1475` (an M17-class doc defect, now corrected). Behavior proven IN PRODUCTION 2026-08-31 (rolled-back probe): engaged employer sees + approves the request; private note hidden; unrelated/ended employers see nothing | **CLOSED 2026-08-31 (was doc-stale, not prod-broken)** | ✅ ledger entry `20260812180224` + 2026-08-31 prod probe |
| M2 | ~~`assign_worker_to_project` regressed in production~~ **CLOSED — STALE FINDING.** The same 2026-08-12 apply restored the engagement bridge pinned to `by_roster`. Proven IN PRODUCTION 2026-08-31: engagement→assign returns a row on the engaging company's project (idempotent, exactly one active assignment); SIBLING company 42501; unrelated caller 42501; unauthenticated 42501 | **CLOSED 2026-08-31 (was doc-stale, not prod-broken)** | same |
| M3 | **Timesheets derive zero hours in prod**: 6/7 journal time rows hang off org-less engagement contexts; `timesheet_compute_lines_v1` scopes on `ec.organization_id`. Code-level restatement: no row-level work-hour fact exists in main (PR #1344, DRAFT, RED, unapplied) | **P1 (honest-empty, no wrong data) · OWNER-GATED** | `APPLIED_LEDGER.md:145` |
| M4 | ~~11 of 15 notification emitters still `void`-detached on serverless~~ **CLOSED — STALE FINDING.** TRAIN 10 (2026-08-31) awaited every write-path emitter end to end; exactly the THREE documented read-time emitters (document_expiring ×2, weekly_digest) stay deliberately detached and self-heal via the UNIQUE dedupe key. Pinned by `lib/guards/notification-emitters-are-awaited.test.ts` (counts the 3) | **CLOSED (was doc-stale)** | guard + `event-emitters.ts` header |
| M5 | ~~`notification_preferences` has ZERO consumers and no settings UI~~ **CLOSED — notifications completion v1.** Settings UI: per-type × per-channel toggles on `/dashboard/account` (collapsed section). Enforcement: every durable emit resolves the recipient's in-app preference (opt-out model, default ON, FAIL-OPEN on a prefs outage); email stays consent-first opt-in (§4). `document_expiring` deliberately offers no email toggle (no dispatch path on its read-time emitters) | **CLOSED** | `lib/notifications/event-emitters.ts` `deliver()` + `components/app/notification-preferences-section.tsx` |
| M6 | Email channel PREPARED, inert until credentials (notifications completion v1): per-event templates render from the same i18n keys the bell uses (`lib/email/notification-email.ts`), dispatcher runs after every durable insert (`lib/notifications/email-dispatch.ts` — explicit opt-in row required, recipient must hold a `profiles.email`, tagged skip otherwise), weekly-digest cron sweep at `/api/cron/weekly-digest` (CRON_SECRET-gated, refuses while unset). Flips LIVE automatically when the owner sets `INVITE_EMAIL_*` to a real provider; `log` provider exercises the path in dev/test. Push still absent everywhere | P2 · ENV/OWNER-GATED (was P1 code-gap) | `lib/notifications/email-dispatch.ts` |
| M7 | Marketplace loop WORKS (offering CRUD → request → accept/decline → conversation) but is unreachable: not in nav; the "always-on dashboard grid" registry has NO renderer (W3 deleted it); `marketplace-loop-reachability.test.ts` passes while the reachability it names does not exist | P1 + guard-honesty defect | surface-matrix N6 |
| M8 | Customer role absent from onboarding (`ROLE_CARDS = worker, company`); buyer acquisition path Tier-C buried | P1 | `onboarding-wizard.tsx:21` |
| M9 | `service_offerings` has no `organization_id` (owner-join only); nothing after `accepted` (no quote/booking/completion/rating — partly by doctrine, partly vision §7 unbuilt) | P2 | marketplace sweep |
| M10 | Only two home identities exist (`person`/`company`): education institutions get "I need workers" chips, buyers get hiring chips, students get plain worker copy | P1 UX | `roles.ts:345` |
| M11 | 11 routes at 800–1,500 lines render under back-arrow-only chrome; ResultShell / ContextPanel / `<details>` primitives exist and are unused there | P1 UX (Train 9) | UX sweep |
| M12 | Attention fragmented across `/dashboard/activity`, `/assist`, `/inbox`, bell + brief; the canonical aggregator reachable only from the bell popover footer | P2 UX | UX sweep |
| M13 | Capacity model ignores `worker_absences` (approved leave counts as free); `capacity_records` named by AI task-routing does not exist in schema | P2 | workforce sweep |
| M14 | Two task truths: `work_tasks` (canonical, healthy, 0 prod rows) vs `follow_up_tasks` (admin CRM queue, no bridge); project detail page shows no tasks | P2 | project sweep |
| M15 | Attribution truth: a mature first-party UTM + funnel-event system EXISTS (`lib/telemetry/*`, ~55 events, anon-insert grants applied). Real gaps: durable first-touch at signup, OG share images (none exist), LIVE-landing beacon unmounted | P1 — fix train `feat/cc/acquisition-readiness-v1` | acquisition sweep |
| M16 | Mobile gate text factually FALSE (cites the #1331 seam as unmerged; it merged a day before the app) + refusal vocabulary mismatch (429 unmapped → "server broken", 403 → "no profile") + `callDomain` cannot speak `/api/mcp` JSON-RPC | P0 (mobile) — fix train `feat/cc/mobile-domain-open` | mobile sweep |
| M17 | Doc hygiene: `APPLIED_LEDGER.md:1375` "not yet applied" contradicts :1150 (anon-bypass fix IS applied); `20260613100000_worker_availability_preferences` header still says DRAFT with zero ledger mentions — apply state unverifiable | P2 | sweeps |

### 5.3 Readiness gates (master-train vocabulary)

| Gate | State | What stands in the way |
|---|---|---|
| WORKER_READY (web) | **YES** — first-value journey proven, no known P0 in it | — |
| EMPLOYER_READY (web) | **YES (web core)** — need→match→shortlist→interest proven (12/12 e2e refresh 2026-08-31); absence review + booking→project for engagement employers proven live in prod (M1/M2 closed as doc-stale) | — |
| STUDENT_READY | PARTIAL | prod browser chain (2nd identity, owner gate) + M10 |
| EDUCATION_INSTITUTION_READY | PARTIAL | first real prod `training_provider` org LIVE (2026-08-28) and #1301 applied; remaining: learner ACCEPT in a browser (2nd identity, owner gate) + M10 |
| MOBILE_ANDROID_READY / IOS | NO — builds proven, zero product data | gate-flip train + runtime proof |
| MARKETPLACE_READY | NO — loop works, reachability ≈ zero | M7, M8 slices |
| CV_IMPORT_READY | YES (DOCX + PDF proven); XLSX/bulk = G10 architecture decision | — |
| CALENDAR_READY | PARTIAL — real viewer, no write path, no shift primitive | scope decision |
| PROJECT_MANAGEMENT_READY | NO | M3 + zero prod usage (M2 closed 2026-08-31 — bridge proven live) |
| SOCIAL_AUTH_READY | Google only (proven); LinkedIn/FB need owner provider apps + dashboard config | owner action |
| SOCIAL_ACQUISITION_READY | PARTIAL — measurement mature; durable attribution + OG cards in flight | train; ad spend NOT requested |
| COMPACT_UX_READY | NO | M10, M11, M12 (Train 9) |

### 5.4 Owner-action queue (each independent; none blocks code trains)

1. ~~RED apply `20260808150000` (M1)~~ / ~~M2 fix migration~~ — **RESOLVED 2026-08-31: already applied 2026-08-12 (ledger `20260812180224`); both behaviors proven live in prod.** No owner action.
2. Review PR #1344 work-hour allocations (M3) — unlocks timesheets end-to-end.
3. Email channel: `INVITE_EMAIL_PROVIDER/API_KEY/FROM` env + Supabase SMTP decision (M6).
4. Unchanged existing gates: #1355 ESCO linkage, #1305 LMC compensate-spend, AI `AI_PROVIDER_MODE` env, LinkedIn/Meta developer apps (only when wanted).
