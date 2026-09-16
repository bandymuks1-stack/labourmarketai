# Historical import → living company model — bounded trace (2026-09-16)

Measured against `main` `87a098f7` and production session
`47627d4a-5bfe-43ac-aa1b-1d4269760116` (158 staged rows, 0 records, organization
holds 0 roster people, 0 work objects, 0 hour allocations). The owner's file was
re-read locally with the SAME reader production used
(`readTimesheetXlsx` → `rowsFromGrid`); every figure below is from that run.

This is the trace §51 asked for. It is not an audit and authorizes nothing.

## What the source actually says

| Fact | Value |
|---|---|
| Rows / people | 158 / 7 (Viktar 40, Linas 36, Aleksandr 28, Valerij 28, Ramūnas 15, Mihail 10, Donatas 1) |
| Period | 2025-10-22 → 2025-12-15, 8 weekly source files (week 43–50) |
| "Object / recognized objects" | 135 rows stated; **37 distinct labels, most COMPOSITE** (`Hoofdgracht 3; Kantoor`, `Hoofdgracht 1; Hoofdgracht 3; Hoofdgracht 13; Kantoor` …) |
| Real distinct places behind them | ~17: Hoofdgracht 1/3/5/13, Kantoor, Travers 19, Walgang 12/19, Bloemhof 157, Banckertstraat 22, Anne Franklaan 16, Nieuwe Havenweg 81, Wijkplaats 4, Hubartlaan 6, Burgemeister, 2e Nieuwstraat, Bussum |
| Non-place labels in the object column | `Administraciniai/koordinavimo darbai` (activity), `2 uur - garantie` (duration note) |
| "Assignment note" (source's own) | `vienas objektas` 74 · `keli objektai - paskirstyta apytiksliai` 61 · `objektas neatpažintas` 23 |
| 23 rows with no object | the site is the first words of the work text, misspelled: `Hoofdgraht 13`, `Hoofdgrat 5`, `Hoofdraht 5`, `Hoofddienst 13`, `Hofdracht3`, `Anna Franklin 16`, `anna franklaan`, `Bussum`; 1 row has no text at all |
| Per-object hours inside text | `Hoofdgraht 13 (7 uur) … Hoofdgraht 3 (2 uur)`, `… 8 uur`, `… 1 uur`, `2,5 uur`, `– 2 uur` — explicit allocation exists on part of the multi-object days |
| Week vs date | 4 rows: source week 50, explicit date 2025-12-15 (ISO 51); the source's own provenance column says it kept the date on purpose |
| Impossible day | Donatas 800 h and Ramūnas 165 h on 2025-11-17 — the text says they are 16-month aggregates |
| Date provenance | the source's own column states every date was derived from year + week + weekday by the owner's pre-processing |

## The chain, edge by edge

| Edge | State | Where |
|---|---|---|
| Source file → import session | LIVE | `createImportSession`, `evidence_import_sessions` (idempotent on fingerprint) |
| Session → source row | LIVE | `submitRows`, `evidence_import_rows` (`source_fact` verbatim, `fact_fields`/`derived`) |
| Source row → person resolution | LIVE, **defect** | `matchPerson` over `organization_people`; all 158 unmatched because roster is empty; UI printed `needsPerson − willCreatePeople = 151` as "needs a person" — the plan already covers all 7 |
| Source row → place resolution | LIVE, **defect** | `matchPlace` over `work_objects` on the WHOLE label → 37 composite objects would be created; activity/note labels would become sites; 23 rows lose their site |
| Row → per-object hours | NOT_BUILT | nothing reads the allocation written inside the text |
| Row → week/date contradiction | LIVE | `derived.calendarWeek` (`iso_week_conflicts_with_source_week`) |
| Row → impossible hours | LIVE, **defect** | `derived.hoursPlausibility` is set but the row stays `ready` and would commit 800 h on one day |
| Preview → human | LIVE, **rejected** | 158-row table as the primary surface (`evidence-import-section.tsx`) |
| Commit → `organization_people` (unlinked) | LIVE | `applyPlan` → `createRosterPerson` (insert policy forces `unlinked`) |
| Commit → `work_objects` | LIVE | `applyPlan` → `create_work_object_v1` RPC |
| Commit → `organization_evidence_records` | LIVE, **defect** | writes `context_label: null` — the source's own place words are dropped from the record |
| Records → competency signals | LIVE (best-effort) | `organization_evidence_competency_signals` (exact/synonym terms only; no inference) |
| Records → provenance / chain / reversal | LIVE | `hash_prev/hash_self`, `withdrawImport`/`reinstateImport`, `listEvidenceRecords` |
| Records → the subject | LIVE (read) / BROKEN (refuse) | RLS via `linked_profile_id`; refusal is RED (`OWNER_GATE_PACKETS_2026-09-08`) |
| Roster person → platform worker | LIVE | `organization_people.linked_worker_id`, `offerRosterLink`/`respondToRosterLink` |
| **Records → the ONE work model** | **NOT_CONNECTED** | `organization_evidence_records` has **zero readers outside the import module**. `loadWorkIntelligence` reads `journal_entries` + `work_hour_allocations` only |
| Work model → Work in Numbers / Living CV / person page / chat / team roll-up | LIVE | `work-in-numbers-view.ts`, `verified-cv.ts`, `team-recorded-work.tsx` — all compose `loadWorkIntelligence` |
| Work model → hours grid (`/dashboard/hours`) | LIVE for `work_hour_allocations` | keyed on `workers.id`, `work_object_id NOT NULL`, `hours ≤ 24` — cannot hold an unallocated multi-object day |
| Company calendar door | LIVE (future only) | `/dashboard/company/planning` reads availability/utilisation/demand; there is no past-actual calendar surface for an organization |
| Records → player card | NOT_CONNECTED | `buildPlayerCardMinimum` reads the worker's own profile/journal; evidence reaches it only through the work model once linked |
| Records → team / brigade | NOT_BUILT (by decision) | ARCH-4: co-presence is evidence of co-work, never a brigade |
| Records → client / project / work package / stage | NOT_BUILT | the source proves person·date·place·hours·activity and nothing above it; `work_objects.project_id` exists for a later human link |
| Records → wage / cost | NOT_BUILT | the source carries no rate; nothing invented |
| Records → capacity / duration estimate / scenario / demand / supply / matching | NOT_BUILT | reached only through the work model → planning readers; out of this slice by decision |

## What this slice does about it (GREEN, no schema/RLS/authority change)

1. **Work-context resolution** (`work-context.ts`, pure): split composite
   labels on `;`, classify each segment (place / activity / duration note),
   address-aware typo matching (`Hoofdgraht 13` → `Hoofdgracht 13`, same
   house number required to merge, different numbers never merge), site
   extraction from the leading words of the work text, per-object hours read
   from the text. Every result is DERIVED with a method and a confidence;
   genuine ambiguity is a question at the LABEL level, asked once.
2. **Canonical representation** of a multi-object day: ONE record per source
   row (the person-day fact: stated hours, verbatim `context_label`),
   `work_object_id` set when exactly one place resolved, and
   `derived.workContexts[]` carrying every resolved place, its id and its
   explicit hours or `unknown_split`. Total hours are never split by guess.
3. **Readiness**: impossible-hour rows are `needs_review` until a human
   acknowledges them as stated; week conflicts stay visible, not blocking.
4. **Human-first preview**: what the system understood → genuine issues →
   people → places → calendar → what commit creates → what stays UNKNOWN →
   commit; the raw rows behind progressive disclosure.
5. **Commit fix**: `context_label` written; `derived` carries the resolution.
6. **CONNECT** records → the ONE work model: `readOrganizationRecords` also
   reads live evidence records of the worker's linked roster people, so a
   person who later claims their roster row sees their history in Work in
   Numbers, the Living CV and the team roll-up with no second upload.

## Genuinely missing canonical edges (not fixed here)

- An organization-level PAST calendar (actual work by person × day) has no
  surface; the hours grid is per linked worker. GREEN candidate for a later
  slice (a read over the same records), not needed to commit honestly.
- Object-centred reads of multi-object days need `derived.workContexts`
  (JSONB) or a RED junction table; deferred.
- Subject refusal of an imported record: RED, already packeted.
