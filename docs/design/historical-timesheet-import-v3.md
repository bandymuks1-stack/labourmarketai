# Historical timesheet import: design record v3

| | |
|---|---|
| **Status** | SUPPORTING design, PROPOSED. **NOT THE CANONICAL ARCHITECTURE.** It realises §1.6 *Historical ingestion and provenance* of [`docs/OWNER_TARGET_ARCHITECTURE_V1.md`](../OWNER_TARGET_ARCHITECTURE_V1.md) and adds no graph node. Nothing in it has been applied. |
| **Date** | 2026-09-23 |
| **Governing input** | Owner rules of 2026-09-23 (§1). They are authoritative over everything below. |
| **Supersedes** | The v2 "historical evidence graph" draft. It was never committed. Its **commercial expansion is SUPERSEDED by owner decision A**: invoices, payments, payroll, settlement, money columns and commercial links. v3 keeps only v2's reuse map and security analysis, and only where this record re-verifies them. |
| **Companion** | [`historical-timesheet-fixture-v3.md`](historical-timesheet-fixture-v3.md): the synthetic acceptance fixture, T1 to T18. |
| **Evidence base** | Design facts come from `main` @ `06d5bb199` and from production `gorgitwvdzxbnaxhrsrw`, read with read-only `SELECT` on 2026-09-23. The live-reader inventory (§5.2) and the definer body (§9.3) were re-checked by grep @ `6e0117d53`. A fact marked PROVEN was read at one of those two places. |
| **Review** | An independent verification pass is folded into the design below. It returned NEEDS_CHANGES with 3 HIGH, 6 MEDIUM and 2 LOW findings. §20 maps each finding to the section that now carries the corrected design. |

**Scope in one line.** Only REAL HISTORICAL TIMESHEETS become verified historical work. Each record is resolved into customer, ordered work, object and address, and it all runs on the ONE existing import pipeline with the smallest additive schema. Historical data is never mixed into live planning.

---

## 1. Owner decisions 2026-09-23 (governing)

| Id | Decision | What it means for this design |
|---|---|---|
| A | Only REAL HISTORICAL TIMESHEETS are imported. | This design has no invoice, payment, payroll, settlement, payment-based verification, money column or finance dependency. |
| B | An ORDER RELATIONSHIP is not an ORDER DOCUMENT. | Work for a real customer at an object, by identifiable workers with recorded hours, IS historical customer-ordered work. Order DETAILS that are not known stay UNKNOWN. They are not stored as empty columns: the projector names them as "not on record" (§5.4). Unknown details do not mean "no order". |
| C | Additional ordered work is a separate step. | Work of a new kind for the same customer and object, done later, becomes ADDITIONAL ORDERED WORK. It is never folded into the initial scope, and no change-order document is required. |
| D | Resolve every supported record along the chain. | TIMESHEET → WORKER → SUPPLYING ORG → CUSTOMER → ORDERED WORK / PROJECT → OBJECT → ADDRESS → PERFORMED WORK → HOURS / PERIOD → VERIFIED HISTORICAL WORK. Reuse existing entities, extend them additively, and never build a second order system. |
| E | A timesheet that resolves correctly is VERIFIED HISTORICAL WORK. | The basis is named `organization_timesheet`. It is never "independently verified". There is no customer re-confirmation and no new verification theory. |
| F | Preserve the source and authorise the import. | The original file and its provenance are kept. Addresses are normalised, and the source spelling is kept beside them. No worker-hour row is left disconnected. The real authorization gaps are fixed. Verified status can be derived only from an authorised import made by the supplying organization. |

Standing platform rules that apply:

- Reuse or extend before adding anything new (decision [0016](../DECISIONS/0016-delivery-over-legacy-constraints.md)).
- SEP-3: evidence is not verification. That rule is kept, and the new state is not independent verification.
- SEP-7: unknown is not zero.
- A-09: any new surface carries the five-answer declaration.
- Migrations are named `YYYYMMDDHHMMSS_snake.sql` and ship a `.down.sql`.
- These classify a migration RED ([`migration-safety.mjs`](../../.github/scripts/migration-safety.mjs)): GRANT or REVOKE, SECURITY DEFINER, DROP or ALTER POLICY, DROP NOT NULL, data UPDATE or DELETE, and any `using (true)` or `with check (true)`.
- Every migration trips the three count ratchets.
- There are no ratings or scores anywhere.
- The 158 existing records in org `19f47e78` are never touched.
- The canonical supplying organization is `20b2c802`.
- Automation never commits real data.
- No service-role path is used or added.

---

## 2. Production and code facts that shape v3 (PROVEN)

| Fact | Value | Consequence |
|---|---|---|
| Evidence in prod | 158 records in 1 session, all in org `19f47e78`. The supplying org `20b2c802` has 0 records, 0 people and 0 objects. | The supplying org starts from nothing. |
| Supplying org | It holds the roles `employer` + `workforce_provider`, with an active owner membership and an active manager membership. Its legacy company is `048aa7e1`. | N1 applies (supplier-role precedence). The owner can create projects. The manager cannot. |
| `projects` columns | `status` is nullable text with `CHECK (status in ('draft','live','paused','completed'))` and **no default**. `authenticated` holds INSERT, SELECT and UPDATE, and **no DELETE**. | A historical project never needs a live status (§5.1), and nobody can delete one (§5.3). |
| `projects` RLS | Insert/update: `owns_company(company_id) OR is_admin()`. Select: `owns_company OR is_admin OR is_assigned_to_project`. **`organization_id` is not bound to `company_id`.** | A manager cannot SELECT projects. The owner of any company could create a project that names another org (N8, §8 P9). |
| Live project readers | Planning, workforce and assist keep `status in ('draft','live','paused')`. The projects list takes the latest 100 rows. Reports, starter signals, market map and company context count or list every row (§5.2). | History would spill into live planning and would push live projects out of the lists (N9, §5.2). |
| One project insert path | `lib/projects/create-project-core.ts` `insertProjectForCompany` is pinned by `lib/guards/w10-project-org-binding.test.ts`. | The historical project insert extends that core. It does not add a second path. |
| `project_clients` | 4 rows, with columns `id, project_id, name, contact_name, contact_email, notes`. RLS is `can_manage_project` (a definer that allows `owns_company OR manages_organization(p.organization_id) OR is_admin`). FK `project_id` is ON DELETE CASCADE. Nothing in `apps/web` reads it. | This is the existing "customer of this project" relation. Managers can read and write it. |
| `work_objects` | Written only through the definer `create_work_object_v1(org, name, project, country, region, city, address_line, lat, lon)`. Authority is `has_org_demand_access`, with a cap of 500 per org. It returns `'created'`, not an id. | It already accepts address fields and `project_id`. |
| `organization_evidence_records` | `session_id` is NOT NULL (composite FK to sessions). `work_object_id` and `import_row_id` are single-column FKs (SET NULL). Also present: `supplied_by_organization_id NOT NULL` and `supplier_role`. There is no project column. Insert policy: `manages_organization(organization_id) AND imported_by_profile_id = auth.uid()`. | N5 and N6 below. |
| `organization_evidence_events` insert (`_attest`) | `manages_organization(organization_id) AND actor_profile_id = auth.uid() AND event_type <> 'independently_verified'`. `_verify` requires a party row whose `party_organization_id = actor_organization_id` and whose `party_role` is in `client, end_client, project_owner, assessor, verifier, public_body`. | Any manager can mint `attested/client` naming any org (R1-1). The party-verify path depends on party rows that carry `party_organization_id`. |
| `organization_evidence_parties` | Insert: `manages_organization(organization_id) AND created_by = auth.uid()`. Select no longer re-enters records: the definer `is_evidence_record_subject` from `20260907220000` breaks that cycle. | A new policy may read records from a parties policy without a cycle (§8, recursion check). |
| `manages_organization` | Memberships `owner, admin, manager, external_manager`, or engagement contexts `manager, owner, external_manager`. | External managers can import and attest today (N7). |
| `evidence_import_rows` | Insert, update and DELETE policies are `manages_organization`. Unique `(session_id, row_index)`. Status is one of `pending, ready, needs_review, committed, skipped, failed`. | Committed staging rows can be updated and then deleted. A partial retry duplicates rows (N3). |
| `evidence_import_sessions` | `supplied_by_organization_id NOT NULL`. `supplier_role` is one of 13 values including `other`. `actor_kind` is `human` or `agent`. `source_kind` includes `csv`, `xlsx` and `agent`. | P1 and P2 can bind records to their session. |
| Supplier role default | `import-actions.ts:241-252` maps capabilities to roles: `training_provider`, then `workforce_provider`/`recruitment_partner` as `agency`, then `employer`/`project_operator` as `employer`. **`other` applies when the org declared no capability.** Capabilities live in `organization_roles.role_slug`. | N1 (a workforce_provider is checked before an employer). `other` must stay admissible (§8 P2). |
| Membership reads | `company_memberships_select`, `engagement_contexts_select` and `organization_roles_select` all admit the caller's own rows. | The governance predicate can be written INLINE in a policy, without a definer function. |
| Grants | `pg_default_acl` has 0 rows for schema `public`. `service_role` holds NO grants on the evidence tables or on `project_clients`. | Any new table needs an explicit GRANT, which is RED. No service-role writer is designed. |
| Document store | Bucket `document-files`: 5 MB, allowing pdf, jpeg, png, webp and docx. `document_files_mime_type_check` has the same list. **The SECURITY DEFINER function `register_document_file_v1` hard-codes the same list and returns `'unsupported_type'` for anything else** ([`20260817140000_document_file_layer_v1.sql:588-592`](../../supabase/migrations/20260817140000_document_file_layer_v1.sql)). The app allowlist `lib/documents/document-file-model.ts:22-28` has the same list. `content_sha256` is plain hex. | CSV and XLSX sources cannot be stored today, and widening only the CHECK and the bucket would not change that (§9.3). |
| Org documents | `create_org_document_v2(..., p_external_ref, ...)` returns the text `'created'`, not an id. Each org may have at most 500 open documents. `can_read_org_document_v1` admits every active member for `status = 'active' AND classification = 'standard'`, and only owner/admin (plus the responsible person and acknowledgement assignees) for `classified`. | Preservation must use `classified` and find its document by `external_ref` (§9). |
| `project_stages` | 1 row. It is live planning (planned and actual dates, status, blocked_reason), and currently assigned workers can read it. | It is not a home for historical orders (§3). |
| Import code | `import-core.ts` never writes `projects`, `project_clients` or `organization_evidence_parties`. It creates objects with `p_project_id null` and no address. | The chain CUSTOMER → PROJECT → OBJECT is not written today. |
| Lane E (`fix/cc/provenance-no-false-precision`, not on `main` @ `6e0117d53`) | An `interpreted_period` has month precision and no monthly figure. A start date alone is refused. | v3 aligns with it (§11) and never renders or stores a share. |

Findings made for this design:

- **N5 (HIGH).** `organization_evidence_records_insert` does not bind `supplied_by_organization_id`, `supplier_role`, `source_kind` or `row_origin` to the record's session.
- **N6 (MED).** `import_row_id` and `work_object_id` are single-column FKs, so a record can point at another org's staging row or object. FK checks bypass RLS.
- **N7 (MED).** External managers pass every evidence write policy.
- **N8 (MED).** `projects.organization_id` is not bound to the owning company. A foreign company owner can create a project inside another org, and can squat a guessable `historical_key`.
- **N9 (HIGH).** Any `projects` row that is not filtered out reaches live planning, workforce, lists, counts and the map.
- Carried from earlier review:
  - **N1**: supplier-role precedence.
  - **N3**: a partial retry duplicates staging rows.
  - **R1-1**: the attestation allow-list.
  - **R1-8**: agent rows can look like a file.
  - **R2-2**: rollback returns early with 0 records and swallows audit errors.

