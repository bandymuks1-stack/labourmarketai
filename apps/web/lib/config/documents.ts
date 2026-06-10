/**
 * Documents & readiness engine config (S3 / s3-documents-readiness).
 *
 * Ships OFF: the worker_documents / country_document_requirements tables
 * exist only as a needs-human-gate DRAFT migration until the owner applies
 * it via MCP (docs/product/documents-readiness-design.md §6). The flag-flip
 * slice turns this on together with the nav links and the file-upload slice.
 */
export const DOCUMENTS_READINESS_ENABLED = false;

/** Days before valid_until at which a ready document counts as expiring. */
export const DOCUMENT_EXPIRING_WINDOW_DAYS = 30;

/** Launch markets for the country selector (Belgium = future, included in
 *  the structure but never promoted above the nine — product plan §20). */
export const DOCUMENT_COUNTRIES = [
  "LT", "LV", "EE", "NL", "DE", "DK", "NO", "SE", "PL",
] as const;
