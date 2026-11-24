# ADR 0006 — Profession-specific work journals

**Status:** Accepted · **Milestone:** M2 · **Vision:** PROJECT_VISION.md §6, §8(3)

## Context
Work journals are the canonical source of the *work-journal-backed*
verification level and feed OVR / trust scoring. A single generic journal
("hours + notes") cannot capture the signals that make a steel fixer's
record comparable and trustworthy (site arrival, materials, incidents,
photos) versus a chef's (shift, dishes, kitchen incidents, certs).

## Decision
Journals are profession-specific via a data-driven `journal_template`
(`field_schema jsonb`) per profession family. Five families to start
(construction, hospitality, education, healthcare, generic) —
`docs/PROFESSION_TEMPLATES.md`. The journal renderer reads the template;
adding a profession is a row insert, not a code change or migration.

## Consequences
- OVR/trust scoring has profession-appropriate evidence.
- Extensibility preserved (same rule as adding a launch country).
- Slightly more M2 schema (`professions`, `journal_templates`,
  `work_journals`, `journal_entries`).