---

## 3. The model

```
CUSTOMER (project_clients row with customer_key)          <- identified from the timesheet
   |
   +-- ORDERED WORK = historical project (customer x object), historical_key NOT NULL
   |      |                                                 <- REUSE projects; never in live planning
   |      +-- ordered-work steps (initial, additional #2, #3 ...)  <- ONE additive relation, no order-detail columns
   |
   +-- OBJECT / ADDRESS (work_objects address fields; source spellings kept on records)
          |
SUPPLYING ORG (org 20b2c802, supplier_role employer)
   |
WORKERS (organization_people roster)
   |
PERFORMED WORK = organization_evidence_records (+ project_id, source_row_index, row_origin)
   |        date / period (with precision), hours (NULL = unknown), work text
   |
TIMESHEET EVIDENCE = evidence_import_sessions + evidence_import_rows + preserved file (sha256)
   |
VERIFIED HISTORICAL WORK (derived on read; basis organization_timesheet)
```

Entity map. REUSE means unchanged. EXTEND means additive columns or policies. ADDITIVE means a new object. COMPOSE means derived, with no store.

| Owner concept | Home | Tag |
|---|---|---|
| Timesheet file (original) | `org_documents` of type `org_import_source` (classified, `external_ref = 'sha256:<hex>'`) + `document_files` (the bytes and `content_sha256`) | REUSE + EXTEND (MIME list in CHECK, bucket and `register_document_file_v1`; one type slug) |
| Import batch and provenance | `evidence_import_sessions` (+ `source_bytes_sha256`), `evidence_import_events` (+ `decided`) | EXTEND |
| Staged source row | `evidence_import_rows` (+ customer, project, `row_origin`); immutable once committed | EXTEND |
| Worker | `organization_people` | REUSE |
| Supplying org | Session and record `supplied_by_organization_id` + `supplier_role`, bound by policy (P1, P2) | REUSE |
| Customer | `project_clients` (+ `customer_key`, `customer_code`, `customer_kind`, `created_session_id`) | EXTEND |
| Ordered work (the commissioned relationship) | `projects` (+ `historical_key`, `created_session_id`); `historical_key IS NOT NULL` marks it historical, and every live reader filters that out | EXTEND |
| Ordered-work steps (initial and additional) | `project_ordered_work` | ADDITIVE (one table, no order-detail or money columns) |
| UNKNOWN order details | the fixed projector list `ORDER_DETAILS_NOT_ON_RECORD` (§5.4) | COMPOSE |
| Object and address | `work_objects` (address columns, `project_id`) through `create_work_object_v1` | REUSE |
| Performed work and hours | `organization_evidence_records` (+ `project_id`, `source_row_index`, `row_origin`) | EXTEND |
| Customer on a work fact, visible to the subject | `organization_evidence_parties` (`party_role 'client'`, label only, never `party_organization_id`) | REUSE (first writer) |
| Supplier attestation | `organization_evidence_events` `attested`, bound to the record's supplier role | REUSE, narrowed |
| Source preserved (marker visible to the subject) | `organization_evidence_events` new type `source_preserved`, written only after a server re-parse | EXTEND (CHECK widening) |
| Verified historical work | the derivation in `evidence-state.ts` | COMPOSE |
| Which step a record belongs to | the `ordered-work.ts` rule over steps and records | COMPOSE |
| History views | the pure `historical-graph.ts` over the stores above, rendered by existing components | COMPOSE |

What is NOT used, and why. The doctrine forbids a second order system.

- **`customer_requests`**. This is LIVE demand. It feeds the worker board, scouting, booking, the map and plan quotas. Its `kind` encodes market direction, and its author must be a platform profile.
- **`agreements` / `agreement_amendments`**. This is a register of legal records: `counterparty_name NOT NULL`, signature status, current document. Using it would turn a relationship into an ORDER DOCUMENT, which decision B forbids.
- **`proposals` / `contracts`**. These are profile-scoped, can be hard-deleted, and are legacy debt.
- **`project_stages`**. This is live planning, and today's crew can read it.
- **`agency_clients`**. This is a staffing-agency contact register. The timesheet scope needs customer IDENTITY (§4), not contacts.
- **The v2 commercial tables, amounts, links and node events.** Superseded by decision A.

---

## 4. Decision 1: where the CUSTOMER lives

**Home: `project_clients`, one row per (historical project, customer), extended with a deterministic identity key.** There is no new register and no invented legal identity. No `organizations` or `companies` row is created for a customer that is not on the platform.

Additive columns (M1c, GREEN):

| Column | Meaning |
|---|---|
| `customer_key text` | `code:<CC or -->:<normalised code>` when the source states a customer code. Otherwise `name:<fold-v1>`. |
| `customer_code text` | The code in the source's normalised form. NULL means the source did not state one. |
| `customer_kind text` | `organization` (there is a code or a legal-form token), `private_person` (only when a source column says so), or `unknown` (the default). |
| `created_session_id uuid` | The session whose signed plan created the row. |

`name` holds the first-seen spelling exactly as written, and is used for display. Every other spelling stays in the records' `source_fact` cells, and the customer view lists them from there (COMPOSE).

Uniqueness:

- `unique (project_id, customer_key) where customer_key is not null`
- `unique (id, project_id)`, for the step FK

At org level, one customer is the set of `project_clients` rows on the org's historical projects that share a `customer_key`: one identity with N project relations. The supplying org's 3 legacy name-only rows have `customer_key` NULL. They are left untouched and never read (owner Q2).

Identity rules live in the pure module `lib/organization-evidence/customer-key.ts`, versioned `customer-fold:v1`:

1. **Fold.** Apply NFKD, strip diacritics, lower-case, and replace quotes (`„“"'«»`) and punctuation with spaces. Drop legal-form tokens (`uab ab mb ii vsi bv b v nv gmbh sp z o o oy as sia ou ltd llc inc`), collapse spaces and sort the tokens. For example, `UAB Fixtura Alfa`, `Fixtura Alfa, UAB` and `UAB „FIXTURA ALFA“` all fold to `alfa fixtura`.
2. **Code first.** A stated code decides:
   - Same code with a different spelling is the same customer. The spelling is kept.
   - The same fold with different codes is two customers, plus the notice `same_name_different_code`.
   - A code never merges with a different code.
3. **Name only (no code on the row).** The candidates are the customers in the org, and in this session's plan, whose fold is equal:
   - 0 candidates: a new `name:` customer.
   - Exactly 1 `name:` candidate: the same customer (a formatting variant).
   - 1 or more `code:` candidates: resolved automatically ONLY when the row's resolved object is already tied to exactly one of them, by a step or a planned project at that object. The method is `name_fold+object`. Otherwise the row goes to review as `ambiguous_customer`.
   - A near fold that is not equal (a token subset, or similarity of at least 0.85): review as `ambiguous_customer`. Never automatic.
4. **Missing customer cell.** The customer is NOT identified. The record is committed with `project_id` NULL and no ordered work, and the views say "customer not identified in the timesheet". Nothing is guessed.
5. **Bounded reads.** Resolution reads the org's keyed `project_clients` rows, which managers can read through `can_manage_project` because P7 adds no SELECT restriction (§8). It reads at most 2,000 rows. A historical project is trusted for resolution only when its `created_session_id` is set; the CHECK in M1a makes that true for every row with a `historical_key`.

Subject visibility. The worker does not read `project_clients` or `projects`. The worker sees the record's customer through `organization_evidence_parties`, written at commit:

- `party_role 'client'`.
- `party_label`: the customer's display name when `customer_kind = 'organization'`, otherwise the token `customer:<first 8 of project_clients.id>`.
- **`party_organization_id` is never written by the historical writer**. Guard G-PARTY-1, backed by P6 in the database. Writing it would give the customer org read and verify access, which is out of scope.

---

## 5. Decision 2: where ORDERED WORK lives

### 5.1 The ordered work IS the historical project

A historical project is the work one customer commissioned at one object. When the timesheet has a Project column, it is the work at one source-named project instead. It reuses a `projects` row, extended in M1a:

- **`historical_key text`**:
  - Form: `hp:v1:<customer_key>|<work_object_id>` or `hp:v1:<customer_key>|p:<fold(project label)>`.
  - Uniqueness: `unique (organization_id, historical_key) where historical_key is not null`.
  - This is the idempotency key **and the discriminator**: `historical_key IS NOT NULL` means historical, NULL means live. There is no other marker.
- **`created_session_id uuid`**: a composite FK `(created_session_id, organization_id)` to `evidence_import_sessions (id, organization_id)`.
- **`CHECK (historical_key is null or (created_session_id is not null and organization_id is not null))`**. A historical project must reference one of its own org's sessions. Together with P9 (org bound to company), this means a foreign company owner can neither create nor squat one.

Field values on a historical project:

- **`title`**: the source project label. Otherwise `<customer display> · <object name>`.
- **`start_date` / `end_date`**: NULL unless a source states them. The evidenced span is computed and shown as derived.
- **`status`**: **NULL**, rendered as "status not on record", unless the owner's SIGNED plan says `completed`. A historical project is never written with `draft`, `live` or `paused`. (`projects.status` has no default and is nullable, so NULL is a real, checked value.)
- **Company**: `organizations.legacy_company_id` of the supplying org (`048aa7e1`).

Who writes it and how:

- **Writer.** The historical project is inserted through the ONE create core: `lib/projects/create-project-core.ts` gains `insertHistoricalProjectForCompany`, beside `insertProjectForCompany`. It writes `organization_id` through the same `resolveOrganizationIdForCompany`, plus `historical_key`, `created_session_id` and the status above. The W10 guard (one insert path) stays true.
- **Who creates it.** The owner or an admin (`projects_insert` = `owns_company`). When a manager's rows need a NEW project, they are held as `project_needs_owner_admin`. FAILED is not EMPTY.
- **No re-keying.** No code path ever UPDATEs `historical_key` or `created_session_id` (guard G-HIST-2). The owner-UPDATE residual is stated in §19.

### 5.2 Isolation from live planning (historical projects never leak)

Rule: **every live reader of `projects` adds `.is("historical_key", null)`**. The filter is the discriminator, not the status. A historical project would still leak if its status were later changed by `set_project_status_v1`, and a status filter would not catch that.

Live readers found by `grep -rn 'from("projects")' apps/web/lib apps/web/app` @ `6e0117d53`. Each one gets the filter in PR-5, in the same PR as the historical writer, so no historical project can exist before every live reader filters it:

| Reader (file:line) | What it feeds | Filter today | Why it must change |
|---|---|---|---|
| `lib/planning/planning.ts:217` | planned items of visible project ids | `status in ('draft','live','paused')` | Planning must show only live work. |
| `lib/planning/planning.ts:303` | planned items for the org/company | same | same |
| `lib/workforce/workforce.ts:184` | workforce project rows | same | Workforce must show only live work. |
| `lib/projects/projects.ts:76` | `listManagedProjects`: latest 100 by `created_at`, also used by `lib/world-state/map-actions.ts:110` | none | Hundreds of historical rows would push live projects out of the 100. |
| `lib/projects/project-workspace.ts:105` | `loadProjectsForResult`: chat project lists and the options for move, readiness, stages and tasks | none | The chat would offer historical projects as targets for live work. |
| `lib/assist/assist.ts:149` | assist project rows | `status in ('draft','live','paused')` | same as planning |
| `lib/reports/reports-hub.ts:265` | project counts by status | company only | Counts would include history. |
| `lib/conversation/starter-signals.ts:198` | project count per org | org only | same |
| `lib/company/project-context.ts:32` | company project count ("foundation ready") | company only | same |
| `lib/market-map/world-read.ts:308` | world map projects by country | none | History is not live market presence. |
| `lib/market-map/signals.ts:231` | own-company market signals | company only | same |
| `lib/planning/employer-committed-work.ts:156` | titles of projects that have assignments | ids from assignments | Defence in depth. A historical project has no assignments. |

