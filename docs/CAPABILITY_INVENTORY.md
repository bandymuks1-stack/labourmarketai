# LabourMarket.ai — CAPABILITY INVENTORY & GAP MAP

> **Status:** canonical. Derived from **code + production**, 2026-08-27,
> revised 2026-08-28 (closure train #1320-#1324), extended 2026-08-31 with the
> full-product master matrix (§5, six parallel domain sweeps), extended
> 2026-09-07 with the **canonical master product register (§6)** — the
> anti-forgetting mechanism every future slice must update.
>
> **§6 is EXECUTABLE.** Its machine-readable half is
> [`apps/web/lib/product-gate/capability-register.ts`](../apps/web/lib/product-gate/capability-register.ts),
> enforced by `apps/web/lib/guards/capability-register.test.ts` and by
> `.github/scripts/product-truth.mjs`. The two halves may not drift: a
> capability id present in one and absent from the other is a CI failure.
> Entry point: [`docs/ARCHITECTURE.md`](ARCHITECTURE.md).
> Reasoning and evidence behind §6:
> [`docs/reconciliation/FULL_PRODUCT_RECONCILIATION_2026-09-07.md`](reconciliation/FULL_PRODUCT_RECONCILIATION_2026-09-07.md).
> **A file existing is not proof. A green unit suite is not semantic proof.
> And a migration in this repository is not proof that it is in the database —
> read the ledger (§6.0).**

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

> **SUPERSEDED 2026-09-07 — see §6.1 for the current read.** The table below is
> kept as the 2026-08-27 record. Two of its lines were already wrong by
> 2026-08-28 and stayed wrong for ten days: **`ai_runs` and `usage_cost_events`
> are NOT zero.** Production holds 47 of each (2026-08-28 → 2026-09-06, Gemini,
> real spend $0.0396). "No AI has ever run in production" was a true statement
> that nobody re-measured after it stopped being true.

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

---
## 6. CANONICAL MASTER PRODUCT REGISTER (2026-09-07)

> **This section is the anti-forgetting mechanism.** Every future slice updates
> a row here. Adding a capability to the product means adding a row; finishing
> one means changing its STATUS with the evidence that justifies it. A
> capability may be `DEFERRED_BY_DESIGN` for years — it is never deleted from
> this register because it is not being built now. That is precisely how scope
> was lost before.
>
> Method and evidence:
> [`docs/reconciliation/FULL_PRODUCT_RECONCILIATION_2026-09-07.md`](reconciliation/FULL_PRODUCT_RECONCILIATION_2026-09-07.md)
> — eight parallel source sweeps on `main` @ `813f1b6`, the full 1,625-commit
> history, and live production reads (schema, RLS, ledger, row counts,
> advisors) on 2026-09-07.

### 6.0 READ THIS BEFORE CONCLUDING ANYTHING IS MISSING

Three rules, each learned from a measured failure in this reconciliation:

1. **The database's `supabase_migrations.schema_migrations` is the ONLY
   authority on what is applied.** Not the migration header, not
   `docs/APPLIED_LEDGER.md`, not a code comment. Sixteen migrations whose
   comments say "DRAFT / not applied / approval not given" **are applied**.
2. **A repository migration is not a deployed capability.** Nine migration
   files have never been applied; four of them sit behind live UI that renders
   an honest "not enabled yet" to real users. The parity gate checks
   applied → repo; nothing checks repo → applied.
3. **Search by synonym before declaring absence.** Calendar lives at
   `/dashboard/planning`; teams are `organizations` rows with
   `organization_type='team'`; "roster" means the active `company_workers`
   list, never a schedule.

### 6.1 PRODUCTION SNAPSHOT — 2026-09-07T03:46Z (current)

266 applied migrations (max `20260906202628`) · 190 tables · **RLS enabled on
all 190**.

| object | rows | object | rows |
|---|---:|---|---:|
| `profiles` / `workers` | 56 / 56 | `journal_entries` | 40 |
| `organizations` / `companies` / `agencies` | 17 / 14 / 3 | `journal_entry_confirmations` | **13** (3 self-confirmed) |
| `organization_roles` | 15 | `journal_entry_skills` / `worker_skills` | 48 / 50 |
| `engagement_contexts` | 79 | `worker_skills` verified | **2** |
| `company_memberships` / `company_workers` | 19 / 7 | `customer_requests` | 20 |
| `projects` / `work_objects` | 9 / 1 | `public_vacancies` (active) | 77,366 (76,747) |
| `work_hour_allocations` | 5 | `conversations` / messages | 5 / 18 |
| `education_programs` / cohorts / members | 1 / 1 / 0 | **`ai_runs` / `usage_cost_events`** | **47 / 47** |
| `market_intelligence_observations` | 76 | `pilot_events` / `audit_logs` | 3,329 / 64 |

**Zero rows, ever** (~40 tables): teams, marketplace listings, matches,
agreements, contracts, proposals, assets, trips, absences, training, reviews,
decisions, procurement, on/offboarding, org documents, customers, leads,
defects, follow-ups, work tasks, LMC, subscriptions, contact disclosures.

### 6.2 THE REGISTER

> **The machine half is authoritative for STATUS.** The Status / AI / P
> columns below are the 2026-09-07 snapshot and are not re-checked by CI.
> The current, CI-enforced classification of every row lives in
> [`apps/web/lib/product-gate/capability-register.ts`](../apps/web/lib/product-gate/capability-register.ts)
> using the owner's six-value vocabulary (BUILT_AND_USABLE ·
> BUILT_NOT_CONNECTED · PARTIAL · ARCHITECTURE_ONLY · MISSING · BLOCKED)
> plus the evidence ladder. **The id list is enforced in both directions:**
> a capability in one half and not the other fails
> `lib/guards/capability-register.test.ts`. That is what makes deleting a
> capability from the product an explicit act rather than an omission.
Legend — **Status**: `PROD_HUMAN` production-human-proven · `PROD_DATA`
production-data-proven · `IMPL` implemented-not-proven · `PARTIAL` · `BROKEN` ·
`DISCONNECTED` · `DUPLICATED` · `LEGACY` · `PLANNED` · `MISSING` ·
`DEFERRED` deferred by design · `OWNER?` needs an owner decision.
**AI**: `R` read · `W` write · `PC` preview→confirm · `—` not exposed.
**P**: 0/1/2/3.

