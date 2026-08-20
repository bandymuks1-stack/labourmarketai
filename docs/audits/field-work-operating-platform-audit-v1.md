# Field-Work Operating Platform — Reality Audit v1

> **Date:** 2026-08-19 · **Branch:** `claude/labour-market-ai-setup-pw3qgl`
> **Base:** `origin/main` @ `9d9a11a` (clean, 0 ahead / 0 behind at audit start)
> **Production truth:** Supabase project `gorgitwvdzxbnaxhrsrw` (labourmarket.ai, eu-west-1)
> **Scope:** cross-sector labour-market + workforce + field-work capability audit.
> Construction/field systems are references for operational excellence, **not** a new identity.

This audit is built from **live schema + live row counts + code reachability**, not from
prior audit documents. Where a capability is absent, that is stated plainly. Where the
platform is already stronger than the reference products, it is marked KEEP.

---

## 0. Method — the six axes

The brief demanded that "schema exists" never be confused with "the feature exists".
Every capability below is scored on six independent axes:

| Axis | Question |
|---|---|
| **SCHEMA** | Do the tables/columns exist in production? |
| **ENGINE** | Is there a server-side read/write module with real logic? |
| **UI** | Is there a page that renders it? |
| **FIELD UX** | Is it usable one-handed on a phone on a site? |
| **USER PATH** | Can a real user reach it without a dev? |
| **REAL DATA** | Are there rows in production? |

A zero-row table is **not** evidence of a missing feature. It is evidence that must be
interpreted: unreachable (defect) vs reachable-but-unused (adoption) vs
reachable-but-pointless (design defect). This audit found all three, and the third is
the important one.

---

## 1. CURRENT REALITY

### 1.1 Production row counts (the ground truth)

Taken from `pg_stat_user_tables` on the production project.

**Engines with real data — the platform is genuinely live:**

| Table | Rows | Reading |
|---|---:|---|
| `esco_labels` | 1,034,730 | Full ESCO taxonomy loaded |
| `esco_occupation_skills` | 126,102 | Occupation→skill graph real |
| `public_vacancies` | 48,623 | Real external labour-market supply |
| `esco_skills` / `esco_occupations` | 13,939 / 3,039 | Canonical skill identity real |
| `journal_entries` | 36 | **Real work records** |
| `journal_entry_skills` | 46 | Evidence→skill extraction working |
| `journal_entry_confirmations` | 12 | **Manager confirmation working** |
| `journal_entry_metrics` | 114 | Structured quantities working |
| `journal_entry_photos` | 8 | Photo evidence working |
| `worker_skills` | 48 | Trust layer populated |
| `engagement_contexts` | 53 | §5.5 four-layer model in real use |
| `profiles` / `workers` | 36 / 36 | Real people |
| `organizations` / `companies` | 13 / 10 | Real orgs |
| `projects` | 6 | Real projects |
| `customer_requests` | 17 | §17 canonical demand intake in real use |
| `workflow_definitions` (+versions/steps) | 16 | Approval templates seeded |
| `audit_logs` | 50 | §3.4 audit trail live |

**Engines with schema + UI but ZERO production rows:**

`work_tasks` 0 · `work_task_events` 0 · `task_dependencies` 0 · `work_objects` 0 ·
`assets` 0 · `asset_assignments` 0 · `timesheets` 0 · `timesheet_events` 0 ·
`workflow_instances` 0 · `worker_documents` 0 · `worker_absences` 0 ·
`training_assignments` 0 · `document_acknowledgements` 0 · `procurement_inquiries` 0 ·
`finance_records` 0 · `org_documents` 0 · `project_worker_readiness_items` 0 ·
`journal_entry_work_items` 0.

### 1.2 The single most important finding

> **The Work Journal — the only execution engine with real production data — is
> structurally disconnected from the task engine and the site engine.**

`journal_entries` carries: `worker_id`, `engagement_context_id`, `entry_type_slug`,
`profession_id`, `original_text`, `original_language`, `hash_prev`/`hash_self`,
`visibility_scope`, `correction_of`, `superseded_by`, **`project_id`**.

It does **not** carry `task_id`. It does **not** carry `object_id`. Verified directly
against production `information_schema.columns`.

Consequences, all confirmed in code:

1. A worker assigned a `work_task` **cannot record evidence against that task**. The
   task page (`app/[locale]/dashboard/tasks/page.tsx`, 1015 lines) contains no evidence,
   photo, or approval surface at all — verified by grep: zero matches for
   `evidence|journal|photo|approve|confirm`.
