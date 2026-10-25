# Historical organization-linkage correction — Vivat Rex / Labour Market AI (2026-10-25)

Owner task: fully audit and correct the historical work records of VIVAT REX and
related companies in LabourMarket.ai production; do not confuse data owner /
employer / contractor / platform operator; ground every fact in the primary
documents; correct through the existing auditable architecture (no unaudited SQL,
no history rewrite); COMPLETED only after real production correction + verification.

Production project: `gorgitwvdzxbnaxhrsrw` (labourmarket.ai). Continuing-business
organization: `19f47e78-7bd1-4120-9937-603dba769f8a` ("Labour market ai Sp. z o.o").
All figures below are read-only production measurements taken 2026-10-25 over the
**full population (no sampling)**.

## 1. The four roles, kept apart (owner point 2)

| Role | Who | How it is recorded |
|---|---|---|
| Platform operator / continuing-business anchor / current data holder | **Labour market ai Sp. z o.o** (`19f47e78`) | `supplied_by_organization_id` on every record — **correct, do not change** |
| Historical legal employer (earlier) | **VIVAT REX** ("V.R.", "Vivat Rex PL", "Nonstop-Vivat Rex PL") | `organization_history_periods` period + per-record employer **party label** — never an invented organization, never a `supplied_by` change |
| Historical legal employer (from 2026-02-23) | **Labour Market AI Sp. z o.o** (NIP 7011295735) | its own `organization_history_periods` period |
| Client / main contractor | **De Klusbaas B.V.** (KvK 86884913, Hilversum) — the party invoiced | NOT the employer; recorded as client context, not asserted as a party until documents establish the role |

**VIVAT REX is a real historical company, not the automatic employer of all
records** (owner point 1). It is **not** given its own organization row and the
records are **not** moved to it — that is the conflation the owner's 2026-09-30
model forbids (`docs/design/business-history-continuity-v1.md`). Labour Market AI
Sp. z o.o is **not** treated as the historical employer merely because the records
are currently filed under it.

## 2. Full-population audit (all 2944 records, no sampling)

| Fact | Value |
|---|---|
| Records under `19f47e78`, supplier_role `employer`, state `ORGANIZATION_REPORTED` | **2944** |
| Prior corrections / withdrawn / superseded | 0 / 0 / 0 (clean rollback baseline) |
| Date span | 2022-01-17 → 2026-03-29 |
| By year | 2022: 54 · 2023: 852 · 2024: 963 · 2025: 1054 · 2026: 21 |
| No work-object link (`work_object_id` null) | **851** |
| `context_label` null | 486 |
| Employer **party** rows written (any record) | **0** — the per-record employer label was never written |
| Records carrying a source-sheet label | **854** of 2944 (`Vivat Rex PL` 675, `Nonstop-Vivat Rex PL` 125, `Serhii` 49, `Ramunas` 4, `Raimundas` 1); 2090 carry none |
| Source files | NL_2022_dokumentu_suvestine, NL_2023_…, NL_2024_…, NL_2025_metine_ataskaita_ir_suvestine, work_history_2025_part3, NL_2022_2026_metine_analize_su_2026_ir_nurasymais |
| Records before the documented 2026-02-23 switch / on-or-after | **2932 / 12** |

> The owner's earlier "500 / 98 / 250 / 33" figures came from the product API read,
> which is **capped at 500 records** — a slice, not the population. The real
> no-object count is **851**, not 250; the real total is **2944**, not 500.

## 3. Existing period state and the gap

`organization_history_periods` holds exactly **one** row for this org: period
`Vivat Rex`, `source_labels {Vivat Rex PL, Nonstop-Vivat Rex PL}`, **both bounds
NULL**, basis `owner_statement`, relation `not_asserted`. The read composer
(`lib/organization-evidence/business-history.ts`) places a record by matching
source-sheet label, else by a period's **documented** date bounds, else "not
placed". With null bounds, only the **800** label-matched records are placed; the
~2132 remaining pre-switch records and all post-switch records are **not placed**,
and there is **no Labour Market AI period** at all.

## 4. Correction — through the existing auditable architecture

### Phase A — period bounds (APPLIED to production 2026-10-25 + verified)
`supabase/migrations/20261025120000_business_history_periods_vivatrex_lmai_bounds_v1.sql`:
1. Supersede the `Vivat Rex` row to add `period_end = 2026-02-22` (documented) and
   `period_start = 2022-01-17` (**OWNER DECISION — earliest evidence day; 2022
   employer identity not fully documented**).
2. Insert the `Labour Market AI Sp. z o.o` period, `period_start = 2026-02-23`,
   open end.

