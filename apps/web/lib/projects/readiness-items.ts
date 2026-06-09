/**
 * Default readiness/document checklist item KEYS (slice pilot-ops-v2-status-docs).
 *
 * Keys only — the human label is taken from i18n (projectOps.readiness.defaults.*)
 * at seed time so labels stay editable/translatable and are NOT hardcoded legal
 * claims in the database. These are OPERATIONAL checklist items, not legal advice
 * and not automatic compliance.
 */
export const DEFAULT_READINESS_ITEM_KEYS = [
  "identity_document",
  "a1_or_posting_document",
  "employment_contract_or_assignment_basis",
  "qualification_or_skill_evidence",
  "safety_instruction_acknowledgement",
  "travel_or_start_availability",
  "client_specific_requirement",
] as const;

export type DefaultReadinessItemKey = (typeof DEFAULT_READINESS_ITEM_KEYS)[number];