#### A. PERSON

| ID | Capability | Canonical objects | Status | AI | P | Next action |
|---|---|---|---|---|---|---|
| PER-1 | Account, auth, onboarding, locale | `profiles`, `profile_roles` | PROD_HUMAN | — | — | — |
| PER-2 | Professional profile + owner narrative | `profiles.profile_text`, `workers` | PROD_HUMAN | R | 2 | `workers.headline`/`bio` have no person UI at all |
| PER-3 | Work card (availability, pay, locations) | `workers.*`, `save_worker_card` | PROD_HUMAN | PC | 2 | editor mounts only inside the chat workspace, not on `/dashboard/profile` |
| PER-4 | CV import (PDF/DOCX) → confirm-each-fact | `/api/cv/extract`, `cv-section-import-actions` | PROD_HUMAN | — | — | — |
| PER-5 | Living CV / player card / EU format export | `verified-cv`, `eu-format` | PROD_HUMAN | R | 2 | `/cv` absent from primary-route smoke |
| PER-6 | Work history (employment) | `engagement_contexts`, `save_self_declared_work_history_v1` | PROD_DATA | — | 1 | — |
| PER-7 | **Practice / volunteering history** | same, `student`+`volunteer` slugs | **HIDDEN → fixed 2026-09-07** | — | 1 | RPC live since 2026-08-27; the profile page filtered it out |
| PER-8 | Education records | `worker_education`, `education_types` | PROD_DATA | — | 2 | in-code comment still says DRAFT |
| PER-9 | Achievements / declared certificates | `worker_achievements` | IMPL | — | 3 | `confirmed_by_manager` has no write path — permanently false |
| PER-10 | Languages | `worker_languages` | PROD_DATA | — | 3 | no `verified` concept |
| PER-11 | External profile links | `worker_external_profiles` | **DISCONNECTED** | — | 1 | **migration never applied**; UI ships an honest empty |
| PER-12 | Privacy: consent, disclosure ledger, export, deletion | `privacy_consent_*`, `personal_data_disclosures` | PROD_DATA | — | 1 | GDPR export covers 6 relations; ~14 personal relations are missing from it |
| PER-13 | Requirement ledger (what is missing for a role) | `lib/player-card/requirement-ledger` | PARTIAL | — | 2 | built for 3 contexts, mounted for 1 (`project`) |

#### B. SKILLS · COMPETENCY · QUALIFICATION