Effect, with no record moved and no `supplied_by_organization_id` changed: the
2932 pre-switch records compose into the Vivat Rex period (800 by label, the rest
by date) and the 12 post-switch records into the Labour Market AI period — visible
in company history (`business-history-overview.tsx`) and, for a worker who has
confirmed their roster row, in the Living CV (`professional-experience.ts`,
`my_worked_organization_periods_v1`).

### Phase B — per-record employer party labels (follow-up PR)
Write `organization_evidence_parties (party_role='employer', party_label=<source
sheet, verbatim>)` for the **854** records whose own source sheet names the
employer. Verbatim from the record's source line, never invented; additive;
idempotent; through committed tooling + tests (follow-up #1 of the 2026-09-30 doc
§7), **not** raw SQL. Records without a source-sheet label are placed by period
date only and get no invented label.

### Phase C — date provenance (follow-up PR, mass correction)
Reclassify source-reconstructed dates (year+week+weekday) as DERIVED, via the
existing `derived-date-provenance` / insert-only record correction — re-reads each
line's own provenance column, invents nothing. Scope is now 2944, not 500; run in
batches after an impact preview, owner-gated.

### Phase D — objects (follow-up; needs primary attachments)
- **851 records with no work-object link** — separate genuine multi-object days
  (keep `derived.workContexts[]`, do not force one object) from real gaps.
- **"Hoofdgracht 45" (11 records in the first slice; full count to re-measure)** —
  no `Hoofdgracht 45` work object exists (objects are 1/3/5/9/13/41/43/65); the
  fuzzy matcher attaches it to `Hoofdgracht 41` via `near_identical_name`
  (`proposed`). **Not confirmed as 41.** Must be read from the weekly timesheets
  (Gmail attachments) to decide: distinct building (new object) vs typo for 41/43.
  Until then it stays `proposed`, never confirmed.

## 5. Owner decisions objectively required (documents cannot settle these alone)
1. **Vivat Rex `period_start`** — confirm `2022-01-17` or give the real start; the
   2022 employer identity (person-name sheets; contract uploaded 2024) is not
   fully documented.
2. **`legal_entity_relation`** — keep `not_asserted`, or upgrade to
   `sold_and_continued_by_new_entity` now that the Vivat Rex contract exists
   (owner wording + basis).
3. **"Nonstop-Vivat Rex PL" label** — the 2026-09-30 decision keeps it as dataset
   provenance inside the Vivat Rex period, NOT a Nonstop party. Confirm it stays so.
4. **Hoofdgracht 45** — once the timesheets are read, confirm distinct object vs 41/43.

## 6. Verification (owner point 10) — run after Phase A apply
1. DB: `select` the two new period rows; re-run the placement query (expect 2932
   into Vivat Rex, 12 into Labour Market AI, 0 not-placed among dated records).
2. Company history page renders the two periods with correct totals.
3. A consenting, roster-linked worker's Living CV shows the earlier Vivat Rex
   employer name on their pre-2026-02-23 work, RLS unchanged.
4. No record's `supplied_by_organization_id` changed; count of records = 2944.

## Status — Phase A DONE in production (verified 2026-10-25)
Applied via Supabase MCP `apply_migration` on project `gorgitwvdzxbnaxhrsrw`
(migration `business_history_periods_vivatrex_lmai_bounds_v1`), under the owner's
explicit 2026-10-25 instruction and the standing 2026-09-30 decision.

Production verification (composition replicated from `business-history.ts` over all
2944 records):

| Period | Records | by label | by date | not placed |
|---|---|---|---|---|
| Vivat Rex `[2022-01-17..2026-02-22]` | 2932 | 800 | 2132 | 0 |
| Labour Market AI Sp. z o.o `[2026-02-23..2026-03-29]` | 12 | 0 | 12 | 0 |

- 2932 + 12 = **2944 — every record placed exactly once, 0 not placed, 0 undated**.
- `supplied_by_organization_id` unchanged on all 2944 — **no record moved**.
- `organization_history_periods`: 3 rows (original null-bound Vivat Rex preserved
  and superseded; 2 live periods) — **append-only, provenance intact**.
- Nonstop Group org (`20b2c802`): **0 historical evidence records, 0 periods** —
  no separate Nonstop dataset; the 125 `Nonstop-Vivat Rex PL` records stay in the
  Vivat Rex period as dataset provenance (2026-09-30 decision).

**Remaining (follow-ups, do not block the product):** Phase B employer-party
labels (854 labelled records); Phase C date-provenance reclassification (2944,
batched); Phase D objects — 851 missing work-object links + "Hoofdgracht 45"
(no 45 object exists; stays `proposed`, needs the weekly timesheets read to decide
distinct-vs-typo). No history rewritten; no unaudited SQL.
