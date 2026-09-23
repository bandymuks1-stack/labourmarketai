# Historical timesheets with ordered work: synthetic acceptance fixture v3

| | |
|---|---|
| **Status** | SUPPORTING. This is the acceptance fixture for [`historical-timesheet-import-v3.md`](historical-timesheet-import-v3.md). **It is NOT THE CANONICAL ARCHITECTURE** (see [`docs/OWNER_TARGET_ARCHITECTURE_V1.md`](../OWNER_TARGET_ARCHITECTURE_V1.md)). |
| **Date** | 2026-09-23 |
| **Replaces** | The v2 fixture draft (never committed). Its order, invoice, payroll and payment sources are dropped by owner decision A. |
| **Scope** | Targets T1–T18. The authorization contracts (T14) include the controls for the three HIGH corrections: CSV registration (A27), the P7 split with manager SELECT kept, and live-planning isolation (T17). |

**The repo is PUBLIC.** Everything below is SYNTHETIC:

- Organizations, people, customers, codes, addresses and bytes use only the tokens `Fixture`, `Fixtura`, `Fixturos`, `Fixtuur` and `Gama`, plus the NATO alphabet.
- Registration codes are in the `9990000xx` range.
- The streets do not exist. City names are real only so that the address split can be exercised.
- No real organization, person or customer data appears, and no production identifier appears.
- Email claims use the actor key as the local part at the reserved domain `fixture.invalid` (RFC 2606).
- All UUIDs are RFC-4122 v4 (version nibble `4`, variant `8`) with the prefix `0f1e7300-0000-4000-8000-`, written `...` below.

---

## 0. Layers and files

```
apps/web/lib/organization-evidence/
  historical-timesheet-acceptance.test.ts     # Layer P (vitest; lib/**/*.test.ts)
  testing/memory-store.ts                     # MemoryEvidenceStore (test-only, guarded from prod import)
  __fixtures__/historical-timesheet-v3/
    actors.ts      # section 1
    sources.ts     # section 2 (exact bytes, exported with their filenames)
    script.ts      # section 3 (intake, decisions, commits, attestations, preservation, rollback, adversarial)
    expected.ts    # section 4 numbers + per-viewer counts for Layer X
    snapshot.test.ts / contracts.seed.sql / contracts.sql   # Layers X and D
apps/web/lib/guards/historical-project-isolation.test.ts   # G-HIST-1 (T17 static half)
```

- **Layer P** (pure, no DB). The SHIPPED orchestration runs on `MemoryEvidenceStore`: `createImportSession`, `submitRows`, `buildPreview`, decisions, `commitImport`, attestation, preservation with the re-parse gate, withdraw/reinstate, `deriveEvidenceStanding`, `ordered-work.ts`, `historical-graph.ts`, and the live project projections. The store implements:
  - every unique key and every ON CONFLICT ignore;
  - the absence of UPDATE and DELETE on evidence tables and steps;
  - the immutability of committed staging rows;
  - a VIEWER projection of the design's read rules.
- **Layer D** (DB). One DO block via MCP `execute_sql`, aborted by RAISE so it leaves zero residue.
  - Before M1, M2 and M3 exist in production, it first runs the migration bodies (a rolled-back DDL proof).
  - For each actor it sets `request.jwt.claims` (`sub`, `role`, `email`) and `set local role authenticated`.
  - It READS THROUGH every touched table per actor (one SELECT per table per actor), because policy presence is not policy reachability (the 42P17 class).
- **Layer X**. `contracts.seed.sql` is generated from the Layer P end state. `contracts.sql` loads it and asserts that the per-viewer row counts equal `expected.viewerCounts`.

Tags: `[P]`, `[D]`, `[X]`. Assertions are `it.todo` until the PR that delivers them (design §15). Section 5 lists the current-behaviour pins that stay green until then.

---

## 1. Actors (`actors.ts`)

| Key | Kind | UUID | Facts |
|---|---|---|---|
| FX | organization | `...000000000001` | "Fixture Timesheets FX". `organization_roles` = `employer`, `workforce_provider` (the same pair the real supplying org holds). `legacy_company_id` = CFX. |
| FY | organization | `...000000000002` | "Fixture Other Org FY". Role `employer`. `legacy_company_id` = CFY. Used for cross-tenant negative controls. |
| FZ | organization | `...000000000003` | "Fixture Party Org FZ". Role `client`. Used for the party-verify positive control. |
| FN | organization | `...000000000004` | "Fixture No-Roles FN". NO declared roles. Used for the `other` positive control. |
| CFX / CFY | company | `...000000000401` / `...000000000402` | Owned by O-Oscar / Y-Yankee (`owns_company` true). |
| O-Oscar | profile | `...000000000101` | FX membership `owner` (active). |
| M-Mike | profile | `...000000000102` | FX membership `manager` (active). G(FX) is true; `owns_company` and OA(FX) are false. |
| E-Eve | profile | `...000000000103` | FX membership `external_manager` (active). `manages_organization` is true; G(FX) is false. |
| P-Alpha | profile | `...000000000104` | Worker W-Alpha, with no membership. Own CV/work-card line seeded: "Fixture Timesheets FX · facade worker · 2022–2023". |
| X-Xavier | profile | `...000000000105` | FY membership `manager`. |
| Y-Yankee | profile | `...000000000106` | FY membership `owner`; owns CFY. |
| Z-Zulu | profile | `...000000000107` | FZ membership `manager`. |
| N-November | profile | `...000000000108` | FN membership `owner`. |
| W-Alpha / W-Oscar | workers | `...000000000201` / `...000000000202` | Profiles P-Alpha / O-Oscar. |
| OY / PY | FY object / FY project | `...000000000501` / `...000000000601` | "Fixtura Other Site". The project of FY (negative controls). |
| PL | FX live project | `...000000000602` | "Fixture Live Project". Seeded through the ONE create core as O-Oscar: `status 'draft'`, `historical_key` NULL. It carries LC, a legacy name-only `project_clients` row (`customer_key` NULL). |

