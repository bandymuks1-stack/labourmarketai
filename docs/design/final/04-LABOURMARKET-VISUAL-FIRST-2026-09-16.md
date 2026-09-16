# LABOURMARKET_VISUAL_FIRST — the standing visual constitution (2026-09-16)

Status: **OWNER DIRECTIVE, PROJECT-WIDE, PERMANENT** ("MASTER OWNER PRODUCT /
UX / VISUAL CONSTITUTION — FINAL UNIFIED COMMAND", 2026-09-16). Additive to
`00-FROZEN-DESIGN-CONTRACT.md`, `00-GALUTINE-DIZAINO-SISTEMA.md` and
`03-PRODUCT-IA-ANTI-SLOP-2026-09-16.md`. Where this document and the frozen
contract differ, the frozen contract wins; where it and the canonical
architecture differ, the architecture wins — this document decides *how a
human sees*, never what the graph is.

Historical Reality (`/dashboard/company/history`, a staged import) is the
first bounded reference implementation. Every other surface converges on this
rule in its own slice; nothing else was redesigned in the reference PR.

---

## 1. The rule

**SHOW → LABEL → EXPLAIN ON REQUEST.** The user LOOKS, RECOGNISES and
INTERACTS; reading is the exception. Before a sentence becomes permanent UI,
ask whether shape · position · icon · time · grouping · visual state · a
number · a 1–3-word label · or an interaction-time explanation can carry it.
Only when all nine fail does prose stay visible.

Text budget: ICON + 1–3-WORD LABEL + VALUE. Sentences live in tooltip ·
popover · drawer · detail · source · help. Implementation vocabulary
(provenance, canonical, derived, ledger, RLS, RPC) never reaches a worker or
an employer.

## 2. The real-world object rule (non-negotiable)

A surface named after a real-world object must look and behave like it.

| Object | Primary representation | Never |
|---|---|---|
| CALENDAR | month / week grid, real dates in real positions, work on the date | a weekly table called "Calendar" |
| WORK JOURNAL | diary + timeline + evidence, a day opens like a day | database rows |
| PLAYER CARD | premium professional identity object, compact in groups | an admin rectangle with KPIs |
| FIELD / TEAM BOARD | people as actors on a field of time and objects | an object grid / matrix |
| OBJECT | a work context with its people, time and evidence | a report row |
| COMPANY | a living operating picture (people × time × objects × work × evidence) | two prose boxes |
| REPORT / TABLE | may look like a report; a table is a secondary, optional view | the primary representation |

Owner nouns may not be satisfied with cheaper substitutes. If the mental model
cannot be realised on the existing architecture, name the exact constraint —
never substitute silently.

## 3. One reality, many representations · three depths

PERSON + DATE + WORK + OBJECT + HOURS + EVIDENCE is ONE canonical fact set.
Calendar (WHEN), Journal (WHAT that day), Player (WHAT this person did),
Object (WHO here, WHAT happened), Field (WHO WHERE WHEN), Company (HOW it
operated), Report (document) are re-shapings of it — never duplicated.

| Level | Name | Content |
|---|---|---|
| 1 | GLANCE | the operational screen; primarily visual; main state in seconds |
| 2 | INSPECT | select / focus: relationships, values, unknowns, evidence, actions |
| 3 | SOURCE / WHY | original source, wording, interpretation, transformation, audit trail |

Auditability is complete and lives at level 3. One screen = one primary task:
modes REPLACE the central workspace; nothing is appended below.

## 4. Stable visual states

- **UNKNOWN** — `?` token, everywhere (availability, wage, period, client,
  team, allocation …). UNKNOWN ≠ ZERO is absolute.
- **EVIDENCE** — source only · organization reported · person confirmed ·
  employer/client confirmed · formal recognition. Never implied beyond what
  exists; the provenance edge (`provenance-edge.tsx`) is the material.
- **TIME** — PAST = actual/performed · NOW = current/committed · FUTURE =
  proposed/scenario. Never conflated. A period aggregate is never a day.
- **ATTENTION** — a compact count (`⚠ 1`); opening it shows only unresolved
  decisions.
- **HISTORICAL ≠ CURRENT** — a token, the explanation on request.

## 5. Identity, avatars, scores

The premium player identity is ONE atom (`lib/identity/player-identity.ts`,
variants registry) that recurs in profile, history, matching, candidate
inspection, team, project, object, opportunities. No fabricated face: the
monogram tile is the neutral professional identity, and it may evolve only
with real evidence. No score, rating, rank, stars or tier — a visual signal
must correspond to a real evidence state. HOURS ≠ SKILL; WORK TEXT ≠
VERIFIED COMPETENCY.

## 6. Semantic icons

`components/app/semantic-icon.tsx` binds one glyph to one concept: person ·
work · object · project · time · calendar · journal · team · company ·
evidence · confirmed · unconfirmed · unknown · historical · current · remote ·
location · money · warning · source. A glyph means the same thing on every
surface; every mount carries an accessible label; colour is never the only
signal.

## 7. Anti-slop test

Remove the logo and the copy. If it could be any AI/SaaS product — generic
dashboard, stat-card grid, glassmorphism, neon AI, robot imagery, marketing
copy in operational UI, interchangeable white rectangles — it is not accepted.
Product identity comes from PERSON · WORK · TIME · OBJECT · EVIDENCE · TEAM ·
COMPANY. WOW = "Čia mano įmonė", not "graži Excel ataskaita".

## 8. Reference implementation — Historical Reality (2026-09-16)

### 8.1 Implementation map (DATA → SYMBOL → INTERACTION → LEVEL → COMPONENT)

| Data | Visual symbol | Interaction | Level | Component (reuse / extend / new) |
|---|---|---|---|---|
| period · counts · aggregates · decisions | top state strip: icon + value + 1 word | click → mode | 1 | `historical-workspace.tsx` `Stat` (new, in-file) |
| person | compact identity: monogram · name · week strip · days · objects · ⚠ · Σ | select → focus | 1 | `historical-player-card.tsx` `HistoricalPlayerCompact` (extend: same file, same atom) |
| person in focus | identity + object lanes on own time band + rhythm + tokens | inspect → level 3 details | 2/3 | `HistoricalPlayerCard` (rewritten in place; reuses `ProvenanceEdge`, `WorkHistoryTimeline`, identity foundation) |
| person · date · place · hours | field: rows = people, columns = days/weeks, cells = place marks | week / person / object dials | 1/2 | `historical-field-board.tsx` (rewritten in place) |
| date | calendar cell with identity tiles + day hours | select day → day reality | 1/2 | `historical/historical-calendar.tsx` (new view; geometry from `lib/journal/journal-calendar.ts`) |
| period aggregate | Σ token in the APART band, `?` period, remote ✓/✕/? | → attention | 1/2 | calendar "apart" band; `historical-attention.tsx` |
| object | compact node: mark · name · people tiles · days · h/? | select → focus | 1/2 | `historical/historical-objects.tsx` (new view) |
| object in focus | people with days, rhythm by week, period; spellings under SOURCE | inspect | 2/3 | `HistoricalObjectFocus` |
| people ↔ objects | footprint map (links weighted by days) | click node → focus | 1 | `historical/historical-overview.tsx` `Footprint` (new, SVG) |
| unknown | `?` token | title / details | 1/2 | tokens on every view |
| decision | person · Σ figure · DETECTED · remote · period · SOURCE | existing time-semantics form | 2/3 | `historical/historical-attention.tsx` (wraps existing `EvidenceTimeSemanticsForm`, `EvidenceLabelResolveForm`) |
| commit | decision bar: ✓ ready · ⚠ decisions · +people · +objects · REVIEW · CONFIRM | CONFIRM opens the existing plan + commit form | 1/2 | workspace decision bar; section builds `commitNode` |
| raw rows | SOURCE · N | opens the existing `<details>` disclosure | 3 | `evidence-import-section.tsx` (kept) |
| place mark | text monogram (`H3`, `K19`, `Ka`) | — | 1 | `import-visual.ts` `objectMonogram` |

Visual geometry (calendar grid, object lanes, field views, object rhythm,
top state) is `lib/organization-evidence/import-visual.ts` — pure re-shaping
of the ONE projection (`import-projections.ts`), no store, no clock, no IO.

### 8.2 BEFORE → AFTER

| | BEFORE (#1749, rejected by the human walk) | AFTER |
|---|---|---|
| IA | 8 stacked cards: sentence → issues → 7 expanded cards → field → 17-row places → weekly table "Calendar" → 2 prose boxes → impact list → plan → commit → rows | top state · 6 modes replacing ONE workspace · detail beside/sheet · persistent decision bar · SOURCE on demand |
| Player | large rectangle: letter avatar + prose + 3 KPI values + tiny chart + chips | compact identity in groups; focus identity with object lanes on time, rhythm, tokens; sentences behind INSPECT |
| Calendar | week × person table | month / week grid, identities on dates, day reality on select; table optional; aggregates apart |
| Field | 17 place rectangles with people chips | people rows × time columns, place marks in cells; week / person / object dials |
| Company | two prose boxes (known / unknown) | rhythm band + people + footprint map + `?` tokens |
| Attention | issue list with `issueWhy` paragraphs inline | ⚠ count; decision objects; source and why on request |
| Commit | bottom of the document | sticky decision bar; CONFIRM withheld while a decision blocks |

### 8.3 Guards

`lib/guards/historical-living-model.test.ts` (visual-first structure: modes
replace, no seven expanded people, no permanent object report, calendar is a
calendar with the table optional, aggregates never a day, no score, no face,
UNKNOWN ≠ ZERO, semantic icons with labels, no second model, no write),
`lib/guards/history-client-boundary.test.ts` (the ONE client boundary renders
the real 158-row session shape in five locales with only serialisable data),
`lib/guards/historical-import-reality.test.ts` (first screen is the
workspace; raw rows behind disclosure).

### 8.4 Known edges (unchanged by this pass, stated honestly)

- historical ACTUAL → the canonical Calendar read (`/dashboard/company/planning`)
  still needs the commit + a linked roster row; the workspace calendar reads
  the pre-commit projection.
- object → actual work / people / time on the objects register after commit:
  the work-object page does not yet compose `organization_evidence_records`.
- observed actual duration → capacity / future scenario consumers: not built.
- period aggregate → ONE work model representation when the period is known:
  the commit writes a period record; no surface renders it as a period yet.
- Work Journal: the diary/timeline grammar is proven compatible here (day →
  person → object → time → evidence); the journal's own list stays queued.
