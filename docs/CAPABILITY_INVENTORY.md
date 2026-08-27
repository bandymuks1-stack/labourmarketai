# LabourMarket.ai — CAPABILITY INVENTORY & GAP MAP

> **Status:** canonical. Derived from **code + production**, 2026-08-27.
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
| Living CV / Player Card | `PARTIAL` | renders; EU export shipped (#1291); not fully E2E |
| Practice / volunteering as experience | `PARTIAL` | RPC proven under RLS; **no browser proof** (form trigger phrase unknown) |
| Opportunities board | `PROVEN` | browser, `pilot-interest-loop` |
| Express interest | `PROVEN` | browser + DB, state-independent |

### Employer core
| capability | status | evidence |
|---|---|---|
| Company setup / identity | `UNPROVEN` | code live, no E2E this round |
| **Organization multi-capability** | `PROVEN` | browser + DB — one org holds `employer` + `training_provider` |
| Demand intake (`customer_requests`) | `PARTIAL` | 17 real rows; NL→structured path not E2E this round |
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
| **AI router** | `IMPLEMENTED`, `ENV-GATED` | one router, chain, privacy gate, cost model — **`ai_runs = 0`, no provider configured** |
| AI vendorless accounting | `UNPROVEN` | #1294 deployed; needs a user to hit an AI surface |
| Pricing / LMC / billing | `OWNER-GATED` | canonical catalogue exists; paid chain gated |
| Public vacancies / SEO | `UNPROVEN` | live |
| **Languages** | `PARTIAL` | **routes 5 of 26 required** — see [`LANGUAGE_MATRIX.md`](LANGUAGE_MATRIX.md) |

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
   sides, and shortlist/review actions were reachable. What remains UNPROVEN is
   the step BEFORE it — an employer typing a need in natural language and
   getting a structured demand (`customer_requests` intake), which this round
   seeded rather than drove.
3. **Cross-actor scenario unproven.** Each actor has been proven separately;
   institution → student → employer has not been run as one chain.
4. **Languages: 5 of 26 routed, Georgian absent entirely.** One narrower gap
   inside this was closed on 2026-08-27: the work-log context selector could
   not NAME a placement, because its base label resolved through
   `conversation.worklog.relationship.*`, which carries neither `student` nor
   `volunteer` — so a learner's placement printed "Kita" / "Other". It now
   resolves through the canonical `relationshipTypes` catalogue in all five
   active locales. The architectural dependence on hand-maintained needle lists
   is UNCHANGED and remains the real language blocker.
5. **AI is not env-gated — it is CODE-gated, which is a stronger statement.**
   `apps/web/lib/ai/provider.ts` unconditionally returns the inert no-op
   provider; there is no real branch to select, so no environment variable can
   turn it on. `ai_runs` = 0. Activating it is an owner decision about provider,
   budget and key, not a deploy setting. It must never be described as
   operational.
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

Nothing above is fixed by more code existing. Each needs a real journey run.