2. `createJournalEntry` (`lib/journal/actions.ts:163`) takes **`site_name` as free text**,
   while the structured `work_objects` table — which has `latitude`/`longitude`,
   `responsible_profile_id`, `project_id` — sits empty. Two competing representations
   of "site", and the weaker one is the one in use.
3. The generic workflow/approval engine (`workflow_instances.context_entity_type`) allows
   `generic_request, worker_absence, expense, invoice, document_ack, timesheet,
   procurement, business_trip, management_decision, agreement` — **`work_task` is not in
   the list**. A task cannot be routed for approval.
4. Therefore completing a task produces **nothing durable**: no evidence, no hours, no
   skill signal, no approval record. That is why `work_tasks` has zero rows. It is not an
   adoption problem and not an unreachable-UI problem. **It is a design defect: the task
   engine is reachable, functional, and pointless.**

This one break explains the entire zero-row cluster. Tasks produce nothing → nobody
creates tasks → no per-task hours → `timesheets` stay empty → `finance_records` have no
labour input → the planning engine has no actuals.

### 1.3 The second most important finding

> **The forecasting / capacity / crew-gap engine the brief asks for as a future
> differentiator already exists, and is better than assumed. It is starving for input.**

- `lib/workforce/capacity-model.ts` — compares requirements against real internal supply
  across **eight gap types**: headcount, hours, skill, certificate, language, supervisor,
  location, brigade. Documented matching rules (`available` / `free` / `fit` / `eligible` /
  `busy-fit`). Carries **opaque worker ids only** — no name, email or phone may cross the
  boundary, pinned by a type-level test. This is §20-compliant by construction.
- `lib/workforce/gap-timeline.ts` — per-bucket shortfall, deterministic `riskDate`,
  documented `ok` / `tight` / `critical` thresholds, and a **closed** recommendation set
  where `create_position` may fire **only** on a human-confirmed requirement. A
  machine-suggested line can never spawn a position. This is §7 compliant by construction.
- `lib/workforce/future-work-model.ts` — composes demand (`customer_requests`
  `payload.structured_v2`) + `projects` into one timeline with **no third intake and no
  new store**.
- `lib/staffing/fit.ts` + `match-preview.ts` — §19-compliant fit-not-rating.

These engines are fed by **planned** work (demand + projects). They receive **zero
actuals**, because actuals would come from tasks and timesheets, which are empty per §1.2.

### 1.4 What is genuinely absent

Verified by exhaustive grep across `lib/`, `app/`, `components/`:

| Capability | Evidence |
|---|---|
| **GPS / clock-in / clock-out / geofence / attendance** | Zero matches for `geofence\|clock_in\|clockIn\|clock_out\|punch`. The only `attendance` hits are code comments explicitly stating no attendance data exists. |
| **QR / barcode scanning** | Zero matches for `qrcode\|QRCode\|qr_code`. |
| **Offline mode / service worker / queued writes** | `app/manifest.ts` exists and is **honest**: it states in-file that there is no service worker and "nothing here promises offline capability". No IndexedDB, no sync queue. |
| **Client / external scoped portal** | `project_clients` (4 rows) stores only `name`, `contact_name`, `contact_email`, `notes`. No access grant, no token, no scoped read. It is a contact record, not a portal. |
| **Variations / change orders** | Zero matches for `change_order\|changeOrder\|variation`. |
| **Worker push / email / SMS notifications** | `notification_events` is in-app only; the sole external channel is `lib/notifications/telegram-owner-alerts.ts` (owner alerts, not worker delivery). |

### 1.5 Classification table

