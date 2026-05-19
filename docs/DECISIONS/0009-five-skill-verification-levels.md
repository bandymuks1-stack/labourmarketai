# ADR 0009 — Five skill-verification levels

**Status:** Accepted · **Milestone:** schema M1, UI M2 · **Vision:** PROJECT_VISION.md §6, §10

## Context
"Verified / not verified" is a lie-prone binary. Trust must be layered and
honest: a self-claim is not a certificate; a manager's word is not a
client's.

## Decision
Every skill carries exactly one of **five** levels:
1. self-declared 2. work-journal-backed 3. manager-confirmed
4. client-confirmed 5. document-backed.
Modelled as `skill_verifications` (schema M1, UI M2,
`docs/DATA_MODEL.md`). UI colour/labels derive strictly from the level —
nothing reads "verified"/green unless it genuinely is (honesty principle,
placeholder governance).

## Consequences
- Replaces the M0 boolean-ish `worker_skills.verified` with an auditable
  level + evidence ref.
- OVR/trust scoring weights by level.
- Enforced visually by the existing `<Placeholder>` / colour-honesty rule.