Roster seeded in FX (`organization_people`):

- PA `...301`: "Person Alpha" `EMP-001`, linked, `worker_confirmed`, P-Alpha.
- PO `...306`: "Owner Oscar" `EMP-000`, linked, O-Oscar.
- PD1 `...304`: "Person Delta One".
- PD2 `...305`: "Person Delta Two".

The script creates PB "Person Bravo" `EMP-002` and PC "Person Charlie" (no reference).

Layer D seed only, NOT part of the P0 end state or its counts: session S0 (FX, typed, `supplier_role employer`) with one non-historical record R0 (PA, 2023-02-01, 8 h, no project). It is used only for the party-verify positive control.

Expected created entities (these keys are used below):

| Key | Entity | Identity |
|---|---|---|
| C1 | customer | key `code:--:999000001`; `project_clients.name` "UAB Fixtura Alfa"; kind `organization` |
| C3 | customer | key `code:--:999000005`; name "UAB Fixtura Alfa" (SAME name, DIFFERENT code) |
| C2 | customer | key `name:fixtura wonen`; name "Fixtura Wonen B.V."; kind `organization` (legal-form token) |
| O1 | object | name "Fixturos g. 3, Vilnius"; `address_line` "Fixturos g. 3"; `city` "Vilnius"; `country` NULL |
| O1b | object | "Fixturos g. 5, Vilnius" (a different house number, so never merged with O1) |
| O2 | object | "Fixtuurstraat 12, Utrecht"; `address_line` "Fixtuurstraat 12"; `city` "Utrecht" |
| O4 | object | "Sandėlis" (name only, no address) |
| PR1 | project | `historical_key` `hp:v1:code:--:999000001|<O1>`; title "UAB Fixtura Alfa · Fixturos g. 3, Vilnius"; status `completed` (stated in the signed plan); start/end NULL |
| PR3 | project | C3 × O1b; status `completed` (stated in the plan) |
| PR2 | project | C2 × O2; status **NULL** (the plan states none) |

---

## 2. Sources (`sources.ts`)

UTF-8, `;`-delimited, with a header row. RFC-4180 quoting is honoured. Each source is exported with its filename.

### S1 `fx-timesheet-2023.csv` (37 data rows; daily rows + week totals; owner upload)

```
Worker;Personnel no;Date;Period;Hours;Customer;Customer code;Object;Work performed
```

| # | Worker | No | Date | Period | Hours | Customer | Code | Object | Work |
|---|---|---|---|---|---|---|---|---|---|
| 1–5 | Person Alpha | EMP-001 | 2023-03-06..10 | | 8 | UAB Fixtura Alfa | 999000001 | Fixturos g. 3, Vilnius | Facade work |
| 6–10 | Person Alpha | EMP-001 | 2023-03-13..17 | | 8 | Fixtura Alfa, UAB | 999000001 | Fixturos g 3 | Facade work |
| 11–15 | Person Alpha | EMP-001 | 2023-03-20..24 | | 8 | UAB „FIXTURA ALFA“ | 999000001 | Fixturos gatvė 3 Vilnius | Facade work |
| 16–20 | Person Bravo | EMP-002 | 2023-03-06..10 | | 8 | UAB Fixtura Alfa | 999000001 | Fixturos g. 3, Vilnius | Facade work |
| 21 | Person Charlie | | 2023-03-08 | | 9 | UAB Fixtura Alfa | 999000001 | Fixturos g. 3, Vilnius | Scaffolding |
| 22 | Person Charlie | | 2023-04-05 | | 6 | UAB Fixtura Alfa | 999000001 | Fixturos g. 3, Vilnius | Window sills |
| 23 | Person Charlie | | 2023-04-06 | | `?` | UAB Fixtura Alfa | 999000001 | Fixturos g. 3, Vilnius | Window sills |
| 24–28 | Person Bravo | EMP-002 | 2023-05-15..19 | | 8 | UAB Fixtura Alfa | 999000001 | Fixturos g. 3, Vilnius | Balcony slabs |
| 29 | P. Delta | | 2023-03-09 | | 8 | UAB Fixtura Alfa | 999000001 | Fixturos g. 3, Vilnius | Cleanup |
| 30 | Person Bravo | EMP-002 | (empty) | | 8 | UAB Fixtura Alfa | 999000001 | Fixturos g. 3, Vilnius | Facade work |
| 31 | Person Alpha | EMP-001 | | 2023-W10 | 40 | UAB Fixtura Alfa | 999000001 | Fixturos g. 3, Vilnius | Week total |
| 32 | Person Alpha | EMP-001 | | 2023-W11 | 42 | UAB Fixtura Alfa | 999000001 | Fixturos g. 3, Vilnius | Week total |
| 33 | Person Bravo | EMP-002 | 2023-03-13 | | 8 | UAB Fixtura Alfa | 999000005 | Fixturos g. 5, Vilnius | Facade work |
| 34 | Person Alpha | EMP-001 | 2023-03-27 | | 8 | Fixtura Alfa | | Fixturos g. 3, Vilnius | Facade work |
| 35 | Person Charlie | | 2023-03-29 | | 7 | Fixtura Alfa | | Fixturos g. 9, Vilnius | Cleanup |
| 36 | Person Alpha | EMP-001 | 2023-03-30 | | 8 | | | Sandėlis | Warehouse tidy-up |
| 37 | Owner Oscar | EMP-000 | 2023-03-20 | | 4 | UAB Fixtura Alfa | 999000001 | Fixturos g. 3, Vilnius | Site supervision |

