# Business history continuity v1

Owner decision 2026-09-30 ("FINAL OWNER MODEL — BUSINESS HISTORY CONTINUITY"). This
record states what was decided, what already existed, the one thing added, and what
is deliberately not done yet.

## 1. Decision (owner)

- During the Vivat Rex period the owner and their team built a real business history:
  people, projects, objects, work, hours, clients, capabilities, evidence.
- The old Vivat Rex legal entity was later sold; the people continued the activity
  through the LabourMarket.ai legal entity.
- The product treats this as ONE continuous business / professional history. It does
  NOT claim that Vivat Rex and LabourMarket.ai are the same legal person.
- **Legal-entity continuity and business-history continuity are two different facts.**
- Provenance never disappears: each record keeps the entity it was made under, the
  source label, the people at the time, the object, the date, the hours, the raw work,
  the source file and row, attestation and verification.
- The buyer of the old legal entity does NOT inherit the earlier team's professional
  experience as their own.
- 2025 part1 + part2 + part3 are parts of the LabourMarket.ai continuous history. The
  158 committed records stay where they are.
- ONE evidence record feeds the worker's Living CV, the team's history, the company's
  portfolio and the object's history. Views differ; evidence is never copied.

## 2. What already exists (reused unchanged)

| Need | Home |
|---|---|
| The work itself, one row | `organization_evidence_records` |
| The person | `organization_people` (linked to a profile by `linked_worker_id`) |
| The object | `work_objects` |
| Entity AT THE TIME, per record, label only | `organization_evidence_parties` (`party_role`, `party_label`) |
| Source file, row, fingerprint | `evidence_import_sessions` / `evidence_import_rows` |
| Attestation / verification | `organization_evidence_events` |
| Person's own reads of their history | `worker-evidence-read.ts` |

## 3. Why nothing existing expresses the continuity

`supplied_by_organization_id` is one `organization_id` per record; making it mean both
"legal entity then" and "business it belongs to" is the conflation the owner forbids.
`organization_facts` is a per-field fact store, not a relationship projections group by.
`organizations` / `engagement_contexts` / `relationship_types` describe a person's
relationship to an organization. A search of `supabase/migrations`, `docs/design` and
`docs/OWNER_TARGET_ARCHITECTURE_V1.md` for lineage, predecessor, successor, legal entity
change and continuity found no equivalent.

## 4. What is added: `organization_history_periods` (RED, awaiting owner)

One append-only table, no evidence copied:

- `organization_id` — the CONTINUING business (the LabourMarket.ai organization).
- `period_label`, `legal_entity_label` (+ optional `legal_entity_organization_id`) — the
  period and the legal entity as then named. A legal entity not on the platform is a
  label, never an invented organization.
- `source_labels[]` — the labels that place a record in the period, as the sources spell
  them (`Vivat Rex PL`, `Nonstop-Vivat Rex PL`).
- `period_start` / `period_end` — NULL = not documented (never "open-ended").
- `continuity` (business history) and `legal_entity_relation` (default `not_asserted`) —
  two columns on purpose.
- `basis` (`owner_statement` | `registry_extract` | `contract` | `other_document`),
  `basis_reference`, `statement`, `supersedes_id`, `created_by`, `created_at`.
- INSERT + SELECT only. A correction is a new row that supersedes the old one.

Membership of a record in a period is COMPOSED on read: the record's employer-party label
against `source_labels`, else its date against known bounds, else "not placed". No link
table, no copy.

## 5. Facts the source documents give, and their limits

- The original weekly workbooks name their supplier in the sheet name: `Vivat Rex PL`
  (2023, 2024) and `Nonstop-Vivat Rex PL` (2024 in part, 2025, 2026). LabourMarket.ai does
  not appear in those labels.
- The prepared 2025 part files do NOT carry that label; it is known from the raw
  workbooks. It must be recorded as a session-level provenance statement that names its
  dataset, not as a per-row source fact.
- The sale date of the old entity and the exact continuity mechanism are not documented in
  the files reviewed. Until a registry extract or contract exists the basis is
  `owner_statement` and the relation stays `not_asserted`.
- The label `Nonstop-Vivat Rex PL` names Nonstop, but Nonstop Group is a separate
  organization. Owner decision 2026-09-30: it is preserved verbatim as SOURCE/DATASET
  provenance and NOT recorded as a party to any row until documents establish that it is
  the same organization and what role it had; if proven later the party is added without
  rewriting the original evidence.

## 6. Earlier governing record: superseded (owner, 2026-09-30)

`docs/design/historical-timesheet-import-v3.md` §1 named `20b2c802` (Nonstop Group) the
canonical supplying organization. The owner CONFIRMED that assumption is superseded for
the 2025 package: the continuous business-history anchor is LabourMarket.ai `19f47e78`,
part1 and part2 join the same history as part3, and nothing is copied under Nonstop.
The v3 record is amended in place (header row **Amended**, §1, §2 and §3), so the two
documents no longer state conflicting rules. Nonstop Group stays a separate organization;
the label `Nonstop-Vivat Rex PL` is dataset provenance only and is NOT a row-level party
until source evidence establishes that it is the same organization and what role it had.

## 7. Not done in this change (follow-ups, each additive)

1. Session-level supplier label + writer of the employer party at commit.
2. The pure projector: records × periods → person / team / company / object views over one
   evidence set, counting each record once.
3. The UI grouping (one continuous history with the period as a band).
4. The first period row (owner statement) after the owner applies this migration.
5. The `correction_of` writer for the 158 records' dates (separate owner approval).
