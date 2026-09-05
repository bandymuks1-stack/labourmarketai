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

/**
 * Which of the person's OWN document records (`worker_documents`, slugs from
 * the seeded `document_types` registry) answer a default checklist row.
 * The bridge between the manager's project checklist and the person's
 * documents (owner contract §11/§12/§16): the manager's row names WHAT the
 * project still needs; the person's own documents say what they HAVE. The
 * two truths stay where they are; this map only lets the PERSON's side read
 * them together. Rows that are not documents (a briefing, availability, a
 * client's own requirement) map to nothing and are shown as words only.
 *
 * Doctrine: worker documents stay default-closed (§4): a manager never reads
 * them through this map; the auto-"received" bridge across scopes is the
 * owner-gated S6 consent, not this constant.
 */
export const READINESS_ITEM_DOCUMENT_TYPES: Record<DefaultReadinessItemKey, readonly string[]> = {
  identity_document: ["id_document", "residence_permit"],
  a1_or_posting_document: ["a1_certificate", "posted_worker_package", "posting_notification"],
  employment_contract_or_assignment_basis: ["employment_contract"],
  qualification_or_skill_evidence: ["professional_certificate", "health_safety_card"],
  safety_instruction_acknowledgement: [],
  travel_or_start_availability: [],
  client_specific_requirement: [],
};

export function documentTypesForReadinessItem(itemKey: string): readonly string[] {
  return (READINESS_ITEM_DOCUMENT_TYPES as Record<string, readonly string[] | undefined>)[itemKey] ?? [];
}
