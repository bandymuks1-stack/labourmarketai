# 0025 — One person = one continuous professional history (owner decision, 2026-10-17)

## Decision
A person's professional experience is **one continuous history**, whoever recorded the work, in
whichever organization it happened, under whichever role, and whenever the record was imported.
Every surface that states the person's experience — Work in Numbers ("Mano veikla skaičiais"),
the Living CV, the profile fact strip, the organization's view of a member or of a historical
person, and the MCP `cv.verified.get` — reads **one** derivation,
`apps/web/lib/journal/professional-experience.ts`, over the one work model
(`deriveWorkIntelligence`) and the one membership spine (`engagement_contexts`, governing
memberships, `organization_history_periods`).

The reading states **one total** and keeps every provenance visible inside it. It supersedes the
2026-10-15 P0 ("two figures of their own, never summed") **for the all-time total only**: the
journal figure and the organization-history figure stay beside it as the two provenances it is
made of, and the period tiles (today / 7 / 30 / 365 days) still read the journal alone.

Trigger: the owner saw "25,6 val. darbo žurnale" and "800 val. organizacijų istorijoje" and no
figure that said what the professional experience adds up to; the Vivat Rex period and the
Nonstop Group management were nowhere in that experience.

## Rules (binding, pinned by `lib/journal/professional-experience.test.ts` and
`lib/guards/professional-experience-one-history.test.ts`)
1. **Every work hour once.** A journal entry counts once (the canonical work-time rule). An
   organization day record that describes a live journal entry is the same work — listed, not
   added. A period record whose span holds a same-organization day record may be a summary of
   those days — listed, not added (the pinned rule of `organization-all-time.ts`). Journal hours on
   days inside a counted same-organization period are listed as "within the organization's
   period" and not added: the organization's figure stands, the person's entries stay the
   detail. Every line says whether it was counted and, if not, why.
2. **No invented days.** A period record keeps its span and its one figure. It is never spread
   over days, weeks, months or years.
3. **Provenance stays visible, never hidden by a confirmation state.** Every line names its source
   (journal / organization day records / organization period record) and its evidence level
   (own record / manager-confirmed / organization-reported). Recorded work counts; the confirmed
   part is a sub-figure of it. Recorded ≠ confirmed ≠ settled stay three facts (decision
   `historical-work-never-needs-invoices`): no invoice, payment or settlement is read.
4. **Roles are experience without hours.** Ownership, management, project leadership, employment,
   subcontracting — every relationship to an organization is part of the person's history, with
   the organization's stated earlier business periods (e.g. "Vivat Rex") as continuity of the same
   business. A role NEVER carries hours: an organization's project hours are its people's work,
   never the leader's personal hours. A director with no roster row still led the company; their
   experience does not depend on a worker or roster row existing.
5. **UNKNOWN ≠ ZERO.** An unreadable journal makes the figure `null`; an unreadable organization
   ledger adds nothing and is said (`organizationUnknown`); unreadable relationships leave the
   roles unlisted and the hours unchanged.
6. **No score, rank or rating.** Hours, spans, roles — as recorded.
7. **General, not one account.** The reading is the same function for every person; the owner's
   production rows are the regression fixture, not a special case.

## What this changes in code
- `lib/journal/work-intelligence.ts` — additive: `journalAllTime` (all-time lines per engagement
  context and project with hours per work day; NOT focus-scoped) and `entryIds`; entries may carry
  `projectId` (the journal list core now selects `project_id`).
- `lib/journal/professional-experience.ts` — the pure reading: `deriveProfessionalExperience`.
- `lib/journal/professional-experience-read.ts` — the person's relationships (active and ended
  engagements incl. the governing `manager` relationship, plus owner/manager memberships with
  business periods). Reads nothing about other people and no organization-wide hours.
- Surfaces: `components/app/work-in-numbers/experience-scale.tsx` (the total first, the two
  provenances, a fold with the per-organization / per-project breakdown, roles, business periods
  and every not-counted line with its reason); the Living CV page (premium fact + printable
  line, `VerifiedCvData.professionalExperience` → MCP); the profile fact strip
  (`player-card-fact-experience-total`).

