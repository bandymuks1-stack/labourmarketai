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
| Rows / people | 158 / 7 (rows per person: 40, 36, 28, 28, 15, 10, 1) |
| Period | 2025-10-22 → 2025-12-15, 8 weekly source files (week 43–50) |
| "Object / recognized objects" | 135 rows stated; **37 distinct labels, most COMPOSITE** (`Hoofdgracht 3; Kantoor`, `Hoofdgracht 1; Hoofdgracht 3; Hoofdgracht 13; Kantoor` …) |
| Real distinct places behind them | ~17 (four house numbers on one street, the office, twelve further addresses/places) |
| Non-place labels in the object column | `Administraciniai/koordinavimo darbai` (activity), `2 uur - garantie` (duration note) |
| "Assignment note" (source's own) | `vienas objektas` 74 · `keli objektai - paskirstyta apytiksliai` 61 · `objektas neatpažintas` 23 |
| 23 rows with no object | the site is the first words of the work text, misspelled: `Hoofdgraht 13`, `Hoofdgrat 5`, `Hoofdraht 5`, `Hoofddienst 13`, `Hofdracht3`, a street name with a typo and a town name; 1 row has no text at all |
| Per-object hours inside text | `Hoofdgraht 13 (7 uur) … Hoofdgraht 3 (2 uur)`, `… 8 uur`, `… 1 uur`, `2,5 uur`, `– 2 uur` — explicit allocation exists on part of the multi-object days |
| Week vs date | 4 rows: source week 50, explicit date 2025-12-15 (ISO 51); the source's own provenance column says it kept the date on purpose |
| Impossible day | 800 h and 165 h on 2025-11-17 (two people) — the text says they are 16-month aggregates |
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

## Delivered in this slice (branch `feat/cc/history-reality-model`)

| Item | Where | Proof |
|---|---|---|
| Split / classify / typo-resolve / site-from-text / per-place hours | `lib/organization-evidence/work-context.ts` | `work-context.test.ts` (35), `import-contexts.test.ts` over the anonymised real file (10) |
| Preview resolves every place per row; plan lists real places with spellings; `needsPerson` counts only what the human must settle; impossible-day rows held until acknowledged | `import-core.ts` (`sessionPlaces`, `resolveRowContexts`, `buildPreview`, `applyPlan`) | same, + `organization-evidence-core.test.ts` unchanged (50) |
| Label-level decision and acknowledgement — staging only | `resolveContextLabel`, `acknowledgeRows`; actions `resolveEvidenceLabelAction`, `acknowledgeEvidenceRowsAction`; MCP `evidence.import.resolve_label`, `evidence.import.acknowledge_rows` | capability guards |
| Commit writes `context_label` and the resolution in `derived` | `commitImport` | `historical-import-reality.test.ts` |
| Read-only projections: people, places, calendar, issues, company, commit effect | `import-projections.ts` | `import-projections.test.ts` (7) |
| First screen = reconstruction; rows behind disclosure; KPI wall removed | `components/app/evidence-import-reconstruction.tsx`, `evidence-import-section.tsx` | `historical-import-reality.test.ts`, `product-ia-anti-slop.test.ts`, i18n guard (5 locales) |
| Evidence → the ONE work model | `worker-evidence-read.ts` → `readOrganizationRecords` | `journal-work-intelligence.test.ts` re-anchored |

No migration. No RLS or policy change. No new store. No brigade inferred.

## Owner HUMAN walk — what to look for on `/lt/dashboard/company/history?evidenceSession=47627d4a-…`

1. **Istorija atkurta**: 158 · 7 · ~17 objektai (not 37) · stated hours; period 22 Oct – 15 Dec 2025; the 965 h flagged line shown apart.
2. **Reikia patikrinti**: exactly ONE blocking item — 2 rows with more hours than a day — with "Palikti kaip nurodyta". Week conflicts (4), site unknown (6), unallocated multi-place days (~30+) under "pastebėjimai, kurie nestabdo".
3. **Žmonės**: 7 cards, each "naujas", rows·days·hours, span, top places; two cards show "+ … h peržiūrėtinose eilutėse".
4. **Objektai**: the ~17 real places (Hoofdgracht 1/3/5/13, Kantoor, …) and a separate `Hoofddienst 13` (too far from `Hoofdgracht` to merge — decide it via the row, or leave it). Spellings listed under each.
5. **Kalendorius**: weeks 43–51, per person per week, ⚠ on week 47 for two people.
6. **Įmonės vaizdas**: known line + UNKNOWN: užsakovas, projektas, darbų paketas, atlygis, rezultatas, brigada.
7. **Patvirtinimas**: plan shows 7 people and the real places; "Patvirtinti (156)" until the two rows are acknowledged. **Do not press it unless you mean it** — this is the one permanent write.
8. The 158 rows are under "Rodyti visas 158 šaltinio eilutes".

## Post-#1748 correction (same day, branch `feat/cc/history-living-model`)

**Source semantics.** The owner's human walk established that the 800 h /
165 h figures were aggregate hours of work from home over months, not a
day's work. "Impossible daily hours" was the wrong classification.
`lib/organization-evidence/time-semantics.ts` now classifies a figure a day
cannot hold from the source's WORDS (period words in the text or the
context: month/week/year… in six languages; remote only when the source says
so) into `period_aggregate` / `unknown`, never from the numbers. The
classification is a blocking QUESTION; the human's answer
(`resolveTimeSemantics`: daily / period aggregate ± remote ± the period only
if known / unknown) is a `human_choice`. The commit represents it with what
the schema already has: a period record (`period_start/end` + `hours`) when
the period is known; otherwise a dated source fact with `hours = null`
(duration UNKNOWN) and the source figure in `source_fact` +
`derived.timeSemantics.sourceHours`. Only DAILY hours reach the work ledger.
Rows staged before the classifier existed (the production session) are
classified in the preview from the same words — no re-upload.

**Player card.** `history-card` is the eighth registered variant of the ONE
person identity (`lib/identity/player-identity.ts`);
`components/app/historical-player-card.tsx` renders it from the projection
with the canonical monogram, the `EVIDENCE_SUPPORTED` provenance edge and
line, daily hours / days / places, a weekly strip, places, aggregates apart,
"current state not inferred", and the evidence behind it (object lanes on
the existing history band, activities, the source's words, interpretations,
unknowns). No score of any kind.

**Field board.** `components/app/historical-field-board.tsx` — read-only
client projection: week / person / place selection over the same evidence;
"people evidenced working", never a team (ARCH-4).

**Reconstruction order.** Understood (sentence + time spine) → to check →
people (cards) → the field → places → calendar (+ aggregates apart) → the
company → what exists after confirm → plan → commit → raw rows (disclosure).

**Still open (unchanged, not regressions):** historical ACTUAL → canonical
calendar read; object → actual work/people/time; observed duration →
capacity / scenario consumers; a period aggregate has no slot in the ONE
work model (it is evidence, not a day's hours).