| Capability | Class | S | E | UI | Field | Path | Data |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Work Journal + photo + confirmation + hash chain | **VERIFIED_PRODUCTION** | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ |
| ESCO skill identity + public vacancies | **VERIFIED_PRODUCTION** | ✅ | ✅ | ✅ | – | ✅ | ✅ |
| Engagement contexts (§5.5) | **VERIFIED_PRODUCTION** | ✅ | ✅ | ✅ | – | ✅ | ✅ |
| Canonical demand intake (§17) | **VERIFIED_PRODUCTION** | ✅ | ✅ | ✅ | – | ✅ | ✅ |
| Projects + clients + assignments | **VERIFIED_PRODUCTION** | ✅ | ✅ | ✅ | – | ✅ | ✅ |
| Capacity / gap-timeline / forecasting | **IMPLEMENTED_AND_REACHABLE** | ✅ | ✅ | ✅ | – | ✅ | ⚠️ planned only |
| Task engine (create/assign/status/deps) | **BROKEN** (reachable, produces nothing) | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Work objects / sites (has lat-lon!) | **IMPLEMENTED_NOT_USED** | ✅ | ✅ | ⚠️ | ❌ | ⚠️ | ❌ |
| Assets + assignment lifecycle | **PARTIAL** (no QR/category/location/maintenance) | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Workflow / approval engine (generic) | **IMPLEMENTED_NOT_USED** (excludes `work_task`) | ✅ | ✅ | ✅ | – | ✅ | ❌ |
| Timesheets | **IMPLEMENTED_NOT_USED** (no hour source) | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Certificates / readiness / training / acks | **IMPLEMENTED_NOT_USED** | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Procurement (project+object scoped) | **IMPLEMENTED_NOT_USED** (no task link) | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Notifications (in-app, dedupe) | **IMPLEMENTED_AND_REACHABLE** | ✅ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ 2 |
| GPS / attendance / geofence | **MISSING** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| QR primitive | **MISSING** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Offline field mode | **MISSING** (honestly declared) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| External client portal | **MISSING** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Variations / change orders | **MISSING** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| AI operations assistants | **OWNER_GATED** (`noop-provider`, parked by design) | ✅ | ⚠️ | ✅ | – | – | ❌ |

---

## 2. WorkerNU COMPARISON

Sources: worker.nu / workernu.com public pages (the vendor's own site; direct fetch of
`workernu.com` is blocked by this environment's egress proxy, so capability claims are
taken from indexed vendor page content — flagged as such, not treated as verified).

| WorkerNU capability | labourmarket.ai state | Verdict |
|---|---|---|
| Task creation, assignment, requirements, deadline, status, progress | `work_tasks` + `task-actions.ts` — create/assign/status/priority/due/reopen/dependencies | **KEEP** (equal or better — WorkerNU has no dependency graph) |
| Task comments | `work_task_events` is an append-only *audit* vocabulary, not comments | **PARTIAL** |
| Task photos | ❌ not on tasks (photos exist only on journal entries) | **REAL GAP — P0** |
| Completion request → manager confirmation | ❌ on tasks; ✅ on journal entries (12 real confirmations) | **REAL GAP — P0** (engine exists, wrong object) |
| Immutable history | ✅ `work_task_events` + §3 hash chain on journal | **KEEP** (stronger — WorkerNU has no hash chain) |
| GPS-located hour registration | ❌ | **REAL GAP** (see §7 privacy position) |
| Tool/equipment register, who holds it, warehouse, history | ✅ `assets` + `asset_assignments` (issue/ack/return, condition at issue & return) | **EXTEND** |
| Tool QR scanning | ❌ | **REAL GAP** |
| Calendar / leave planning | ✅ `worker_absences`, leave balance policies, planning zone | **KEEP** |
| Auto-generated reports → accounting integration | ⚠️ CSV export exists (journal, timesheets, operations); no accounting integration | **PARTIAL** |

**Net:** on *structure, trust and legal defensibility* labourmarket.ai is materially ahead
(hash chain, append-only, engagement contexts, ESCO skill identity, confirmed-vs-declared
separation). On *field data capture* — the moment work actually happens — WorkerNU is
ahead, because our task chain terminates before evidence.

---

## 3. BROADER COMPETITOR COMPARISON

Sources are the vendors' current public pages (see Sources at end). Capability claims are
theirs; nothing here copies branding, UI, copy or architecture — principles only.

| Capability | Remato | Workyard | Grownu | WorkTrac | Teambridge | Maximo | **labourmarket.ai** |
|---|:-:|:-:|:-:|:-:|:-:|:-:|---|
| GPS clock-in + geofence | ✅ | ✅ (continuous while clocked in) | ✅ (approved-site restriction) | ✅ | ✅ (+ biometric face) | – | ❌ |
| Offline field mode | ✅ | ✅ | – | ✅ (full offline + sync) | – | ✅ (offline + sync) | ❌ |
| QR / tag scanning | ✅ (tool QR) | – | – | – | – | ✅ (NFC asset+location) | ❌ |
| Equipment lifecycle + custody history | ✅ | – | – | ✅ (materials check-in/out) | – | ✅ (procure→decommission) | ⚠️ partial |
| Photo evidence tied to work | ✅ | ✅ | – | ✅ | – | ✅ | ✅ (journal only) |
| Tamper-evident work proof | – | ⚠️ GPS audit trail | – | ✅ (cryptographic) | – | – | ✅ **hash chain** |
| Scheduling / dispatch | ✅ | ✅ | ✅ | ✅ | ✅ (AI shift-fill) | ✅ (map routing) | ⚠️ planning yes, dispatch no |
| Skills/credential-aware assignment | – | – | – | ⚠️ courses | ✅ (credential renewal) | ✅ (job plans) | ✅ **8-type gap engine** |
| Payroll / accounting export | ✅ | ✅ | ✅ | ✅ (QuickBooks) | ✅ | ✅ | ⚠️ CSV only |
| Safety / compliance forms | – | – | – | ✅ (OSHA) | – | ✅ (safety plans) | ⚠️ acks + certs, no forms |
| **External labour market supply** | ❌ | ❌ | ❌ | ❌ | ⚠️ internal pool | ❌ | ✅ **48,623 vacancies + ESCO** |
| **Cross-sector by design** | ❌ constr. | ❌ constr. | ⚠️ | ❌ field | ✅ hourly | ⚠️ EAM | ✅ |