| ID | Capability | Canonical objects | Status | AI | P | Next action |
|---|---|---|---|---|---|---|
| SKL-1 | Skill catalogue + professions | `skills`, `professions`, `profession_skills` | PROD_HUMAN | — | — | — |
| SKL-2 | Deterministic recognition (journal → skill) | `journal_entry_skills`, `lib/structuring` | PROD_HUMAN | — | — | no AI required (I-7) |
| SKL-3 | Evidence tier ladder | `lib/evidence/evidence-tier`, `provenance` | PROD_HUMAN | R | 0 | self-confirmation must not read as employer-confirmed (fixed 2026-09-07) |
| SKL-4 | Free-label skill claims | `profile_skill_claims`, `skill_candidate_clarifications` | DUPLICATED | — | 3 | 2 live stores + `candidate_skills` frozen at 0 rows |
| SKL-5 | Transversal capabilities (8 slugs) | `skills` category `transversal.*` | PROD_DATA | — | 3 | applied 2026-08-27 |
| SKL-6 | ESCO taxonomy | 4 tables, 1,045,186 labels | IMPL | — | 2 | 0 of 161 platform skills carry an `esco_uri` — the bridge is inert |
| SKL-7 | Documents / credential validity | `worker_documents`, `document_files` | IMPL | W (add only) | 1 | one download door, versioned, ack-bound |
| SKL-8 | Country requirement matrix | `lib/country-readiness` (code), `country_document_requirements` (empty) | PARTIAL | — | 2 | no route of its own |
| SKL-9 | **Qualification recognition / RPL / equivalence** | — | **MISSING** | — | 2 | nothing at any layer; keep in the architecture |
| SKL-10 | Training & certification register | `training_programs`, `training_assignments` | IMPL (0 rows) | — | 2 | applied; writes nothing into the skill ladder, by decision |

#### C. ORGANIZATION · WORKSPACE · AUTHORITY

| ID | Capability | Canonical objects | Status | AI | P | Next action |
|---|---|---|---|---|---|---|
| ORG-1 | Organization creation + identity + verification | `companies` (write) → `organizations` (read, mirrored) | PROD_DATA | — | 1 | identity split across two tables |
| ORG-2 | **Multi-capability organization** | `organization_roles`, `organization_role_types` | PROD_DATA | — | 0 | **OWNER?** `companies.company_type='staffing_agency'` still hard-gates 7 agency features |
| ORG-3 | Memberships + invitations + roles | `company_memberships`, `invitations` | PROD_DATA | — | 1 | — |
| ORG-4 | Workspace context + switching | cookie + `profiles.active_organization_id` | PROD_DATA | W | 1 | `getActiveOrganizationContext` is owner-only while `getWorkspaceContext` is not |
| ORG-5 | Cross-org isolation | 7 authority helpers | PARTIAL | — | 0 | an org **manager** cannot read `company_workers` (`owns_company` excludes managers) |
| ORG-6 | Roster (employees, historical, agency) | `engagement_contexts` + 4 legacy link tables | DUPLICATED | — | 1 | 4 parallel roster truths |
| ORG-7 | Candidates / talent pool / scouting | `candidate_drafts`, `demand_shortlist` | PROD_DATA | — | 1 | `/dashboard/talent` is a superadmin sample preview |
| ORG-8 | Agency ↔ client bridge | `agency_client_connections`, `agency_candidate_offers` | PROD_DATA | — | 1 | `agency_clients` is a second, unapplied client model |
| ORG-9 | Public organization profile | `organizations.public_*`, `/business/[slug]` | IMPL | — | 3 | no index/directory route |

#### D. WORK EXECUTION

| ID | Capability | Canonical objects | Status | AI | P | Next action |
|---|---|---|---|---|---|---|
| WRK-1 | Projects | `projects` | IMPL | W | 1 | `start_date`/`end_date` have no writer |
| WRK-2 | Objects / sites | `work_objects` | IMPL (1 row) | — | 1 | no route; a section of `/dashboard/company` |
| WRK-3 | Stages | `project_stages` | IMPL | W | 2 | — |
| WRK-4 | Tasks | `work_tasks` (+ `follow_up_tasks` duplicate) | IMPL (0 rows) | W | 2 | "reachable, functional and pointless" — its own migration says so |
| WRK-5 | Worker→project assignment | `project_worker_assignments` | PROD_DATA (1 row) | W (strong) | 1 | no overlap constraint of any kind |
| WRK-6 | **Team→project assignment** | — | **MISSING** | — | 1 | no FK exists anywhere |
| WRK-7 | Readiness / operational status | `project_worker_readiness_items` | IMPL | W | 2 | — |
| WRK-8 | Defects / corrections | `defects`, `defect_corrections` | IMPL (0 rows) | — | 3 | — |
| WRK-9 | Handover passport | `project_handover_entries` | IMPL | — | 3 | — |
| WRK-10 | Project economics | `project_budgets` | IMPL | — | 3 | — |

