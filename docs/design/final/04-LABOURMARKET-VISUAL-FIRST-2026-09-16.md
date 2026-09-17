# LABOURMARKET_VISUAL_FIRST — the standing visual constitution (2026-09-16)

Status: **OWNER DIRECTIVE, PROJECT-WIDE, PERMANENT** ("MASTER OWNER PRODUCT /
UX / VISUAL CONSTITUTION — FINAL UNIFIED COMMAND", 2026-09-16). Additive to
`00-FROZEN-DESIGN-CONTRACT.md`, `00-GALUTINE-DIZAINO-SISTEMA.md` and
`03-PRODUCT-IA-ANTI-SLOP-2026-09-16.md`. Where this document and the frozen
contract differ, the frozen contract wins; where it and the canonical
architecture differ, the architecture wins — this document decides *how a
human sees*, never what the graph is.

**Visual status (owner decision 2026-09-17, after the #1751 review):**
`CURRENT_VISUAL_FOUNDATION = ACCEPTED` (PR #1751, merged as `85ef5294`,
deployed, health ok) · `FINAL_PREMIUM_VISUAL_TARGET = NOT ACHIEVED` (owner
estimate ≈ 40 % of the intended premium living-work experience) ·
`VISUAL_REDESIGN = DEFERRED UNTIL PRODUCT COMPLETION`. The long-term target
(high-end sports-product clarity, motion, spatial relationships,
evidence-backed identities, team / project / company representations) is
unchanged and is not to be propagated as a finished standard. Nothing in this
status is HUMAN_UI_PROVEN.

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

## 9. The one grammar — OBJECTS × TIME, PEOPLE as tokens (2026-09-17, second pass)

The owner's judgment of the first pass (§8) was "≈30 % of the required
level: still a workforce-admin / timesheet / diary look". The second pass
does not add views; it re-draws every view in ONE grammar so the product is
learnt once and recognised everywhere:

| Scale | Surface | Objects are … | Time is … | People are … | Focus does … |
|---|---|---|---|---|---|
| period | Overview (company footprint) | ridges across the weeks, thick where many person-days | the weeks as columns, the rhythm above | evidence-ring identities | a person **re-weights** the ridges to their own days; an object lights its ridge; no lines are ever drawn between people and places |
| week | Field (formation) | lanes, most person-days first | the seven days as columns (period: the weeks) | tokens standing on a lane on a day | a person lights their tokens and their **work path** draws through the lanes; an object lights its lane; a day lights its column and opens that day's formation |
| day | Calendar | (the day's places open on select) | real dates in real positions | tokens on the day, the day's hours as a density bar | a day opens its **formation**: places → people → hours or `?` |
| person | Player Card | lanes on the person's own span (the canonical band, evidence tone) | the daily rhythm: one bar per dated day | the ring identity | places → object focus |
| place | Object | the square place mark, the active period on the company's span | the rhythm by week | marks with the bar of their days | people → person focus |

### 9.1 Visual vocabulary (`components/app/historical/historical-marks.tsx`)

| Mark | Shape | Means | Never |
|---|---|---|---|
| `PersonMark` | round monogram tile | the ONE person identity (canonical foundation) | a synthesised face |
| `PersonMark ring` | the **evidence ring**: one arc slot per week of the period, the arc as long as the days evidenced that week (of 7) | *when* there is evidence — a shape every person owns and no two share | a score, a rating, a percentile |
| `PersonToken` | the tile with an outline: **solid** = hours stated on this place, **dashed** = split unknown | a person on a place on a day | hours divided by guess |
| `ObjectMark` | **square** tile with the location glyph | a place as a place (square ≠ round, never confused with a person) | a code as the architecture |
| `PlaceMark` | glyph + NAME | a place in a list / week cell | — |
| `UnknownToken` | dashed circle around `?` | UNKNOWN, everywhere the same dash | zero, an estimate |
| `Σ` amber | period aggregate, apart | a figure a day cannot hold | a day |
| orange dot / ⚠ | a decision waits | — | — |
| gold ring / underline | selected / focused (brand action) | — | confirmation |

Colour never carries a state alone: unknown is a dash, selection a ring
and a label, aggregate a Σ, a decision a glyph.

### 9.2 Motion (`framer-motion`, already a dependency; `useReducedMotion` everywhere)

Semantic only, enter-only (nothing animates out, so a click during a
change never lands on a leaving node): a mode arrives (160 ms settle, the
tab underline slides), the ridges settle to the focus (spring, no bounce),
the work path **draws** through the lanes (420 ms `pathLength`), the detail
slides in beside the workspace, the day formation staggers in. Under
`prefers-reduced-motion` every duration is 0 and nothing moves.

### 9.3 Geometry (`lib/organization-evidence/import-visual.ts`, pure)

`personRing` · `personDaySeries` · `objectStreams(calendar, person?)` ·
`fieldFormationWeek` (lanes, tokens, unplaced `?` lane, per-person paths) ·
`fieldFormationPeriod` · `dayFormation`. All re-shape the ONE projection;
none stores, reads, invents or divides (`hours: null` stays null).

### 9.4 Fixed on the way

- Template labels (`{count}`, `{hours}`) were translated without values and
  interpolated client-side: next-intl raised `FORMATTING_ERROR` on every
  render and leaked the raw key `evidenceImport.reconstruction.card.moreLanes`
  into the card. Labels that need values are now functions that call the
  translator with the values.
- Mobile recomposes rather than shrinks: the field shows lane marks only,
  the card hides the lane band (the footprint list below carries the same
  places), the top state is a 2-column grid, the decision bar shows only the
  counts that decide.
