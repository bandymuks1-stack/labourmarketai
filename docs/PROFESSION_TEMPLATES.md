# Profession Templates

Work journals are **profession-specific** (ADR 0006): a generic journal is
too weak to power OVR / trust scoring. Each profession family has a
`journal_template` (a row, **not code** — see "Extensibility") describing
the fields a `journal_entry` collects.

Every `journal_entry` field can become evidence behind a skill at one of
the **5 verification levels** in `PROJECT_VISION.md` §6
(self → work-journal → manager → client → document). A journal entry is
the canonical source of the **work-journal-backed (level 2)** signal and
feeds higher levels when a manager/client confirms it.

Status: schema **M2** (`professions`, `journal_templates`, `work_journals`,
`journal_entries` — see `docs/DATA_MODEL.md`). Construction first.

## 1. construction
Roles: steel fixer, concrete, electrician, plumber, scaffolder,
supervisor, safety.
Journal fields: `site_arrival` (time), `hours` (number),
`materials` (text[]), `incidents` (text), `weather` (enum),
`photos` (evidence_id[]), `task` (text), `skill_refs` (skill_id[]).

## 2. hospitality
Roles: cook, chef, server, bartender.
Journal fields: `shift` (enum am/pm/night), `dishes` (number),
`customer_count` (number), `kitchen_incidents` (text),
`certs_used` (document_id[]), `station` (text), `skill_refs` (skill_id[]).

## 3. education
Roles: teacher, tutor, instructor.
Journal fields: `classes_taught` (number), `students` (number),
`curriculum_coverage` (text), `assessments` (number),
`subject` (text), `skill_refs` (skill_id[]).

## 4. healthcare
Roles: caregiver, nurse aide.
Journal fields: `patient_hours` (number), `care_acts` (text[]),
`certs_used` (document_id[]), `incidents` (text),
`skill_refs` (skill_id[]).

## 5. generic (fallback)
For any profession without a dedicated template.
Journal fields: `hours` (number), `summary` (text),
`evidence` (evidence_id[]), `skill_refs` (skill_id[]).

## Extensibility (hard requirement)

Adding a new profession = inserting a new `journal_template` row
(profession key + JSON field schema). **No code change, no migration, no
UI rework** — same architectural rule as adding a launch country
(`PROJECT_VISION.md` §4). The journal renderer reads the template's field
schema dynamically. New profession *families* beyond these five arrive
post-M5 (`docs/ROADMAP.md`).