#### E. EVIDENCE · JOURNAL

| ID | Capability | Canonical objects | Status | AI | P | Next action |
|---|---|---|---|---|---|---|
| EVID-0 | **Work Journal** (4 transports, 1 core) | `journal_entries` + 7 satellites | **PROD_HUMAN** | R + PC | — | the product's strongest chain |
| EVID-1 | **Organization historical evidence import** | `organization_people`, `evidence_import_*`, `organization_evidence_*` | **PARTIAL** | production data path | 0 | owner-approved 2026-09-08; recursion fix APPLIED (ledger `20260908080950`); read + write proven under real auth, rolled back, zero residue; **no human import yet** |
| EVID-2 | Manager review / receive loop | `journal_entry_confirmations`, `review_journal_entry` | PROD_HUMAN | — | 0 | **OWNER?** self-confirmation: block in the RPC, or keep the weaker classification? |
| EVID-3 | Work verification state (8 states) | `lib/journal/work-verification-state` | IMPL | — | 1 | never walked by a human |
| EVID-4 | Photos / task evidence | `journal_entry_photos`, `journal_entry_tasks` | PROD_DATA (8 photos) | — | 2 | — |
| EVID-5 | Hours: journal metrics · allocations · timesheets | 3 stores + 1 dead | PARTIAL | — | 1 | reconciled inside ONE SQL function; no TS reader unions them |
| EVID-6 | Experience records + disputes + right of reply | `experience_records`, `experience_responses` | PROD_DATA (2) | — | 2 | **`experience_responses` is write-only — no surface renders a reply** |
| EVID-7 | Work intelligence: hours · activities · skill practice · evidence strength | `journal_entry_metrics` (+ `fragment_skill` rows) + `journal_entry_skills` + confirmations + photos, ONE pure model over the canonical work-time rule | PARTIAL | — | 1 | #1689: journal section + Living CV chips + conversation; fragment-level skill attribution from the worker's own split (#1692); archetype map covers all 43 ISCO sub-major groups; composer modules, §13 overlap warnings, §14 org views and a human walk remain |

#### F. DEMAND · SUPPLY · MATCHING