## What it does NOT do
- It does not write anything, move any record, merge any organization or alter any import.
- It does not attribute any organization's records about OTHER people to a leader.
- It does not change the owner's data: the one 800 h record keeps the period its importer chose
  (2025-06-01..2025-11-30) although its source text speaks of "at least 16 months × 50 h"; any
  correction is an owner-side correction record, never an agent edit.

## Addendum A (owner correction, 2026-10-17 evening) — Vivat Rex → Labour Market AI continuity

> **Superseded in part by Addendum B below:** the legal reading in this addendum ("earlier name of the same company", relation `renamed`) was corrected by the owner the same night. The evidence tables stay valid; the `renamed` SQL proposal is withdrawn.

The owner states that **Vivat Rex is the earlier name of the same company and Labour Market AI
is its continuation**. The earlier record (`docs/design/business-history-continuity-v1.md`,
2026-09-30) stated the opposite legal reading ("the old Vivat Rex legal entity was later sold")
and deliberately left `legal_entity_relation = not_asserted`. These are two different owner
statements; the product must carry the one the owner confirms, with its basis.

### What the production data holds (read-only, 2026-10-17)

| Fact | Value |
|---|---|
| Organization | `19f47e78` "Labour market ai Sp. z o.o", country PL, created 2026-05-21, owner `dc3284ea` |
| Legal identifiers on it | ONE `name_country` identifier (PL, "labour market ai sp z o o"). **No registration code (KRS/NIP), no VAT.** No identifier for "Vivat Rex" anywhere; no organization row named Vivat Rex. |
| Period statement | `organization_history_periods` `5751eeef`: label "Vivat Rex", `continuity = continuous_business_history`, `legal_entity_relation = not_asserted`, `basis = owner_statement`, `period_start/end = NULL` (not documented), `source_labels = ["Vivat Rex PL", "Nonstop-Vivat Rex PL"]` |
| Migrations | the only migration naming Vivat Rex is `20260930130000_organization_history_periods_v1.sql` (the table); the period row was inserted by the owner's lane on 2026-10-09 (`created_by` NULL) |
| Evidence records | 2,944 records, 29,645.5 h, 43 roster people, 6 import sessions, all `organization_id = 19f47e78`, all imported by the owner |

**Legal continuity therefore cannot be confirmed from the database**: there is no registry
identifier for either name. It can be recorded as the owner's statement now (basis
`owner_statement`) and upgraded to `registry_extract` when the owner supplies the KRS/NIP number
and the rename date.

### Continuity map by the records' own provenance (source sheet labels)

| Span | Source file · sheet label | Records | Hours | People | Placed in the "Vivat Rex" period today? |
|---|---|---|---|---|---|
| 2022-01-17 → 2022-12-18 | NL_2022 · sheets named after three people | 54 (period rows) | 2,718 | 5 | no — label is a person's name, period has no dates |
| 2023-01-13 → 2023-12-19 | NL_2023 · no label | 852 | 7,432.5 | 10 | no — unlabelled, period has no dates |
| 2024-01-18 → 2024-10-12 | NL_2024 · **Vivat Rex PL** | 675 | 5,819 | 16 | **yes** (by label) |
| 2024-10-14 → 2024-11-16 | NL_2024 · **Nonstop-Vivat Rex PL** | 125 | 1,085 | 6 | **yes** (by label) |
| 2024-11-11 → 2024-12-28 | NL_2024 · no label | 159 | 1,390 | 6 | no |
| 2024-12-30 → 2025-10-25 | NL_2025 · no label | 900 | 7,870.5 | 16 | no |
| 2025-06-01 → 2025-12-15 | work_history_2025_part3 · no label | 158 | 2,329 | 7 | no |
| 2026-01-19 → 2026-03-29 | NL_2022_2026 analysis · no label | 21 (period rows) | 1,001.5 | 3 | no |
| **Total** | | **2,944** | **29,645.5** | **43** | **800 placed (6,904 h) · 2,144 not placed** |

Where the links break: the period has **no documented dates**, so only the 800 records whose
sheet carries one of its two labels are placed; 2,144 records are "not placed" although they
belong to the same organization. Nothing is lost — every record stays readable under
`19f47e78` — but the history is not yet shown as one continuous period band.

### Historical workers — who can reach what