Rows are written one per line in `sources.ts`, in this order, with weekday dates only in the ranges. Source positions are 0-based (`#` minus 1). Intake happens three times:

1. Upload #1, with the store fault-injected after the first staged batch (`MAX_ROWS_PER_SUBMIT` = 10 in the test).
2. Upload #2, identical bytes.
3. Upload #3, identical bytes named `fx-timesheet-2023 (copy).csv`.

### S2 `fx-daily-report-2023-03.csv` (2 rows; a second, independent file; owner upload)

```
Date;Employee;Personnel no;Site;Customer;Customer code;Hours;Task
2023-03-08;Person Alpha;EMP-001;Fixturos g. 3, Vilnius;UAB Fixtura Alfa;999000001;9;Facade work
2023-03-09;Person Alpha;EMP-001;Fixturos g. 3, Vilnius;UAB Fixtura Alfa;999000001;8;Facade work
```

### S3 `fx-monthly-totals-2024.csv` (5 rows; monthly and weekly totals; owner upload)

```
Worker;Personnel no;Period;Hours;Customer;Object;Work performed
Person Charlie;;2024-05;160;Fixtura Wonen B.V.;Fixtuurstraat 12, Utrecht;Interior finishing
Person Charlie;;2024-06;150;Fixtura Wonen BV;Fixtuurstraat 12 Utrecht;Interior finishing
Person Bravo;EMP-002;2024-W23;38;FIXTURA WONEN B.V.;fixtuurstraat 12;Tiling
Person Bravo;EMP-002;2024-10;96;Fixtura Wonen B.V.;Fixtuurstraat 12, Utrecht;Bathroom renovation
Person Charlie;;2024-10;;Fixtura Wonen B.V.;Fixtuurstraat 12, Utrecht;Interior finishing
```

### S4 agent rows (MCP; `actor_kind 'agent'`; 1 row; under O-Oscar's OAuth identity)

1. `create_session(sourceKind 'agent', supplierRole 'employer', explicit fingerprint fingerprintPayload('fixture-agent', {n:1}))`.
2. `submit_rows(startIndex 0)` with one row: Person Alpha / EMP-001 / 2023-06-01 / 8 h / "UAB Fixtura Alfa" / 999000001 / "Fixturos g. 3, Vilnius" / "Facade work".

### S5 `fx-timesheet-2023-07-mike.csv` (2 rows; MANAGER upload by M-Mike; S1 header)

```
Person Alpha;EMP-001;2023-07-03;;8;UAB Fixtura Alfa;999000001;Fixturos g. 3, Vilnius;Balcony slabs
Person Alpha;EMP-001;2023-07-04;;8;Fixtura Gama UAB;999000007;Fixturos g. 11, Vilnius;Painting
```

---

## 3. Script (`script.ts`, canonical order P0)

1. O-Oscar: S1 upload #1 (fault after batch 1), upload #2, upload #3 (copy).
2. O-Oscar: S1 preview, then the decisions:
   - `ordered_work_split_uncertain` (PR1, "Window sills") = `additional_order`;
   - `source_subtotal_mismatch` (row 32) = `skip_total`;
   - any `proposed` place is confirmed once per distinct spelling;
   - rows 29 and 35 are left UNANSWERED.

   Signed plan: create PB, PC, O1, O1b, O4, PR1 and PR3 (status `completed`, as the owner states), plus the C1 and C3 customer rows. Commit, then attest the session as `employer`. Preservation runs on this owner upload.
3. O-Oscar: S2 upload. Decision on the conflict (row 0) = `keep_existing`. Commit (0 records).
4. O-Oscar: S3 upload, then the decisions:
   - `ordered_work_split_uncertain` (PR2, "Tiling") = `same_order`;
   - `repeat_work_after_gap` (PR2, "Interior finishing", 2024-10) = `additional_order`.

   Plan: O2, PR2 (no status stated), C2. Commit, then attest.
