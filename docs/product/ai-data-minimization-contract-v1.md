# AI Data Minimization Contract v1

Status: ACTIVE (Labour Market OS P11 rules, encoded with P8 routing)
Date: 2026-07-13

Every AI task receives the **minimum** data it needs — field allowlists and
prohibitions are declared per task in `TASK_POLICIES`
(`apps/web/lib/ai/runtime/task-routing.ts`) and audited by field **name**
only (`dataCategoriesSent` — never values). This extends rule 3 of
`docs/product/human-reviewed-ai-assistance-contract-v1.md`.

## PII minimization rules (binding)

1. **Never the full CV when a task needs a few fields.** Only the
   CV-extraction task (`extract_cv`, agent `worker_profile`) may receive CV
   text at all — every other task prohibits `full_cv`.
2. **Never one CV to multiple providers simultaneously.** There is exactly
   one active adapter (`anthropic`); the adapter registry keeps every other
   provider `declared_inactive`/`unavailable`, and `selectAdapterForRoute`
   returns at most ONE adapter per run. A future multi-provider gateway
   must preserve this rule: one person's CV/profile content goes to at most
   one provider per run, never fanned out.
3. **No address / phone / email / exact coordinates / raw documents /
   government ids / payment details without necessity.** No current task
   needs them, so they are prohibited for **all ten** tasks.
4. **Data categories audit.** Every run's audit record carries
   `dataCategoriesSent` — the field NAMES sent to the model. Input content
   is never logged (test-asserted: the serialized audit record contains no
   input text).
5. **Prohibited ≠ filtered silently.** A prohibited field arriving in an
   agent input is rejected by the agent's strict zod input schema
   (`.strict()` — unknown fields fail validation and the run returns
   `needs_review: invalid_input` before anything reaches a model).

## Allowed / prohibited fields per task

`(base prohibited)` = `address`, `phone`, `email`, `exact_coordinates`,
`documents`, `government_id`, `payment_details`.

| Task | Allowed fields | Prohibited fields |
|---|---|---|
| `structure_future_work` | work_description, role_hints, timeframe, headcount_hint, region_hint, locale | full_cv + (base) |
| `derive_workforce_requirements` | structured_work_scope, role_requirements, country_code, timeframe, locale | full_cv + (base) |
| `normalize_work_scope` | scope_text, journal_entry_text, work_categories, locale | full_cv + (base) |
| `detect_capacity_gap` | role_requirements, headcount_plan, capacity_records, assignment_records | full_cv + (base) — deterministic, no LLM sees anything |
| `detect_skill_gap` | required_skills, available_skills, skill_matrix | full_cv + (base) — deterministic, no LLM sees anything |
| `normalize_external_profile` | external_profile_text, declared_skills, locale | full_cv + (base) |
| `extract_cv` | cv_text, bio, locale | (base) — the ONE task allowed CV text; contact/location/document fields still never sent |
| `explain_match` | worker_skills, work_evidence_summaries, availability, country_readiness_summaries, documents_summary, company_need, booking_dates, accommodation, transport, language, locale | full_cv + (base) |
| `translate_message` | source_text, source_locale, target_locale | full_cv + (base) |
| `draft_follow_up` | conversation_summary, recipient_role, goal, locale | full_cv + (base) |

Notes:

- `documents_summary` (explain_match) is a short human-readable readiness
  summary line — never document contents. Raw document/file content is
  banned everywhere (`ai-content-safety` guard: no content/ocr/base64
  fields exist on any agent schema).
- `region_hint` / `country_code` are coarse (country/region level) —
  `exact_coordinates` stays prohibited everywhere.
- Location precision, when a future task genuinely needs it, must be added
  by widening exactly one task's allowlist in `TASK_POLICIES` with a doc
  update here — never by bypassing the policy.

## Enforcement

- `lib/ai/runtime/task-routing.test.ts` — asserts every policy prohibits
  coordinates/documents/ids/address/phone, and `full_cv` everywhere except
  `extract_cv`; asserts no field is both allowed and prohibited.
- `lib/ai/run-agent-routing.test.ts` — asserts the audit record carries
  field names only and no input content.
- `lib/guards/ai-task-routing.test.ts` — pins policy completeness and the
  single-active-adapter rule (rule 2 above).
- `lib/guards/ai-content-safety.test.ts` — no agent schema can carry raw
  document content.

## Honest gap

The allow/prohibit lists are the declared contract per task; runtime input
shape is enforced by each agent's strict zod input schema. A generic
runtime cross-check "input field ∈ policy.allowedFields" (name-level, for
agents whose schema fields are named differently from the policy
categories) is a follow-up — today the strict schemas are the enforcement
and the policy lists are the audit/authoring contract.
