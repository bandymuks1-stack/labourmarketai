# Historical data traceability — Vivat Rex & Nonstop Group (2026-10-25)

Source → confirmation → import → production record, for every previously-provided
historical package. Read-only production measurement on project
`gorgitwvdzxbnaxhrsrw`, continuing-business org `19f47e78` (Labour market ai
Sp. z o.o). No sampling. This answers: **which previously-confirmed data is
imported, which is not, and why.**

## 1. Vivat Rex / Labour Market AI — data origin vs legal employer (kept apart)

- **Data origin / current holder / continuing business:** Labour market ai
  Sp. z o.o (`19f47e78`) — every record's `supplied_by_organization_id`. This is
  NOT a claim that LMAI was the legal employer.
- **Historical legal employer:** Vivat Rex (period `2022-01-17 … 2026-02-22`,
  documented switch 2026-02-23) then Labour Market AI Sp. z o.o
  (`2026-02-23 …`). Expressed as `organization_history_periods` + per-record
  `employer` party label `Vivat Rex PL` (675). Composed on read; no record moved.
- **Client / main contractor:** De Klusbaas B.V. (KvK 86884913) — invoiced, not
  the employer.
- **Nonstop Group** (`20b2c802`): a **separate** organization (see §4). The label
  `Nonstop-Vivat Rex PL` (125 records) is dataset provenance inside the Vivat Rex
  period, never a Nonstop party.

## 2. Source → import → production traceability (every package)

| Source package (as provided) | Import session (org) | Staged | Committed (leaf) | Held | Production records | Hours | People | Span |
|---|---|---|---|---|---|---|---|---|
| NL_2022_dokumentu_suvestine.xlsx | LMAI | 54 | 54 | 0 | 54 | 2 718.0 | 5 | 2022-01-17 … 2022-12-12 |
| NL_2023_dokumentu_suvestine.xlsx | LMAI | 875 | 852 | **23 (all duplicates)** | 852 | 7 432.5 | 10 | 2023-01-13 … 2023-12-19 |
| **NL_2024_dokumentu_suvestine.xlsx** | LMAI | 959 | **959** | 0 | 959 | 8 294.0 | 17 | 2024-01-18 … 2024-12-28 |
| NL_2025_metine_ataskaita_ir_suvestine.xlsx | LMAI | 900 | 900 | 0 | 900 | 7 870.5 | 16 | 2024-12-30 … 2025-10-25 |
| work_history_2025_part3.xlsx | LMAI | 158 | 158 | 0 | 158 | 2 329.0 | 7 | 2025-06-01 … 2025-12-15 |
| NL_2022_2026_metine_analize…xlsx | LMAI | 21 | 21 | 0 | 21 | 1 001.5 | 3 | 2026-01-19 … 2026-03-23 |
| work_history_2025_part1.xlsx | **Nonstop** | 0 | 0 | 0 | 0 | — | — | empty shell |
| work_history_2025_part2.xlsx | **Nonstop** | 0 | 0 | 0 | 0 | — | — | empty shell |
| work_history_2025_part3.xlsx | **Nonstop** | 0 | 0 | 0 | 0 | — | — | empty shell (data committed under LMAI) |
| **TOTAL (committed, LMAI)** | | | **2 944** | 23 | **2 944** | **29 645.5** | **43** | 2022-01-17 … 2026-03-29 |

Import sessions retain **no source-file bytes** (`source_bytes_sha256` null) — the
original workbooks were not stored in the DB; the raw weekly sources are in the
owner mailbox (De Klusbaas timesheets) and Drive, and were never committed to git
(PII, correct). Only anonymised test fixtures exist in the repo
(`__fixtures__/work-history-2025-part3.staged.json`, `historical-timesheet-v3/`).

## 3. Reconciliation against the owner's confirmed package figures

