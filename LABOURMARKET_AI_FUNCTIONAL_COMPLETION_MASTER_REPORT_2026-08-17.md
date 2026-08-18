# LabourMarket.ai — Functional Completion Train V2, master report (2026-08-17/18)

**START SHA** `7bdf6874` (PR #1167 baseline)
**END SHA** `dbc6b76f` (`origin/main`, PR #1179, merged 2026-08-18T03:47:48Z)
**Report author** final-report agent (read-only; no product code changed, nothing merged, production touched with SELECTs only)
**Production project** `gorgitwvdzxbnaxhrsrw`
**Production measured** market truth 2026-08-18 03:34:42 UTC; migration ledger + schema re-verified 2026-08-18 03:57:03 UTC

> **Measurement-window correction.** An earlier draft of this report measured
> the migration ledger at 03:34:42 UTC and concluded that `procurement_v1` and
> `business_trips_v1` were unapplied. They committed at **03:34:45** and
> **03:36:17** — three seconds and ninety-five seconds after that read.
> `org_document_register_delta_v1` followed at 03:47:40. The ledger below is
> the **03:57:03 re-read**, cross-checked by direct schema probe. Applied count
> is **18**, not 15. The three genuinely-unapplied migrations in §2.3 survived
> the re-check and are confirmed absent from production.

## Row-count correction (read this before §4)

The mandate cited an 88-item matrix (WORKER 18 / ORGANIZATION 11 / WORK 17 /
EMPLOYEE LIFECYCLE 14 / DOCUMENTS-LEGAL 17 / OPERATIONS 12 / AI 11). The audit
document as merged contains **96 rows**, distributed differently. §4 uses the
document's actual taxonomy and drops/invents nothing.

| Domain | Mandate said | Audit document actually has |
|---|---|---|
| WORKER | 18 | **15** |
| ORGANIZATION | 11 | **11** |
| WORK | 17 | **16** |
| EMPLOYEE LIFECYCLE | 14 | **12** |
| DOCUMENTS / LEGAL | 17 | **18** |
| OPERATIONS | 12 | **13** |
| AI | 11 | **11** |
| **Total** | **88** | **96** |

---

## 1. Pull requests

Twelve PRs merged between `7bdf6874` and `dbc6b76f`, all squash-merged to
`main`. CI column is the merged PR's own check rollup.

| PR | Title | Merge SHA | CI | Size | What it delivered |
|---|---|---|---|---|---|
| **#1168** | fix(security): advisor triage train A | `54067a4b` | 5 pass / 1 skip | 16 files, +1775 −4 | Four authz migrations + guards. Closed the three `using(true)` cross-tenant catalog reads (`productivity_units`, `profession_templates`, `skill_icons`) by re-scoping SELECT to `authenticated` + org membership across **both** membership truths; made contact-disclosure authority org-bound via `has_org_demand_access`; made finance authority org-bound via a new `finance_company_authority_v1` helper (managers deliberately excluded from money data). Evaluated and **rejected** converting the `worker_absence_scheduling` SECURITY DEFINER view — conversion would re-admit managers to private absence notes — and pinned that decision with a 24-test guard so the ERROR advisor is a tested decision, not silent debt. |
| **#1170** | feat(workflow): canonical Workflow & Approval Engine v1 | `08121c8d` | 5 pass / 1 skip | 35 files, +6867 −17 | The single biggest gap named by the audit. 7 tables (`workflow_definitions` → versions → steps → instances → instance_steps), 4 helpers, 8 SECURITY DEFINER commands, 3 trigger guards, fail-closed RLS. Supports 1–20 ordered approval rounds, `single|all|any` modes, closed approver-rule vocabulary (`org_role|profiles|requester_manager`), `deadline_hours` and an escalation rule. Published versions are frozen by trigger. One live instance per external context entity, enforced by a partial unique index. |
| **#1169** | feat(documents): document file layer + versions + acknowledgements v1 | `1450ed08` | 5 pass / 1 skip | 41 files, +5614 −33 | The second-biggest gap. One private `document-files` bucket (5 MB, MIME allowlist), `document_files` version rows with partial unique indexes enforcing exactly-one-current-version, a new `org_documents` org-scope register (7 additive document types incl. correspondence in/out), append-only `org_document_events`, and `document_acknowledgements` that are version-bound and fill-once — acknowledging version N explicitly does **not** cover N+1. Writes are RPC-only throughout. |
| **#1172** | feat(work): objects/sites entity + task collaboration + project completion v1 | `b6c5f71b` | 5 pass | 57 files, +6587 −1091 | Created the canonical `work_objects` org-scoped site entity on membership-based authority (not the legacy `companies.profile_id` pattern), and rewired both consumers (company workspace "Objects & sites", market-map territory layer) onto it — formally superseding the never-applied `company_locations_v1`. Also built task assign-to-other, `task_dependencies`, task history and reopen, plus project responsible person and derived progress. **Two of its four migrations never reached production — see §2.3.** |
| **#1173** | feat(work): timesheets derived from journal + workflow approval + calendar workload v1 | `515ef3f9` | 5 pass / 1 cancelled | 33 files, +4838 −9 | Timesheets as a period *document* derived from the Work Journal, with no second hours store: `lines_snapshot` is computed by one internal SQL derivation from `journal_entry_work_items`, each line landing on the day work happened. Non-overlapping periods per worker+org enforced by advisory lock, `draft → submitted → approved|rejected → reopened` machine, submit freezes the snapshot immutably (even against superuser), append-only `timesheet_events`. Submission runs through the workflow engine's own `start_workflow_instance_v1` with compensation (instance withdrawn if the freeze fails). Added the derived calendar workload strip. |
| **#1171** | feat(consolidation): no-new-truth guards, dead-code removal, durable workspace pointer v2 | `010547e4` | 4 pass / 1 **fail** (CodeQL) / 1 skip | 27 files, +1124 −1307 | Consolidation slice 1. Deleted dead app code (`talent_source_records` provenance actions, `identity-resolution-service`, `company-locations*`), added no-new-truth guards, and shipped `durable_workspace_pointer_v2` (`profiles.active_organization_id` + validating trigger) — superseding the 2026-07-14 pointer migration whose trigger predates `company_memberships` and would have 42501-rejected a live production manager. Deliberately widened the accepted slug set to include `employee`, because production holds 40 employee engagement rows whose workspace switching would otherwise have broken at apply time. |
| **#1174** | feat(requests): typed employee requests + configurable leave balances v1 | `39104f23` | 5 pass / 1 skip | 36 files, +5063 −14 | `employee_requests` (closed 7-type vocabulary) as a register whose approval lifecycle **is** a workflow-engine instance — no per-type approval tables. Plus `leave_balance_policies` (org × absence type, annual entitlement + flat carryover) with balances **derived at read time and advisory only** — a warning chip, never a block, with no statutory defaults, zero seeded rows and no country/law logic. Engine status is reconciled engine→mirror by read-repair only. |
| **#1175** | feat(agreements): agreement register + amendments + honest signature evidence v1 | `66c869a4` | 5 pass / 1 skip | 31 files, +4784 −5 | `agreements` org-scoped register (closed type vocabulary incl. `employment_related` CHECK-bound to a `worker_id`), append-only `agreement_amendments` (current terms = base + ordered amendments, never a rewrite), append-only `agreement_events`, 8 SECURITY DEFINER commands. Legal doctrine is enforced by a guard that parses the SQL CHECK and asserts the status vocabulary **never** contains `signed`, `executed`, `legal`, `valid`, `binding` or `notarized`; signature material is stored as separate *evidence*, not as an execution claim. Explicitly states the `contracts` relationship (§7.3). |
| **#1176** | feat(landing): market proof + top professions from production truth | `239a012d` | 5 pass / 1 skip | 16 files, +569 −4 | See §9. |
| **#1177** | feat(lifecycle): employment lifecycle on engagement_contexts + onboarding/offboarding runs v1 | `900284f2` | 5 pass / 1 skip | 33 files, +6460 −8 | Declared `engagement_contexts` the canonical employment record (the only one with live production data) and evolved it: four additive nullable columns (`lifecycle_stage`, `probation_until`, `ended_reason`, `ended_note`) with **no backfill DML** — NULL reads as `active` via one COALESCE rule mirrored in TS. Added append-only `engagement_lifecycle_events`, onboarding templates → snapshot runs whose item completion is verified against **real** rows (`work_tasks` done, `document_acknowledgements` acknowledged, `asset_assignments` open), and offboarding runs whose asset-return checklist is *generated from asset reality* and completable only when the assignment genuinely reads `returned`. |
| **#1178** | feat(finops): procurement + business trips + invoice/expense upgrades v1 | `64f27c7b` | 5 pass / 1 skip | 41 files, +9854 −39 | Three thin modules on engines already live: invoice upgrades on `finance_records` (invoice number, VAT, `org_document_id` receipt pointer, approval mirror), `procurement_inquiries`/`offers`/`events`, and `business_trips`/`events`. All four approval contexts were already in the workflow engine's closed vocabulary — nothing widened. Every `sync_*` command copies only a **terminal** engine outcome; withdrawn/cancelled clears the mirror rather than silently approving. Receipts ride `org_documents` — no second file layer. **All three migrations are applied.** |
| **#1179** | feat(documents): correspondence register + object link + retention surfacing v1 | `dbc6b76f` | 5 pass / 1 skip | 28 files | One migration, `org_document_register_delta_v1`, adding seven columns to `org_documents`: correspondence facts (`counterparty_name`, `correspondence_date`, `counterparty_reference`), a same-org-validated `object_id` link to `work_objects`, retention record-keeping (`retention_until`, `retention_note`, indexed), and an `approval_state` engine mirror. `create_org_document_v2` plus `set_org_document_retention_v1` — **the first writer the retention columns have ever had**. Correspondence direction is derived from the type slug rather than stored as a column, and a correspondence fact on a non-correspondence type is **refused, not silently stored**. |

**PR #1180** — *feat(development): training/certification + evidence-based
reviews + management decisions v1* (12 tables, 21 RPCs, 3 migrations, 46 files)
— is **OPEN and NOT merged** as of 2026-08-18 03:57 UTC. Its migrations are
therefore neither in `main` nor applied, and none of its scope is credited
anywhere in this report. If it lands, the OPERATIONS rows `training`,
`certifications`, `tests/assessments`, `performance` and `management decisions`
all become re-gradable.

**PR #1171's CodeQL failure** is the one non-green check in the train. It did
not block the merge and every subsequent `main` push run is green (§10).

---

## 2. Migrations

22 migration files dated `20260817*` exist in the tree at `dbc6b76f`.
**18 are applied to production**; 2 were superseded before apply; **3 are
merged but NOT applied** (one file, `20260817130100`, is both superseded and
counted once).

### 2.1 Applied and verified

Ledger versions read live from `supabase_migrations.schema_migrations`
(2026-08-18 03:57:03 UTC). The production ledger version is the *apply
timestamp*, not the filename prefix.

| # | Repo migration file | Production ledger version | PR | Verified |
|---|---|---|---|---|
| 1 | `20260817120000_catalog_least_privilege_v1` | `20260817065038` | #1168 | 3 SELECT policies now `to authenticated`, org-scoped |
| 2 | `20260817122000_contact_disclosure_org_authority_v1` | `20260817065249` | #1168 | `has_org_demand_access` branch present |
| 3 | `20260817123000_finance_org_authority_v1` | `20260817065407` | #1168 | Helper in `pg_proc`, 3 RPCs redefined |
| 4 | `20260817130000_workflow_engine_v1` | `20260817164010` | #1170 | `workflow_definitions` exists |
| 5 | `20260817140000_document_file_layer_v1` | `20260817172108` | #1169 | `document_files`, `org_documents` exist |
| 6 | *(union — see 2.2)* `notification_types_union_workflow_document_v3` | `20260817172306` | #1169/#1170 | Applied |
| 7 | `20260817150000_work_objects_v1` | `20260817204529` | #1172 | `work_objects` exists |
| 8 | `20260817152000_project_responsible_v1` | `20260817204807` | #1172 | Applied |
| 9 | `20260817170000_timesheets_v1` | `20260817211538` | #1173 | `timesheets` exists |
| 10 | `20260817160000_durable_workspace_pointer_v2` | `20260817214201` | #1171 | `profiles.active_organization_id` present |
| 11 | `20260817180000_employee_requests_v1` | `20260817221335` | #1174 | `employee_requests` exists |
| 12 | `20260817181000_leave_balance_policies_v1` | `20260817221407` | #1174 | `leave_balance_policies` exists |
| 13 | `20260817200000_agreements_v1` | `20260817223514` | #1175 | `agreements` exists |
| 14 | `20260817190000_employee_lifecycle_v1` | `20260817230652` | #1177 | `engagement_contexts.lifecycle_stage` + `engagement_lifecycle_events` present |
| 15 | `20260817220000_finance_invoice_upgrades_v1` | `20260818033211` | #1178 | All 5 new `finance_records` columns present |
| 16 | `20260817221000_procurement_v1` | **`20260818033445`** | #1178 | `procurement_inquiries`, `procurement_offers`, `procurement_events` all exist |
| 17 | `20260817222000_business_trips_v1` | **`20260818033617`** | #1178 | `business_trips`, `business_trip_events` exist; `finance_records.trip_id` present |
| 18 | `20260817240000_org_document_register_delta_v1` | **`20260818034740`** | #1179 | All 7 delta columns present on `org_documents` |

`org_documents` column probe (03:57:03 UTC) returned, in order:
`id, organization_id, document_type_slug, title, description, status,
classification, responsible_profile_id, project_id, worker_id, external_ref,
valid_from, expires_on, retention_until, retention_note, created_by,
created_at, updated_at, counterparty_name, correspondence_date,
counterparty_reference, object_id, approval_state`.

Apply path throughout: Supabase MCP `apply_migration` (never `db push`), one
migration per call, each verified by targeted read-back.

### 2.2 Superseded before apply (correct — no action needed)

| Repo file | Superseded by |
|---|---|
| `20260817130100_notification_events_v3_workflow_types` | `notification_types_union_workflow_document_v3` (`20260817172306`) — the union migration widened both `notification_events` CHECK constraints for workflow **and** document types in one statement |
| `20260817140100_notification_document_types_v3` | same union migration |

Also still-superseded from the BEFORE audit: `20260713120000_company_locations_v1`
(replaced by `work_objects`) and `20260714210000_company_memberships_v1`
(replaced by durable workspace pointer v2). Neither must ever be applied.

### 2.3 NOT applied — merged code, dormant schema

All three re-confirmed absent from production at 03:57:03 UTC.

| Repo file | PR | Exact reason | Production consequence (verified) |
|---|---|---|---|
| `20260817121000_invitation_org_authority_v1` | #1168 | Apply call **declined by the session's permission classifier**, most plausibly because `resend_invitation_v1` rewrites `token_hash` (token-rotation content). Refusal respected, not routed around. Recorded in `docs/audits/security-train-a-apply-record-2026-08-17.md`. | The invitation cross-tenant finding stays OPEN: an org owner cannot see/revoke/resend a revoked manager's pending org invitations. |
| `20260817151000_work_tasks_v2_collaboration` | #1172 | Same classifier block; tracked for an owner-permitted session. | `task_dependencies` and `work_task_events` **do not exist**; `work_tasks.object_id` **absent**. Task assign-to-other, dependencies, history and reopen are dormant; assignment remains self-only. |
| `20260817153000_notification_events_v4_task_types` | #1172 | Same; depends on the above. | Task notification types are not admitted by the `notification_events` CHECK. |

**Ledger accuracy warning (still real).** `docs/APPLIED_LEDGER.md` lists
applied migrations in its Deferred section marked *PENDING APPLY BY LEAD*. The
ledger understates reality; the direction of error is conservative. Follow-up
edits to reconcile it and evolve `security-train-a-v1.test.ts` were also
declined by the session classifier and were honestly recorded rather than
retried. **Owner TODO: reconcile the ledger against §2.1.**

---

## 3. Security

### Before vs after

| Aspect | Before (2026-08-17 audit) | After (2026-08-18 03:57 UTC) |
|---|---|---|
| RLS-disabled public tables | 0 | **0** |
| Cross-tenant `using(true)` catalog reads | 3 | **0** — closed by `catalog_least_privilege_v1` |
| Contact-disclosure authority | person-bound (cross-tenant gap) | **org-bound** via `has_org_demand_access` |
| Finance authority | creator-bound legacy | **org-bound** via `finance_company_authority_v1`; managers excluded from money data |
| Invitation authority | person-bound (cross-tenant gap) | **UNCHANGED — still person-bound**; migration merged but not applied |
| ERROR advisors | 1 (`worker_absence_scheduling`) | **1 — same view, now a documented + guard-pinned accepted decision** |

### Current advisor state (live)

| Advisor | Level | Count | Assessment |
|---|---|---|---|
| `security_definer_view` (`worker_absence_scheduling`) | ERROR | 1 | **Accepted and tested.** `security_invoker` conversion would re-admit managers to full `worker_absences` rows including private note and absence type, re-opening the W12 privacy split. Pinned by `security-train-a-v1.test.ts`, which scans for any future flip without the column split. |
| `authenticated_security_definer_function_executable` | WARN | 306 | By design — the repo's authority model is RPC-only writes via SECURITY DEFINER functions with `search_path` pinned. Fires on the pattern, not a defect. |
| `anon_security_definer_function_executable` | WARN | 4 | All intentional public surfaces: `get_public_business_listings_v1`, `get_public_business_profile_v1`, `get_public_business_services_v1`, `submit_company_need_public_v1`. |
| `rls_enabled_no_policy` | WARN | 3 | `company_need_public_intakes`, `vacancy_import_cursors`, `worker_display_name_backfill_20260805`. Fail-closed by construction (RLS on, no policy = nothing readable by client roles), but each should get an explicit policy or move out of `public`. |
| `function_search_path_mutable` | WARN | 2 | Two hashed `usage_cost_events` guard triggers. |
| `auth_otp_long_expiry`, `auth_leaked_password_protection` | INFO | 2 | Auth configuration, unchanged. Owner decision. |

### RLS posture

Every new table in this train ships fail-closed: RLS enabled, **zero write
policies**, direct writes REVOKEd, writes reachable only through
`search_path`-pinned SECURITY DEFINER commands with anon and public revoked,
and anti-oracle `not_found` responses rather than permission errors.
`work_objects` deliberately reads for **both** membership truths via
`is_org_member_or_engaged_v1` and writes only through the existing
`has_org_demand_access`, avoiding a new authority model.

### Cross-tenant test coverage

Per-domain guard suites exist for every engine: `workflow-engine.test.ts`,
`document-file-layer.test.ts`, `timesheets.test.ts`, `employee-requests.test.ts`,
`agreements.test.ts`, `work-objects-projects-v1.test.ts`,
`org-document-register-delta.test.ts`, `financial-ops.test.ts`,
`security-train-a-v1.test.ts` (24 tests), plus per-PR DB-proof scripts (#1170
85/85, #1171 32/32). **UNVERIFIED:** whether any exercises a genuine two-tenant
negative case against a live database, versus asserting SQL text and policy
shape. Several of these suites demonstrably read migration SQL as text and
assert on substrings (§12.2), which is shape-checking, not behaviour-checking.
Verifying real tenant isolation would need one seeded multi-org integration
pass — worth doing before external users arrive.

---

## 4. The capability matrix (96 rows)

Legend for AFTER: **FULL** = user-accessible entry point, authz, tenant
context, business action, persistence, state transition, read-back, history,
failure state and tests are all present **and the migration is applied to
production**. Merged code on unapplied schema is **PARTIAL**, never FULL.

> **Applies to every FULL row in this train:** graded on code + applied schema
> + guard tests. **No capability delivered by this train has a
> browser-verified end-to-end journey**, and every new engine table holds
> **zero production rows** (§8). These are shipped-and-live, not
> exercised-in-anger.

### 4.1 WORKER (15 rows) — untouched by this train

| Item | BEFORE | AFTER | Evidence |
|---|---|---|---|
| identity/profile | FULL | FULL | Unchanged. |
| CV create/import/export | FULL | FULL | Unchanged. `/api/cv/extract` → review → persist RPCs; no server PDF. |
| skills model | PARTIAL | PARTIAL | Unchanged. `worker_skills.self_rated_level` still has no writer. |
| ESCO | PARTIAL | PARTIAL | Unchanged. Picks still persist label-only; `skills.esco_uri` bridge still unpopulated. |
| evidence system | FULL | FULL | Unchanged. |
| availability | PARTIAL | PARTIAL | Unchanged. No per-day calendar entity. |
| worker discovery | FULL | FULL | Unchanged. |
| consent/visibility | FULL | FULL | Unchanged. |
| opportunity matching | FULL | FULL | Unchanged; single engine `match-v1.ts`. |
| external opportunities | FULL | FULL | Unchanged mechanism; volume now 43,781 active ads (§8). |
| application/action path | FULL | FULL | Unchanged. |
| Work Journal | FULL | FULL | Unchanged, and now the **sole** hours source for timesheets (#1173). |
| journal→skill enrichment | FULL | FULL | Unchanged. |
| journal→rematch | PARTIAL | PARTIAL | Unchanged. Recompute-on-visit; no rematch event, no match notification type. |
| reputation/trust | FULL | FULL | Unchanged. |

### 4.2 ORGANIZATION (11 rows)

| Item | BEFORE | AFTER | Evidence |
|---|---|---|---|
| org creation | FULL | FULL | Unchanged. |
| membership | DUPLICATE | **DUPLICATE** | Still two truths. #1177 *declared* `engagement_contexts` canonical and #1171 landed consolidation slice 1 (guards + dead code), but no write-redirection shipped. Both remain live with two member-list UIs. |
| roles | FULL | FULL | Unchanged. |
| permissions/RBAC | FULL | FULL | Unchanged; extended by every new engine using the same RPC+RLS pattern. |
| teams/departments | PARTIAL | PARTIAL | Unchanged. Teams have no roster; departments still absent. |
| worker invitation | DUPLICATE | **DUPLICATE** | Three parallel systems unchanged, and the org-authority fix for the canonical one is **not applied** (§2.3). |
| org switching | FULL | FULL | Improved: `durable_workspace_pointer_v2` applied, so `profiles.active_organization_id` is a real durable column rather than a feature-detected 42703 fallback. |
| org context propagation | FULL | FULL | Unchanged; single resolver. |
| revocation | FULL | FULL | Unchanged. |
| employer workspace | FULL | FULL | Unchanged, plus the new "Objects & sites" section. |
| cross-tenant isolation | PARTIAL | PARTIAL | 3 of 4 gaps closed and applied. The 4th — invitation authority — remains open because `20260817121000` is unapplied. |

### 4.3 WORK (16 rows)

| Item | BEFORE | AFTER | Evidence |
|---|---|---|---|
| inquiry/demand intake | FULL | FULL | Unchanged. |
| job/opportunity lifecycle | PARTIAL+DUPLICATE | PARTIAL | Unchanged. No publish/expiry states; `job_demands` still a dead legacy store. |
| engagement | FULL | FULL | Unchanged. |
| project | FULL | FULL | Improved: `project_responsible_v1` applied — responsible person + derived progress. |
| object/site | PARTIAL | **FULL ★** | `work_objects_v1` applied. Org-scoped entity, membership-based authority via `is_org_member_or_engaged_v1`, 4 RPC-only write commands, archive/restore with no hard delete, 500-object cap. UI `components/app/work-objects-section.tsx`; market-map territory layer rewired; `company_locations_v1` formally superseded. Now also linkable from org documents (#1179). |
| task | FULL entity | **PARTIAL** ‡ | Entity unchanged and healthy. The collaboration completion is merged but **`20260817151000` is unapplied** — `task_dependencies` and `work_task_events` do not exist; assignment remains self-only. |
| stage | FULL | FULL | Unchanged. |
| assignment | FULL (project) / PARTIAL (task) | PARTIAL | Project side unchanged and FULL. Task side still self-only. |
| scheduling | PARTIAL | PARTIAL | Unchanged. No shift/roster entity. |
| capacity | PARTIAL | PARTIAL | Unchanged. Rich deterministic model, still zero persistence. |
| workload | MISSING | **PARTIAL** | #1173 added a derived workload strip on the calendar from journal/timesheet hours. Read-only projection — no entity, no persistence, no business action. |
| workforce planning | PARTIAL | PARTIAL | Unchanged. The "human plan" payload key still has no writer. |
| calendar | PARTIAL | PARTIAL | Unchanged in kind. Still read-only by construction, no calendar entity. |
| journal↔project/task | PARTIAL | PARTIAL | Unchanged. Project auto-link only; task link blocked behind the same unapplied migration. |
| work evidence | FULL | FULL | Unchanged. |
| timesheet | MISSING | **FULL ★** | `timesheets_v1` applied. Period document derived from the Journal with no second hours store; non-overlap by advisory lock; `draft→submitted→approved|rejected→reopened`; submit freezes the snapshot immutably even against superuser; append-only `timesheet_events`; approval via the workflow engine with compensation on freeze failure. UI `/dashboard/planning/timesheets`. See §7.1. |

‡ **Stricter re-grade, not a regression.** The audit recorded "FULL entity"
while noting assignment was self-only. Against the completion goal this train
set, the row is PARTIAL because the collaboration schema is not live.

### 4.4 EMPLOYEE LIFECYCLE (12 rows)

| Item | BEFORE | AFTER | Evidence |
|---|---|---|---|
| recruitment | FULL (DUPLICATE substrate) | FULL | Unchanged; 6 candidate-stage stores still derived at read time. |
| offer | FULL (+1 DEAD dup) | FULL | Unchanged. `agency_candidate_offers` still has zero app callers. |
| onboarding | PARTIAL | **FULL ★** | `employee_lifecycle_v1` applied. Templates + items (5 kinds, 30×30 caps) → snapshot runs bound to one engagement, one open run per EC. Item completion is **verified against real rows** — `work_tasks` done, `document_acknowledgements` acknowledged, `asset_assignments` open — not self-declared. UI `dashboard/start/my-onboarding-section.tsx`. |
| employment records | PARTIAL (TRIPLE DUPLICATE) | PARTIAL | EC declared canonical and evolved, but still **no direct-hire path**, **no position/pay/FTE fields**, and all three parallel models remain. |
| probation | DEAD | **FULL ★** | `lifecycle_stage='probation'` + `probation_until`, transitioned by RPC, recorded in trigger-immutable `engagement_lifecycle_events`, read back via `deriveLifecycleStage`. Previously only a descriptive vacancy field. |
| leave/absence | FULL (no balances) | **FULL** (balances added) | `leave_balance_policies_v1` applied. Org × absence type, annual entitlement + flat carryover. Balances **derived at read time and advisory only** — a warning chip, never a block. No statutory defaults, zero seeded rows, no country/law logic. |
| employee requests | MISSING | **FULL ★** | `employee_requests_v1` applied. Closed 7-type vocabulary; the approval lifecycle *is* a workflow-engine instance with no per-type approval tables. Engine refusal rolls the register row back out in the same transaction. Deciding happens in the existing approvals inbox — no second inbox. See §7.1. |
| changes | MISSING | **PARTIAL** | `lifecycle_stage='change_pending'` exists and transitions, but there is **no change entity carrying the actual values** — no position/salary/term before/after record, no effective date, no approval binding to a value set. |
| offboarding | MISSING | **FULL ★** | `employee_lifecycle_v1` applied. Asset-return checklist **generated from asset reality** — one required item per genuinely open org-scoped assignment, completable only when the assignment really reads `returned` via `return_asset_v1`. Plus access-removal and final-evidence confirms and ≤20 custom items. |
| termination | PARTIAL | **PARTIAL** | Improved: `ended_reason` (closed vocab) and `ended_note` (≤500) stamp on the canonical end path with immutable events. Still missing: a **notice-period** field and an **effective date** distinct from stamp time. |
| approval chains | MISSING (engine) | **FULL ★** | `workflow_engine_v1` applied — closes the biggest architectural gap the audit named. 1–20 ordered rounds, `single|all|any`, closed approver rules, deadlines + escalation, published versions frozen by trigger, one live instance per context entity. Seven domains now consume it. See §7.1. |
| lifecycle notifications | FULL (3 domains) | FULL | Extended to 5 domains via the applied union migration. Task notification types remain inadmissible (`notification_events_v4` unapplied). |

### 4.5 DOCUMENTS / LEGAL (18 rows)

| Item | BEFORE | AFTER | Evidence |
|---|---|---|---|
| documents (files) | PARTIAL | **FULL ★** | `document_file_layer_v1` applied. One private `document-files` bucket (5 MB, MIME allowlist); worker and org paths cleanly separated by RLS. The dead `file_path` column stays dead by design rather than being reused. |
| document metadata | FULL | FULL | Unchanged. |
| versions | MISSING | **FULL ★** | `document_files` version rows: exactly-one-parent CHECK, unique version per parent, partial unique index enforcing exactly one current version. Replace = new version; nothing overwritten or client-deletable once registered. |
| classification | FULL | FULL | Extended: 7 additive `document_types` rows under a widened category constraint. |
| access control | FULL | FULL | Unchanged pattern, extended to org scope via `can_read_org_document_v1`. |
| acknowledgement | MISSING | **FULL ★** | `document_acknowledgements`: version-bound, fill-once, self-only (delegation impossible by both CHECK and RPC). **Acknowledging version N never covers N+1.** UI `components/app/document-ack-inbox.tsx`. |
| retention | MISSING | **PARTIAL** | #1179 gave the retention columns **their first writer ever** (`set_org_document_retention_v1`), plus `retention_note`, a partial index on `(organization_id, retention_until)`, and a `retention_set` event. But it is per-document record-keeping only: **no per-type retention policy, no schedule, no disposition or purge action** — the migration states "NO retention auto-deletion, NO scheduled purge, NO destructive job of any kind" and the guard pins that. See §7.3 — the non-destructive half is deliberate doctrine. |
| document register | PARTIAL | **FULL ★** | `org_documents` org-scope register + append-only `org_document_events` (created / file_uploaded / archived / revoked / ack_assigned / acknowledged / downloaded / retention_set / approval_submitted / approval_synced), manager-visible. UI `components/app/org-documents-register.tsx`. |
| correspondence | MISSING | **FULL ★** | #1179 turned the filing category into a real register: `counterparty_name`, `correspondence_date` and `counterparty_reference` persist via `create_org_document_v2`; direction is **derived from the type slug** (`org_correspondence_incoming` / `_outgoing`) rather than stored — a deliberate no-`correspondence_direction`-column decision the guard enforces. A correspondence fact on a non-correspondence type is **refused (`invalid`), not silently stored** — a real failure state. Entry point, authz, persistence, events, read-back and tests all present. |
| employment contracts | MISSING | **FULL ★** | `agreements_v1` applied. `type='employment_related'` CHECK-bound to a `worker_id`; agreement text lives in the document engine via `current_document_id → org_documents`; 8 SECURITY DEFINER commands are the only write paths. |
| amendments | MISSING | **FULL ★** | `agreement_amendments`, append-only and trigger-enforced **including against superuser**. Amending never rewrites the base row's document pointer — current terms render as base + ordered amendments. |
| termination docs | MISSING | **PARTIAL** | An agreement can reach `terminated_record` with attached evidence, and offboarding runs can require final-evidence confirms. There is **no termination-document type or generation path** — only a status value plus a manually filed document. |
| general contracts (B2B) | FULL | FULL | Unchanged and still FULL. Coexists with the new `agreements` register by an **explicit, documented decision** — see §7.3. |
| parties model | PARTIAL/DEAD | **PARTIAL** | `agreements` carries bounded counterparty fields plus an optional org number, and `org_documents` now carries counterparty name/reference — real parties data where none was written before. But it is **single-counterparty only** (no multi-party entity), and the legacy `contracts` free-text parties column is still read and never written. |
| contract register | FULL | FULL | Unchanged. |
| approval flow (docs) | BROKEN chain | **FULL ★** | The broken chain is closed. `request_worker_document_verification` — applied in prod since 2026-06-13 with **zero callers**, so the admin queue could never fill from workers — now has a real caller in `lib/documents/document-actions.ts`, a UI trigger, and a guard. |
| signature | MISSING | **PARTIAL** | Honest signature **evidence** attaches via `attach_agreement_signature_evidence_v1` as a separate evidence record. Deliberately **not** e-signature: a guard parses the SQL CHECK and asserts the status vocabulary never contains `signed`, `executed`, `legal`, `valid`, `binding` or `notarized`. |
| expiry/reminders | PARTIAL | **PARTIAL** | Improved: `document_expiring` is now an admitted notification type and emitters exist. But they are called from the **document read path** (`lib/documents/document-files.ts`), so reminders are recompute-on-visit — a worker who never opens the documents page is never reminded. Same defect class as journal→rematch. |

### 4.6 OPERATIONS (13 rows)

| Item | BEFORE | AFTER | Evidence |
|---|---|---|---|
| tasks | FULL | **PARTIAL** ‡ | Mirrors the WORK `task` row — collaboration schema unapplied. |
| approvals | PARTIAL | **FULL ★** | The unified queue the audit said did not exist now does: one workflow engine + one approvals inbox at `/dashboard/network#approvals`, reused by every consuming domain. `WorkflowTimeline` is the single shared component; `decide_workflow_step_v1` is called from the inbox only, guard-enforced. |
| business trips | MISSING | **FULL ★** | `business_trips_v1` **applied** (`20260818033617`). `business_trips` + append-only `business_trip_events` + `finance_records.trip_id`, 7 commands, 1 visibility helper, 1 trigger guard. UI `dashboard/finance/trips-section.tsx` + `lib/trips/`. Approval rides the workflow engine; withdrawn/cancelled returns the trip to draft rather than silently approving. |
| expenses | FULL (manual) | FULL | Improved: approval routes through the workflow engine; receipts ride `org_documents`; `create_finance_record_v2`/`update_finance_record_v2` supersede v1 app-side while v1 stays defined in the DB per the rollback-chain rule. No OCR, by design. |
| invoices | FULL register / PARTIAL handling | **FULL ★** | `finance_invoice_upgrades_v1` applied: `invoice_number`, `vat_amount_cents`, `org_document_id` receipt pointer, `approval_status` mirror written only by the module's own `submit_*`/`sync_*` commands. Duplicate detection warns, never blocks. OCR remains deliberately absent. |
| procurement | MISSING | **FULL ★** | `procurement_v1` **applied** (`20260818033445`). `procurement_inquiries` / `procurement_offers` / append-only `procurement_events`, 9 commands, 1 visibility helper, 1 trigger guard. UI `dashboard/finance/procurement-section.tsx` + `lib/procurement/`. Approval rides the workflow engine with terminal-only mirror sync. |
| assets/inventory | FULL | FULL | Improved: offboarding runs now generate asset-return items from real open assignments (#1177). |
| training | PARTIAL | PARTIAL | Unchanged. **PR #1180 targets this row but is not merged.** |
| tests/assessments | MISSING | MISSING | Unchanged. Audit called this deliberate doctrine; **PR #1180 targets it** — treat the doctrine as under owner review. |
| certifications | PARTIAL | PARTIAL | Unchanged. **PR #1180 targets this row but is not merged.** |
| performance | MISSING | MISSING | Unchanged. Audit called this deliberate doctrine ("record count, never a competence score"); **PR #1180 proposes evidence-based reviews** — owner should confirm the doctrine change is intended. |
| management decisions | MISSING | MISSING | Unchanged — **but the audit's stated reason is wrong**; see §12.1. The module was simply never built. **PR #1180 targets it.** |
| billing/payments | PARTIAL, gated | PARTIAL, gated | Unchanged. Verified live: `billing_subscriptions`, `subscriptions`, `billing_customers` all **0 rows**; `PAYMENTS_ENABLED=false`. |

### 4.7 AI (11 rows) — untouched by this train

| Item | BEFORE | AFTER | Evidence |
|---|---|---|---|
| chat-first workspace | PARTIAL | PARTIAL | Unchanged. Deterministic intent router; zero model calls. |
| context awareness | PARTIAL | PARTIAL | Unchanged; context never serialized into prompts by policy. |
| document understanding | DEAD | DEAD | Unchanged. `document_assistant` still has zero callers — **but #1169 built the file layer it would need**, so this is now a wire-up away rather than a build. |
| inquiry understanding | PARTIAL | PARTIAL | Unchanged. |
| matching explanation | PARTIAL | PARTIAL | Unchanged. |
| workforce calculations | FULL (deterministic) | FULL | Unchanged. |
| forecasts | DEAD | DEAD | Unchanged. |
| simulation | DEAD | DEAD | Unchanged. |
| action generation | PARTIAL | PARTIAL | Unchanged; all 5 draft surfaces still `disabled`. |
| audit/budget boundaries | PARTIAL | PARTIAL | Unchanged — **the two named gaps are still open**: journal/CV AI actions lack an auth check + rate limit, and the public company-need AI call runs outside the rate limiter. |
| provider chain | FULL (code), OFF (config) | FULL (code), OFF (config) | Unchanged. Verified live: `ai_runs` = **0 rows**; `AI_PROVIDER_MODE=disabled`. |

---

## 5. Totals

| Status | Before | After | Δ |
|---|---:|---:|---:|
| **FULL** | 38 | **55** | **+17** |
| **PARTIAL** | 32 | **33** | +1 |
| **MISSING** | 19 | **3** | **−16** |
| **BROKEN** | 1 | **0** | **−1** |
| **DUPLICATE** | 2 | **2** | 0 |
| **DEAD** | 4 | **3** | −1 |
| Total rows | 96 | 96 | — |

Per domain (FULL / PARTIAL / MISSING / BROKEN / DUPLICATE / DEAD):

| Domain | Rows | Before | After |
|---|---:|---|---|
| WORKER | 15 | 11 / 4 / 0 / 0 / 0 / 0 | 11 / 4 / 0 / 0 / 0 / 0 |
| ORGANIZATION | 11 | 7 / 2 / 0 / 0 / 2 / 0 | 7 / 2 / 0 / 0 / 2 / 0 |
| WORK | 16 | 6 / 8 / 2 / 0 / 0 / 0 | 7 / 9 / 0 / 0 / 0 / 0 |
| EMPLOYEE LIFECYCLE | 12 | 4 / 3 / 4 / 0 / 0 / 1 | 9 / 3 / 0 / 0 / 0 / 0 |
| DOCUMENTS / LEGAL | 18 | 5 / 4 / 8 / 1 / 0 / 0 | 13 / 5 / 0 / 0 / 0 / 0 |
| OPERATIONS | 13 | 3 / 5 / 5 / 0 / 0 / 0 | 6 / 4 / 3 / 0 / 0 / 0 |
| AI | 11 | 2 / 6 / 0 / 0 / 0 / 3 | 2 / 6 / 0 / 0 / 0 / 3 |

Arithmetic check: +6 (PARTIAL→FULL) +11 (MISSING→FULL) +1 (DEAD→FULL) +1
(BROKEN→FULL) −2 (FULL→PARTIAL, stricter re-grade) = **+17**. 38 + 17 = 55. ✓

**All three remaining MISSING rows are in OPERATIONS** (`tests/assessments`,
`performance`, `management decisions`) and **all three are the declared scope
of the still-open PR #1180.**

---

## 6. Every status improvement

### PARTIAL → FULL (6)

| Row | Domain | Delivered by |
|---|---|---|
| object/site | WORK | #1172 · `work_objects_v1` |
| onboarding | EMPLOYEE LIFECYCLE | #1177 · `employee_lifecycle_v1` |
| documents (files) | DOCUMENTS | #1169 · `document_file_layer_v1` |
| document register | DOCUMENTS | #1169 · `document_file_layer_v1` |
| invoices | OPERATIONS | #1178 · `finance_invoice_upgrades_v1` |
| approvals | OPERATIONS | #1170 · `workflow_engine_v1` |

### MISSING → FULL (11)

| Row | Domain | Delivered by |
|---|---|---|
| timesheet | WORK | #1173 · `timesheets_v1` |
| employee requests | EMPLOYEE LIFECYCLE | #1174 · `employee_requests_v1` |
| offboarding | EMPLOYEE LIFECYCLE | #1177 · `employee_lifecycle_v1` |
| approval chains | EMPLOYEE LIFECYCLE | #1170 · `workflow_engine_v1` |
| versions | DOCUMENTS | #1169 · `document_file_layer_v1` |
| acknowledgement | DOCUMENTS | #1169 · `document_file_layer_v1` |
| correspondence | DOCUMENTS | #1179 · `org_document_register_delta_v1` |
| employment contracts | DOCUMENTS | #1175 · `agreements_v1` |
| amendments | DOCUMENTS | #1175 · `agreements_v1` |
| procurement | OPERATIONS | #1178 · `procurement_v1` |
| business trips | OPERATIONS | #1178 · `business_trips_v1` |

### Other upgrades

| Row | Change | Delivered by |
|---|---|---|
| probation | **DEAD → FULL** | #1177 |
| approval flow (docs) | **BROKEN → FULL** | #1169 (wired the orphan RPC; no migration needed) |
| retention | MISSING → PARTIAL | #1179 (first writer the columns ever had) |
| workload | MISSING → PARTIAL | #1173 |
| changes | MISSING → PARTIAL | #1177 |
| termination docs | MISSING → PARTIAL | #1175 |
| signature | MISSING → PARTIAL | #1175 |
| leave/absence | FULL → FULL + balances | #1174 |
| org switching | FULL → FULL, durable | #1171 |
| project | FULL → FULL + responsible/progress | #1172 |

---

## 7. Exact blocker for every remaining non-FULL row

### 7.1 Blocked on a production migration apply

Three migrations are merged, reviewed, CI-green and dormant. **The blocker is
one owner-permitted session that can run `apply_migration`**; this session's
permission classifier declined these calls and the refusals were respected
rather than routed around.

| Row(s) | Migration to apply |
|---|---|
| task (WORK), tasks (OPERATIONS), assignment, journal↔project/task | `20260817151000_work_tasks_v2_collaboration` + `20260817153000_notification_events_v4_task_types` |
| cross-tenant isolation, worker invitation | `20260817121000_invitation_org_authority_v1` |

**Configuration prerequisite (not a code gap, but it gates real use).** Every
approval-carrying capability requires the org to have **published a workflow
definition** for that context. Production holds **0 rows in
`workflow_definitions`**. Until an org authors one, the approve transition is
unreachable for: timesheets, employee requests, agreement approval, expense,
invoice, procurement and business-trip approval. All fail honestly
(`no_definition`) rather than silently. **Owner action: author and publish a
starter definition set per context, or ship seeded default templates.** This is
the single highest-leverage unblock in the report — seven FULL capabilities are
inert without it.

### 7.2 Blocked on a build decision or missing artefact

| Row | Domain | Exact blocker |
|---|---|---|
| skills model | WORKER | `worker_skills.self_rated_level` has no writer. Decide: add a self-rating UI writer, or drop the column. |
| ESCO | WORKER | Picks persist the label string only. Needs `concept_id` persisted on pick, plus a backfill populating the `skills.esco_uri` bridge. |
| availability | WORKER | No per-day availability entity. Needs a `worker_availability_days` table; status/window/prefs/absences cannot express per-day truth. |
| journal→rematch | WORKER | No rematch event and no match notification type. Needs a `match_found` type in the `notification_events` CHECK plus an emitter on journal save. |
| teams/departments | ORGANIZATION | Teams have no member roster; departments have no entity. Needs a team-membership table and a department entity. |
| membership | ORGANIZATION | Two live truths. #1177 named `engagement_contexts` canonical; remaining work is redirecting `company_memberships` **writes** and collapsing the two member-list UIs. Consolidation slice 2 was scoped but not shipped. |
| worker invitation | ORGANIZATION | Three parallel systems. Needs a decision on which two to retire and a migration path for in-flight tokens — plus the unapplied authority migration (§7.1). |
| job/opportunity lifecycle | WORK | Demand rows have no publish/expiry state machine; `job_demands` is a dead legacy store. Needs a lifecycle column set + trigger, and a `job_demands` drop. |
| scheduling | WORK | No shift or roster entity. Bands derive from absences/bookings/stages/due-dates. Needs a shift entity. |
| capacity | WORK | The 8-gap-type model computes and renders but persists nothing — no snapshot table, so no history, no trend. Needs a capacity snapshot table + write path. |
| workload | WORK | Derived strip only. Needs a workload entity before targets or thresholds can be set or alerted on. |
| workforce planning | WORK | The "human plan" payload key has no writer anywhere. Needs the authoring UI + persistence. |
| calendar | WORK | Read-only projection by construction. Needs a calendar entity before anything can be created directly on it. |
| employment records | EMPLOYEE LIFECYCLE | No direct-hire path (engagements mint only via booking accept); no position/pay/FTE fields. Needs a `create_engagement_direct_v1` command and employment-terms columns. |
| changes | EMPLOYEE LIFECYCLE | `change_pending` is a stage with no payload. Needs a change entity carrying before/after values, an effective date, and approval binding to that value set. |
| termination | EMPLOYEE LIFECYCLE | Needs a **notice-period** field and an **effective date** distinct from stamp time. |
| termination docs | DOCUMENTS | Only a status value plus manual filing. Needs a termination-document type and a generation path from the agreement + offboarding run. |
| parties model | DOCUMENTS | `agreements` is single-counterparty. Needs a multi-party entity; and the legacy `contracts.parties` free-text column is still read but never written — decide to wire or drop. |
| expiry/reminders | DOCUMENTS | Types and emitters exist but fire from the document **read** path. Needs a scheduled job so a worker who never opens `/dashboard/documents` is still reminded. |
| training, certifications | OPERATIONS | Self-declared only; no training surface, and only 2 certification registry slugs. **PR #1180 is the in-flight fix — merge it or close it.** |
| task / tasks / assignment / journal↔task | WORK + OPERATIONS | See §7.1 — apply-blocked, not build-blocked. |
| audit/budget boundaries | AI | Three named gaps still open: journal AI action lacks auth check + rate limit; CV AI action the same; the public company-need AI call runs outside the rate limiter. |
| chat-first workspace, context awareness, inquiry understanding, matching explanation, action generation | AI | All gated by one config value: `AI_PROVIDER_MODE=disabled` in production (`ai_runs` = 0). The code paths exist; enabling them is an owner cost/privacy decision, not a build. |
| document understanding, forecasts, simulation | AI | DEAD. `document_assistant` is a wire-up away since #1169. Forecasts and simulation are label/stub only — build them or delete them. |

### 7.3 Blocked on an owner decision

| Row | Domain | Decision needed |
|---|---|---|
| retention | DOCUMENTS | Two halves. **(a)** The non-destructive design is **deliberate doctrine**, pinned by guard — "retention is a record. No delete/purge/destructive job." If the owner agrees, PARTIAL is terminal by design and should be recorded as such. **(b)** What is *not* deliberate: there is no **per-document-type retention policy**, so every retention date is typed in by hand. Needs an owner/legal retention schedule per type before that can be automated. |
| signature | DOCUMENTS | Whether to procure a qualified e-signature provider. Until then the honest-evidence model is correct and the doctrine guard should stay. |
| general contracts (B2B) vs agreements | DOCUMENTS | **Documented, deliberate coexistence — not accidental duplication.** #1175 states the relationship explicitly: `contracts` + its 3 RPCs + register UI are UNTOUCHED and remain the *legacy personal commercial register*; `agreements` is the *canonical org-scoped register going forward*; migrating old `contracts` rows is a **LATER owner decision with no data moved in that PR**. The UI states this on the page (`agreements.relationshipNote`) and `agreements.test.ts` pins "contracts untouched". **The open item is only the deferred consolidation decision** — two registers with overlapping purpose remain live in the meantime, and the longer that persists the more rows accrue on the legacy side. |
| tests/assessments, performance, management decisions | OPERATIONS | The audit called all three deliberate doctrine. **PR #1180 proposes building all three.** The owner should confirm whether the doctrine reversal is intended — particularly for `performance`, where the standing rule is "record count, never a competence score" and the PR proposes evidence-based reviews. See also §12.1: the stated reason for excluding `management decisions` was factually wrong. |
| billing/payments | OPERATIONS | `PAYMENTS_ENABLED=false`, 0 subscription rows, portal endpoint still has no UI caller, LMC ledger still dead app-side. Owner-only billing activation gate. |
| `worker_absence_scheduling` ERROR advisor | SECURITY | Accepted decision; reversing it re-opens the W12 privacy split. No action recommended. |

---

## 8. Market truth (production, measured 2026-08-18 03:34:42 UTC)

### Marketplace supply — imported data, no relationship with LabourMarket.ai

| Metric | Value |
|---|---:|
| Active visible vacancies (`is_active AND lifecycle='published'`) | **43,781** |
| Total positions (sum of `positions`) | **72,973** |
| Distinct employers by `employer_external_org_id` | 7,591 |
| Additional distinct employers by lowercased name (org id null) | 316 |
| **Distinct identified employers (non-overlapping)** | **7,907** |
| Distinct regions with active ads | **21** |

Movement since the audit's 2026-08-17 read: 41,606 → 43,781 active ads
(+2,175) and 7,669 → 7,907 identified employers (+238). The import cadence is
live, so the landing floor claims ("41 000+", "7 600+") remain true and are
being exceeded, exactly as `market-coverage-claims.ts` intends.

### Product adoption — the populations that may carry adoption verbs

| Metric | Value |
|---|---:|
| Registered organizations (`organizations`) | **13** |
| Organizations with ≥1 active `company_memberships` | **13** |
| Organizations with ≥1 active `engagement_contexts` | **13** |
| Active engagement contexts | **53** |
| Total profiles | **36** |
| **Paying organizations** (`billing_subscriptions` active/trialing) | **0** |
| `billing_subscriptions` / `subscriptions` / `billing_customers` rows | 0 / 0 / 0 |

### Usage of what this train shipped — the honest number

| Table | Rows |
|---|---:|
| `workflow_definitions` | **0** |
| `timesheets` | **0** |
| `agreements` | **0** |
| `employee_requests` | **0** |
| `work_objects` | **0** |
| `org_documents` | **0** |
| `document_files` | **0** |
| `procurement_inquiries` | **0** |
| `business_trips` | **0** |
| `notification_events` | **0** |
| `work_tasks` | 0 |
| `worker_documents` | 0 |
| `finance_records` | 0 |
| `worker_absences` | 0 |
| `projects` | 6 |
| `ai_runs` | 0 |

**This is the most important line in the report.** Seventeen capabilities moved
to FULL, and not one of them has been exercised by a real user. The
pre-existing domains are equally empty — `work_tasks`, `worker_documents`,
`finance_records` and `worker_absences` all hold zero production rows. The
estate is 13 organizations, 36 profiles and 6 projects. **The binding
constraint on LabourMarket.ai is not capability coverage; it is that nobody is
using the capabilities that exist.**

---

## 9. Landing minimal update (PR #1176)

| Aspect | Detail |
|---|---|
| **Added** | `MarketProofBand` (`apps/web/components/marketing/market-proof-band.tsx`), mounted between the product chain and the Player Card showcase. Three production-derived floor stats — "41 000+" active job opportunities, "7 600+" employers, "21" regions — plus a data-derived top-professions-in-demand ranking (6 families, **ranking only, no absolute counts**). |
| **Removed** | Placeholder content in the same band position. No hero redesign, no Living World, no design-system change — scope deliberately small. |
| **Data source** | `public.public_vacancies`, read via Supabase MCP `execute_sql` on 2026-08-17 21:22–21:23 UTC. Profession slugs resolve against the canonical `professions` taxonomy catalogs. |
| **Freshness** | A dated visible basis line: "Based on job listing data from 2026-08-17; numbers change daily", plus an honest note that some listings are not yet grouped by profession. |
| **Honesty enforcement** | Numbers are **floors**, so a fresh count can only exceed them — confirmed today (43,781 > 41,000; 7,907 > 7,600). New guard `lib/guards/landing-market-proof.test.ts` pins every locale's numbers to `lib/analytics/market-coverage-claims.ts`, re-runs the adoption-verb rule over every string, and asserts the band renders no per-profession counts. The claims module keeps the four company populations apart so marketplace-employer counts can never acquire an adoption verb — "7,600 companies use LabourMarket.ai" would be sourced from population A and is pinned as a lie. |
| **i18n** | `landing.marketProof` added to all 11 catalogs with real translations; no new `[EN]` markers; `da` debt unchanged at baseline 1301. |
| **Freeze** | The new component joined `FROZEN_LANDING_FILES`; regeneration moved exactly five hashes and nothing else drifted. |

**Risk:** the band claims 21 regions and production reads 21 — the one stat
with **no headroom**. If regional coverage dips it becomes false immediately.
Consider "20+" or re-deriving at build time.

---

## 10. Tests and gates

Per the mandate, the full suite was **not** re-run; CI evidence is cited from
the PRs and from `main`'s post-merge runs.

### `main` post-merge (authoritative)

| Commit | Workflow | Result |
|---|---|---|
| `dbc6b76f` (#1179) | Quality Gates | **success** |
| `dbc6b76f` (#1179) | CodeQL | **success** |
| `64f27c7b` (#1178) | Quality Gates | success (5m51s) |
| `64f27c7b` (#1178) | CodeQL | success (4m3s) |
| `900284f2` (#1177) | Quality Gates / CodeQL | success / success |
| `239a012d` (#1176) | Quality Gates / CodeQL | success / success |

**`main` at the END SHA is green on both workflows.**

### Per-PR rollup

| PR | Success | Skipped | Other |
|---|---:|---:|---|
| #1168, #1169, #1170, #1174, #1175, #1176, #1177, #1178, #1179 | 5 | 1 | — |
| #1172 | 5 | 0 | — |
| #1173 | 5 | 0 | 1 cancelled |
| #1171 | 4 | 1 | **1 FAILURE (CodeQL)** |

### Guard coverage added by the train

New suites: `workflow-engine.test.ts`, `document-file-layer.test.ts`,
`timesheets.test.ts`, `employee-requests.test.ts`, `agreements.test.ts`,
`work-objects-projects-v1.test.ts`, `org-document-register-delta.test.ts`,
`financial-ops.test.ts`, `security-train-a-v1.test.ts` (24 tests),
`worker-doc-verification-request.test.ts`, `landing-market-proof.test.ts`.
DB-proof scripts reported 85/85 (#1170) and 32/32 (#1171).

Migration-ratchet pins were recounted per PR as the tree grew (203 → 205 at
#1170, 216 at #1177), which is why several PRs carried baseline renumbering.

---

## 11. Production state verified

| Check | Result |
|---|---|
| Migration ledger read (03:57:03 UTC) | **18** train migrations present; versions in §2.1 |
| Schema existence probe | `work_objects`, `timesheets`, `agreements`, `employee_requests`, `workflow_definitions`, `document_files`, `org_documents`, `leave_balance_policies`, `engagement_lifecycle_events`, `procurement_inquiries`, `procurement_offers`, `procurement_events`, `business_trips`, `business_trip_events` — **all present** |
| Schema absence probe | `task_dependencies`, `work_task_events` — **absent**; `work_tasks.object_id` — **absent** |
| Column probe | All 5 new `finance_records` columns (incl. `trip_id`) present; `profiles.active_organization_id`, `engagement_contexts.lifecycle_stage` present; all 7 `org_documents` delta columns present |
| Security advisors | 1 ERROR (accepted), 314 WARN, 3 INFO; 0 RLS-disabled tables |
| Row counts | §8 |
| Dead-code removal | `talent_source_records`, `identity-resolution-service` now appear only in guard tests |
| Orphan RPC wiring | `request_worker_document_verification` now has a real caller |
| Honest degradation | Confirmed in `lib/procurement/procurement.ts` (42P01 → `needs-migration`, now a dormant path since the migration applied) and `components/app/work-objects-section.tsx` |

**Routes NOT browser-verified.** Every new surface —
`/dashboard/planning/timesheets`, `/dashboard/finance` (procurement + trips
sections), `/dashboard/network#approvals`, `/dashboard/documents`, the
agreements register, org documents register, ack inbox, objects & sites
section, onboarding section — was confirmed to **exist in the tree** with wired
actions and guards, but no authenticated browser journey was run. Verifying
this needs one authenticated Playwright pass per surface against a seeded org.

---

## 12. Corrections to prior documents, and repo hygiene

### 12.1 The 2026-08-17 audit's `management decisions` reason is FALSE

The audit records: *"management decisions | MISSING | nav guard actively
excludes it."* **Verified false.** The only repo match is
`apps/web/lib/guards/public-nav-canonical.test.ts:88` —

```
expect(Object.values(n)).not.toContain("Sprendimai");
```

That assertion bans the **marketing-header label** "Sprendimai"/"Solutions"
from the public nav vocabulary. It is a copy guard on a marketing nav, not a
product-module exclusion, and it would not block a management-decisions
feature. **The module was simply never built.** The status (MISSING) is
correct; the stated reason is not, and it matters because "a guard excludes it"
reads as a deliberate decision when nothing of the kind was decided. This
should be corrected in `docs/audits/full-reality-audit-2026-08-17.md`.

### 12.2 `financial-ops.test.ts` carries a CRLF-fragile assertion

Reported by Train I; mechanism confirmed here. `apps/web/lib/guards/financial-ops.test.ts`
asserts on migration SQL by reading the files as text and calling `toContain`
with literal needles (e.g. lines 222–227, 234ff). Needles that span more than
one line are authored with `\n` in the test source and compared against file
content that is **CRLF on a Windows checkout**, so they fail locally while CI
stays green because CI checks out LF. **This is a false-red for Windows
developers, not a product defect.** Fix by normalising line endings at read
time (`.replace(/\r\n/g, "\n")`) in the file-reading helper, which also
protects every other text-asserting guard in the suite.

### 12.3 Worktree cleanup could not complete

Reported by the coordinating session and consistent with what I observe:
`git worktree list` currently registers **28 worktrees** against this repo.
Eight merged train worktrees plus a stale `work-os-vecticum` remnant were
verified clean — no tracked modifications, no untracked files, nothing
unpushed, and only regenerable artifacts — but could not be removed:
`git worktree remove` fails on Windows `node_modules` file locks, and `rm -rf`
was denied by the session permission layer. **No data is at risk; this is disk
hygiene.** Per the workspace path-guard rules, a merged worktree is meant to be
temporary, so an owner-run cleanup pass (with editors and dev servers closed)
should reclaim them. Verify each against the four-point checklist before
deleting, since gitignored files are not recoverable from git.

---

## Bottom line

At the code layer the train delivered: **+17 FULL, MISSING cut from 19 to 3,
the last BROKEN row closed, and the two biggest architectural gaps the audit
named — the Workflow & Approval engine and the Document file layer — built as
single canonical engines that seven other domains now consume rather than
fork.** Eighteen migrations are applied and verified. Duplication was held flat
(2 before, 2 after); the `agreements`/`contracts` overlap is a documented,
UI-disclosed coexistence with a deferred owner consolidation decision, not new
accidental debt.

Three things stand between this and a genuinely complete product:

1. **Three merged migrations are dormant.** One owner-permitted apply session
   converts four more rows and closes the last open cross-tenant finding (an
   org owner still cannot revoke a departed manager's pending invitations).
2. **`workflow_definitions` is empty, so no approval can complete anywhere.**
   Seven capabilities graded FULL are inert until an org publishes a workflow
   definition. Seeding starter templates is the cheapest, highest-leverage
   action available.
3. **Nothing is in use.** Every engine table holds zero rows; 13 organizations,
   0 paying. Further capability building has sharply diminishing returns
   against getting one real organization to run one real month of work through
   what already exists.

The open PR #1180 would close the last three MISSING rows — but two of them
(`performance`, `tests/assessments`) were previously recorded as *deliberate
doctrine*. That is an owner decision to make consciously, not a gap to close by
default.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