**The strategic read.** Every competitor is a *closed-system* workforce tool: they know
only the company's own employees. None of them can answer "we are two electricians short
in three weeks — and here is who exists in the market". labourmarket.ai already owns the
external half of that sentence (ESCO identity + 48k live vacancies + fit engine) and
already owns the gap-detection half (`capacity-model` + `gap-timeline`). It does **not**
own the operational-truth half, because tasks produce no evidence.

**That is the whole competitive thesis, and it is one missing link away.**

---

## 4. GAP MATRIX

Columns: **CS** current state · **Engine** existing canonical engine to extend ·
**CV** competitive value · **XS** cross-sector value · **UV** user value · **RV** revenue
value · **Risk** legal/privacy · **Cost** implementation · **Mig** migration needed ·
**Gate** owner gate · **Rec** recommendation. Scores H/M/L.

| # | Capability | CS | Engine to extend | Real gap | CV | XS | UV | RV | Risk | Cost | Mig | Gate | Rec |
|---|---|---|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| 1 | **Task ↔ evidence link** | BROKEN | Journal + work_tasks | **Yes — the break** | H | H | H | H | L | L | additive | no | **BUILD P0** |
| 2 | **Task ↔ site (object) link** | MISSING | Journal + work_objects | Yes | M | H | H | M | L | L | additive | no | **BUILD P0** |
| 3 | Task approval via workflow | MISSING | workflow_instances | Yes (enum omits task) | M | H | H | M | L | L | additive | no | **BUILD P1** |
| 4 | Per-task hours → timesheet | IMPL_NOT_USED | timesheets | Input starvation | H | H | H | H | L | M | none | no | **EXTEND P1** |
| 5 | Field mode (worker TODAY view) | PARTIAL | tasks + journal | Yes | H | H | H | M | L | M | none | no | **BUILD P1** |
| 6 | Asset QR primitive (typed targets) | MISSING | assets + objects | Yes | H | H | M | M | L | M | additive | no | **BUILD P1** |
| 7 | Asset category / location / maintenance | PARTIAL | assets | Yes | M | H | M | M | L | M | additive | no | **EXTEND P2** |
| 8 | GPS clock-in / geofence | MISSING | work_objects (has lat/lon) | Yes | H | M | M | M | **H** | M | additive | **YES** | **P2 + owner gate** |
| 9 | Offline field mode | MISSING | PWA + journal | Yes | H | H | H | M | M | **H** | none | no | **P2** |
| 10 | External client portal | MISSING | project_clients + §4 grants | Yes | M | H | M | H | **H** | H | additive | **YES** | **P2 + owner gate** |
| 11 | Materials/expenses per task | PARTIAL | procurement + finance | Yes (no task link) | M | H | M | H | L | M | additive | no | **EXTEND P2** |
| 12 | Variations / change orders | MISSING | workflow + management_decisions | Partial (workflow covers most) | L | M | M | M | L | M | additive | no | **P3** |
| 13 | Worker push/email notifications | PARTIAL | notification_events | Yes (no delivery) | M | H | H | M | M | M | none | no | **P2** |
| 14 | Safety forms / permits / incidents | PARTIAL | document_acks + org_documents | Partial | M | H | M | M | **H** | H | additive | no | **P3** |
| 15 | Accounting/payroll integration | PARTIAL | CSV exports | Yes | M | H | M | H | M | H | none | no | **P3** |
| 16 | Crew gap / replacement recommendation | **EXISTS** | gap-timeline | **No — starving** | H | H | H | H | L | – | – | – | **KEEP** |
| 17 | Forecasting | **EXISTS** | capacity + future-work | **No — starving** | H | H | H | H | L | – | – | – | **KEEP** |
| 18 | Fit / matching (§19) | **EXISTS** | staffing/fit | No | H | H | H | H | L | – | – | – | **KEEP** |
| 19 | Multilingual field work | **EXISTS** | §2 slug→JSON, 11+1 locales | No | H | H | H | M | L | – | – | – | **KEEP** |
| 20 | Voice → structured journal draft | PARTIAL | voice + journal_entry_work_items | Engine parked | M | H | H | M | M | M | none | **YES (AI)** | **P2 gated** |
| 21 | AI operations assistants | OWNER_GATED | lib/ai (noop provider) | Parked by design | M | M | M | M | **H** | H | – | **YES** | **KEEP PARKED** |
| 22 | Continuous location history | MISSING | – | – | L | L | L | L | **H** | – | – | – | **REJECT** |
| 23 | Biometric / face clock-in | MISSING | – | – | L | L | L | L | **H** | – | – | – | **REJECT** |
| 24 | Global worker score / ranking | MISSING | – | – | – | – | – | – | **H** | – | – | – | **REJECT (§19)** |
| 25 | Full accounting ledger | MISSING | finance_records | – | L | M | L | M | M | H | – | – | **REJECT — integrate** |

