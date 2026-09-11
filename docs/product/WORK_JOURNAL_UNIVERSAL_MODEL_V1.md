# Work Journal — Universal Model v1 (one journal for the full world of work)

Status: OWNER-DIRECTED DESIGN EVIDENCE + LIVE CONTRACT (issue #1689, 2026-09-11).
Machine form: `apps/web/lib/journal/work-evidence-archetypes.ts` (data + composition),
guarded by `work-evidence-archetypes.test.ts` and `lib/guards/journal-work-intelligence.test.ts`.
This file is the human-readable matrix those tests enforce; the code is the source of truth.

Owner direction (verbatim intent): ONE Work Journal engine capable of representing work
across the whole ESCO/ISCO occupational universe — no profession-specific journals, no
thousands of static forms, no giant occupation switch, no arbitrary human scores, no fake
skill-hours. `ESCO/ISCO → OCCUPATION → ARCHETYPE(S) → UNIVERSAL RECORD → ADAPTIVE MODULES
→ REAL EVIDENCE → PROFESSIONAL INTELLIGENCE`. The person never sees this classification.

## 1. What already exists (audited on production, 2026-09-11)

| Structure | Finding | Consequence |
|---|---|---|
| `journal_entries` + `journal_entry_metrics` | `metric_slug` is free TEXT (no CHECK, no FK); `value_numeric` / `value_text` / `unit_slug → productivity_units` (10 units in 5 categories) / `source ∈ worker_input, ai_extracted, manager_corrected` | **The universal record is already extensible.** Every archetype field is a metric slug; no column, no table, no migration for fields. New UNITS (km, covers, cases) need registry rows (§10 slug registry) |
| `esco_occupations` | 3,039 active, **all** with a 4-digit ISCO-08 code; 42 of 43 sub-major groups populated (63 has no ESCO rows) | ISCO group is the resolution key; the map needs ≈50 rows, not 3,039 |
| `esco_skills`, `esco_occupation_skills`, `esco_labels` | 13,939 skills (10,715 competence / 3,219 knowledge), 126,051 relations, 1.05 M labels / 28 locales | Semantic layer exists; slug↔ESCO bridge for the platform's 161 skills is EMPTY and owner-gated (#1355) — ESCO stays interoperability, never ranking |
| Canonical work-time rule `work-time.ts` (+ SQL mirror) | fragments win, entry quantity fallback, never summed; `days` never hours; provenance per line | Time is already first-class and counted once |
| `journal_entry_skills` (+ `provenance`), `journal_entry_confirmations`, `journal_entry_photos`, `source_document_file` metric | skill involvement, human confirmation, photo evidence, immutable original document | Evidence/verification layer exists |
| `journal_profession_templates` (migration 20260714180000) | **not applied** (owner-gated draft) | The template registry is not live; archetype data lives in code until it is |
| Recognition chain (`skill-pipeline.ts`, accept / reject / correct, append-only markers) | live, measured on production 2026-09-08 | Unchanged by this model |

## 2. Four kinds of time (binding — owner rule §5)

| Concept | Definition | Where it lives |
|---|---|---|
| ENTRY WORKED TIME | the entry's canonical duration, counted once | `deriveEntryWorkTime` |
| ACTIVITY TIME | hours on the same fragment as an activity label, or the entry's own direction for an entry-level duration | `work-intelligence.ts` → `activities` |
| SKILL INVOLVEMENT | a skill was linked to an entry: entries · days · contexts · `sharedHours` (shown, never summed across skills) | `work-intelligence.ts` → `skills` |
| ATTRIBUTABLE PRACTICE TIME | hours a skill can claim: only entries where it is the ONLY linked skill | `work-intelligence.ts` → `attributedHours` |

An 8-hour entry linked to four skills = 8 h of work, four involvements, 0 h attributed each — never 32.

## 3. Archetype matrix

Columns: time model · activity model · quantity/output · tools · precise skill-time attribution possible? · evidence · verifier · regulatory/continuity · privacy · result · Living CV consequence · modelled on (real-world record). Machine form carries the same rows.

| Archetype | Time | Activity | Output | Tools | Skill-time | Evidence | Verifier | Regulatory | Privacy | Result | Living CV | Modelled on |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| field_project | activity duration | work package | physical output | equipment | activity | photo, supervisor, client | supervisor | safety record | — | completed/partial/blocked | hours + output | daily site diary / field report |
| shift | shift | task | units handled | — | involvement | system record, supervisor | supervisor | — | — | handover | hours + output | rostered shift record with handover |
| construction_trade | clock (start/end/breaks) | work package | physical output (m², pcs) | equipment | activity | photo, original timesheet, supervisor, client | supervisor | safety record | — | completed/partial/blocked | hours + output | trade daily report (08:00–17:00, 30 min break, object, m², materials, photos, sign-off) |
| production_manufacturing | shift | batch run | physical output | equipment | activity | system record, inspection, supervisor | supervisor | safety record | — | inspection pass/fail | hours + output | production / batch log (line, machine, output, scrap, QC) |
| machine_equipment_operation | clock | task | physical output | equipment | precise | system record, supervisor | supervisor | continuity | — | completed/partial/blocked | continuity record | operator hour-meter / equipment log |
| maintenance_repair | activity duration | task | cases | equipment | activity | system record, photo, inspection, client | client | safety record | — | inspection pass/fail | hours + cases | CMMS work order (asset, fault, diagnosis, parts, labour hours, downtime, test) |
| driving_mobile | driving / duty / rest | route leg | distance | vehicle | precise | tachograph/GPS, document, client | client | duty time | — | completed/partial/blocked | hours + output | tachograph / driver daily log (Reg. 561/2006) — driving, other work, rest never merged |
| logistics_warehouse | shift | task | units handled | equipment | activity | system record, supervisor | supervisor | safety record | — | completed/partial/blocked | hours + output | WMS shift record (zone, orders/pallets, forklift) |
| clinical_healthcare | shift | procedure | cases | instruments | involvement | system record, supervisor, peer | supervisor | supervised practice | patient-confidential | outcome | practice hours | clinical shift log / placement logbook — categories and counts, never patient content |
| supervised_practice | session | procedure | cases | — | activity | document, supervisor | supervisor | supervised practice | client-confidential | outcome | practice hours | trainee lawyer / psychologist / social worker / teacher practice record |
| case_client | case time | case/matter | cases | software | precise | artifact, document, client | client | — | client-confidential | outcome | hours + cases | matter time entry (client, matter, activity, duration, billable, deliverable) |
| office_administrative | clock | task | units handled | software | involvement | system record, artifact | supervisor | — | — | completed/partial/blocked | hours + output | office day record |
| knowledge_project | activity duration | deliverable | — | software | activity | artifact, document, peer | peer | — | client-confidential | outcome | deliverables | project timesheet + deliverable log |
| software_digital | activity duration | deliverable | — | software | activity | system record, artifact, peer | peer | — | client-confidential | outcome | deliverables | issue tracker + change history; time evidence when available, never forced |
| engineering_technical | activity duration | deliverable | — | instruments | activity | artifact, document, inspection, peer | peer | safety record | — | inspection pass/fail | deliverables | engineering design / inspection / test record |
| research | activity duration | procedure | — | instruments | activity | artifact, document, peer | peer | — | — | outcome | deliverables | lab notebook (experiment, protocol, sample, finding) |
| education_teaching | session | session | cases (learners) | — | precise | document, artifact, peer | supervisor | — | client-confidential | outcome | hours + cases | lesson register / teaching log |
| apprenticeship_training | session | task | — | — | activity | document, supervisor | supervisor | licence hours | — | outcome | practice hours | on-the-job training record (competency practised, hours, trainer sign-off, cumulative) |
| sales_commercial | activity duration | task | units handled | software | involvement | system record, client | supervisor | — | client-confidential | outcome | hours + output | CRM activity log (leads, meetings, orders) |
| customer_service | shift | task | units handled | software | involvement | system record, supervisor | supervisor | — | client-confidential | outcome | hours + output | contact-centre shift (contacts, channel, outcomes) |
| hospitality | shift | task | units handled (covers) | equipment | involvement | supervisor | supervisor | safety record | — | completed/partial/blocked | hours + output | service-period record (station, covers, food-safety checks) |
| care_work | session | procedure | cases (visits) | — | activity | document, client, supervisor | supervisor | supervised practice | patient-confidential | outcome | practice hours | care visit log — activity category and duration, never private detail |
| agriculture_forestry_fisheries | activity duration | work package | physical output | equipment | activity | photo, document, system record | supervisor | safety record | — | completed/partial/blocked | hours + output | field / spray / catch record |
| security_emergency | shift | incident response | — | equipment | involvement | system record, supervisor | supervisor | safety record | security-sensitive | handover | hours + cases | patrol log / daily activity report (timestamped checkpoints, incidents, handover) |
| management_leadership | activity duration | deliverable | — | software | involvement | artifact, document, peer | peer | — | client-confidential | outcome | deliverables | management record (team, decisions, plans, outcomes) |
| creative_media | activity duration | deliverable | — | software | activity | artifact, client | client | — | — | outcome | deliverables | production / publication log |
| legal_professional_services | case time | case/matter | cases | software | precise | artifact, document, client | client | supervised practice | client-confidential | outcome | hours + cases | matter time entry (6-minute units) + supervised-practice record |
| public_service | clock | case/matter | cases | software | involvement | system record, document | supervisor | — | client-confidential | outcome | hours + cases | case / service record (reference only) |
| cleaning_facility | shift | task | physical output (area) | equipment | activity | photo, supervisor, client | client | safety record | — | completed/partial/blocked | hours + output | facility checklist |
| personal_services | session | session | cases | instruments | precise | photo (consented), client | client | — | client-confidential | outcome | hours + cases | appointment book |
| military_regulated | shift | task | — | equipment | involvement | document, supervisor | supervisor | licence hours | security-sensitive | handover | continuity record | service record / exercise log, clearance-bounded |

## 4. ISCO-08 → archetypes (the full universe in ≈50 rows)

Resolution: minor group (3 digits) wins, else sub-major (2 digits); unknown → universal core only.
A RELATIONSHIP adds archetypes (a `student` engagement adds `apprenticeship_training` + `supervised_practice`).
Every one of the 43 sub-major groups resolves (guarded). Examples:

| ISCO | Family | Archetypes |
|---|---|---|
| 01–03 | Armed forces | military_regulated (+ management / shift) |
| 11–14 | Managers | management_leadership + public_service / knowledge_project / field_project / hospitality + sales |
| 21 | Science & engineering professionals | engineering_technical, knowledge_project |
| 22 | Health professionals | clinical_healthcare, supervised_practice, case_client |
| 23 | Teaching professionals | education_teaching, supervised_practice |
| 24 · 26 | Business / legal-social-cultural professionals | knowledge_project, case_client; **261** legal → legal_professional_services; **263** social/religious → research, case_client; **264–265** authors, artists → creative_media |
| 25 | ICT professionals | software_digital, knowledge_project |
| 31 | Science & engineering associate | engineering_technical, field_project; **315** ship/aircraft controllers → driving_mobile, shift |
| 32 | Health associate | clinical_healthcare, supervised_practice |
| 33 · 34 · 35 | Business / legal-social / ICT associate | office/sales/case; **342** sports → personal_services, education; **343** artistic/culinary → creative_media, hospitality |
| 41–44 | Clerical | office_administrative (+ customer_service, logistics_warehouse) |
| 51–54 | Personal service / sales / care / protective | personal_services, hospitality; **511** travel attendants → driving_mobile; sales_commercial; care_work; security_emergency |
| 61–63 | Agricultural, forestry, fishery | agriculture_forestry_fisheries (+ machine operation) |
| 71–75 | Craft & trades | construction_trade, maintenance_repair, engineering_technical (721 metal/welding), production_manufacturing, creative_media (73) |
| 81–83 | Plant/machine operators, drivers | production_manufacturing, machine_equipment_operation, driving_mobile; **834** mobile plant → machine operation; **835** deck crews → shift |
| 91–96 | Elementary | cleaning_facility, agriculture, construction/production/logistics labour, hospitality (94), sales (95) |

## 5. Composition (the assembly contract)

`composeJournal(archetypes)` = UNIVERSAL CORE + strictest TIME MODEL + CONTEXT + union of
ACTIVITY models + union of ARCHETYPE MODULES (each a small set of metric slugs, never a core
slug) + union of EVIDENCE kinds + VERIFIERS + the **most cautious** skill-time attribution any
archetype allows + privacy + regulatory needs. Only these modules may appear, progressively
(quick entry → relevant details → optional evidence → advanced detail). A surgeon never sees
construction quantity fields; a warehouse worker never clinical ones (guarded).

## 6. Universal professional intelligence (what the evidence can answer today)

Live in `deriveWorkIntelligence` and rendered on `/dashboard/journal#work-intelligence`, the
Living CV (`/cv`) and the conversation (`journal-recent`, `figures`): WHAT (activities,
skills) · HOW LONG (today / 7 / 30 / 365 days / all time) · HOW OFTEN (entries, days) · WHEN LAST ·
WHERE / CONTEXT (per engagement, context diversity) · WHAT PRODUCED (outputs in recorded units) ·
WHAT SKILLS WERE INVOLVED (involvement vs attributed) · WHAT EVIDENCE (confirmed / photos /
original document / self-only) · WHO CONFIRMED (approved confirmations only) · HOW IT CHANGED
(months, 30-vs-30 trend) · WHAT OCCUPIES MOST · WHAT ADJACENT CAPABILITY (evidenced skills →
existing profession/skill map, named as derived) · WHAT DEMAND (opportunities board from
journal-linked skills). Tools/systems used and ESCO occupation mapping are extension points
(§7) — nothing is manufactured for them.

## 7. Extension path (preserved, not built here)

1. Composer modules: render `composeJournal(...)` modules behind progressive disclosure in the
   ONE composer (`journal-entry-composer.tsx`); each field = one metric row.
2. Units: add registry rows for km / covers / cases / pallets (`productivity_units`, additive).
3. ESCO occupation → archetype resolution surface (`iscoGroupForEscoOccupation` exists); the
   platform's own 49 professions map through their ESCO occupation once #1355 (bridge) is
   owner-approved.
4. Template registry migration (draft 20260714180000) may carry the same archetype data when
   the owner applies it — the code stays canonical until then.
5. Overlap / implausible-duration detection (owner §13) over `work-time.ts` lines — warn, never
   silently corrupt; overrides recorded with reason.
6. Organization views (owner §14) compose the same reader under `manages_organization` — no
   second timesheet universe.