By-id readers of the project page and live operations: `lib/projects/operations.ts:225` (`getProjectOperations`, used by the chat move, readiness and executors and by the operations report route), `lib/projects/operations-centre.ts:95`, `lib/projects/project-workspace.ts:165`, `lib/projects/actions.ts:172` and `lib/projects/responsible.ts:24`. Each also selects `historical_key`, and for a historical project:

- `getProjectOperations` returns no live operations. The caller takes its existing not-found path.
- `/dashboard/projects/[id]` renders History mode only (§13), with no assign, stage, task, readiness or status controls.

Readers keyed by assignment, journal, task or asset cannot reach a historical project, because the historical pipeline writes none of those (non-goal, §18). These are `lib/projects/worker-project-access.ts:114,155`, `lib/engagements/end-engagement-visibility.ts:82`, `lib/cv-export/verified-cv.ts:416,654`, `lib/approvals/task-approvals.ts:206` and `lib/assets/assets.ts:87,222`. They go into the guard's allow-list with that reason. The SQL readers are:

- definer predicates such as `can_manage_project`;
- the journal autolink at `20260610213000_journal_entry_project_autolink.sql:55`, which requires an active assignment.

Both are by-id or keyed by assignment, so the same reason applies.

The following enforce this:

- **G-HIST-1** (`apps/web/lib/guards/historical-project-isolation.test.ts`, PR-5). It enumerates every non-test `.from("projects")` in `apps/web/lib` and `apps/web/app`. Each must carry `historical_key` in the same statement, or have an allow-list entry `{file, reason}`. A planted negative control proves the detector fires.
- **Fixture T17.** Over the FX end state, the planning, workforce, list, count and map projections contain 0 historical projects. The Layer D queries with the exact live filters return 0 of PR1, PR2 and PR3.

Residual (§19): a caller who knows a historical project's id could still call a live writer on it (`assign_worker_to_project`, `set_project_status_v1`). No surface offers that. A database refusal would change definer bodies (RED), and is left as a later slice.

### 5.3 ONE additive relation for ordered-work steps: `project_ordered_work` (M2)

It is needed because one project must hold the INITIAL ordered work and, separately, each ADDITIONAL ordered work (decision C), each with its own first-evidenced date. No existing table can hold that without overloading (§3). **The table has no order-detail and no money columns.** Unknown order details are named by the projector (§5.4), not stored as columns that must always be NULL.

```sql
-- M2 (RED: a new table needs GRANT; public has no default privileges)
-- @human-gate-approved: TIER owner-gated (new table + explicit grants; no definer, no policy change elsewhere)
begin;
create table public.project_ordered_work (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null,
  project_client_id uuid not null,
  work_object_id uuid,
  step_kind text not null check (step_kind in ('initial','additional')),
  -- the work kinds (scope keys, scope-key:v1) whose first evidence defines this step
  scope_keys text[] not null check (cardinality(scope_keys) between 1 and 50),
  scope_labels text[] not null check (cardinality(scope_labels) = cardinality(scope_keys)),
  first_evidenced_on date not null,
  first_evidenced_until date not null,
  first_evidenced_precision text not null check (first_evidenced_precision in ('day','week','month')),
  first_evidence_record_id uuid not null,
  evidence_basis text not null default 'organization_timesheet'
    check (evidence_basis = 'organization_timesheet'),
  detection jsonb not null,           -- {method:'ordered-work:v1', gapDays, lateStartDays, repeatGapDays, rule, decidedEventId?}
  review_state text not null check (review_state in ('auto','human_confirmed')),
  supersedes_step_id uuid references public.project_ordered_work(id) on delete restrict,
  step_fingerprint text not null check (char_length(step_fingerprint) between 16 and 128),
  created_session_id uuid not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint pow_window check (first_evidenced_until >= first_evidenced_on),
  constraint pow_project_fk foreign key (project_id, organization_id)
    references public.projects (id, organization_id),
  constraint pow_client_fk foreign key (project_client_id, project_id)
    references public.project_clients (id, project_id),
  constraint pow_object_fk foreign key (work_object_id, organization_id)
    references public.work_objects (id, organization_id) on delete set null (work_object_id),
  constraint pow_first_record_fk foreign key (first_evidence_record_id, organization_id)
    references public.organization_evidence_records (id, organization_id),
  constraint pow_session_fk foreign key (created_session_id, organization_id)
    references public.evidence_import_sessions (id, organization_id),
  constraint pow_once unique (organization_id, step_fingerprint)
);
create unique index pow_one_live_initial on public.project_ordered_work (project_id)
  where step_kind = 'initial' and supersedes_step_id is null;
create index pow_project_idx on public.project_ordered_work (organization_id, project_id, first_evidenced_on);

alter table public.project_ordered_work enable row level security;
revoke all on public.project_ordered_work from public, anon;
grant select, insert on public.project_ordered_work to authenticated;   -- no update, no delete, no truncate

create policy pow_select on public.project_ordered_work for select to authenticated
  using (public.manages_organization(organization_id) or public.is_admin());

create policy pow_insert on public.project_ordered_work for insert to authenticated
  with check (
    created_by = auth.uid()
    and ( exists (select 1 from public.company_memberships m
                   where m.profile_id = auth.uid() and m.organization_id = project_ordered_work.organization_id
                     and m.status = 'active' and m.role in ('owner','admin','manager'))
       or exists (select 1 from public.engagement_contexts ec
                   where ec.profile_id = auth.uid() and ec.organization_id = project_ordered_work.organization_id
                     and ec.status = 'active' and ec.relationship_slug in ('owner','manager')) )
    and exists (select 1 from public.evidence_import_sessions s
                 where s.id = project_ordered_work.created_session_id
                   and s.organization_id = project_ordered_work.organization_id
                   and s.supplied_by_organization_id = project_ordered_work.organization_id)
    and exists (select 1 from public.project_clients pc
                 where pc.id = project_ordered_work.project_client_id
                   and pc.project_id = project_ordered_work.project_id
                   and pc.customer_key is not null)
  );
commit;
```

- **Insert only.** There is no UPDATE, DELETE or TRUNCATE grant and no matching policy, which is the existing pattern for the evidence family.
- **Correction.** A correction is a new row with `supersedes_step_id`. The old row stays, hidden in the views.
- **Projects cannot be deleted.** `authenticated` has no DELETE grant on `projects`, so deleting a historical project returns **42501**, whatever references it. The FKs from steps and records (NO ACTION) are defence in depth for any future grant, and would then return 23503.
- **Nothing else is added.** No definer function, no trigger, no service-role grant.
- **Rollback** (`.down.sql`). It refuses if any row exists. Otherwise it drops the table.

### 5.4 UNKNOWN order details (no columns; a fixed projector list)

The timesheet path can never state an order date, an order reference, a contract number, a price, an initial quantity or a change-order reference. Such columns would be dead schema, they would contradict decision A, and a later order-document slice can add them additively. So the projector names them:

```ts
// lib/organization-evidence/historical-graph.ts (pure, PR-7)
export const ORDER_DETAILS_NOT_ON_RECORD = [
  { fact: "order_date", reason: "not_on_record" },
  { fact: "order_reference", reason: "not_on_record" },
  { fact: "contract_number", reason: "not_on_record" },
  { fact: "price", reason: "not_on_record" },
  { fact: "initial_quantity", reason: "not_on_record" },
  { fact: "change_order_reference", reason: "not_on_record" },
] as const;
```

- **Every step's view model** carries `notSupported: ORDER_DETAILS_NOT_ON_RECORD` verbatim.
- **The views** print one line: "Order details: not on record". It expands to the six names and is never 0, never empty and never a guess. The `notSupported` reason union gains `not_on_record`.
- **G-TS-1** (no finance, payroll or money identifier in the historical evidence modules) allow-lists exactly this constant and its one message key (`historical.orderDetails.notOnRecord`). Any other money identifier in those modules fails the guard.

### 5.5 Why steps are stored, not computed only on read

- A computation done only on read would re-classify history whenever a later file arrived, so what a reader saw as "additional ordered work" could silently change.
- It would also give the owner's decision no stable identity.
- A step is a business event. It is recorded once, from a signed plan, and changes only through an explicit superseding row.
- Which step a record belongs to is computed (§6.4), because records are insert-only and may be committed before an uncertain split is decided.

---

## 6. Decision 3: detecting ADDITIONAL ORDERED WORK deterministically

The pure module is `lib/organization-evidence/ordered-work.ts`, versioned `ordered-work:v1`. It uses no LLM.

- **Input:** all ACTIVE records of one historical project across all sessions, plus this session's staged rows that are being committed.
- **Output:** proposed steps and review items.

### 6.1 Scope key

`scope-key:v1(workText)` folds like the customer fold, without the legal-form list. It drops digits, hour figures (`DURATION_RE` from `work-context.ts`) and stop tokens, then sorts the tokens. `Facade work` and `facade  WORK` give one key. A near key (similarity of at least 0.85, or a token subset) is the review item `scope_label_variant`. It is never merged automatically.

### 6.2 Windows and thresholds

Every record has a window `[lo, hi]`:

- a day record is `[d, d]`;
- an ISO-week period runs Monday to Sunday;
- a month period runs from its first to its last day;
- any other stated period uses its bounds.

All comparisons use conservative bounds: the `min` distance is `lo_b - hi_a` and the `max` distance is `hi_b - lo_a`.

| Constant | Value | Meaning |
|---|---|---|
| `GAP_DAYS` | 21 | A new activity cluster starts only when the `min` distance from the cluster's end is greater than 21 days. |
| `LATE_START_DAYS` | 28 | Inside the initial cluster, a new work kind is certainly INITIAL only when its `max` offset from the cluster start is at most 28 days. |
| `REPEAT_GAP_DAYS` | 90 | A work kind already in a step, evidenced again after a `min` gap of more than 90 days, raises the question of whether it was ordered again. |

The constants are recorded in every step's `detection` jsonb. They are an owner calibration question (Q1), not a hidden policy.

### 6.3 Rules (applied in order)

1. **No identified customer means no steps.** Records keep `project_id` NULL.
2. **Clusters.** Sort the windows by `lo`. A window joins the current cluster when `lo - clusterHi <= GAP_DAYS`, and otherwise opens a new cluster. C0 is the initial cluster.
3. **Initial step.** It holds the work kinds first evidenced in C0 whose `max` offset from C0's first window is `<= LATE_START_DAYS`. There is one `initial` step, with `review_state 'auto'`.
4. **Late kind inside C0** (`max` offset `> LATE_START_DAYS`, no gap). This goes to review as `ordered_work_split_uncertain`, with the choices `same_order` and `additional_order`. It blocks ONLY the step creation, never the records. Choosing `additional_order` creates an `additional` step for that kind, with `review_state 'human_confirmed'` and `detection.decidedEventId` set.
5. **New kind in a later cluster Cj.** This is certain, because the gap is certain by construction. All kinds first evidenced in Cj form ONE `additional` step with `review_state 'auto'`, and its `first_evidenced_on` is the earliest `lo` among them. Separate later clusters give separate steps. An additional step is NEVER merged into the initial one.
6. **Repeat after a long gap.** A kind already in step s is evidenced again with a `min` gap greater than `REPEAT_GAP_DAYS` since its previous evidence. This goes to review as `repeat_work_after_gap`: `same_order` keeps it in s, and `additional_order` puts it into Cj's additional step, creating that step if none exists. Below the threshold it is a silent continuation of s.
7. **Precision guard.** Some outcomes would depend on where inside a month (or other coarse window) the work lay. Those are decided by the `min`/`max` bounds. When `min` and `max` straddle a threshold, the result is a review item, never an assumption.
8. **Contradiction.** A later import may place an existing additional step's kind inside an earlier cluster. That goes to review as `ordered_work_step_contradicted`. Nothing changes until the owner either keeps the step or supersedes it.
9. **Step fingerprint.** `sha256('ordered-work-step:v1|' || org || '|' || project || '|' || kind || '|' || sorted scope keys || '|' || first_evidenced_on || '|' || precision)`, inserted with `ON CONFLICT (organization_id, step_fingerprint) DO NOTHING`.