| Owner's confirmed figure | Production | Verdict |
|---|---|---|
| 2024 package: 959 day records | 959 committed | **IMPORTED — exact** |
| 2024 package: 48 timesheets / 193 worker-weeks | 959 daily records across 17 people, 2024-01-18…12-28 | consistent (daily grain) |
| 2025 package: 1 058 rows | 900 + 158 = **1 058** | **IMPORTED — exact** |
| 2025 package: 10 199.5 h | 7 870.5 + 2 329.0 = **10 199.5** | **IMPORTED — exact** |
| 2025 package: 19 people | 19 (calendar-2025 distinct) | **IMPORTED — exact** |
| Existing: 2 944 records / 29 645.5 h / 43 people | 2 944 / 29 645.5 / 43 | **exact** |

The calendar-year view (2024 = 963, 2025 = 1 054) differs from the package view
only because 4 `NL_2025_metine` rows are dated 30–31 Dec 2024; by **source package**
the figures match the owner's exactly.

## 4. What is NOT imported, and why

- **23 rows from NL_2023 — NOT committed, by design.** All 23 are exact duplicates
  of already-committed records (same person + date + hours + object; verified:
  0 of 23 lack a committed match). Committing them would double-count — forbidden.
  These are the only held rows in any package. **No unique evidence-backed data is
  missing.**
- **Nonstop Group worker history — none in the system to import.** The 3 Nonstop
  import sessions are empty shells (0 rows); the 2025 worker data they were meant
  for was re-anchored to LMAI per the 2026-09-30 decision. The Nonstop documents
  that exist (Drive) are **commercial** — contract `Nonstop Group Burbiškių g. 3 …
  LAKEDE` (2026-03-18), invoices (F2019 055/065, FACTUR/BAS TO NONSTOP), bank
  statement 2025-05…2026-05 — not per-worker/day/hours timesheets, so they do not
  belong in the worker-evidence subsystem and are not importable as work history.
- **No Vivat Rex 2024/2025 worker data is missing** — every provided package is
  fully committed (above).

## 5. Open, evidence-dependent (inside the committed 2 944; need the raw timesheets)

- **390 records with an unresolved site** and **34 records naming "Hoofdgracht 45"**
  (no `45` work object exists; 0 are wrongly linked to `41` — the fuzzy "→41" is a
  read-time `proposed` suggestion only, never committed). Resolving the real site
  requires the weekly De Klusbaas timesheet attachments (owner mailbox); no
  committed error exists to undo, and no site may be assigned without the source.
- **437 multi-object day records** correctly keep `work_object_id` null (multiple
  resolved places in `derived.workContexts`) — not a gap.

## 6. Nonstop Group production state (before = after; correct, not a defect)

| Nonstop `20b2c802` | Value |
|---|---|
| Historical evidence records | 0 |
| Roster people / work objects / hours / periods | 0 / 0 / 0 / 0 |
| Party labels naming Nonstop | 0 |
| Own projects | 4 (1 live PELENIŠKIU BIO; 3 draft incl. a duplicate PASVINTINIAI) |

No foreign workers or hours are attributed to Nonstop. To put Nonstop's **own**
work history into the system, per-worker timesheets for its Lithuanian projects
(Peleniškės / Pasvintiniai / Burbiškių g. 3) must be provided; none exist in any
accessible source today.

## 7. Conclusion

Every previously-confirmed Vivat Rex 2022–2026 worker-timesheet package is **fully
imported and matches the owner's own figures exactly** (2024: 959; 2025: 1 058 /
10 199.5 h; total 2 944 / 29 645.5 h / 43). The only non-imported rows (23, 2023)
are verified duplicates held to prevent double-counting. Nonstop Group has no
worker-timesheet dataset in any accessible source — only commercial documents and
empty session shells. **No evidence-backed historical worker data is missing, so
there is nothing to restore** without new source documents. This is not COMPLETED
for the broader product; it is the complete, evidence-based status of the
historical-data import.