| ID | Capability | Canonical objects | Status | AI | P | Next action |
|---|---|---|---|---|---|---|
| DEM-1 | Canonical demand intake | `customer_requests` (4 kinds) | PROD_HUMAN | PC | — | — |
| DEM-2 | **Demand/supply semantic boundary** | `lib/demand/market-direction` | **PARTIAL** | — | 0 | 2 boards fixed (#1588/#1596); **7 surfaces still leak**, market map worst |
| DEM-3 | Worker opportunity board + interest | `demand_interest_signals` | PROD_HUMAN | PC | — | — |
| DEM-4 | External vacancy ingestion | `public_vacancies` | PROD_DATA (77k) | — | 1 | **no scheduler** — manual script or admin panel only |
| DEM-5 | Matching engine (20 criteria, both directions) | `lib/market/match-v1` | PROD_DATA | — | 1 | 1 frozen fork still reachable at `/match-preview` |
| DEM-6 | Team matching | `match-team-v1` | IMPL | — | 2 | admin route only |
| DEM-7 | Anon public need intake | `company_need_public_intakes` | PROD_DATA (2) | — | 2 | — |
| DEM-8 | **Saved searches / alerts** | — | **MISSING** | — | 2 | bookmarks exist; recurring queries do not |
| DEM-9 | **Organizational supply discovery** (agency capacity → employer) | `customer_requests` + gated reader | **BLOCKED** | — | 0 | proven in a prod transaction under 3 real users and rolled back; the migration is unapplied |

#### G. TIME · CAPACITY · BOOKING

| ID | Capability | Canonical objects | Status | AI | P | Next action |
|---|---|---|---|---|---|---|
| CAL-1 | Calendar (5 views, single projection) | `lib/planning`, 8 sources | IMPL | — | 1 | 10 further dated stores never reach it |
| CAL-2 | Employer calendar | — | **DISCONNECTED** | — | 1 | everything exists; the page never calls `getPlanning()` |
| CAL-3 | Availability | 4 incompatible vocabularies | **DUPLICATED** | — | 1 | none derived from another |
| CAL-4 | Capacity / gap timeline | `lib/workforce` | **BROKEN** | — | 0 | ignores approved leave and accepted bookings |
| CAL-5 | Absences / leave | `worker_absences` | IMPL (0 rows) | — | 2 | privacy-narrowed view is correct |
| CAL-6 | Booking request → accept → engagement | `booking_requests` + 3-layer concurrency | PROD_DATA (1) | — | 1 | nothing past `accepted`; expiry RPC has no scheduler |
| CAL-7 | **Capacity reservation** | — | **MISSING** | — | 1 | nothing decrements anything |
| CAL-8 | **Shifts / rotas / rosters** | — | **MISSING** | — | 2 | keep in the architecture |
| CAL-9 | Utilisation / FTE | — | **MISSING** | — | 3 | — |
| CAL-10 | **Planned vs actual → learned duration/capacity** | — | **MISSING** | — | 1 | the flywheel's learning loop; a forecast may never be stored where a fact is read (SEP-1) |

#### H. MARKETPLACE · COMMERCE

| ID | Capability | Canonical objects | Status | AI | P | Next action |
|---|---|---|---|---|---|---|
| MKT-1 | Service offerings + request loop | `service_offerings`, `service_offering_requests` | **DISCONNECTED** | — | 1 | loop complete, reachability ~zero |
| MKT-2 | Physical resource listings | `marketplace_listings` | DISCONNECTED (0 rows) | — | 2 | no bridge to `assets` |
| MKT-3 | Assets / tools / equipment | `assets`, `asset_assignments` | IMPL (0 rows) | — | 2 | `issue_asset_v1` has no availability guard, no lock |
| MKT-4 | Proposals / contracts / agreements | 3 stores | DUPLICATED (0 rows) | — | 3 | `contracts` is legacy of `agreements` |
| MKT-5 | Procurement | `procurement_*` | IMPL (0 rows) | — | 3 | no route; `#procurement` anchor |
| MKT-6 | Business trips | `business_trips` | IMPL (0 rows) | — | 3 | never reaches the calendar |
| MKT-7 | Billing / plans / entitlements | `plans`, `billing_*` | DEFERRED | — | 1 | test mode; two independent owner acts to arm |
| MKT-8 | LMC credit ledger | 5 tables, 16 RPCs | DEFERRED | — | 3 | all six flags false in code AND database |

#### I. COMMUNICATION · ATTENTION

| ID | Capability | Canonical objects | Status | AI | P | Next action |
|---|---|---|---|---|---|---|
| COM-1 | Conversations + attachments + unread | `conversations`, `conversation_*` | PROD_DATA (5/18) | — | 1 | no organization participant type; `team` threads always RESTRICTED |
| COM-2 | Contact disclosure | `contact_disclosure_requests` | IMPL (0 rows) | — | 2 | expiry RPC has no caller — requests never expire |
| COM-3 | Notifications (20 types) | `notification_events` | PARTIAL | — | 1 | all 20 emitted; **email inert** (provider unset) |
| COM-4 | Weekly digest | cron + read-time emitter | IMPL | — | 2 | the only cron in the product |
| COM-5 | Attention / activity centre | spine signals | PARTIAL | — | 2 | fragmented across 4 surfaces |

#### J. MAP · MOBILITY · INTELLIGENCE

| ID | Capability | Canonical objects | Status | AI | P | Next action |
|---|---|---|---|---|---|---|
| GEO-1 | Market map / world view | `lib/market-map` | PARTIAL | — | 1 | owner-scoped only; cross-user aggregate deliberately absent |
| GEO-2 | Personal location privacy | `preferred_locations`, `consented_login_location_signals` | PROD_DATA | — | — | **no coordinates for people, by schema construction** |
| GEO-3 | Mobility / cross-border requirements | `lib/country-readiness` | PARTIAL | — | 2 | checklist only; no permit/posting workflow |
| GEO-4 | Labour-market intelligence | `market_intelligence_observations` (76) | PARTIAL | — | 2 | exactly one path into an operational action |
| GEO-5 | Public answer engine / SEO | `question-registry.json` | PROD_DATA | — | 2 | — |

#### K. EDUCATION

| ID | Capability | Canonical objects | Status | AI | P | Next action |
|---|---|---|---|---|---|---|
| EDU-1 | Institution capability + learner link | `organization_roles`, `engagement_contexts` `student` | PROD_DATA | — | 1 | — |
| EDU-2 | Programmes / cohorts / members | `education_*` | PROD_DATA (1/1/0) | W | 1 | applied 2026-09-03 |
| EDU-3 | Learner outcomes | `institution_learner_outcomes` | IMPL | — | 2 | — |
| EDU-4 | Learning compass (student path) | `lib/learning/learning-compass` | IMPL | — | 2 | — |
| EDU-5 | Human-in-loop learning review | `learning_review_queue` | **ORPHAN** | — | 3 | `/dashboard/learning` has zero inbound links |
| EDU-6 | **Institution reporting** | — | **MISSING** | — | 2 | programmes exist; no report, no export |

#### L. PLATFORM · AI · GOVERNANCE

| ID | Capability | Canonical objects | Status | AI | P | Next action |
|---|---|---|---|---|---|---|
| AI-1 | MCP door (12 capabilities) | `/api/mcp`, `lib/capabilities` | PROD_DATA | — | 0 | **no MCP e2e spec**; OAuth authorization server not enabled by the owner |
| AI-2 | Conversation action backbone (52 actions, 38 wired) | `lib/conversation` | PROD_DATA | — | 1 | 48 of 52 tokens carry `stateFingerprint = "n/a"` |
| AI-3 | AI runtime: providers, model registry, cost ceilings, egress | `lib/ai/runtime` | **PROD_DATA (47 runs)** | — | 1 | 6 registered agents have zero call sites |
| AI-4 | AI agent subjects (human / agent / team) | ARCHITECTURE §5.1 | **DEFERRED** | — | 3 | architecture recorded; deliberately not now |
| GOV-1 | Migration safety + parity gates | `.github/scripts`, `check:migration-parity` | PARTIAL | — | 0 | **OWNER?** one `SUPABASE_DB_URL` secret arms two inert gates; repo→prod direction unchecked |
| GOV-2 | Quality gates (typecheck, lint, unit, 12 copy/doctrine guards) | `quality.yml` | PROD_DATA | — | — | strong |
| GOV-3 | E2E in CI | `e2e-smoke.yml` | PARTIAL | — | 1 | 5 of 94 specs, 27 tests |
| GOV-4 | Telemetry / funnel | `pilot_events` (3,329) | PROD_DATA | — | 2 | — |
| GOV-5 | Localization | 11 locales, 5 active | PARTIAL | — | 2 | 5 inactive locales carry ~2,500 `[EN]` each and are not ratchet-tracked |
| GOV-6 | Search / discovery | 4 incompatible stacks | DUPLICATED | — | 2 | no people search anywhere by design |
| GOV-7 | Reporting / export | 6 real downloads | PARTIAL | — | 2 | CSV/JSON only; no PDF/XLSX generator |
| GOV-8 | Security / RLS | 190 tables, all RLS | PROD_DATA | — | 0 | 2 real advisor items + 2 owner-only Auth settings |
| GOV-9 | **Executable product constitution** (register + graph + journeys + separations) | `lib/product-gate/*`, `.github/scripts/product-truth.mjs` | IMPL | — | 0 | what a new agent meets before it can narrow the product |

### 6.3 OWNER DECISION QUEUE (2026-09-07)

Each is independent; none blocks a code train.

1. **Self-confirmation, authorization side** (EVID-2) — block in
   `review_journal_entry`, or rely on the weaker classification now shipping?
   A sole trader legitimately has nobody above them. RED.
2. **Nine unapplied migrations** — apply the four with live UI behind them
   (agency clients, journal templates, external profiles, opportunity-seen), or
   retire them?
3. **`SUPABASE_DB_URL`** — one read-only secret arms two live CI gates.
4. **Two Supabase Auth settings** — OTP expiry ≤ 1 h, leaked-password
   protection on.
5. **`companies.company_type` agency lock** (ORG-2) — migrate to
   `organization_roles`, or keep the industry lock deliberately?
6. **E2E in CI** (GOV-3) — build an authenticated fixture strategy, or accept
   the suite as a local-only tool?
7. **Org surfaces and the primary nav** — correct the feature catalogue (which
   still calls shipped org workspaces `preparing`), or add nav routes?

### 6.4 THE NINE UNAPPLIED MIGRATIONS — reconciled individually (2026-09-07)

> Owner decision 4: **no bulk apply, no bulk retire.** Each reconciled against
> current schema, production data, live dependents, superseding migrations,
> RLS, rollback and this register. Every "PRODUCTION_SCHEMA_STATE: absent" below
> is a direct `to_regclass` read on 2026-09-07, not an inference.
>
> None has been applied. Four have live UI behind them and are P0.

#### P0 — live UI depends on an absent schema capability

**1. `20260713160000_agency_clients_v1`**
- CAPABILITY: an agency's own private client address book + `demand → client` link.
- CURRENT_DEPENDENTS: `lib/agency/clients.ts`, `clients-actions.ts`, `clients-model.ts`; `AgencyClientsSection` on `/dashboard/company` (renders for `company_type='staffing_agency'`); `lib/guards/market-map-read-layer-v1.test.ts`.
- PRODUCTION_SCHEMA_STATE: `agency_clients` **absent**; 3 RPCs absent.
- SUPERSEDED: **NO.** `agency_client_connections` (applied `20260723155658`) is a *different* model — an invitation-based, bidirectional bridge to a real platform organization. This is a private record of a client that may not be on the platform. Both are legitimate; today only the bridge exists.
- SAFE_TO_APPLY: **YES** — 1 table, 1 policy, 5 SECURITY DEFINER RPCs, 4 GRANTs, no data DML (the `update`/`delete` lines are inside function bodies), paired rollback present.
- SAFE_TO_RETIRE: **NO** — retiring means deleting a shipped agency surface and its lib layer.
- CONSEQUENCE_OF_APPLY: the agency room's client list starts working; nothing existing changes.
- CONSEQUENCE_OF_RETIRE: an agency capability the product advertises is removed.
- RECOMMENDATION: **prepare for the human gate.** Highest of the four — it is the only one that gates a whole role's workflow.
- HUMAN_GATE_REQUIRED: **YES** (SECURITY DEFINER + GRANT).

**2. `20260714170000_worker_opportunity_seen_v1`**
- CAPABILITY: per-worker "already seen this opportunity" markers — the honest definition of "new".
- CURRENT_DEPENDENTS: `lib/opportunities/seen.ts` (the single adapter), `recommendations-model.ts`, `weekly-intelligence-model.ts`, `notifications/spine-signals.ts`, `marketplace/worker-opportunities.ts`.
- PRODUCTION_SCHEMA_STATE: `worker_opportunity_seen` **absent**; RPC absent.
- SUPERSEDED: **NO.**
- SAFE_TO_APPLY: **YES** — 1 table, 1 own-rows-only policy, 2 RPCs, 2 GRANTs, no data DML, paired rollback. Privacy-positive by design: the demand owner never learns who saw.
- SAFE_TO_RETIRE: **NO** without also removing the "new matching jobs" spine signal and the recommendation "Nauja" chip.
- CONSEQUENCE_OF_APPLY: the new-jobs count can clear; the 7-day `created_at` fallback stops standing in for it.
- CONSEQUENCE_OF_RETIRE: the badge stays permanently 0 by design, which is honest but dead.
- RECOMMENDATION: **prepare for the human gate.**
- HUMAN_GATE_REQUIRED: **YES** (SECURITY DEFINER + GRANT).

**3. `20260714180000_journal_profession_templates_v1`**
- CAPABILITY: per-profession scaffolding for the journal composer (doctrine §10 slug registry, not a UI enum).
- CURRENT_DEPENDENTS: `lib/journal/journal-templates.ts`, `journal-templates-model.ts`; `journal-entry-composer.tsx`; `/dashboard/journal`.
- PRODUCTION_SCHEMA_STATE: `journal_profession_templates` **absent**.
- SUPERSEDED: **NO.**
- SAFE_TO_APPLY: **YES** — the *least* risky of the nine: 1 table, 2 policies, **no SECURITY DEFINER function at all**, 2 GRANTs, no data DML, paired rollback.
- SAFE_TO_RETIRE: possible, but it removes the only answer to "a tiler and a cleaner should not start from the same blank textarea".
- CONSEQUENCE_OF_APPLY: templates become seedable; the composer's empty state stops being the only state.
- CONSEQUENCE_OF_RETIRE: journal scaffolding stays a permanent gap.
- RECOMMENDATION: **prepare for the human gate.** Lowest risk — a reasonable first apply if the owner wants to validate the gate procedure on something small.
- HUMAN_GATE_REQUIRED: **YES** (GRANT only — no definer body to audit).

**4. `20260713210000_multi_source_talent_v1`**
- CAPABILITY: three tables — `worker_external_profiles` (P6), `talent_source_records` (P5 provenance), `identity_resolution_events` (P7 audit).
- CURRENT_DEPENDENTS: **split.** `worker_external_profiles` has a live consumer (`lib/worker/external-profiles.ts` + the profile page section rendering `notEnabled`). `talent_source_records` and `identity_resolution_events` have **zero runtime consumers** — guard tests only.
- PRODUCTION_SCHEMA_STATE: all three **absent**.
- SUPERSEDED: **NO.**
- SAFE_TO_APPLY: **YES technically** (3 tables, 3 policies, 8 definer RPCs, 9 GRANTs, an immutability trigger, no data DML, paired rollback) — but it applies twice as much surface as the live dependency needs.
- SAFE_TO_RETIRE: **NO** for the external-profiles third; **YES** for the other two on today's evidence.
- CONSEQUENCE_OF_APPLY: profile external links start working; two unused tables also ship, adding audit surface with no reader.
- CONSEQUENCE_OF_RETIRE: the profile section must be removed too.
- RECOMMENDATION: **split before gating.** Prepare an `external_profiles_v1` migration carrying only the one table its live UI needs; leave P5/P7 as recorded architecture. Applying all three to serve one is the kind of unused-surface growth this reconciliation is meant to stop.
- HUMAN_GATE_REQUIRED: **YES** (SECURITY DEFINER + GRANT + trigger).

#### Retire / never-apply

**5. `20260714210000_company_memberships_v1`**
- SUPERSEDED: **YES** — by `20260817160000` / the applied `company_memberships` (`20260805195716`). Its own header says `DO NOT APPLY THIS FILE, EVER`: its validation trigger would 42501-reject members whose governance lives only in `company_memberships` — production holds one such active manager.
- SAFE_TO_APPLY: **NO — applying it would break a live manager's session.**
- SAFE_TO_RETIRE (delete the file): **NO** — `company-architecture-v1.test.ts` pins its bytes. Keep in tree, never apply.
- RECOMMENDATION: leave exactly as is. HUMAN_GATE_REQUIRED: n/a.

**6. `20260713120000_company_locations_v1`**
- SUPERSEDED: **YES** — by `work_objects_v1` (applied `20260817204529`); the ledger already records `SUPERSEDED, MUST NOT BE APPLIED`, pinned by `work-objects-projects-v1.test.ts`.
- CURRENT_DEPENDENTS: none.
- SAFE_TO_APPLY: **NO** (a second location truth beside `work_objects`).
- SAFE_TO_RETIRE: **YES**, but the file is pinned by a guard — keep in tree, never apply.
- RECOMMENDATION: leave as is. HUMAN_GATE_REQUIRED: n/a.

#### Defer — no live dependent

**7. `20260714211000_dashboard_preferences_v1`**
- CAPABILITY: server-side dashboard card order/hidden preferences.
- CURRENT_DEPENDENTS: **none.** The configurable card grid it served was deleted in W3; `dashboard-module-registry.ts` still describes 18 routes but has no renderer.
- SAFE_TO_APPLY: yes technically; SAFE_TO_RETIRE: yes.
- RECOMMENDATION: **defer.** Revisit only if the card grid returns. Applying it now creates a table with no writer.
- HUMAN_GATE_REQUIRED: not yet.

**8. `20260717150000_demand_interest_seen_v1`**
- CAPABILITY: worker-side "the company responded to my interest" seen markers.
- CURRENT_DEPENDENTS: **none at runtime** — guards only; `spine-signals.ts` explicitly defers the signal.
- RECOMMENDATION: **defer** until the interest-response signal is built. Applying first is the wrong order.
- HUMAN_GATE_REQUIRED: not yet.

**9. `20260717130000_open_markets_countries_draft_v1`**
- CAPABILITY: adds GE / BE / FR / ES / AT / CH as selectable `countries` rows. Data only — no table, no policy, no function, no GRANT.
- CURRENT_DEPENDENTS: none directly; every country selector reads `countries`.
- SAFE_TO_APPLY: technically yes (`insert … on conflict do nothing`); SAFE_TO_RETIRE: yes.
- RECOMMENDATION: **owner market-scope decision, not an engineering one.** The header is explicit that the static gate may call it GREEN and that the DRAFT header is authoritative. Nothing is blocked by it.
- HUMAN_GATE_REQUIRED: **YES** — as a market-scope decision.

#### Summary

| | migrations |
|---|---|
| Prepare for the human gate (live UI blocked) | `agency_clients_v1`, `worker_opportunity_seen_v1`, `journal_profession_templates_v1`, + a **split** `external_profiles_v1` carved out of `multi_source_talent_v1` |
| Never apply, keep in tree (guard-pinned) | `company_memberships_v1` (20260714210000), `company_locations_v1` |
| Defer — no live dependent | `dashboard_preferences_v1`, `demand_interest_seen_v1` |
| Owner market-scope decision | `open_markets_countries_draft_v1` |