---

## 5. KEEP / EXTEND / BUILD / REJECT

### KEEP (already stronger than the reference set — do not rebuild)
- Work Journal: hash chain (§3.3), append-only, corrections, supersede, photos,
  manager confirmation, skill extraction with provenance. **No competitor has this.**
- Capacity / gap-timeline / forecasting with 8 gap types + privacy-safe opaque ids.
- ESCO canonical skill identity + 48,623 live vacancies — the external-market half.
- §19 fit-not-rating, §20 privacy base, §5 engagement contexts, §2 slug→JSON i18n.
- Generic workflow/approval engine, generic notification engine with dedupe.

### EXTEND (canonical engines that need one more edge, not a new module)
- `journal_entries` → add task + object linkage (**P0**).
- `workflow_definitions/instances` → allow `work_task` context (**P1**).
- `timesheets` → derive lines from task-linked journal hours (**P1**).
- `assets` → category, location, maintenance, QR target (**P1/P2**).
- `procurement_inquiries` → optional `task_id` (**P2**).

### BUILD (genuinely absent, justified)
- Task evidence + completion-request surface (**P0**).
- Worker field "TODAY" mode (**P1**).
- One QR primitive with typed targets — object / asset / task / document (**P1**).
- Offline-aware write queue (**P2**).

### REJECT (with reasons — see §9)
Continuous location history · biometric clock-in · global person score · a second task
module · a full accounting ledger · a separate "field app" codebase.

---

## 6. SELECTED P0 TRAIN

> **P0 — Close the work chain: task-linked, site-linked evidence.**

Everything else in this audit is downstream of this. It is additive, non-destructive,
GREEN-class, requires no owner gate, and reuses six existing engines without creating one
new module.

Delivered in this train:

1. **Migration (additive, reversible):** `journal_entries.task_id` → `work_tasks(id)` and
   `journal_entries.object_id` → `work_objects(id)`, both `NULL`able,
   `ON DELETE SET NULL`. Indexes for the two new read paths. Explicit `-- DOWN` block.
   No RLS loosening — the new columns inherit the existing default-closed policies (§4).
2. **Write path:** `createJournalEntry` accepts optional `task_id` / `object_id`, validated
   server-side against what the caller may actually see (never a caller-supplied id trusted
   blind).
3. **Read path:** a task's evidence — the journal entries recorded against it, with their
   photos and confirmation state.
4. **Task surface:** evidence list + "record work on this task" entry point, so completing a
   task finally produces something durable.
5. **Guard tests** pinning: the link is optional (no journal entry is ever *required* to
   have a task); no translated columns (§2.2); append-only preserved (§3.1); hash chain
   untouched (§3.3).

**Why this and not GPS/QR/offline first:** those are real gaps, but each is a *new*
capability on top of a chain that does not yet close. Adding GPS clock-in to a task engine
that produces no evidence would add surveillance risk for no operational truth. The link
must exist before anything is worth attaching to it.

---

## 7. PRIVACY / SAFETY POSITION (Phase 7)

