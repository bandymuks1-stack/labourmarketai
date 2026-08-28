# LabourMarket.ai — CAPABILITY INVENTORY & GAP MAP

> **Status:** canonical. Derived from **code + production**, 2026-08-27,
> revised 2026-08-28 (closure train #1320-#1324).
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
| Transversal capability recognition | `PARTIAL` | LT/EN/RU only, classified `deferred` |

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

   What is still MISSING is not code: **0 production organizations hold
   `training_provider`**, so no institution exists in production yet, and the
   user-facing browser chain has not been run against the deployed app.
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

   **Still open:** the chain is proven on the LOCAL stack. It has not been run
   against the deployed app, and 0 production organizations hold
   `training_provider`, so production remains `PARTIAL` for the same reason
   blocker 1 records.
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
