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