### 6.4 Which step a record belongs to (COMPOSE)

A record r of kind k and window `[lo, hi]` belongs to a non-superseded step s where `k in s.scope_keys` and `s.first_evidenced_on <= lo`. Of those, it is the step whose `first_evidenced_on` is latest.

- **Kind without a step yet** (an undecided split): the record shows "ordered-work step: needs review".
- **Hours per step** are the sums of the member records at their own precision (§11). They are never redistributed.

---

## 7. Decision 4: VERIFIED HISTORICAL WORK

It is derived on read in `evidence-state.ts`. It is never stored, never an `evidence_state` column value and never an event type.

A committed record R is `HISTORICAL_WORK_VERIFIED`, with basis `organization_timesheet`, when ALL of the following hold:

1. **Parsed from the uploaded file.** `R.row_origin = 'parsed_file'` and `R.source_row_index is not null`. The server parsed the uploaded file; MCP `submit_rows` writes `agent_rows` and typed rows write `typed`. P1 admits `parsed_file` only in a human-actor CSV/XLSX session that carries a `source_bytes_sha256`.
2. **Source preserved.** R has a standing `source_preserved` event whose actor org is R's org.
   - The database admits it only from an owner/admin of R's org, and only when an ACTIVE, CLASSIFIED `org_import_source` document holds bytes whose sha256 equals the session's `source_bytes_sha256` (P5).
   - The shipped preservation module writes it only after it re-parses those bytes on the owner/admin's own server request, and only when R's `source_fact` canonically equals the parsed row at `R.source_row_index` and R's `import_row_id` is a committed staging row of that session (§9).
3. **Supplier attestation.** R has a standing supplier attestation: the latest `attested` event with `actor_organization_id = R.organization_id` and `actor_role = R.supplier_role`, not followed by an `attestation_withdrawn` from the same actor org. The database admits no other supplier attestation (P4).
4. **Standing.** R is not WITHDRAWN, DISPUTED or CORRECTED (the existing ladder), and not superseded.
5. **Not self-attested.** The attester is not R's subject. The existing self rule still applies, and gives `SELF_ATTESTED`.
6. **Person resolved.** R's person was resolved by reference, exact name, plan creation or a human decision. Partial name matches are `ambiguous` in historical sessions and never commit. The method is copied into `R.derived.personResolution` at commit.

The ladder, from strongest: `WITHDRAWN > DISPUTED > CORRECTED > INDEPENDENTLY_VERIFIED > HISTORICAL_WORK_VERIFIED > attestation states > base`. `countsAsIndependentlyVerified` stays `state === INDEPENDENTLY_VERIFIED` only. No count, ranking, discoverability or trust signal changes.

Supported facts. Only these carry the verified mark; everything else keeps its own standing.

| Fact | Supported when |
|---|---|
| person | always (condition 6) |
| supplier (the supplying org, employer) | always, because the record is bound to its session (P1) |
| date / period at its stated precision | always. A month period is verified AS a month. |
| object / address | the source cell exists. It is shown exactly as written beside the resolved object. |
| work performed | the source cell exists (shown exactly as written) |
| hours | the source stated a figure. NULL means "unknown": never verified and never 0. An approximate figure stays approximate. |
| customer | the source cell stated it and it resolved (§4) |
| ordered-work step (initial / additional) | NOT a verified fact. It is labelled "derived from timesheet chronology", plus "confirmed by the owner" when a human decided it. |
| order details | never. They are listed in `ORDER_DETAILS_NOT_ON_RECORD` (§5.4). |

Output shape:

```ts
EvidenceStanding.verification = {
  basis: 'organization_timesheet',
  supplierOrgId, sourceDocumentSha256, sourceFilename, sourceRowIndex,
  facts: SupportedFact[],
  notSupported: { fact, reason: 'not_stated' | 'unknown_value' | 'derived' | 'not_on_record' }[],
}
```

Copy, in all locales (the raw-message-key leak class applies):

- EN: "Verified historical work · basis: organization timesheet (<supplying organization>, <file>, row <n>)".
- Never "independently verified", "employer-confirmed" or "customer-confirmed".
- The record uses the record/document glyph, not the treatment used for independent verification.
- SEP-3 in `lib/product-gate/semantic-separations.ts` is re-anchored to also cover the new state's vocabulary (`HISTORICAL_WORK_VERIFIED`, `organization_timesheet`), so it can never be counted as independent verification.

Guards:

| Guard | What it enforces |
|---|---|
| G-VER-1 | No `HISTORICAL_WORK_VERIFIED` without a non-empty facts list. It has a negative control. |
| G-VER-2 | `source_preserved` is written only by the preservation module (checked by grep). |
| G-TS-1 | No finance, payroll or money identifier in the historical evidence modules, except the one allow-listed constant of §5.4. |
| G-HIST-1 | Live-reader isolation (§5.2). |
| G-HIST-2 | No UPDATE of `historical_key` or `created_session_id`. |
| G-PARTY-1 | The historical writer never writes `party_organization_id`. |

---

## 8. Decision 5: authorization fixes (restrictive only; no loosening, no new definer, no service role)

The governance predicate G(org) is written out verbatim in each policy by the migration. There is no definer function; members can read their own membership and engagement rows, so the predicate works inline:

```sql
( exists (select 1 from public.company_memberships m
           where m.profile_id = auth.uid() and m.organization_id = <org>
             and m.status = 'active' and m.role in ('owner','admin','manager'))
  or exists (select 1 from public.engagement_contexts ec
           where ec.profile_id = auth.uid() and ec.organization_id = <org>
             and ec.status = 'active' and ec.relationship_slug in ('owner','manager')) )
```

- **G(org)** is `manages_organization` minus `external_manager`.
- **OA(org)** is the same predicate restricted to memberships `('owner','admin')` and engagements `('owner')`. It is used only by P5.

Every fix below is a RESTRICTIVE policy created with CREATE POLICY only, so it can only narrow what the existing permissive policies admit. None uses a `(true)` predicate. Where it matters, each UPDATE policy states both USING and WITH CHECK. **All of them are GREEN under `migration-safety` and ship in M1.**