| Link state of the roster person | People | Records | Hours | Reachable by |
|---|---|---|---|---|
| `linked` (account confirmed) | 1 (the owner) | 1 | 800 | the person's own CV / Work in Numbers / MCP, and the organization's managers |
| `link_proposed` (invitation sent 2026-09-21, not yet accepted) | 1 | 313 | 2,736 | the organization's managers only, until the person accepts |
| `unlinked` (no account) | 41 | 2,630 | 26,109.5 | the organization's managers only (company history, historical person card) |

RLS (`organization_evidence_records_select`): managers of `19f47e78` see every record; a person
sees only records of a roster row linked to them with `link_method = worker_confirmed`. No record
of any of the 43 people references Nonstop Group `20b2c802` (0 roster rows, 0 records, 0
`organization_evidence_parties` rows anywhere); "Nonstop-Vivat Rex PL" is dataset provenance.
Projects: 2,093 records sit on 180 work objects → 85 canonical projects (95 duplicates folded by
#2358); 851 records name no object. Attestations: 158 (the 2025 part3 session) attested by the
owner as employer; 2,786 records carry no event. 0 corrections, 0 withdrawals.

### The owner's leadership — documented links (read-only)

| Relationship | Where it is recorded |
|---|---|
| Owner of Labour market ai `19f47e78` | `organizations.owner_profile_id`, `company_memberships` owner (2026-08-05), `engagement_contexts` owner `39b1f66c`, `organization_roles` employer + training_provider |
| Leadership during the Vivat Rex period | the period statement on `19f47e78` (above) — the same organization, so the owner role spans it once its dates are documented |
| Manager of UAB Nonstop Group `20b2c802` | `company_memberships` manager, active since 2026-09-23; no engagement row, no roster row, no evidence record, no project membership |
| Owner of the archived unnamed agency shell `2e3a4744` | membership + engagement `598d7143` (archived 2026-09-23 as a dev residue; unnamed → filtered from history by `isRecordedEngagement`) |
| Documented acts | imported all 2,944 records (15 sessions created, 16 commits, 3 withdrawals, 2026-09-30…10-04), created the 43 roster rows, attested 158 records, verified 11 companies as admin, reviewed 7 journal entries, 2 org-member additions |

Nothing in the database documents the owner's personal hours at Nonstop Group or at Vivat Rex
beyond the one 800 h period record; none are invented.

### What this slice does (code, GREEN)
- A period whose `legal_entity_relation` is `renamed` or `same_entity` is a **former name** of
  the organization (`FORMER_NAME_RELATIONS`, `formerNamesOf`): the experience scale, the CV and
  the leadership block print "Labour market ai Sp. z o.o (anksčiau Vivat Rex)" beside every
  period line with the business history's own relation words.
- Every evidence record's source label travels as data (`HistoryContext.source.label`); a surface
  resolves it to the stated **period** (`periodLabelFor`) and prints the period, never the raw
  sheet name (a sheet may be a person's first name). The CV's organization-history groups band by
  period; the experience scale shows organization hours per period and "no stated period" for the
  rest.

### What needs the owner (data, NOT applied — production data changes only on approval)

1. **Record the continuity the owner states.** A superseding period row (append-only; the old
   row stays as history). Values the owner must confirm: the **dates** of the Vivat Rex period
   (the records suggest up to 2024-10-13 for "Vivat Rex PL" and 2024-10-14..11-16 for
   "Nonstop-Vivat Rex PL"; the 2022–2023 files carry no label) and the **relation**
   (`renamed` = same legal entity under an earlier name).

   ```sql
   -- NOT APPLIED. Run via Supabase MCP apply_migration after the owner confirms the values.
   insert into public.organization_history_periods
     (organization_id, period_label, legal_entity_label, legal_entity_organization_id,
      source_labels, period_start, period_end, continuity, legal_entity_relation,
      basis, basis_reference, statement, supersedes_id, created_by)
   values
     ('19f47e78-7bd1-4120-9937-603dba769f8a', 'Vivat Rex', 'Vivat Rex',
      '19f47e78-7bd1-4120-9937-603dba769f8a',
      array['Vivat Rex PL','Nonstop-Vivat Rex PL'],
      '<OWNER: period_start>', '<OWNER: period_end>',
      'continuous_business_history', 'renamed',
      'owner_statement', 'Owner statement 2026-10-17 (decision 0025 addendum A)',
      'Vivat Rex is the earlier name of the same company; Labour Market AI is its continuation.',
      '5751eeef-4b5e-4959-ad82-fd8fb101e8bb', 'dc3284ea-026f-4b1a-8d28-4f043973ed34');
   ```

   With dates, `buildBusinessHistory` places the unlabelled records by date and the company
   history shows one continuous band; the CV and experience scale name the period on each group.
2. **Legal identifier.** Supply the KRS / NIP of the company and, if available, the registry
   extract showing the earlier name; the basis then becomes `registry_extract` and a
   `registration_code` identifier is added to `19f47e78` (the `organization_identifiers.scheme`
   check allows `registration_code | vat | web_domain | name_country`; a `former_name` scheme
   would need a widening migration).
3. **Nonstop Group and the owner's professional activity there.** The database holds a manager
   membership only. If the owner led or worked at Nonstop in a dated period, that is an
   engagement row (owner/manager, with `started_at`/`ended_at`) the owner adds through the
   product; no hours exist to show and none will be invented.
4. **Workers' view of the name history (RED follow-up).** `organization_history_periods` is
   readable by the organization's managers only, so a worker of the company cannot yet see "formerly
   Vivat Rex" on their own CV. A SECURITY DEFINER read function limited to the period
   label/relation/dates of organizations the caller has an engagement or linked roster row with
   is a RED migration (needs-human-gate) — proposed, not written here.

## Addendum B (owner, final, 2026-10-17 late) — SEPARATE legal entities, ONE person history

**Supersedes the legal reading in Addendum A.** The owner's final statement: *Vivat Rex was a
separate company, sold to other owners; Labour Market AI Sp. z o.o. is a NEW company through
which the owner continues the activity. It is NOT a rename of the same company.* The legal
relation `renamed` / `same_entity` must not be used between them. The SQL proposal in Addendum A
with `legal_entity_relation = 'renamed'` is withdrawn.

### Model (code, this PR)
- **Separate legal entities.** A stated period whose relation is NOT a former name
  (`sold_and_continued_by_new_entity`, `successor`, `not_asserted`, `other`) is an
  **earlier legal entity of its own** in the person's experience: its own row
  (`ExperienceOrganization.kind = "earlier_legal_entity"`), named by `legal_entity_label`,
  carrying the relation words, the basis of the statement, the dates, and "records administered
  by <continuing organization>". The continuing organization's row says which earlier entities
  it continues. A former name (`renamed` / `same_entity`) stays a name history inside the one
  organization row — a different fact, kept different.
- **One person history across companies.** The person's hours route to the entity under which
  the work happened: a record whose source label the period claims ("Vivat Rex PL",
  "Nonstop-Vivat Rex PL") sits on the Vivat Rex row; the rest stays on Labour Market AI; the
  journal stays with its engagement; Nonstop Group is its own row. One total, every hour once.
- **Original provenance preserved.** No record moves: `organization_id`, `session_id`,
  `source_fact`, `import_row_id`, events and parties are untouched. The entity-at-the-time comes
  from the record's own source label resolved against the period statement, on read.
- **Administration ≠ legal belonging.** The row prints both: "Legal entity at the time: Vivat
  Rex" and "records administered by Labour market ai Sp. z o.o". Vivat Rex's historical workers
  are never presented as the new company's staff: their roster rows stay historical persons of
  the administering organization, and their CV groups band by the entity of the time
  (`cvOrganizationHistory.legalEntityBand`).
- **Leadership across the three.** The OWNER of the continuing organization is shown as the
  owner of the earlier entity too — that is what the period statement says — as a DERIVED role,
  dated by the period, labelled "by the organisation's period statement". A manager appointed to
  the continuing organization is not projected. Nonstop Group stays the manager-membership row it
  is. So the owner's history reads: Vivat Rex (owner, period dates, derived) · Labour market ai
  (owner) · UAB Nonstop Group (manager) · personal records — no hours invented anywhere.

### What needs the owner (data, NOT applied)
The period row `5751eeef` already says `continuous_business_history` and `not_asserted`, so the
separate-entity model renders today. To state the relation the owner confirmed and to give the
period its dates (which places the 2,144 unlabelled records by date), a superseding row:

```sql
-- NOT APPLIED. Run via Supabase MCP apply_migration only after the owner confirms the dates.
insert into public.organization_history_periods
  (organization_id, period_label, legal_entity_label, legal_entity_organization_id,
   source_labels, period_start, period_end, continuity, legal_entity_relation,
   basis, basis_reference, statement, supersedes_id, created_by)
values
  ('19f47e78-7bd1-4120-9937-603dba769f8a', 'Vivat Rex', 'Vivat Rex', null,
   array['Vivat Rex PL','Nonstop-Vivat Rex PL'],
   '<OWNER: period_start>', '<OWNER: period_end>',
   'continuous_business_history', 'sold_and_continued_by_new_entity',
   'owner_statement', 'Owner statement 2026-10-17 (decision 0025 addendum B)',
   'Vivat Rex was a separate company, later sold to other owners; the owner continues the activity through Labour Market AI Sp. z o.o., a new company. Not a rename.',
   '5751eeef-4b5e-4959-ad82-fd8fb101e8bb', 'dc3284ea-026f-4b1a-8d28-4f043973ed34');
```

The records' source labels suggest the Vivat Rex period runs to 2024-10-12 ("Vivat Rex PL") with
a joint "Nonstop-Vivat Rex PL" dataset 2024-10-14..11-16; 2022–2023 workbooks carry no label.
Only the owner can state the bounds. The RED follow-up from Addendum A (a worker-readable period
statement, so that Vivat Rex's historical workers see the entity of the time on their own CV once
they claim their roster row) stands.

## Addendum C (owner integrated-architecture order, 2026-10-24) — ONE hours ledger

Every person has ONE total of accumulated work hours, broken down by organization (the performer
at the time), project, role/activity, state and skill. The total is the ledger's total
(`apps/web/lib/journal/hours-ledger.ts`, version `hours-ledger/2026-10-24.v1`), read over the SAME
lines as this decision's reading — never a second ledger, never stored.

- **States, two facts kept apart.** BASIS: `actual` (journal entries, organization day records),
  `estimated` (a stated estimate — `derived.hoursBasis`, written by the insert-only correction path),
  `reported` (an organization's figure over a span whose method the source did not state — claimed
  neither actual nor estimated). CONFIRMATION: `unconfirmed` · `self_attested` · `confirmed`. A
  person's own attestation never upgrades the state; only someone else's confirmation does.
- **Confidence** is a band per line (high · medium · low) with the facts it rests on — never a score
  of the person. The weights behind it are not public material (AGENTS.md "outcomes, not
  mechanisms"): the server-side caller injects them from private configuration; without them the
  band is unrated.
- **Overlap capacity.** Overlapping counted lines may not exceed 16 h per calendar day across every
  organization. The excess is taken from estimated / reported lines only (actual beats estimate);
  actual records that alone exceed it are flagged, never edited. `hours.capacityExcess` says how much.
- **Estimation** for periods without timesheets: H = D × h × K − A (working days by the calendar
  minus known non-working days × standard daily hours × workload coefficient, minus the actual hours
  already recorded in the span); date precision gives a low–high range; a missing h or K gives no
  figure. A source's own monthly rate (months × h per month) is read as such. Hours are never
  invented to fill a history.
- **Skill split** H_skill = Σ H_i × P_ij per evidence state (decision 0023): supporting hours, never
  added to the total; a (line, skill) pair counts once.
- **Who the hours belong to.** Only the person's own lines; roles carry no hours; a manager's
  personal hours are separate from the hours of the people they manage; an AI agent's autonomous
  work is project history (`projectHistoryOnly`), never a person's hours.
- **Performer at the time, by date.** A record no source label places is placed in a stated EARLIER
  LEGAL ENTITY (sold / succeeded — never a former name) when its whole span lies certainly inside
  that entity's DATED period; the bounds' precision (migration `20261024100000`: day / month / year,
  a per-bound basis, the earlier entity's register identifier) is respected. Undated = nothing is
  placed by date. The successor keeps its own work and names the entity it continues; inherited
  experience serves competence analysis and planning, current capacity counts only who is there today.
- **Access is not a professional role.** A `manager` MEMBERSHIP is not printed as "manager" where the
  person's own engagement with that organization states what they are (e.g. `consultant`); an owner
  membership is never dropped. Nothing is written; the access is unchanged.
- **Documents are optional evidence** (decision 0021): a register extract strengthens a bound's
  basis; its absence never erases experience proven by other sources.

Pinned by `lib/journal/hours-ledger.test.ts` and `lib/journal/professional-experience-ledger.test.ts`.