- **GPS is deliberately deferred and gated.** `work_objects` already carries
  `latitude`/`longitude`, so the *site* half of geofencing exists. The *worker* half is not
  built, and when it is, the design position of this audit is: **event-based location
  evidence only** — a point captured at an explicit clock-in / clock-out / evidence event,
  never a continuous track. Continuous location history is REJECTED outright (§4.1 gap #22)
  as incompatible with §20.1–§20.3: a behavioural dossier must not exist as a data
  structure.
- **Biometric clock-in REJECTED** — special-category data under GDPR Art. 9, no
  proportionate justification.
- **No global person score** (§19a) — the fit engine already computes per-need percentages
  with their basis; nothing in this train adds an aggregate.
- **Client portal is owner-gated** — it is the one capability that exposes internal data to
  an external party. Least-privilege scoped grants (§4.2 `reports_only`) are the only
  acceptable shape; a client must never gain general organisation visibility.
- **AI stays parked** — `lib/ai/noop-provider.ts` is the configured provider. This train
  enables no provider, adds no egress, and moves no data outward.

---

## 8. WHAT IS UNUSED vs GENUINELY MISSING

**Unused but real** (reachable, correct, waiting for the chain to close — do **not**
rebuild these): work_objects, timesheets, workflow instances, worker_documents, training
assignments, document acknowledgements, procurement, finance records, org documents,
readiness items, journal_entry_work_items.

**Genuinely missing** (nothing exists): GPS/attendance, QR, offline mode, client portal,
variations, worker-facing notification delivery, safety forms/permits/incidents.

**Broken** (exists, reachable, produces nothing): the task engine — fixed by the P0 train.

---

## 9. DELIBERATELY REJECTED

| Idea | Why rejected |
|---|---|
| Continuous GPS tracking while clocked in (Workyard-style) | §20 forbids behavioural dossiers as a data structure. Event-based location evidence achieves the legitimate purpose (was the person on site) without continuous surveillance. |
| Biometric / facial clock-in (Teambridge-style) | GDPR Art. 9 special-category data; disproportionate; no operational need our evidence chain cannot meet. |
| A separate "WorkerNU-clone" field module | Would duplicate work_tasks, assets, journal. Phase 4 rule: extend canonical primitives. |
| A second task/checklist store | §17-style single-model discipline. `work_tasks` is canonical. |
| Global worker score / OVR / trust_score | Explicitly forbidden by §19(a). |
| Full accounting ledger | `finance_records` + export is the correct boundary; accounting belongs in an integration. |
| A separate mobile app codebase | Field mode is a *view* over the same engines, not a second product. A second codebase would fork the evidence chain. |
| Auto-publishing AI-drafted journal entries | §7 / §7.1 — AI drafts, humans confirm before canonical write. |

---

## 10. TOP 10 REMAINING OPPORTUNITIES (ranked by ROI)

| # | Opportunity | Why it pays |
|---|---|---|
| 1 | **Task→timesheet→cost derivation** | Once evidence is task-linked, hours become free. Unlocks timesheets, finance, job cost, billing — four empty engines at once. |
| 2 | **Worker field TODAY mode** | The single biggest adoption lever: a phone screen answering where/what/start/finish. Every competitor has it. |
| 3 | **Actuals into the gap engine** | Turns an excellent *planning* engine into a *forecasting* engine. This is the flywheel's missing input. |
| 4 | **One QR primitive, typed targets** | Object/asset/task/document behind one infrastructure. High field value, low architectural cost. |
| 5 | **Task approval via existing workflow enum** | One enum value + wiring; reuses a fully-built approval engine. |
| 6 | **Worker notification delivery (push/email)** | `notification_events` already emits with dedupe; only delivery is missing. |
| 7 | **Offline write queue for journal + task status** | Highest field-reality value; highest complexity — sequence after the chain closes. |
| 8 | **Asset category/location/maintenance + custody QR** | Completes the asset story to parity with Remato/Maximo. |
| 9 | **Scoped client evidence portal** | Direct revenue lever (clients pay for proof); owner-gated on privacy. |
| 10 | **Accounting/payroll export profiles** | Converts CSV into an integration boundary; removes the last manual step to payroll. |

---

## Sources (competitor capability claims)

- [Remato — tools management](https://remato.com/tools-management/) · [construction time tracking](https://remato.com/construction-time-tracking-software/) · [offline time tracking](https://remato.com/blog/offline-time-tracking-software/)
- [Workyard — GPS time clock](https://www.workyard.com/time-clock-app-with-gps) · [geofencing comparison](https://www.workyard.com/compare/top-geofencing-time-tracking-for-construction-projects)
- [Grownu — GPS/geolocation time tracking](https://grownu.com/solution/gps-time-tracking-for-remote-and-field-employees) · [solutions](https://grownu.com/solutions)
- [WorkTrac](https://worktrac.io/)
- [Teambridge — AI hourly workforce management](https://www.teambridge.com/blog/ai-hourly-workforce-management-2026) · [shift scheduling guide](https://www.teambridge.com/blog/shift-scheduling-2026-operators-guide-ai-coverage)
- [IBM Maximo Application Suite](https://www.ibm.com/products/maximo) · [Maximo Mobile overview](https://www.ibm.com/docs/en/masv-and-l/maximo-manage/cd?topic=overview-maximo-mobile)
- WorkerNU — [worker.nu](https://worker.nu/en/welcome-en/) / [workernu.com](https://workernu.com/en/construction-management-and-time-tracking-system/) (direct fetch blocked by egress proxy; claims taken from indexed vendor page content, flagged as unverified)
- **FieldScout** — no field-workforce product of that name was found in current sources; the
  name resolves to agronomy sensing hardware. Excluded rather than guessed.

---

# ADDENDUM v2 — 2026-08-20: what running the chain changed

The audit above was written from schema, code and row counts. This addendum
records what changed once the chain was **executed** rather than read. Two of
its conclusions were wrong in the optimistic direction, and both were only
visible from execution.

The vehicle is `scripts/db-proof/work-task-approval-chain.sql`: the whole chain
against the **real production database**, inside `begin … rollback`. It
exercises the real deployed functions, the real constraints and the real RLS,
and leaves nothing behind (verified by recount).

## Status by chain step

| Step | Status | Evidence |
|---|---|---|
| A — task → hours/timesheet | **VERIFIED_PRODUCTION** | `timesheet_task_attribution_v1` applied `20260820060427`; 44/44 harness + 24/24 production chain |
| B — task → approval | **OWNER_GATED** | route existed with no on-ramp; needs `20260820070000` (PR #1216) |
| C — task → cost | **REAL_MISSING**, unstarted | `finance_records` / `procurement_inquiries` carry `project_id` + `object_id`, no task link |
| D — work → skills | **VERIFIED_PRODUCTION** | `journal_entry_skills.provenance` since `20260727180000`; needs nothing |
| E — actuals → capacity | **UNUSED_BUT_REAL**, blocked upstream | engines exist; starved by the FIRST_BROKEN_LINK below |

## Correction 1 — chain step B was not "implemented, unproven". It was unreachable.

The audit recorded B as IMPLEMENTED_NOT_PROVEN after `20260819210000` widened
the `context_entity_type` CHECK constraints. That was necessary and **not
sufficient**.

There were **three** independent lists of context types, not one:

1. the table CHECK constraints — widened in #1213;
2. the TypeScript vocabulary **and a second hardcoded copy inside the
   authoring form** — widened in #1216;
3. **`create_workflow_definition_v1`'s own allowlist** — not widened.

So the engine accepted the context, the table accepted the row, the server
action validated the value, and all 11 locales carried the label — while the
only command that can create a definition returned `'invalid'`. No
organization could author a `work_task` flow at all.

**No static signal could see this.** Schema was right, types were right, guards
passed. Steps 1–7 of the chain passed; step 8 returned `invalid`.

*Lesson for this register: a capability is not reachable because its schema
admits it. Duplicate allowlists are the failure mode — count them.*

## Correction 2 — the audit under-read the zero-row cluster

The audit treated the zero rows in `timesheets` as "nobody has used it yet".
Measurement says otherwise: production holds **12 `fragment_time` and 8
`quantity`** metric rows in the `time` unit category across **7** journal
entries, and derives **zero** timesheet hours. The work was logged. It cannot
be reached.

## THE FIRST_BROKEN_LINK — work is recorded against the wrong engagement context

Upstream of every remaining slice, and the reason C and E would stay starved
even if built.

**The measurement.** Of the 18 live journal entries sitting in an engagement
context with `organization_id IS NULL`, **15 were written by people who also
hold an active organization-scoped context**. Nine profiles hold both kinds.
This is not solo workers logging personal work — it is employed workers logging
into their org-less personal context.

**Why those hours are unreachable.** `timesheet_compute_lines_v1` scopes by
`ec.organization_id = p_organization_id`. A NULL-org context matches no
organization, ever. So the hours exist, carry real durations and real
provenance, and can never become work-time for any employer.

**The mechanism** (`app/[locale]/dashboard/journal/page.tsx`). Contexts are
ordered `is_primary desc`, then re-sorted so contexts matching the **active
workspace** come first, and the composer defaults to the first row. When the
active workspace is *person* — no organization selected — the comparator ranks
the org-less primary context first. A worker with an employer, browsing as
themselves, logs into the personal context by default.

**Why it is not fixed here.** The remedy is a product decision, not a patch:

- should the composer prefer an employer context when one exists, or is
  logging-to-self the correct default with a visible indicator?
- should the picker be explicit rather than defaulted, given the consequence?
- what happens to the 15 existing entries? They are hash-chained (§3), so
  re-pointing one is a **correction with provenance**, never an edit.

That is exactly the "genuinely ambiguous product/business decision" class. It
is recorded, measured and left for the owner.

**Until it is resolved,** slices C and E can be built and will still show
nothing, because the actuals never arrive. Building them first would produce
correct code over an empty input — the failure mode this audit was
commissioned to stop.

## Unchanged

The gap register stands: GPS/geofence, QR, offline mode, client portal,
variations, notification delivery and safety forms remain **recorded, not
built**, and are not to be reconsidered until the canonical
task/evidence/actuals chain carries real production traffic.

---

# ADDENDUM v3 — 2026-08-20: the chain works; the hours were never reaching it

ADDENDUM v2 named the engagement context as the FIRST_BROKEN_LINK. That was
real and is fixed (#1217). Re-running the audit afterwards found a **larger**
one immediately upstream of it, and this one was invisible from schema, from
row counts and from the chain proof — because the chain proof supplies its own
metrics and therefore never exercised the step where they are lost.

## What real usage revealed

A real timesheet appeared in production (`2026-08-20 06:39`, org
`19f47e78`, period 2026-08). It computed **0.00 hours**.

Its worker holds **no** org-less context, so the ADDENDUM v2 defect does not
apply to them. All **twelve** of their entries sit in the correct organization
context. Every one states hours in plain words:

> `Kasiau smėli 9h` · `10h / 3h dažiau sienas / 4h tapetavau` ·
> `3h staliaus darbai / 6,5h betonavimas` · `4h tinkuoyi / 3,5h dažyti /
> 2,25h nešti smėli` · `Kasiau žemes su ekskavatoriumi 10h` ·
> `9h viniojau grindinio šildymo vamzdukus`

Not one produced a time metric.

## The measurement

Over all 26 live journal entries:

| | |
|---|---|
| State hours in the worker's own text | **16** |
| Reached a time metric | **4** |
| **Wrote hours that were LOST** | **14** |
| …of those, with zero confirmed fragments | **14 / 14** |
| Entries in the entire database that ever had a confirmed fragment | **2** |

**87.5% of the hours workers actually wrote never became data.**

## The cause — not parsing

The pipeline reads the durations correctly. The composer posts
`fragments_json` filtered to `status === "confirmed"`, and posts the
entry-level duration only when its own status is `confirmed`. Everything still
at `pending` is dropped — **silently**, while the entry saves and looks
successful. A one-tap "confirm all" control exists; nothing tells the worker
that skipping it discards what they wrote.

The discriminator is exact: entries that kept their hours carry
`parsed_fragment` metrics; the fourteen that lost them carry none.

## The fix, and why it is not "confirm it for them"

Doctrine §7: the platform never presents inferred data as though a human had
asserted it. A parsed duration is a machine reading of free text — the worker
confirming it is what makes it their claim. Auto-confirming would manufacture
assertions nobody made: a worse failure than losing them.

So the save now **refuses to discard quietly**. When durations the worker wrote
are still unreviewed, the composer names how many and stops; keeping them is
one tap, and discarding them deliberately remains a real answer that never
blocks. `lib/journal/unconfirmed-work-time.ts` holds the rule,
`lib/guards/logged-hours-not-silently-dropped.test.ts` pins it — including that
the save path may not promote a pending suggestion to confirmed, and that the
`confirmed`-only filter was not loosened.

## Why this outranked C and E

Both C (task → cost) and E (actuals → capacity) consume actuals. With 87.5% of
actuals lost at entry, either would have been correct code over an empty input
— the failure this audit was commissioned to stop. Neither is the next
bottleneck until real hours arrive.

## Status after this addendum

| Step | Status |
|---|---|
| A — task → hours/timesheet | VERIFIED_PRODUCTION |
| B — task → approval | VERIFIED_PRODUCTION (36/36 against the applied functions) |
| Engagement context routing | VERIFIED_PRODUCTION (#1217) |
| **Hours surviving entry** | **fixed here; needs real usage to confirm in the wild** |
| C — task → cost | REAL_MISSING, still downstream of actuals existing |
| D — work → skills | VERIFIED_PRODUCTION |
| E — actuals → capacity | UNUSED_BUT_REAL, still downstream of actuals existing |