5. O-Oscar via MCP: S4 create, submit, commit, attest.
6. M-Mike: S5 upload, commit (row 1 is held), attest as `employer`. Row 0 resolves to C1 and PR1 through the keyed `project_clients` row, which M-Mike can read.
7. O-Oscar: uploads S5's identical bytes. The session is reused, this is preservation only (the re-parse gate marks the S5 record), and row 1 stays held.
8. Replays for idempotency (T1): upload S1 again, upload S3 again, and re-run commit on S1 and S3.

Rollback cases run on a clone of the P0 end state, restored between cases:

- R1: withdraw S3.
- R2: withdraw S3 again.
- R3: reinstate S3 (after R1).
- R4: withdraw S2 (0 records).
- R5: withdraw S5.

Adversarial cases run on a clone of the P0 end state, restored between cases:

- **X1.** M-Mike writes straight to the store (Layer P) or through a PostgREST-equivalent INSERT as himself (Layer D). He creates a fabricated record in S1: PA, 2023-03-31, 8 h, "Facade work", `row_origin 'parsed_file'`, `source_row_index` 5, `import_row_id` = the committed staging row at index 5, with a `source_fact` that is not the file's row 5. He then attests it as `employer`. O-Oscar then uploads S1 again.
- **X1b.** As X1, but with `source_row_index` 29 (the undated row, which was never staged) and `import_row_id` NULL.

Permutation P1 (order check): S3 before S1. Every end-state number in section 4 is identical.

---

## 4. Expected results (`expected.ts`)

### T1 Same file twice: no duplicates [P][D]

- S1 upload #1: session S1 is created and 10 rows are staged (source positions 0–9).
- Upload #2: `reused: true`, 26 more rows staged and 10 ignored.
- Upload #3: `reused: true`, 0 staged.
- Staged total is 36. Position 29 is the undated row and is never staged. No `row_index` falls outside 0..36, and none is duplicated.
- Step 8 replays create 0 new sessions, staged rows, records, projects, `project_clients` rows, steps, parties, documents, `document_files`, `attested` events or `source_preserved` events.
- `evidence_import_sessions` total = 5 (S1..S5).
- `org_documents` of type `org_import_source` = 4 (S1, S2, S3, S5). All are `classification 'classified'`, `status 'active'`, `external_ref 'sha256:<hex of the bytes>'`, with one `document_files` row each and `mime_type 'text/csv'`.

### T2 Records, staging statuses and the chain [P]

| Session | Staged | Committed | Skipped | Needs review | Records |
|---|---|---|---|---|---|
| S1 | 36 | 32 | 2 (row 31 subtotal consistent; row 32 skip_total) | 2 (row 29 ambiguous person; row 35 ambiguous customer) | 32 |
| S2 | 2 | 0 | 2 (row 0 conflict kept existing; row 1 duplicate of S1 row 4) | 0 | 0 |
| S3 | 5 | 5 | 0 | 0 | 5 |
| S4 | 1 | 1 | 0 | 0 | 1 |
| S5 | 2 | 1 | 0 | 1 (row 1 `project_needs_owner_admin`) | 1 |

- Total records: 39.
- Every record has `organization_person_id`, a date or period, `session_id`, `source_row_index`, `row_origin` and its `source_fact` exactly as written. No record lacks a person, and no hour figure exists outside a record: rows are never disconnected.
- `project_id` is set on 38 records. It is NULL only on the S1 row 36 record.
- Every committed staging row's final state was written by the single UPDATE that set `committed`.

### T3 Customer-ordered work without an order document; unknown details not stored [P][D]

- Created: 3 projects (PR1, PR3, PR2), 3 `project_clients` rows with a key, and 6 steps.
- No source contains an order document, yet all 6 steps exist with `evidence_basis = 'organization_timesheet'`.
- `project_ordered_work` has NO column named `ordered_on`, `order_reference`, `contract_number`, `agreed_price_minor`, `price_currency`, `initial_quantity`, `quantity_unit` or `change_order_reference` (Layer D: `information_schema.columns` count = 0). A Layer D insert that names `order_reference` fails with 42703.
- Every step's view model carries `notSupported` equal to `ORDER_DETAILS_NOT_ON_RECORD`, verbatim: `order_date`, `order_reference`, `contract_number`, `price`, `initial_quantity` and `change_order_reference`, each with reason `not_on_record`. The views print "Order details: not on record" and never 0, an empty value or a guess.
- G-TS-1: the only money identifier in the historical modules is that one allow-listed constant, together with its message key.

### T4 Additional ordered work: separate and later [P]

| Step | Project | Kind | scope_keys | first_evidenced_on .. until | Precision | review_state |
|---|---|---|---|---|---|---|
| ST1 | PR1 | initial | facade work, scaffolding, site supervision | 2023-03-06 | day | auto |
| ST2 | PR1 | additional | sills window | 2023-04-05 | day | human_confirmed |
| ST3 | PR1 | additional | balcony slabs | 2023-05-15 | day | auto |
| ST4 | PR3 | initial | facade work | 2023-03-13 | day | auto |
| ST5 | PR2 | initial | finishing interior, tiling | 2024-05-01 .. 2024-05-31 | month | human_confirmed |
| ST6 | PR2 | additional | bathroom renovation, finishing interior | 2024-10-01 .. 2024-10-31 | month | human_confirmed |