| # | Table, command | Predicate | Closes |
|---|---|---|---|
| P1 | `organization_evidence_records` INSERT | G(`organization_id`) AND a session s exists with `s.id = session_id`, `s.organization_id = organization_id`, `s.supplied_by_organization_id = supplied_by_organization_id`, `s.supplier_role = supplier_role`, `s.source_kind = source_kind`, AND (`row_origin IS DISTINCT FROM 'parsed_file'` OR (`s.actor_kind = 'human'` AND `s.source_kind in ('csv','xlsx')` AND `s.source_bytes_sha256 is not null`)). Also (`work_object_id` null OR the object's `organization_id` = `organization_id`) AND (`import_row_id` null OR the staging row's `session_id` = `session_id`). | N5, N6, N7, R1-8 |
| P2 | `evidence_import_sessions` INSERT | G(`organization_id`) AND G(`supplied_by_organization_id`) AND (`supplier_role = 'other'` OR the supplying org holds, in `organization_roles.role_slug`, a capability from the map below) | N7, R1-1 (self-minted capacities), with `other` always admitted |
| P3i | `evidence_import_rows` INSERT | G(`organization_id`) | N7 |
| P3u | `evidence_import_rows` UPDATE | USING G(`organization_id`) AND `status <> 'committed'`; WITH CHECK G(`organization_id`) | a committed staging row is immutable (its status and cells cannot be rewritten) |
| P3d | `evidence_import_rows` DELETE | USING G(`organization_id`) AND `status <> 'committed'` | committed provenance cannot vanish |
| P4 | `organization_evidence_events` INSERT | Either branch holds. **Branch 1:** `event_type in ('disputed','independently_verified','verification_withdrawn')` AND NOT `manages_organization(organization_id)`. This leaves the subject-dispute and party-verify paths exactly as they are, and keeps room for a future permissive party-withdraw policy. **Branch 2:** G(`organization_id`) AND (`actor_organization_id` is null OR = `organization_id`) AND `event_type in ('attested','attestation_withdrawn','withdrawn','reinstated','corrected','source_preserved')` AND (`event_type <> 'attested'` OR (`actor_organization_id = organization_id` AND `actor_role` = the record's `supplier_role`)) AND (`event_type <> 'source_preserved'` OR P5). | R1-1: no self-minted client or institution attestation, no naming another org, no supplier-written `verification_withdrawn` or `disputed`; N7 |
| P5 | (inside P4) `source_preserved` | OA(`organization_id`) AND exists (`org_documents od` join `document_files df` on `df.org_document_id = od.id` join `evidence_import_sessions s` on `s.source_bytes_sha256 = df.content_sha256 and s.organization_id = od.organization_id` join `organization_evidence_records r` on `r.session_id = s.id`, where `r.id = record_id`, `od.organization_id = organization_id`, `od.document_type_slug = 'org_import_source'`, **`od.status = 'active'`, `od.classification = 'classified'`**, and `df.superseded_at is null`) | Verification only from a preserved, classified source, marked by an owner/admin. A standard or revoked document does not count. |
| P6 | `organization_evidence_parties` INSERT | G(`organization_id`) AND (`party_organization_id is null` OR NOT exists (a record r joined to `project_clients pc` on `pc.project_id = r.project_id`, where `r.id = record_id` and `pc.customer_key is not null`)) | N7. On records inside a historical customer-ordered work, no party org can be named, so no customer org gains read or verify access by accident. **On every other record, the independent-verification party path is unchanged.** |
| P7i | `project_clients` INSERT | K: `customer_key is null` OR exists (`projects p` where `p.id = project_id` and `owns_company(p.company_id)`) | Keyed (historical) customer rows are written only by the owner/admin of the project. |
| P7u | `project_clients` UPDATE | USING K, WITH CHECK K | Neither a manager nor an external manager can re-point or re-key a customer. |
| P7d | `project_clients` DELETE | USING K | same |
| (none) | `project_clients` SELECT | **no restriction added** | Managers keep reading keyed rows through `can_manage_project`. Customer and project resolution depends on that read (§4 rule 5, §12). |
| P8 | `evidence_import_events` INSERT | G(`organization_id`) | N7 |
| P9i | `projects` INSERT | B: `organization_id is null` OR exists (`organizations o` where `o.id = organization_id` and `o.legacy_company_id = company_id`) OR `is_admin()` | N8. A company owner cannot create a project inside another org, or squat a `historical_key`. |
| P9u | `projects` UPDATE | USING B, WITH CHECK B | N8. `organization_id` cannot be re-pointed. |

The P2 capability map. A role is refused only when it claims a capability the org does not hold.

| `supplier_role` | Admitted when the supplying org holds one of |
|---|---|
| `other` | always. It claims no capacity, and it is today's default for an org with no declared capability. |
| `employer` | `employer`, `project_operator` |
| `agency` | `workforce_provider`, `recruitment_partner`, `talent_provider` |
| `subcontractor` | `workforce_provider`, `project_operator` |
| `training_provider`, `education_provider`, `placement_provider` | `training_provider` |
| `assessor` | `training_provider`, `verification_provider` |
| `client`, `end_client` | `client` |
| `project_owner` | `project_operator`, `client` |
| `public_body`, `sector_body` | no capability slug exists in `organization_role_types`, so these are refused on the supplier path. The M1 pre-merge check requires 0 sessions with these roles today. Owner Q7 decides whether to add the slugs. |

M1 policy SQL. Each `G(x)`, `OA(x)`, `K` and `B` is written out verbatim, as above:

```sql
create policy hist_p1_records_insert on public.organization_evidence_records
  as restrictive for insert to authenticated
  with check (
    G(organization_evidence_records.organization_id)
    and exists (
      select 1 from public.evidence_import_sessions s
       where s.id = organization_evidence_records.session_id
         and s.organization_id = organization_evidence_records.organization_id
         and s.supplied_by_organization_id = organization_evidence_records.supplied_by_organization_id
         and s.supplier_role = organization_evidence_records.supplier_role
         and s.source_kind = organization_evidence_records.source_kind
         and ( organization_evidence_records.row_origin is distinct from 'parsed_file'
               or ( s.actor_kind = 'human'
                    and s.source_kind in ('csv','xlsx')
                    and s.source_bytes_sha256 is not null ) ) )
    and ( organization_evidence_records.work_object_id is null
          or exists (select 1 from public.work_objects o
                      where o.id = organization_evidence_records.work_object_id
                        and o.organization_id = organization_evidence_records.organization_id) )
    and ( organization_evidence_records.import_row_id is null
          or exists (select 1 from public.evidence_import_rows ir
                      where ir.id = organization_evidence_records.import_row_id
                        and ir.session_id = organization_evidence_records.session_id) ) );

create policy hist_p2_sessions_insert on public.evidence_import_sessions
  as restrictive for insert to authenticated
  with check (
    G(evidence_import_sessions.organization_id)
    and G(evidence_import_sessions.supplied_by_organization_id)
    and ( evidence_import_sessions.supplier_role = 'other'
          or exists (
            select 1 from public.organization_roles r
             where r.organization_id = evidence_import_sessions.supplied_by_organization_id
               and r.role_slug = any (case evidence_import_sessions.supplier_role
                 when 'employer'           then array['employer','project_operator']
                 when 'agency'             then array['workforce_provider','recruitment_partner','talent_provider']
                 when 'subcontractor'      then array['workforce_provider','project_operator']
                 when 'training_provider'  then array['training_provider']
                 when 'education_provider' then array['training_provider']
                 when 'placement_provider' then array['training_provider']
                 when 'assessor'           then array['training_provider','verification_provider']
                 when 'client'             then array['client']
                 when 'end_client'         then array['client']
                 when 'project_owner'      then array['project_operator','client']
                 else array[]::text[] end) ) ) );

create policy hist_p3_rows_insert on public.evidence_import_rows
  as restrictive for insert to authenticated
  with check (G(evidence_import_rows.organization_id));
create policy hist_p3_rows_update on public.evidence_import_rows
  as restrictive for update to authenticated
  using (G(evidence_import_rows.organization_id) and evidence_import_rows.status <> 'committed')
  with check (G(evidence_import_rows.organization_id));
create policy hist_p3_rows_delete on public.evidence_import_rows
  as restrictive for delete to authenticated
  using (G(evidence_import_rows.organization_id) and evidence_import_rows.status <> 'committed');

create policy hist_p4_events_insert on public.organization_evidence_events
  as restrictive for insert to authenticated
  with check (
    ( organization_evidence_events.event_type in ('disputed','independently_verified','verification_withdrawn')
      and not public.manages_organization(organization_evidence_events.organization_id) )
    or
    ( G(organization_evidence_events.organization_id)
      and ( organization_evidence_events.actor_organization_id is null
            or organization_evidence_events.actor_organization_id = organization_evidence_events.organization_id )
      and organization_evidence_events.event_type in
            ('attested','attestation_withdrawn','withdrawn','reinstated','corrected','source_preserved')
      and ( organization_evidence_events.event_type <> 'attested'
            or ( organization_evidence_events.actor_organization_id = organization_evidence_events.organization_id
                 and exists (select 1 from public.organization_evidence_records r
                              where r.id = organization_evidence_events.record_id
                                and r.organization_id = organization_evidence_events.organization_id
                                and r.supplier_role = organization_evidence_events.actor_role) ) )
      and ( organization_evidence_events.event_type <> 'source_preserved'
            or ( OA(organization_evidence_events.organization_id)
                 and exists (
                   select 1
                     from public.org_documents od
                     join public.document_files df on df.org_document_id = od.id
                     join public.evidence_import_sessions s
                       on s.source_bytes_sha256 = df.content_sha256
                      and s.organization_id = od.organization_id
                     join public.organization_evidence_records r on r.session_id = s.id
                    where r.id = organization_evidence_events.record_id
                      and od.organization_id = organization_evidence_events.organization_id
                      and od.document_type_slug = 'org_import_source'
                      and od.status = 'active'
                      and od.classification = 'classified'
                      and df.superseded_at is null ) ) ) ) );

create policy hist_p6_parties_insert on public.organization_evidence_parties
  as restrictive for insert to authenticated
  with check (
    G(organization_evidence_parties.organization_id)
    and ( organization_evidence_parties.party_organization_id is null
          or not exists (
            select 1 from public.organization_evidence_records r
              join public.project_clients pc on pc.project_id = r.project_id
             where r.id = organization_evidence_parties.record_id
               and pc.customer_key is not null ) ) );

create policy hist_p7_clients_insert on public.project_clients
  as restrictive for insert to authenticated with check (K);
create policy hist_p7_clients_update on public.project_clients
  as restrictive for update to authenticated using (K) with check (K);
create policy hist_p7_clients_delete on public.project_clients
  as restrictive for delete to authenticated using (K);
-- deliberately NO restrictive SELECT policy on project_clients

create policy hist_p8_import_events_insert on public.evidence_import_events
  as restrictive for insert to authenticated
  with check (G(evidence_import_events.organization_id));

create policy hist_p9_projects_insert on public.projects
  as restrictive for insert to authenticated with check (B);
create policy hist_p9_projects_update on public.projects
  as restrictive for update to authenticated using (B) with check (B);
```

**Recursion check.** PR-3's rolled-back DO block proves this by READING through every policy per actor. Policy presence is not policy reachability (the 42P17 class).

- P1 reads sessions, work_objects and staging rows. None of their policies read records.
- P4 and P5 read records, whose select policy reads `organization_people` and parties. The parties select no longer re-enters records. P5 also reads documents.
- P6 reads records and `project_clients`. The latter's select is the definer `can_manage_project`.
- P7 reads projects.
- P9 reads `organizations`, whose select is owner, member (definer) or admin, and never reads projects.

No cycle.

**Why P9 refuses no create that works today.** `insertProjectForCompany` obtains `organization_id` from `resolveOrganizationIdForCompany`, which reads `organizations` by `legacy_company_id` under the caller's own RLS. P9's subquery performs the same read under the same RLS, so every create the core performs today passes. Existing rows are judged only when updated. The M1 pre-merge check requires 0 rows that violate B.

**Behaviour that must ship FIRST in code (PR-2)** so that legitimate calls never hit 42501 after M1:

- `attestRecord` and `attestSessionRecords` write `actor_organization_id = organization_id` and offer only `[record.supplier_role]`.
- `lifecycleSweep` writes `actor_organization_id = organization_id`.
- The supplier role defaults to `employer` when the org holds it (N1). `other` stays the default when the org declared nothing. A per-row "capacity" column may override the role within P2's map.
- The commit writes a staging row's final state in the single UPDATE that sets `committed`, because P3u makes a committed row immutable afterwards.

Carried unchanged:

- No anon anywhere.
- Every write runs as the authenticated human's own JWT.
- The MCP's authority is the human's OAuth identity.
- `actor_kind 'agent'` and `row_origin 'agent_rows'` are recorded, and exclude verification.
- No service-role write is designed. The service role holds no grants on these tables, and none is added.
- `is_admin()` is not an evidence-write authority. It appears only in P9's branch for platform-admin project maintenance, which exists today.

**Residual risk (stated, not hidden).** An authorised governor of the supplying org who calls PostgREST directly can still stage and commit rows that are not in the file. Those records are NOT verified:

- the preservation module marks only records whose `source_fact` equals the re-parsed row at their index, and whose staging row is committed in that session (§9);
- P5 lets only an owner/admin write the marker.

An owner/admin who bypasses the shipped module through raw PostgREST is making the org's own statement, which is exactly what the basis names. The row-level trace (file sha256, row index, cells as written) lets any reviewer check it. A trusted server-side re-parse held by the database would need grants and a definer path (RED), and is owner option Q6.

---

## 9. Decision 6: source preservation

### 9.1 Intake and storage

- **Intake** computes `sha256(bytes)` for every uploaded file, CSV included. This is plain hex, the same format as `document_files.content_sha256`. It is stored in the new `evidence_import_sessions.source_bytes_sha256` (M1e, GREEN). `source_fingerprint` is unchanged, so a file that was already imported keeps its session.
- **Store.** On an owner/admin's server request (the upload itself, or an explicit "preserve source" action), the bytes go through the EXISTING document engine:
  1. **Look up.** Find an existing document by (org, `document_type_slug = 'org_import_source'`, `external_ref = 'sha256:<hex>'`, `status = 'active'`, `classification = 'classified'`).
  2. **Create if missing.** If none is found, call `create_org_document_v2(type 'org_import_source', classification 'classified', title = filename, external_ref = 'sha256:<hex>')`. It returns `'created'`, not an id, so the module then finds the row by the same key. `'limit_reached'` (500 open documents per org) is shown to the user, never swallowed.
  3. **Upload** to the canonical path.
  4. **Register** with `register_document_file_v1(..., mime 'text/csv' or the xlsx type, ...)`.

  The same bytes are stored once, however many times they are uploaded.

### 9.2 The re-parse gate for `source_preserved`

The marker is written only in the owner/admin's own server request, after these steps:

1. Re-parse the SAME bytes that are held in hand, with the SHIPPED parser (`read-source-file.ts` / `parse-tabular.ts`), into rows keyed by source position.
2. For each committed record of each session of this org whose `source_bytes_sha256` equals the bytes' hash, and which lacks a standing `source_preserved`, it is ELIGIBLE only when all of these hold:
   - `row_origin = 'parsed_file'`;
   - `source_row_index` is not null;
   - `import_row_id` points to a staging row of that session with `status = 'committed'` and `row_index = source_row_index`;
   - `canonicalJson(record.source_fact)` equals `canonicalJson(parsed[source_row_index])` under the same `SOURCE_ROW_FIELDS` projection the commit used.
3. Insert one `source_preserved` event per eligible record, in one statement. P4 and P5 check the document and the owner/admin role at the database.
4. Ineligible records are listed in the batch audit as "not found in the preserved file" (`source_row_mismatch`), because FAILED is not EMPTY. They are never forced.

Consequences:

- **Manager imports.** A manager can neither create classified org documents nor pass OA, so their sessions show "source not preserved (owner/admin needed)" and stay at the attestation tier. When an owner/admin later uploads the same bytes, the gate runs and those records verify with no re-import (fixture step 7).
- **Injected records.** A record injected through raw PostgREST into a preserved session does not match any parsed row, so it stays unverified however often the owner re-uploads (fixture X1, A23).
- **App allowlist.** `lib/documents/document-file-model.ts` `DOCUMENT_FILE_MIME_TYPES` is widened in PR-6 (after M3). The upload path admits `text/csv` and xlsx only for the `org_import_source` type.

### 9.3 Schema (M3, RED)

M3 changes ONE existing SECURITY DEFINER body. The function `register_document_file_v1` hard-codes its own MIME list, so widening only the CHECK and the bucket would still return `'unsupported_type'`, and no timesheet could ever be preserved. The body is reproduced **byte-identical** to [`20260817140000_document_file_layer_v1.sql:554-674`](../../supabase/migrations/20260817140000_document_file_layer_v1.sql) except the MIME list. `SECURITY DEFINER` and `SET search_path = public` are kept. PR-4 must diff this body against production `pg_get_functiondef('public.register_document_file_v1(text,uuid,text,text,text,bigint,text)'::regprocedure)` before apply. If production differs from the repo, the production body is the one reproduced, still with only the list widened, and the PR body shows the diff.

```sql
-- M3 (RED): preserve CSV/XLSX timesheet sources through the existing document engine
-- @human-gate-approved: TIER owner-gated (storage bucket UPDATE is data DML; CREATE OR REPLACE of an existing SECURITY DEFINER function; privilege re-assertion)
begin;

insert into public.document_types (slug, category) values ('org_import_source','organization')
  on conflict (slug) do nothing;

alter table public.document_files drop constraint document_files_mime_type_check;
alter table public.document_files add constraint document_files_mime_type_check check (mime_type in (
  'application/pdf','image/jpeg','image/png','image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv'));

update storage.buckets set allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv']
 where id = 'document-files';

create index if not exists document_files_sha256_idx on public.document_files (content_sha256);

-- The ONE existing definer body that changes: only the MIME list below differs
-- from 20260817140000_document_file_layer_v1.sql:554-674.
create or replace function public.register_document_file_v1(
  p_scope text,
  p_parent_id uuid,
  p_storage_path text,
  p_original_filename text,
  p_mime_type text,
  p_byte_size bigint,
  p_content_sha256 text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid             uuid := auth.uid();
  cleaned_path    text := nullif(trim(coalesce(p_storage_path, '')), '');
  cleaned_name    text := nullif(trim(coalesce(p_original_filename, '')), '');
  cleaned_mime    text := lower(nullif(trim(coalesce(p_mime_type, '')), ''));
  cleaned_sha     text := lower(nullif(trim(coalesce(p_content_sha256, '')), ''));
  wd              public.worker_documents%rowtype;
  od              public.org_documents%rowtype;
  v_worker_id     uuid;
  next_version    int;
  expected_prefix text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_scope not in ('worker','organization') or p_parent_id is null then
    return 'invalid';
  end if;
  if cleaned_name is null or char_length(cleaned_name) > 255 then
    return 'invalid';
  end if;
  if cleaned_mime is null or cleaned_mime not in
       ('application/pdf','image/jpeg','image/png','image/webp',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv') then
    return 'unsupported_type';
  end if;
  if p_byte_size is null or p_byte_size <= 0 or p_byte_size > 5242880 then
    return 'file_too_large';
  end if;
  if cleaned_sha is null or cleaned_sha !~ '^[0-9a-f]{64}$' then
    return 'invalid';
  end if;
  if cleaned_path is null or char_length(cleaned_path) > 1024 then
    return 'invalid';
  end if;

  if p_scope = 'worker' then
    -- Lock the parent so concurrent uploads serialize on one version chain.
    select * into wd from public.worker_documents w
     where w.id = p_parent_id
     for update;
    if wd.id is null or not public.owns_worker_document_v1(wd.id) then
      return 'not_found';
    end if;
    v_worker_id := wd.worker_id;
    select coalesce(max(df.version), 0) + 1 into next_version
      from public.document_files df
     where df.worker_document_id = wd.id;
    expected_prefix := 'worker/' || v_worker_id::text || '/doc/' || wd.id::text
                       || '/v' || next_version::text || '/';
  else
    select * into od from public.org_documents o
     where o.id = p_parent_id
     for update;
    if od.id is null or not public.manages_org_document_v1(od.id) then
      return 'not_found';
    end if;
    if od.status = 'revoked' then
      return 'invalid_state';
    end if;
    select coalesce(max(df.version), 0) + 1 into next_version
      from public.document_files df
     where df.org_document_id = od.id;
    expected_prefix := 'org/' || od.organization_id::text || '/doc/' || od.id::text
                       || '/v' || next_version::text || '/';
  end if;

  if next_version > 50 then
    return 'version_limit_reached';
  end if;
  if position(expected_prefix in cleaned_path) <> 1
     or char_length(cleaned_path) <= char_length(expected_prefix) then
    return 'path_mismatch';
  end if;

  -- Supersede the previous current version — acknowledgements stay bound to
  -- their version row and deliberately do NOT carry over.
  if p_scope = 'worker' then
    update public.document_files
       set superseded_at = now()
     where worker_document_id = wd.id and superseded_at is null;
    insert into public.document_files
        (scope, worker_document_id, version, storage_path, original_filename,
         mime_type, byte_size, content_sha256, uploaded_by)
      values ('worker', wd.id, next_version, cleaned_path, cleaned_name,
              cleaned_mime, p_byte_size, cleaned_sha, uid);
    insert into public.worker_document_events
        (worker_document_id, actor_id, event_type, after_state)
      values (wd.id, uid, 'file_uploaded',
              jsonb_build_object('version', next_version,
                'original_filename', cleaned_name, 'byte_size', p_byte_size));
  else
    update public.document_files
       set superseded_at = now()
     where org_document_id = od.id and superseded_at is null;
    insert into public.document_files
        (scope, org_document_id, version, storage_path, original_filename,
         mime_type, byte_size, content_sha256, uploaded_by)
      values ('organization', od.id, next_version, cleaned_path, cleaned_name,
              cleaned_mime, p_byte_size, cleaned_sha, uid);
    insert into public.org_document_events
        (org_document_id, actor_id, event_type, after_state)
      values (od.id, uid, 'file_uploaded',
              jsonb_build_object('version', next_version,
                'original_filename', cleaned_name, 'byte_size', p_byte_size));
  end if;
  return 'registered';
end $$;
-- Privileges re-asserted unchanged (CREATE OR REPLACE keeps them; restated for determinism).
revoke all on function public.register_document_file_v1(text, uuid, text, text, text, bigint, text) from public;
revoke all on function public.register_document_file_v1(text, uuid, text, text, text, bigint, text) from anon;
grant execute on function public.register_document_file_v1(text, uuid, text, text, text, bigint, text) to authenticated;

commit;
```

- **Class RED.** Four things make it RED: the `update storage.buckets` (the bucket rejects CSV and XLSX at the storage layer, and only an UPDATE of that row changes it), the CREATE OR REPLACE of an existing SECURITY DEFINER function, the privilege statements, and the seed insert. PR-4 lists the definer change and the exact body diff in its description.
- **ROLLBACK** (`.down.sql`). It refuses while any `org_import_source` document, or any `document_files` row with a CSV or XLSX type, exists. Otherwise it:
  - restores the function body byte-for-byte to the 5-type list;
  - restores the previous CHECK and the bucket array;
  - drops the index;
  - deletes the unused slug.
- **Messages.** The slug gets a message in all locales.
- **Limit.** 5 MB per file (owner Q5 if real timesheets are larger). Splitting by year is the fallback.
- **Scope of the wider list.** The database admits CSV and XLSX for any document type. The body must stay byte-identical, so it cannot branch on the type. The app restricts them to `org_import_source` (§9.2, and residual risk in §19).

---

## 10. Decision 7: idempotency, resumable staging, batch rollback

| Object | Key | Behaviour on a repeat |
|---|---|---|
| session | `(organization_id, source_fingerprint)` (exists) | The same bytes under any filename give the same session (`reused: true`). |
| staged row | `(session_id, row_index)`, where `row_index` is the row's position in the SOURCE (PR-2 fix of N3; the MCP passes `startIndex`) | A partial first staging resumes. A full repeat stages 0. |
| committed staged row | status `committed` is immutable (P3u, P3d) | It can be neither rewritten nor deleted. |
| record | `(organization_id, record_fingerprint)` `work-history-record:v1` (exists, unchanged) | 0 new records. An identical row from ANOTHER file is a `duplicate` and is not committed. The same person, day, place and text with different hours is a `conflict`, which blocks that row only. |
| project | `(organization_id, historical_key)` | 0 new projects. |
| customer on project | `(project_id, customer_key)` | 0 new rows. |
| step | `(organization_id, step_fingerprint)` | 0 new steps. |
| party | `organization_evidence_parties_once` (exists) | 0 new rows. |
| preserved document | `(organization_id, 'org_import_source', external_ref 'sha256:<hex>')` | Stored once. |
| `source_preserved` / `attested` events | written only for records that lack a standing one | 0 new events. |
| decisions | `decided` import events `{kind, subject, choice}`; re-reading applies the latest | A repeated decision is a no-op. |

**Batch rollback.** This uses the existing `withdrawImport` / `reinstateImport`, fixed in PR-2, with no RPC:

1. One INSERT statement writes the `withdrawn` (or `reinstated`) event for every record of the session that is not already in the requested state. It is atomic per statement. Errors are returned, never swallowed.
2. Then the `rolled_back` or `reinstated` session event is appended, and CHECKED. A retry after a failure between the two steps is idempotent, because step 1 finds nothing to do.
3. It works with 0 records: a session that committed nothing still gets its session event.
4. A second withdraw returns `already_withdrawn` and writes nothing.

A rollback never deletes or archives entities. **Derived-hidden rule:** a project, customer row, step or object appears in history views only through ACTIVE evidence.

- **Hidden.** When every record that references it is withdrawn (and, for projects and steps, its `created_session_id` is withdrawn), it is hidden from history.
- **Shown in the audit.** The batch audit lists it as "from withdrawn batch S".
- **Restored.** It reappears on reinstate.

Other batches are untouched, because every write is keyed by its own session.

---

## 11. Decision 8: precision (aligned with lane E)

| Source shape | Stored as | Precision |
|---|---|---|
| a dated day row | `activity_date` | exact day |
| an ISO week (`2023-W10`) | `period_start`..`period_end`, Monday..Sunday | exact period (method `iso_week`) |
| a month (`2024-05`, `May 2024`) | first..last day of the month | `derived.datePrecision = month` |
| a period chosen by a person (time-semantics decision) | lane E `periodFromHumanInput`: two months or two days | month (`interpreted_period`), never a monthly figure |
| a start date alone | refused (lane E) | never a one-day period |
| no date | not staged: `skipped_source_row` | never today's date |

**Hours.** NULL means unknown, never 0. A `?`, an empty cell or an unreadable cell becomes NULL, with the notice `unreadable_source_value` or `missing_source_value`. 0 is used only when the source states 0.

**Subtotal rows** (pure `source-subtotals.ts`). Suppose a session has a period row P (person p, window W, hours h, and object o when stated) and ALSO has day rows of p (at o, if stated) inside W. Then P is a SUBTOTAL, not a work fact:

- If the day rows sum to h (to 0.01) and none is NULL, P gets status `skipped` and the notice `source_subtotal_consistent`.
- Otherwise P goes to review as `source_subtotal_mismatch` (choice `skip_total`). The day rows commit regardless.
- A period row with no covered day rows is a `period_total` record.

**No distribution, ever.**

- Day and week cells show day records only.
- A month, year, step or project bucket includes a period record only when the record's whole window lies inside it.
- A period that crosses buckets is ONE band, with its total and precision.
- Every total carries its breakdown by class, for example "exact days 243 h · 1 day with unknown hours".
- The v3 projections never call `projectPeriodAggregateByMonth`.
- Lane E's labelled even share for `source_period` is not rendered on any historical surface (owner Q3).
- Historical hours are a third ledger. They are never summed with journal hours or allocations.

**Dependency.** Lane E merges before PR-5. v3 reuses lane E's `time-semantics.ts` and `period-provenance.ts`, and adds only the week and month parsing and the subtotal rule.

---

## 12. Pipeline changes (ONE pipeline: `import-core.ts`)

| Stage | Change | PR |
|---|---|---|
| Intake (`read-source-file.ts`, `import-actions.ts`) | Compute `sha256(bytes)` for every file. Add header synonyms for Customer, Customer code, Period (week/month) and Object/Address (at least lt/en/nl/de/pl). `row_origin` = `parsed_file` (web), `agent_rows` (MCP) or `typed`. | PR-2 (hash), PR-5 (headers) |
| `SourceWorkRow` | Additive: `customerLabel`, `customerCode`, and `SOURCE_ROW_FIELDS` gains both. Week and month periods set `derived.datePrecision`. | PR-5 |
| Session | Supplier role precedence puts `employer` first (N1), and `other` stays the default when the org declared nothing. MCP `create_session` requires an explicit fingerprint. | PR-2 |
| Stage | `row_index` = source position; MCP `startIndex`. | PR-2 |
| Preview: person | The ladder is unchanged. A partial match is `ambiguous` in historical sessions. | PR-2 |
| Preview: object/address | Uses `work-context.ts` `resolvePlace` (exists). New objects are created through `create_work_object_v1` WITH `address_line`/`city` when `address-split:v1` is certain (`"<street> <number>, <City>"`), and by name only otherwise. `country` is set only when stated. The name is the first-seen spelling. | PR-5 |
| Preview: customer | `customer-key.ts` (§4), reading keyed `project_clients` rows, which managers can read. | PR-5 |
| Preview: project | `historical_key` lookup. The owner reads `projects`. A manager goes through `project_clients` and steps, both of which managers can read. A new project becomes an owner/admin plan item. | PR-5 |
| Preview: subtotal | `source-subtotals.ts` | PR-5 |
| Preview: ordered work | `ordered-work.ts` over active records and the rows that can be committed | PR-6 |
| Review | Grouped IssueKinds (table below); `decided` events are CHECKED. | PR-5 / PR-6 |
| Commit | In plan order: people → objects → projects (through `insertHistoricalProjectForCompany`) → customer rows → records (with `project_id`, `source_row_index`, `row_origin`, `derived.personResolution`) → parties (label only) → steps → attestation (paged; the 1000 cap is removed) → preservation (§9.2). The staging row's final state is written in the one UPDATE that sets `committed`. | PR-5 / PR-6 |
| Live-reader isolation | `.is("historical_key", null)` on every live reader, the by-id historical mode, and G-HIST-1 (§5.2) | PR-5 |
| Rollback | §10 | PR-2 |

Grouped review. Each question is asked once per label or group, and blocks only its own rows.

| IssueKind | Class | Blocks |
|---|---|---|
| `ambiguous_person` | question | its rows |
| `ambiguous_customer` / `customer_name_uncoded` | question | its rows |
| `project_needs_owner_admin` | notice to a manager | its rows |
| `conflict` (existing) | question: keep existing / correct | its row |
| `source_subtotal_mismatch` | question: skip total | the total row |
| `ordered_work_split_uncertain` / `repeat_work_after_gap` / `ordered_work_step_contradicted` / `scope_label_variant` | question | step creation only |
| `same_name_different_code`, `customer_not_identified`, `source_subtotal_consistent`, `skipped_source_row`, `unreadable_source_value`, `missing_source_value`, `source_row_mismatch` | notice | nothing |

---

## 13. Decision 9: views (reuse; one pure projector)

`lib/organization-evidence/historical-graph.ts` is pure. From what the viewer can read, it builds the chain:

customers (by `customer_key`) → historical projects → steps (with computed membership and `ORDER_DETAILS_NOT_ON_RECORD`) → objects and addresses (source spellings) → workers → dates and periods at their precision → work → hours by class → standing and basis.

- **Bounded reads.** Reads are per org, per year window, paginated and indexed (`pow_project_idx`, and records `(organization_id, project_id)`).
- **Trace.** Every rendered fact carries its session, file name, file sha256, `source_row_index` and the cell exactly as written.

| View | Where (existing component) | Content |
|---|---|---|
| Project / object history | `components/app/historical/historical-objects.tsx` (Objects mode of `HistoricalWorkspace`), and History mode of `/dashboard/projects/[id]` (no live controls, §5.2) | Customer → ordered work (the initial step, then each additional step on a time axis with its first-evidenced date and "derived from timesheet chronology") → object and address (all source spellings) → workers → dates → work → hours per step, per precision class. Status NULL shows "status not on record". The step shows "Order details: not on record". |
| Supplying-org view | `HistoricalWorkspace` on `/dashboard/company` (overview / people / field / objects / calendar / attention) | Adds a Customers lens on `historical-overview.tsx`, and the batch audit (SOURCE) with withdraw, reinstate, "from withdrawn batch S" and "not found in the preserved file". |
| Worker history (company side) | `components/app/people/person-imported-history.tsx` on `/dashboard/people/[workerId]` | Per customer and object: spans, hours by class, steps, standing and basis. |
| Worker history (own) | `/dashboard/profile` `OrganizationEvidenceSection` + `work-world/primitives.tsx` (`PeriodBand` span + total) | Own records, the customer label (masked unless an organization), object, dates, hours, and "Verified historical work · organization timesheet" with the supported facts marked. |
| Living CV comparison | A collapsed section on `/dashboard/profile` (subject only) and on the company person page (managers) | Two columns computed from data: the traditional CV line (the worker's own CV/work-card entry, as written) and the evidence-backed lines (supplier → customer → object → span → work → hours by class → standing). Differences are listed as facts, for example "CV says 2022–2023; records span 2023-03-06 – 2023-07-03". No score, no percentage, no rating. |

- **Managers.** A manager cannot read `projects`. The manager's views name a project by customer and object, and say "project title visible to owner/admin". FAILED is not EMPTY.
- **Workers.** The worker never sees steps or other workers.
- **A-09.** Each new section carries the five-answer declaration.

---

## 14. Schema changes (complete list)

| Id | Change | Class | Why needed |
|---|---|---|---|
| M1a | `projects`: unique `(id, organization_id)`; add `historical_key` and `created_session_id` (composite FK to sessions); partial unique `(organization_id, historical_key)`; CHECK `historical_key is null or (created_session_id is not null and organization_id is not null)` | GREEN | an idempotent historical project and the discriminator; tenant-safe FKs from records and steps; no squatting |
| M1b | `work_objects`: unique `(id, organization_id)` | GREEN | composite FK from steps |
| M1c | `project_clients`: add `customer_key`, `customer_code`, `customer_kind` (CHECK) and `created_session_id` (FK to sessions); unique `(id, project_id)`; partial unique `(project_id, customer_key)` | GREEN | customer identity without a new register |
| M1d | `organization_evidence_records`: add `project_id` (composite FK to projects, NO ACTION), `source_row_index int` and `row_origin text` (CHECK `parsed_file`, `agent_rows`, `typed`); index `(organization_id, project_id)` | GREEN | every hour row connected to its customer-ordered work; row-level provenance; eligibility for verification |
| M1e | `evidence_import_sessions`: add `source_bytes_sha256` (CHECK hex64) | GREEN | binds the file bytes to preservation |
| M1f | `evidence_import_rows`: add `row_origin`, `customer_label`, `customer_code`, `customer_key` and `project_id` | GREEN | resolution state in staging |
| M1g | `evidence_import_events` event_type CHECK widened with `decided` | GREEN (drop and re-add) | a checked decision log |
| M1h | `organization_evidence_events` event_type CHECK widened with `source_preserved` | GREEN (drop and re-add) | a preservation marker the subject can read |
| M1i | restrictive policies P1, P2, P3i/u/d, P4 (with P5), P6, P7i/u/d, P8, P9i/u (§8) | GREEN (CREATE POLICY, narrowing; no `(true)` predicate) | the authorization fixes of §8 |
| M2 | `project_ordered_work` table, RLS and grants (§5.3); no order-detail or money columns | RED | one relation for initial and additional ordered work. A new table needs GRANT because `public` has no default privileges. |
| M3 | `org_import_source` type; `document_files` MIME CHECK widened (csv, xlsx); bucket `allowed_mime_types` UPDATE; sha256 index; **CREATE OR REPLACE `register_document_file_v1` with only the MIME list widened** (§9.3) | RED | preservation of the original timesheet. The bucket UPDATE is data DML, and the definer body changes. |

Nothing drops, loosens or rewrites existing data. The 158 existing records and their events are not touched. **No new SECURITY DEFINER function, no trigger and no service-role grant is added. Exactly one existing definer body changes: `register_document_file_v1`, and only its MIME list, in M3 (RED).**

M1 checks before merge (PR-3). All are read-only on production:

1. `organization_roles` of every org that has an evidence session today (only `19f47e78`) satisfies P2 for its sessions' `supplier_role`.
2. There are 0 sessions with `supplier_role in ('public_body','sector_body')`.
3. There are 0 `projects` rows that violate B (P9): `organization_id is not null and not exists (organizations o where o.id = organization_id and o.legacy_company_id = company_id)`. Any such rows go to an owner data decision first.
4. `attestRecord` from PR-2 is on production.
5. The commit writes the staging row's final state in one UPDATE (PR-2 pin).
6. A rolled-back DO block proves the legitimate owner and manager paths, a live project create through the core, and every negative control of fixture T14, by reading through each policy per actor.

ROLLBACK for M1: drop the policies, indexes, constraints and new columns (it refuses while any new column is non-null) and restore the two CHECKs.

---

## 15. PR plan (storage lands before the code that writes it)

| PR | Scope | Class | Depends on |
|---|---|---|---|
| PR-1 | Docs: this design and the fixture spec, registered as SUPPORTING in the §9 registry of `OWNER_TARGET_ARCHITECTURE_V1.md`. The v2 commercial approach is recorded as SUPERSEDED by decision A. | GREEN | none |
| PR-2 | Code only: the `computePreview` / `buildCommitRows` seams, and an `EvidenceStore` port with a memory adapter; the fixture v3 skeleton (targets as `it.todo`, current-behaviour pins green); resumable staging (`row_index` = source position, MCP `startIndex`, explicit MCP fingerprint); N1 employer-first with `other` kept; attest and withdraw write `actor_organization_id` and offer only the record's supplier role; paged attestation; checked, zero-record-safe rollback; the commit writes the final staging state in one UPDATE; intake computes `sha256(bytes)`; a partial person match in a historical session is ambiguous. | GREEN | lane E merged |
| PR-3 | Migration M1: columns, keys, the historical CHECK, CHECK widening, and the restrictive policies P1–P9 (§8), with P7 split and no SELECT restriction. It is applied to production through the GREEN path and verified in the ledger BEFORE PR-5 merges. | GREEN | PR-2 on production |
| PR-4 | Migrations M2 + M3 in two files behind one human gate. The body carries the exact SQL, the policy diff and the `register_document_file_v1` body diff against production. | RED: draft + `needs-human-gate`. M2 is RED because a new table needs GRANT. M3 is RED because of `update storage.buckets` and the definer body. | PR-3 applied |
| PR-5 | Feat: customer key and resolution; the project, customer-row and parties writer (the project through `insertHistoricalProjectForCompany` in the one create core, status NULL/`completed`, parties label-only); **live-planning isolation (the reader filters of §5.2, the by-id historical mode, G-HIST-1)**; G-HIST-2; G-PARTY-1; address pass-through to `create_work_object_v1`; records `project_id`/`source_row_index`/`row_origin`; week and month parsing; the subtotal rule; grouped review kinds; checked `decided` events | GREEN | PR-3 applied |
| PR-6 | Feat: `ordered-work.ts`, the step writer, and the split, repeat and contradiction decisions; the preservation module with the re-parse gate (§9.2) and `source_preserved`; `DOCUMENT_FILE_MIME_TYPES` widened for `org_import_source` only; the `HISTORICAL_WORK_VERIFIED` derivation, facts and copy (all locales); the SEP-3 re-anchor; G-VER-1/2; G-TS-1 (with the one allow-listed constant) | GREEN | PR-4 applied, PR-5 |
| PR-7 | Feat: `historical-graph.ts` with `ORDER_DETAILS_NOT_ON_RECORD`; the project/object, supplying-org, worker and Living-CV comparison views in the existing components | GREEN | PR-6 |
| OWNER ACT | The real import (§16) | owner | PR-7 on production |

Every RED PR is opened as a draft with `needs-human-gate`, carries the SQL and the policy diff in its body, and is applied via MCP `apply_migration` after approval (never `db push`), with the ledger verified afterwards. Each migration bumps the three count ratchets.

---

## 16. Real import procedure (owner act; automation never commits real data)

### 16.1 Preconditions

- PR-1 to PR-7 are merged.
- M1, M2 and M3 are applied and verified in the ledger.
- The synthetic fixture is green in Layer P and Layer D.
- The owner has answered Q1–Q2 (thresholds, legacy drafts) before the first commit.

### 16.2 Who: an authorised session of the supplying organization

The real import runs through the SAME product pipeline as every other import: the web upload on `/dashboard/company` → evidence import. It runs in an authenticated session of a human who governs the supplying org (`20b2c802`):

- **The owner, or an admin member.** Only they can create historical projects and preserve the source (P5 requires OA).
- **The platform admin**, only through an active owner or admin membership of the supplying org. `is_admin()` on its own passes no evidence-write policy, and this design does not make it one. If the platform admin holds no such membership, the owner grants one through the existing membership flow before the import.
- **A manager** may upload and answer questions. But rows that need a new project wait for the owner or admin, and so does source preservation.

Every write carries that human's own JWT. `imported_by_profile_id`, `created_by` and the event actors name that human, and the batch audit shows them.

### 16.3 Path A: the owner's own session

For each timesheet file (xlsx or csv, at most 5 MB; split larger ones by year):

1. The owner signs in themself, sets the active workspace to the supplying org, and uploads the file. The capacity is `employer`.
2. Read the preview: row counts, skipped rows, subtotals and the grouped questions.
3. Answer the questions: people, customers, objects, uncertain ordered-work splits and conflicts. Anything unknown stays unanswered. Those rows remain in staging, and nothing is guessed.
4. Sign the plan (people / objects / projects with the status the owner states, or none / customer rows / steps), then commit.
5. Attest the session as `employer`. The source is preserved automatically, because this is an owner upload: the re-parse gate marks the matching records.
6. Check the views: customer → ordered work → object → workers → hours. Every figure opens its source row, and "not found in the preserved file" must be empty.

### 16.4 Path B: operator-assisted, inside that authorised session

An operator may assist. The operator is a person, or an assistant driving the browser pane, and works INSIDE the session that the owner or admin opened and signed into themself.

- **Credentials.** The operator never receives, types or stores that human's credentials, and never uses another identity.
- **What the operator may do.** Open the import page, upload the file the owner provided, read the preview back to the owner, and draft answers to the grouped questions for the owner to confirm.
- **What only the owner or admin does.** Each decision, the plan signature, the commit and the attestation. The operator does not press them.
- **Records.** Because every write carries the authorised human's JWT, the records say who imported them. The operator's assistance is noted in the owner's walk notes.

### 16.5 Never

- The service-role key, or any service-role path.
- Supabase MCP `execute_sql` or `apply_migration` used to write data.
- Scripts calling PostgREST with a copied JWT.
- MCP `submit_rows` or typed rows for anything that should verify. Agent rows never verify.
- Importing the 2025 period that the 158 existing records already cover without the owner's explicit choice (Q4).

### 16.6 Import rules

- **Idempotent by construction.** Re-uploading a file is safe (0 duplicates). A wrong batch is withdrawn as a whole from the batch audit and can be reinstated.
- **Order.** Import the earliest files first, so later files add ADDITIONAL ordered work instead of raising contradictions. Where possible, import all files of one object before signing its steps.

### 16.7 After the import

Record a read-only `SELECT` count check in the owner's walk notes: records, projects (all with `historical_key`), steps, and the verified count per session. Also confirm that live planning and workforce show 0 historical projects. Automation changes no data.

---

## 17. Owner questions (open; each has a recommended default)

1. **Thresholds** `GAP_DAYS 21`, `LATE_START_DAYS 28`, `REPEAT_GAP_DAYS 90`. Keep them, or calibrate them on the first real file's PREVIEW (no commit)? Recommended: calibrate on the preview.
2. **The supplying org's 4 legacy draft projects and 3 name-only `project_clients` rows.** Are they test residue to leave untouched, or real customers to adopt? Recommended: leave them untouched. v3 never reads them, because `historical_key` and `customer_key` are NULL.
3. **Lane E's labelled even monthly share for source periods.** v3 never renders it on historical surfaces. Keep it elsewhere, or remove it everywhere?
4. **Overlap with the 158 existing records** (2025). Exclude that period from the import, or import it and let the linked person see both organizations' records? Recommended: exclude it.
5. **Private-person customers.** Mask them on every worker-visible surface unless the customer is an organization, or show them as written? Recommended: mask them.
6. **Tamper evidence against the org's own governors.** Accept the organization-timesheet basis as the org's statement, with the row-level trace and the re-parse gate? Or later add a server re-parse held by the database, which is RED (service-role grant + definer)? Recommended: accept the basis.
7. **`public_body` / `sector_body` as supplier roles.** No capability slug exists for them, so P2 refuses them. Add the slugs, or keep refusing? Recommended: keep refusing until an owner decision names the capability.

---

## 18. Non-goals

- Invoices, payments, payroll, settlement, money columns, finance links and payment-based verification (decision A).
- Order documents, order-detail or change-order columns, and change-order documents.
- A second order or client register, and customer organizations created for customers that are not on the platform.
- Customer re-confirmation, client attestation flows, and independent verification by customers.
- Distributed or invented values: per-day or per-month shares, inferred hours, dates, customers, order dates, prices or quantities.
- Historical writes into `journal_entries`, `work_hour_allocations`, `timesheets`, `customer_requests`, `agreements`, `proposals`, `contracts`, `project_stages`, `project_worker_assignments`, tasks, assets or `finance_records`.
- Any live status (`draft`, `live`, `paused`) on a historical project, and any historical project in live planning, workforce, lists, counts or the map.
- AI in the deterministic core, and any new AI egress grant.
- Touching the 158 existing records, real data in fixtures (the repo is PUBLIC), and automation that commits real data.
- Ratings, scores, stars and completeness percentages.

## 19. Remaining risks (carried, not hidden)

- **Erasing the owner deletes objects.** `work_objects.created_by` is NOT NULL with CASCADE from profiles. Erasing the owner who created objects deletes them, and sets `work_object_id` to NULL on steps and records (SET NULL). A separate RED fix exists, and is not in this scope.
- **Customer not in the fingerprint.** `record_fingerprint` v1 does not include the customer, so two rows that differ only in the customer collide as `duplicate` and go to review. The formula is not changed, because that would break existing idempotency.
- **A late file can contradict a step.** Steps are recorded once. A contradiction is surfaced (`ordered_work_step_contradicted`) and resolved only by an explicit superseding row.
- **Revoking a preserved document does not revoke verification.** `source_preserved` events already written stay, so verification persists until a record is withdrawn. A later slice may add a `source_unpreserved` event.
- **Limits.** 5 MB per preserved file, 500 objects per org, 500 open documents per org, and 2,000 customers read per resolution.
- **PostgREST bypass by an owner/admin.** An owner or admin who bypasses the shipped module through raw PostgREST can write `source_preserved` on records that are not in the file. That is the org's own statement, and it is traceable (§8 residual, Q6). A manager cannot, because of OA.
- **Re-keying by the owner.** RLS cannot compare old and new values, so an owner can UPDATE `projects.historical_key` or `created_session_id` through raw PostgREST. G-HIST-2 keeps every code path from doing so. A re-keyed project breaks only its own idempotency: the next import creates a new project and the old one stays visible in history. A database guard would need a trigger, and is a later slice if the owner wants one.
- **Live writers can target a historical project.** A caller who knows a historical project's id can still call a live writer on it (`assign_worker_to_project`, `set_project_status_v1`). No surface offers that (§5.2). A database refusal would change definer bodies (RED).
- **CSV/XLSX on any document type.** Because the M3 body stays byte-identical, the database admits CSV and XLSX for every document type. A direct RPC caller who manages a document could register a CSV against another type. The file stays in the private bucket, under that org's own document, and the app admits the types only for `org_import_source`.
- **Managers do not see project titles.** Managers see the customer and object, but not the project title (projects RLS).

---

## 20. Review trace (where each verification finding is folded in)

| Severity | Finding | Corrected design |
|---|---|---|
| HIGH | Preservation could not register CSV/XLSX: `register_document_file_v1` has its own MIME list. | §9.3 M3: CREATE OR REPLACE with the widened list, body otherwise byte-identical, SECURITY DEFINER and search_path kept; §14 statement on the one changed definer; §9.2 app allowlist in PR-6; fixture A27 |
| HIGH | P7 as `FOR ALL` restricted SELECT and broke manager resolution. | §8 P7i/P7u/P7d, no SELECT restriction; §4 rule 5; fixture positive control (manager reads C1) |
| HIGH | Historical projects leaked into live planning. | §5.1 (status NULL/`completed`, discriminator), §5.2 (reader inventory, filter, by-id mode, G-HIST-1), §12, §15 PR-5; fixture T17 |
| MEDIUM | Eight never-writable order-detail columns. | §5.3 (dropped), §5.4 (`ORDER_DETAILS_NOT_ON_RECORD`), §7 G-TS-1 allow-list; fixture T3 |
| MEDIUM | `projects.organization_id` not bound to the company. | §8 P9i/P9u, §5.1 and M1a CHECK; fixture A22 |
| MEDIUM | P6 removed the party-verify path for every record. | §8 P6, scoped to records in a historical customer-ordered work; G-PARTY-1; fixture A25 plus the party-verify positive control |
| MEDIUM | P2 refused `other` and unmapped roles. | §8 P2 map (`other` always admitted; `placement_provider`/`assessor` mapped; `organization_roles.role_slug`); Q7; fixture A26 |
| MEDIUM | A manager could get fabricated rows verified through the preservation sweep. | §9.2 re-parse gate, §8 P1 `row_origin` binding, P5 OA; fixture X1/A23/A24 |
| MEDIUM | Committed staging rows could be rewritten, then deleted. | §8 P3u/P3d, §10, PR-2 single-UPDATE commit; fixture A15 |
| LOW | `projects` has no DELETE grant; status has no default. | §2, §5.1, §5.3 (42501); fixture A21 |
| LOW | P5 ignored the document's status and classification; the document id and cap; owner re-keying. | §8 P5 (active + classified + OA), §9.1 (`external_ref` lookup, `limit_reached`), G-HIST-2, §19; fixture A28/A29 |