- Every additional step's `first_evidenced_on` is later than the first date of its project's initial step. No additional scope key was folded into an initial step's `scope_keys`.
- Rule traces (in `detection`):
  - ST2: rule 4 (30 days after the cluster start, no gap, decided).
  - ST3: rule 5 (min gap 39 days > 21).
  - ST5 tiling: rule 4 (`max` offset 39 > 28, decided `same_order`).
  - ST6: rule 5 for bathroom (min gap 93 > 21) plus rule 6 for interior finishing (min gap 93 > 90, decided `additional_order`).
- S4 (2023-06-01, facade) and S5 (2023-07-03, balcony) create no step. They are continuations (66 and 45 days, both < 90).
- Membership:
  - S1 rows 22–23 → ST2.
  - Rows 24–28 and the S5 record → ST3.
  - The S4 record → ST1.
  - The October S3 interior-finishing record → ST6.
  - The May and June interior-finishing records → ST5.

### T5 Supported facts → VERIFIED HISTORICAL WORK with its basis [P][X]

- At the end state, `HISTORICAL_WORK_VERIFIED` covers 37 records: S1 31 + S3 5 + S5 1. Before step 7 it is 36.
- Not verified:
  - the S1 row 37 record: Owner Oscar attested his own work, so it is `SELF_ATTESTED`;
  - the S4 record: `row_origin 'agent_rows'` and no preserved file, so it is `ORGANIZATION_ATTESTED`, shown as "stated by organization, agent-submitted rows, not verified";
  - the S5 record until step 7, shown as "source not preserved; owner/admin needed".
- For every verified record:
  - `verification.basis = 'organization_timesheet'`;
  - `sourceDocumentSha256` = the file's sha256;
  - `sourceRowIndex` = its position.
- `countsAsIndependentlyVerified` = false for all 39 records.
- No copy string contains "independently", "customer-confirmed" or "employer-confirmed".
- Facts:
  - The S1 row 23 record (hours `?`) and the S3 October interior record (empty hours) are verified WITHOUT the hours fact (`notSupported: hours / unknown_value`).
  - The S1 row 36 record is verified without the customer fact (`not_stated`).
  - Step membership is never in `facts` (`notSupported: ordered_work_step / derived`).
- Verified hours in PR1: 231 of 243 (initial 177 of 189; ST2 6; ST3 48).

### T6 Totals are never distributed [P]

- PR1: 243 h in exact days, plus "1 day with unknown hours". By step: ST1 189, ST2 6 (+1 unknown), ST3 48.
- PR3: 8 h. O4 (no project): 8 h.
- PR2: 444 h in period records, plus "1 period with unknown hours". ST5 348 (May 160, June 150, W23 38) and ST6 96 (+1 unknown).
- Month buckets for PR2:
  - 2024-05 = 160.
  - 2024-06 = 188 (the June record and the W23 record, both wholly inside).
  - 2024-10 = 96 + 1 unknown.
- Weeks: 2024-W22 is empty. 2024-W23 shows "38 h (week total)" with no day cell. No day cell anywhere carries a period record's hours.
- The W10 and W11 total rows contribute 0 h anywhere, because subtotals are not records.
- Year 2023, FX: 259 h in exact days + 1 unknown. It is never summed with journal hours or allocations.
- No v3 projection calls `projectPeriodAggregateByMonth`, and no stored value equals a total divided by a count. A planted negative control guards this.

### T7 Address variants → one object [P][D]

- These spellings resolve to one object each:
  - O1 (1 row): "Fixturos g. 3, Vilnius", "Fixturos g 3", "Fixturos gatvė 3 Vilnius".
  - O1b: "Fixturos g. 5, Vilnius". The house number differs, so it stays separate.
  - O2 (1 row): "Fixtuurstraat 12, Utrecht", "Fixtuurstraat 12 Utrecht", "fixtuurstraat 12".
  - O4: "Sandėlis".
- `work_objects` created in FX: 4. "Fixturos g. 9, Vilnius" and "Fixturos g. 11, Vilnius" are NOT created, because their rows are held.
- O1 and O2 carry `address_line` and `city` from `address-split:v1`. `country` is NULL, because no source states it. Every record keeps its source spelling in `context_label` and `source_fact`.
- At most one grouped decision is asked per distinct spelling, never one per row.

### T8 Customers: variants do not duplicate; linked only when identified [P][D]

- C1 has one key, `code:--:999000001`. Source spellings seen:
  - "UAB Fixtura Alfa"
  - "Fixtura Alfa, UAB"
  - "UAB „FIXTURA ALFA“"
  - "Fixtura Alfa" (row 34, resolved by `name_fold+object` because O1 is tied only to C1 in the plan)
- C3 has a separate key, `code:--:999000005` (same name, different code), and raises the notice `same_name_different_code` (1).
- C2 has one key, `name:fixtura wonen`, for "Fixtura Wonen B.V.", "Fixtura Wonen BV" and "FIXTURA WONEN B.V.".
- Row 35 ("Fixtura Alfa" at a new object) is `ambiguous_customer`, with candidates C1 and C3. It is not committed, and no customer, object or project is created for it.
- Row 36 (empty customer): the record is committed with `project_id` NULL and the notice `customer_not_identified`, with no party row and no step.
- S5 row 1 ("Fixtura Gama UAB", a new code and a new object) is held for the owner/admin, and nothing is created.
- `organization_evidence_parties`: 38 rows, all `party_role 'client'`, and `party_organization_id` is NULL on all of them.
  - By session: S1 31 (C1 30, C3 1), S3 5 (C2), S4 1 (C1), S5 1 (C1).
  - Labels: "UAB Fixtura Alfa" on 33 (C1 32 + C3 1, each the customer row's display name, not the row's variant) and "Fixtura Wonen B.V." on 5.

### T9 The ambiguous worker is not merged [P]

- Row 29 ("P. Delta") is `ambiguous_person`, with candidates PD1 and PD2. It is not committed. There is no record for PD1 or PD2 and no new roster person, and the question is asked once for the label.

### T10 Conflicting, missing and unreadable values [P]

- **S2 row 0** (9 h against the S1 record's 8 h, same person, day, place and text) is a `conflict` that blocks that row only. The decision `keep_existing` skips it, and the S1 record is unchanged.
- **S2 row 1** is a `duplicate` of the S1 row 4 record and is not committed.
- **S1 row 32** (a W11 total of 42 h against day rows of 40 h) is a `source_subtotal_mismatch`. The five W11 day rows commit regardless.
- **Unreadable and missing hours.** S1 row 23 (`?`) becomes hours NULL with the notice `unreadable_source_value`. S3 row 5 (empty) becomes hours NULL with the notice `missing_source_value`. Neither is 0 anywhere.
- **No date.** S1 row 30 is a `skipped_source_row`. It is never staged and never given today's date.

### T11 Roll back only that batch [P][D]

| Case | Events written | Records active after | Verified after | Visible in history |
|---|---|---|---|---|
| R1 withdraw S3 | 5 `withdrawn` + 1 `rolled_back` | 34 | 32 | PR2, C2, O2, ST5 and ST6 are hidden ("from withdrawn batch S3" in the batch audit). Every S1, S4 and S5 record, PR1, PR3 and ST1–ST4 are unchanged. |
| R2 withdraw S3 again | none; result `already_withdrawn` | 34 | 32 | as R1 |
| R3 reinstate S3 | 5 `reinstated` + 1 `reinstated` session event | 39 | 37 | as the end state |
| R4 withdraw S2 | 0 record events + 1 `rolled_back` | 39 | 37 | unchanged (zero-record safe) |
| R5 withdraw S5 | 1 `withdrawn` + 1 `rolled_back` | 38 | 36 | PR1 and ST3 stay, because S1 evidence is active; ST3 hours become 40 |

A rollback updates or deletes no row of any table. Entities are hidden, never archived.

### T12 Every displayed fact traces to its source row [P]

- For every rendered fact (project, object, worker and CV views), the view model carries `{sessionId, sourceFilename, sourceSha256, sourceRowIndex, cells}`.
- For each of the 37 verified records, re-parsing the preserved bytes yields, at `source_row_index`, a row whose canonical JSON equals the record's `source_fact`. The re-parse gate enforces this before marking (T18); this test re-checks it.
- Every customer spelling, object spelling and work text shown is a cell of such a row, exactly as written.

### T13 Views [P][X]

- **PR1 project/object history.**
  - Steps in this order: C1 → ST1 (2023-03-06) → ST2 (2023-04-05) → ST3 (2023-05-15).
  - O1 with its 3 spellings.
  - Workers PA, PB, PC and PO.
  - Hours per step as in T6.
  - "Order details: not on record", and status "completed" (as stated in the plan).
- **PR2 history** shows "status not on record".
- **Worker P-Alpha (own profile).**
  - 19 records and 152 h in exact days: 144 h verified and 8 h "agent-submitted, not verified".
  - The customer label "UAB Fixtura Alfa" on 18 records, and row 36 shown as "customer not identified".
  - P-Alpha reads 0 rows of `projects`, `project_clients`, `project_ordered_work`, staging or sessions.
- **Living CV comparison (P-Alpha).** The traditional line "Fixture Timesheets FX · facade worker · 2022–2023" is shown exactly as written. Beside it are evidence lines computed from data:
  - "Fixture Timesheets FX (employer) · UAB Fixtura Alfa · Fixturos g. 3, Vilnius · 2023-03-06 – 2023-07-03 · facade work 128 h verified + 8 h not verified (agent rows), balcony slabs 8 h · basis: organization timesheet"
  - "Fixture Timesheets FX · customer not identified · Sandėlis · 2023-03-30 · 8 h verified"

  The difference is listed as a fact ("CV says from 2022; records start 2023-03-06"). No score and no percentage.
- **The same comparison on the company person page** (M-Mike, O-Oscar) adds the step label: "balcony slabs: additional ordered work, first evidenced 2023-05-15, derived from timesheet chronology". The worker's own view never shows steps.
- **M-Mike (manager)** reads the C1 row: `select` on `project_clients` returns 1 row, because P7 adds no SELECT restriction. He sees PR1 as "UAB Fixtura Alfa · Fixturos g. 3, Vilnius (project title visible to owner/admin)", never as "no projects".

### T14 Authorization contracts (`contracts.sql`) [D]

Negative controls. Each must fail with the stated result, and the DO block continues.

| # | Actor | Attempt | Result |
|---|---|---|---|
| A1 | E-Eve | insert a session in FX | 42501 (P2) |
| A2 | E-Eve | insert a record in FX | 42501 (P1) |
| A3 | M-Mike | a record with `supplied_by_organization_id` = FY | 42501 (P1) |
| A4 | M-Mike | a record with `supplier_role 'agency'` in the employer session S5 | 42501 (P1) |
| A5 | M-Mike | a record with `work_object_id` = OY | 42501 (P1) |
| A6 | M-Mike | a record with `project_id` = PY | 23503 (composite FK) |
| A7 | M-Mike | a record with the `import_row_id` of an S1 staging row, while in S5 | 42501 (P1) |
| A8 | M-Mike | `attested` with `actor_role 'client'` | 42501 (P4) |
| A9 | M-Mike | `attested` with `actor_organization_id` = FY | 42501 (P4) |
| A10 | M-Mike | `verification_withdrawn` on an FX record | 42501 (P4) |
| A11 | M-Mike | `disputed` on an FX record | 42501 (P4) |
| A12 | M-Mike | `source_preserved` on an S1 record | 42501 (P5: not owner/admin) |
| A13 | O-Oscar | `source_preserved` on the S4 record (no document with its hash) | 42501 (P5) |
| A14 | M-Mike | a session with `supplier_role 'client'` (FX holds no `client` capability) | 42501 (P2) |
| A15 | M-Mike, then O-Oscar | update a committed S1 staging row (status to `pending`, hours to 99), then delete it | 0 rows updated, 0 rows deleted, for both (P3u/P3d: committed rows are immutable) |
| A16a | M-Mike | insert a `project_clients` row with a `customer_key` | 42501 (P7i) |
| A16b | M-Mike | update the C1 row's `name` | 0 rows updated (P7u USING) |
| A16c | M-Mike | update LC (non-keyed, on PL) to set a `customer_key` | 42501 (P7u WITH CHECK) |
| A16d | M-Mike | delete the C1 row | 0 rows deleted (P7d) |
| A17 | E-Eve | insert any `organization_evidence_parties` row in FX | 42501 (P6: G) |
| A18 | X-Xavier | read FX steps / insert an FX step | 0 rows / 42501 |
| A19 | O-Oscar | update or delete any step, record or event | 42501 (no grant) |
| A20 | anon | select `project_ordered_work` | 42501 (no grant) |
| A21 | O-Oscar | delete PR1 | **42501** (no DELETE grant on `projects` for `authenticated`; the FKs from records and steps are defence in depth) |
| A22 | Y-Yankee | insert a project with `company_id` CFY and `organization_id` FX; update PY to set `organization_id` FX | 42501 / 42501 (P9i / P9u) |
| A23 | M-Mike | adversarial case X1: inject a fabricated `parsed_file` record into S1 | the INSERT is admitted (P1: a human CSV session). After O-Oscar's re-upload the record has NO `source_preserved` and is never `HISTORICAL_WORK_VERIFIED` (T18). |
| A24 | M-Mike | a record with `row_origin 'parsed_file'` in S4 (agent session) | 42501 (P1) |
| A25 | O-Oscar, M-Mike | a party row with `party_organization_id` = FZ on a C1 (historical) record | 42501 (P6, historical path) |
| A28 | O-Oscar | `source_preserved` where the only matching `org_import_source` document is `standard`, then `revoked` | 42501 / 42501 (P5) |
| A29 | M-Mike | set as the responsible person of the classified S1 document, then `source_preserved` | 42501 (P5: OA) |
| A30 | E-Eve | insert an `evidence_import_events` row in FX | 42501 (P8) |

Positive controls (each must succeed):

| # | Actor | Action | Result |
|---|---|---|---|
| +1 | O-Oscar | create a session, stage, insert records, customer rows and steps; attest `employer`; write `source_preserved` with the matching active classified document | admitted |
| +2 | M-Mike | SELECT the C1 `project_clients` row | 1 row (P7 adds no SELECT restriction) |
| +3 | M-Mike | insert a record into an existing project (S5 row 0 → PR1); attest `employer` on an employer record | admitted |
| +4 | P-Alpha | insert a `disputed` event on an own record | admitted |
| +5 | O-Oscar, then Z-Zulu | O-Oscar inserts a party row (`party_role 'client'`, `party_organization_id` = FZ) on the non-historical R0 (S0, no project); Z-Zulu inserts `independently_verified` on R0 | both admitted (P6 admits outside the historical path). R0 derives `INDEPENDENTLY_VERIFIED`, so the existing party-verify path is unchanged. |
| A26 | N-November | a session in FN (no declared roles) with `supplier_role 'other'`; the same with `employer` | admitted / 42501 (P2) |
| A27 | O-Oscar | `register_document_file_v1('organization', <S1 doc>, <canonical path>, 'fx-timesheet-2023.csv', 'text/csv', <size>, <sha>)` | `'registered'` after M3 (before M3: `'unsupported_type'`, pinned) |
| +6 | O-Oscar | create a live project through the ONE create core shape (`company_id` CFX, `organization_id` FX, `status 'draft'`) | admitted (P9 refuses no create the core performs today) |
| +7 | — | the 158-record shape (one `attested/employer` event per record, `actor_organization_id = organization_id`) | passes P4 |
| +8 | every actor | a SELECT on every touched table | no 42P17 |

### T15 Supplier role and precision pins [P]

- FX holds `employer` + `workforce_provider`. An upload without an explicit role gets `employer` (N1 fix).
- FN holds no role. An upload without an explicit role gets `other`, and P2 admits it (A26).
- Period parsing:
  - `2023-W10` → the period 2023-03-06..2023-03-12, exact.
  - `2024-05` → 2024-05-01..2024-05-31, month precision.
  - A start date without an end date on a time-semantics decision is refused (lane E).

### T16 Order independence (P1) [P]

Running S3 before S1 yields exactly the T2–T13 and T17 end state: records, projects (with statuses), customers, steps with their `scope_keys`, the verified count and the hours.

### T17 Historical projects never reach live planning [P][D]

- **Statuses.** PR1 and PR3 have `status 'completed'` (stated in the plan) and PR2 has status NULL. No historical project has `draft`, `live` or `paused`.
- **Layer P.** Over a store seeded with the FX end state plus PL, each live projection returns PL only, and each count is 1:
  - planning (both reads), workforce, `listManagedProjects`, `loadProjectsForResult`;
  - assist, the reports-hub counts, starter signals, the company project-context count;
  - market-map world-read and signals, employer committed work.
- **By-id reads.** `getProjectOperations(PR1)` returns no live operations. The PR1 project page renders History mode only, with no assign, stage, task, readiness or status controls.
- **Layer D.** As O-Oscar:
  - `select id from projects where company_id = CFX and historical_key is null` returns PL only;
  - adding `and status in ('draft','live','paused')` still returns PL only;
  - `select count(*) from projects where company_id = CFX and historical_key is not null` = 3.
- **Static (G-HIST-1).** Every non-test `.from("projects")` in `apps/web/lib` and `apps/web/app` carries `historical_key` or has an allow-list entry with its reason. A planted reader without the filter makes the guard fail.

### T18 Preservation re-parse gate [P][D]

- **Step 2.** The re-parse of S1 marks all 32 committed S1 records. Each is a `parsed_file` record whose `source_fact` equals the parsed row at its index. 31 of them derive `HISTORICAL_WORK_VERIFIED`. The row 37 record stays `SELF_ATTESTED` (T5).
- **Step 7.** The re-parse of S5 marks the one committed S5 record (row 0). Row 1 is not committed, so it is not marked.
- **X1.** After O-Oscar's re-upload of S1:
  - the fabricated record has no `source_preserved` and its standing is at most `ORGANIZATION_ATTESTED`;
  - the batch audit lists it as `source_row_mismatch` ("not found in the preserved file");
  - the 31 S1 verified records are unchanged;
  - 0 new `source_preserved` events are written for already-marked records.
- **X1b.** The record is not eligible (no committed staging row at index 29), and the outcome is the same as X1.
- **Direct write.** M-Mike cannot write the marker directly (A12, A29).

---

## 5. Current-behaviour pins (green until the delivering PR flips them)

| Pin | Today | Flipped by |
|---|---|---|
| supplier role inferred for FX | `agency` (workforce_provider is checked first) | PR-2 |
| partial retry of S1 | duplicates staged rows (`row_index = already + i`) | PR-2 |
| withdraw of a 0-record session | returns early, with no session event | PR-2 |
| committed staging row | can be updated, then deleted | PR-3 (M1 P3u/P3d) |
| manager `attested/client` naming another org | accepted | PR-3 (M1 P4) |
| record `supplied_by_organization_id` ≠ session | accepted | PR-3 (M1 P1) |
| external manager import | accepted | PR-3 (M1 P1/P2) |
| manager inserts a keyed `project_clients` row | accepted | PR-3 (M1 P7i) |
| foreign company owner creates a project in FX | accepted | PR-3 (M1 P9i) |
| `register_document_file_v1` with `text/csv` | `'unsupported_type'` | PR-4 (M3) |
| objects created by import | no address, no project | PR-5 |
| customer / project / parties | never written | PR-5 |
| live `projects` readers | no `historical_key` filter (no historical row can exist yet) | PR-5 |

## 6. Fixture hygiene (`snapshot.test.ts`)

- Every UUID matches the RFC-4122 v4 pattern and the `0f1e7300-` prefix.
- No string in `sources.ts` matches a production organization, profile or customer name. The denylist is read from nothing in production: the check asserts the synthetic tokens only.
- Email claims use only the reserved domain `fixture.invalid`. Codes are in `9990000xx`.
- `contracts.sql` ends in RAISE, so it leaves zero rows. A count before and after verifies this.
